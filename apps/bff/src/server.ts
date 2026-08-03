import { serve } from "@hono/node-server";
import {
  CopilotRuntime,
  CopilotKitIntelligence,
  createCopilotEndpoint,
} from "@copilotkit/runtime/v2";
import { LangGraphAgent } from "@copilotkit/runtime/langgraph";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";

import {
  breakerCheck,
  breakerRecordFailure,
  breakerRecordSuccess,
  acquireSlot,
  releaseSlot,
  inflightCount,
  MAX_QUEUE_WAITERS,
  QUEUE_TIMEOUT_MS,
  EST_RUN_SECONDS,
} from "./admission.js";
import {
  handleLivez,
  handleReadyz,
  rewriteErrors,
  rewriteWsUrl,
} from "./health.js";
import { handleX402 } from "./x402/routes.js";
import { handleB2EventNotification, vaultFromThreadValues } from "./b2_events.js";

const intelligence = new CopilotKitIntelligence({
  apiKey:
    process.env.INTELLIGENCE_API_KEY ?? "cpk_sPRVSEED_seed0privat0longtoken00",
  apiUrl: process.env.INTELLIGENCE_API_URL ?? "http://localhost:4203",
  wsUrl: process.env.INTELLIGENCE_GATEWAY_WS_URL ?? "ws://localhost:4403",
});

const agent = new LangGraphAgent({
  deploymentUrl:
    process.env.LANGGRAPH_DEPLOYMENT_URL ?? "http://localhost:8123",
  graphId: "default",
  langsmithApiKey: process.env.LANGSMITH_API_KEY ?? "",
  // 60 (vs LangGraph default 25) leaves headroom for the deepagents planner
  // loop on multi-step turns like "draft email + queue".
  assistantConfig: {
    recursion_limit: Number(process.env.LANGGRAPH_RECURSION_LIMIT ?? 60),
  },
});

// Director / storyboard agent — same LangGraph deployment, different graphId.
// The frontend mounts this at agentId="director" on the /director route.
//
// Director uses a *lower* recursion limit than the default agent. The
// storyboard pipeline is a finite chain (plan → references → videos →
// stitch) and shouldn't legitimately recurse 60 times. Capping at 25 turns
// a Gemini planner that's stuck in a tool-call loop into a fast,
// recoverable failure instead of a 5-minute worker hold.
const director = new LangGraphAgent({
  deploymentUrl:
    process.env.LANGGRAPH_DEPLOYMENT_URL ?? "http://localhost:8123",
  graphId: "director",
  langsmithApiKey: process.env.LANGSMITH_API_KEY ?? "",
  assistantConfig: {
    recursion_limit: Number(process.env.LANGGRAPH_DIRECTOR_RECURSION_LIMIT ?? 40),
  },
});

// ----------------------------------------------------------------- limits
// Per-thread Runway call budget (image + video each count as 1).
// Default: 20 calls ≈ 10 shots × (1 image + 1 video).
// Override with RUNWAY_BUDGET_PER_THREAD env var.
//
// Counters are stored in Redis (the same instance used by Intelligence)
// with a 7-day TTL so they survive BFF restarts and scale across multiple
// BFF instances. Falls back to an in-memory Map if Redis is unavailable
// (e.g. Docker not running) so local dev without infra still works.
const RUNWAY_BUDGET = Number(process.env.RUNWAY_BUDGET_PER_THREAD ?? 20);
const BUDGET_KEY_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const BUDGET_KEY_PREFIX = "runway:budget:";

// Redis client — lazy, non-blocking. Errors are caught so a Redis outage
// never takes down the BFF.
const _redisUrl = process.env.REDIS_URL ??
  `redis://localhost:${process.env.REDIS_HOST_PORT ?? 6379}`;
const _redis = new Redis(_redisUrl, {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: 2000,
});
_redis.connect().catch(() => {
  console.warn("[bff] Redis unavailable — budget counters will use in-memory fallback");
});

// In-memory fallback for when Redis is down.
const _memCounts = new Map<string, number>();

async function threadCallCount(threadId: string): Promise<number> {
  try {
    const val = await _redis.get(`${BUDGET_KEY_PREFIX}${threadId}`);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return _memCounts.get(threadId) ?? 0;
  }
}

async function incrementThreadCallCount(threadId: string): Promise<number> {
  try {
    const key = `${BUDGET_KEY_PREFIX}${threadId}`;
    const next = await _redis.incr(key);
    // Refresh TTL on every increment so active threads don't expire mid-use.
    await _redis.expire(key, BUDGET_KEY_TTL_SECONDS);
    return next;
  } catch {
    const next = (_memCounts.get(threadId) ?? 0) + 1;
    _memCounts.set(threadId, next);
    return next;
  }
}

// ---- brief-hash ledger (resume-vs-fresh on landing CTAs) ----
// Records brief hash → threadId/status so a repeat click can be offered the
// previous (free) cut instead of silently spending another full pipeline.
const CUT_KEY_PREFIX = "devcut:brief:";
const CUT_KEY_TTL_SECONDS = 7 * 24 * 60 * 60;
const _memCuts = new Map<string, Record<string, unknown>>();

async function cutRecordRead(hash: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await _redis.get(`${CUT_KEY_PREFIX}${hash}`);
    if (raw) return JSON.parse(raw) as Record<string, unknown>;
    return null;
  } catch {
    return _memCuts.get(hash) ?? null;
  }
}

// ---- Daily cost counter + alert ----
// Counts ALL Runway calls per UTC day; fires ONE Discord alert when the
// day crosses the threshold. ~150 calls ≈ ~10 full golden cuts on the
// shared key — enough early warning before a surprise invoice.
const COST_ALERT_DAILY_CALLS = Number(process.env.COST_ALERT_DAILY_CALLS ?? 150);
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL ?? "";

async function trackDailyCost(threadId: string): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `devcut:cost:${day}`;
  let count = 0;
  try {
    count = await _redis.incr(key);
    await _redis.expire(key, 48 * 3600);
  } catch { return; }
  if (count !== COST_ALERT_DAILY_CALLS) return; // alert exactly once, at crossing
  if (!DISCORD_WEBHOOK_URL) return;
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: `⚠️ DevCut daily Runway usage hit **${count} calls** (threshold ${COST_ALERT_DAILY_CALLS}) on ${day} UTC. Last thread: \`${threadId}\`. Consider raising COST_ALERT_DAILY_CALLS or checking for runaway loops.`,
      }),
    });
  } catch { /* alerting is best-effort */ }
}

async function cutRecordWrite(hash: string, patch: Record<string, unknown>): Promise<void> {
  const prev = (await cutRecordRead(hash)) ?? {};
  const next = { ...prev, ...patch };
  _memCuts.set(hash, next); // shadow copy — survives Redis flaps
  try {
    await _redis.set(`${CUT_KEY_PREFIX}${hash}`, JSON.stringify(next), "EX", CUT_KEY_TTL_SECONDS);
  } catch { /* non-fatal */ }
}

// ----------------------------------------------------------------- copilot endpoint
//
// lockTtlSeconds / lockHeartbeatIntervalSeconds are set explicitly (rather
// than relying on the Intelligence defaults of 20s/15s) so a run that dies
// mid-stream — agent crash, OOM, network blip — releases its Intelligence
// thread lock within `lockTtlSeconds` instead of staying locked until the
// upstream default timeout (which we've seen strand threads for minutes).
//
// The heartbeat keeps healthy in-flight runs alive; the TTL bounds how long
// a dead run can hold a lock. Keep `heartbeat << ttl` (≥3x) so a single
// missed heartbeat doesn't drop the lock.
const RUNTIME_LOCK_TTL = Number(process.env.CPKI_LOCK_TTL_SECONDS ?? 45);
const RUNTIME_LOCK_HEARTBEAT = Number(process.env.CPKI_LOCK_HEARTBEAT_SECONDS ?? 10);

const copilotApp = createCopilotEndpoint({
  basePath: "/api/copilotkit",
  runtime: new CopilotRuntime({
    intelligence,
    identifyUser: () => ({ id: "default", name: "Hackathon User" }),
    licenseToken: process.env.COPILOTKIT_LICENSE_TOKEN,
    agents: { default: agent, director },
    lockTtlSeconds: RUNTIME_LOCK_TTL,
    lockHeartbeatIntervalSeconds: RUNTIME_LOCK_HEARTBEAT,
    openGenerativeUI: true,
    a2ui: { injectA2UITool: false },
    mcpApps: {
      servers: [
        {
          type: "http",
          url: process.env.MCP_SERVER_URL || "http://localhost:3001/mcp",
          serverId: "manufact_local",
        },
      ],
    },
  }),
});

// ----------------------------------------------------------------- /info cache
// The CopilotKit client polls /api/copilotkit/info aggressively (multiple
// times per page load + on reconnect). Each call hits Intelligence to get
// runtime metadata. Caching the response for a few seconds breaks the
// retry-storm feedback loop without hiding genuine outages: if Intelligence
// is down we still surface 5xx on /run, and a stale /info for 10s is
// strictly better than a fresh 404.
const INFO_CACHE_TTL_MS = Number(process.env.INFO_CACHE_TTL_MS ?? 10_000);
let _infoCache: { at: number; status: number; headers: Headers; body: string } | null = null;

// ----------------------------------------------------------------- wrapper
// Adds two capabilities on top of the CopilotKit endpoint:
//
// 1. BYOK (Bring Your Own Key): reads X-Runway-Api-Key request header and
//    injects it into forwardedProps.config.configurable.runway_api_key so
//    the Python agent can use the user's own Runway account instead of the
//    shared server key. The key is never logged.
//
// 2. Budget guard: reads thread ID from the request body, looks up the
//    per-thread call count in Redis (falls back to in-memory if Redis is
//    down), and injects runway_calls_remaining + runway_budget into
//    configurable so the Python agent can refuse Runway calls when the
//    budget is exhausted.
//
// 3. Budget increment: POST /api/runway-call-used lets the Python agent
//    increment the per-thread counter in Redis after each successful call.
//
// 4. Error rewriting: maps known 5xx bodies to structured { error, hint }
//    payloads the UI renders as actionable toasts.

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // ---- Liveness ----
  if (url.pathname === "/livez") return handleLivez();

  // ---- Readiness + legacy /health ----
  if (url.pathname === "/readyz" || url.pathname === "/health") {
    return handleReadyz();
  }

  // ---- DevCut x402 job meter (catalog + paid SKUs) ----
  const x402Res = await handleX402(req);
  if (x402Res) return x402Res;

  // ---- Thread-state proxy (frontend canvas restore on thread switch) ----
  const threadStateMatch = url.pathname.match(/^\/api\/thread-state\/([^/]+)$/);
  if (threadStateMatch) return handleThreadState(decodeURIComponent(threadStateMatch[1]));

  // ---- Provenance vault from LangGraph thread state ----
  const vaultMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/vault$/);
  if (vaultMatch && req.method === "GET") {
    return handleRunVault(decodeURIComponent(vaultMatch[1]));
  }

  // ---- B2 Event Notifications → Discord (optional DISCORD_WEBHOOK_URL) ----
  if (url.pathname === "/api/b2-events" && req.method === "POST") {
    return handleB2EventNotification(req);
  }

  // ---- Budget increment endpoint (called by Python agent) ----
  if (url.pathname === "/api/runway-call-used" && req.method === "POST") {
    let body: Record<string, unknown> = {};
    try { body = await req.json() as Record<string, unknown>; } catch { /* ignore */ }
    const threadId = body.thread_id as string | undefined;
    if (threadId) {
      const next = await incrementThreadCallCount(threadId);
      void trackDailyCost(threadId);
      const remaining = Math.max(0, RUNWAY_BUDGET - next);
      return new Response(
        JSON.stringify({ calls_used: next, calls_remaining: remaining }),
        { headers: { "content-type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ error: "missing thread_id" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // ---- Runway call counter (post-run cost display) ----
  const runwayCallsMatch = url.pathname.match(/^\/api\/runway-calls\/([^/]+)$/);
  if (runwayCallsMatch && req.method === "GET") {
    const used = await threadCallCount(decodeURIComponent(runwayCallsMatch[1]));
    return new Response(
      JSON.stringify({ calls_used: used, budget: RUNWAY_BUDGET }),
      { headers: { "content-type": "application/json" } },
    );
  }

  // ---- Brief hash → prior cut lookup (resume-vs-fresh on landing CTAs) ----
  if (url.pathname === "/api/cut-record" && req.method === "POST") {
    let recBody: Record<string, unknown> = {};
    try { recBody = await req.json() as Record<string, unknown>; } catch { /* ignore */ }
    const hash = typeof recBody.hash === "string" && /^[0-9a-f]{64}$/.test(recBody.hash) ? recBody.hash : "";
    const tid = typeof recBody.threadId === "string" ? recBody.threadId : "";
    if (!hash || !tid) {
      return new Response(JSON.stringify({ error: "missing hash/threadId" }), {
        status: 400, headers: { "content-type": "application/json" },
      });
    }
    await cutRecordWrite(hash, {
      threadId: tid,
      title: typeof recBody.title === "string" ? recBody.title.slice(0, 120) : "",
      status: typeof recBody.status === "string" ? recBody.status.slice(0, 24) : "unknown",
      updatedAt: Date.now(),
    });
    return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
  }

  if (url.pathname === "/api/cut-lookup" && req.method === "GET") {
    const hash = url.searchParams.get("hash") ?? "";
    const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });
    if (!/^[0-9a-f]{64}$/.test(hash)) return json({ found: false });
    const rec = await cutRecordRead(hash);
    if (!rec) return json({ found: false });
    // Probe the agent for ground truth — the in-mem runtime wipes state on
    // restart, which makes old records non-resumable.
    const tid = String(rec.threadId ?? "");
    let resumable = false;
    let runStatus = "";
    let shotsReady = 0;
    let finalUrl = "";
    try {
      const [stateRes, runsRes] = await Promise.all([
        fetch(`${LANGGRAPH_URL}/threads/${encodeURIComponent(tid)}/state`, { signal: AbortSignal.timeout(4000) }),
        fetch(`${LANGGRAPH_URL}/threads/${encodeURIComponent(tid)}/runs?limit=1`, { signal: AbortSignal.timeout(4000) }),
      ]);
      if (stateRes.ok) {
        const st = await stateRes.json() as { values?: Record<string, unknown> };
        const vals = st.values ?? {};
        const shots = Array.isArray(vals.shots) ? vals.shots as Array<Record<string, unknown>> : [];
        shotsReady = shots.filter((s) => s.video_url || s.clip_url || s.still_url || s.ref_image_url).length;
        finalUrl = ((vals.final_video_url ?? vals.durable_url ?? "") as string);
        resumable = shots.length > 0;
      }
      if (runsRes.ok) {
        const runs = await runsRes.json() as Array<Record<string, unknown>>;
        runStatus = (runs?.[0]?.status as string) ?? "";
      }
      // LangGraph state wipe (agent restart) ≠ cut gone: rehydrate
      // resumability from the B2 snapshot the agent writes after mutations.
      if (!resumable) {
        const snap = await fetchSnapshot(tid);
        if (snap) {
          const shots = Array.isArray(snap.shots) ? (snap.shots as Array<Record<string, unknown>>) : [];
          shotsReady = shots.filter((s) => s.video_url || s.clip_url || s.ref_image_url).length;
          finalUrl = ((snap.final_video_url ?? snap.durable_url ?? "") as string) || finalUrl;
          resumable = shots.length > 0;
        }
      }
    } catch { /* probe failure → not resumable */ }
    return json({
      found: true,
      threadId: tid,
      title: rec.title ?? "",
      status: runStatus || rec.status || "unknown",
      recordedAt: rec.updatedAt ?? 0,
      resumable,
      shotsReady,
      finalUrl,
    });
  }

  // ---- Non-copilotkit routes pass through unchanged ----
  if (!url.pathname.startsWith("/api/copilotkit")) {
    return copilotApp.fetch(req);
  }

  // ---- /info cache (short-circuit before hitting the runtime) ----
  // Many CopilotKit client retries hammer /info; cache it briefly.
  if (url.pathname === "/api/copilotkit/info" && req.method === "GET") {
    const now = Date.now();
    if (_infoCache && now - _infoCache.at < INFO_CACHE_TTL_MS) {
      return rewriteWsUrl(
        new Response(_infoCache.body, {
          status: _infoCache.status,
          headers: _infoCache.headers,
        }),
      );
    }
    const fresh = await rewriteWsUrl(await copilotApp.fetch(req));
    // Only cache 2xx — never cache failures.
    if (fresh.status >= 200 && fresh.status < 300) {
      try {
        const body = await fresh.clone().text();
        _infoCache = { at: now, status: fresh.status, headers: fresh.headers, body };
      } catch { /* ignore caching failure */ }
    }
    return fresh;
  }

  // ---- Inject BYOK key + budget into POST body ----
  const requestId = randomUUID();
  const requestStart = Date.now();
  const userRunwayKey = req.headers.get("x-runway-api-key") ?? "";

  let proxiedReq = req;
  let threadId = "";
  let agentId = "";
  if (req.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      // Not JSON — pass through as-is
      return rewriteErrors(await copilotApp.fetch(req));
    }

    // Extract thread ID and agent ID from the request body.
    threadId =
      (body.threadId as string | undefined) ??
      (body.thread_id as string | undefined) ??
      "";
    agentId =
      (body.agentId as string | undefined) ??
      (body.agent_id as string | undefined) ??
      "";

    // ---- Per-thread circuit breaker ----
    const cb = breakerCheck(threadId);
    if (cb.open) {
      return new Response(
        JSON.stringify({
          error: "Thread is temporarily unavailable",
          hint: "This thread had repeated failures and is in cooldown. Start a new conversation (sidebar → +).",
          command: "new-thread",
        }),
        {
          status: 423, // Locked
          headers: {
            "content-type": "application/json",
            "retry-after": String(cb.retryAfterSec),
          },
        },
      );
    }

    // ---- Global concurrency cap with FIFO queue ----
    let queuePosition = 0;
    let waitedMs = 0;
    try {
      ({ queuePosition, waitedMs } = await acquireSlot());
    } catch (qErr: unknown) {
      const isFull = qErr instanceof Error && qErr.message === "queue_full";
      const isTimeout = qErr instanceof Error && qErr.message === "queue_timeout";
      const hint = isFull
        ? `Queue is full (${MAX_QUEUE_WAITERS} waiters). Try again in a moment.`
        : `Waited ${Math.round(QUEUE_TIMEOUT_MS / 1000)}s for a slot — server is overloaded.`;
      return new Response(
        JSON.stringify({ error: "Server is busy", hint }),
        {
          status: 503,
          headers: { "content-type": "application/json", "retry-after": "30" },
        },
      );
    }
    const currentCount = threadId ? await threadCallCount(threadId) : 0;
    const callsRemaining = Math.max(0, RUNWAY_BUDGET - currentCount);

    // Inject into forwardedProps.config.configurable — LangGraph passes
    // these to the Python agent via get_config()["configurable"].
    const fp = (body.forwardedProps as Record<string, unknown>) ?? {};
    const cfg = (fp.config as Record<string, unknown>) ?? {};
    const cfgurable = (cfg.configurable as Record<string, unknown>) ?? {};

    const injected: Record<string, unknown> = {
      ...cfgurable,
      runway_calls_remaining: callsRemaining,
      runway_budget: RUNWAY_BUDGET,
      request_id: requestId,
      // In intelligence mode the agent executes on an internal twin thread;
      // billing must key on the UI-visible thread (matches budget checks).
      ui_thread_id: threadId,
    };
    // Only inject the user key if one was provided — never overwrite with empty.
    if (userRunwayKey) {
      injected.runway_api_key = userRunwayKey;
    }

    const newBody = {
      ...body,
      forwardedProps: {
        ...fp,
        config: { ...cfg, configurable: injected },
      },
    };

    proxiedReq = new Request(req.url, {
      method: req.method,
      headers: req.headers,
      body: JSON.stringify(newBody),
    });

    // ---- Execute with slot + breaker tracking ----
    const cbPost = breakerCheck(threadId);
    const breakerState = cbPost.open ? "open" : "closed";
    const estWaitSec = queuePosition > 0 ? queuePosition * EST_RUN_SECONDS : 0;
    try {
      const res = await rewriteWsUrl(rewriteErrors(await copilotApp.fetch(proxiedReq)));
      if (res.status === 409 || res.status >= 500) {
        breakerRecordFailure(threadId);
      } else if (res.status >= 200 && res.status < 400) {
        breakerRecordSuccess(threadId);
      }
      const durationMs = Date.now() - requestStart;
      console.log(JSON.stringify({
        request_id: requestId,
        thread_id: threadId,
        agent_id: agentId,
        status: res.status,
        duration_ms: durationMs,
        breaker_state: breakerState,
        inflight: inflightCount(),
        queue_position: queuePosition,
        waited_ms: waitedMs,
      }));
      const outHeaders = new Headers(res.headers);
      if (queuePosition > 0) {
        outHeaders.set("X-Queue-Position", String(queuePosition));
        outHeaders.set("X-Estimated-Wait", String(estWaitSec));
      }
      return new Response(res.body, { status: res.status, headers: outHeaders });
    } catch (e) {
      breakerRecordFailure(threadId);
      const durationMs = Date.now() - requestStart;
      console.log(JSON.stringify({
        request_id: requestId,
        thread_id: threadId,
        agent_id: agentId,
        status: 0,
        duration_ms: durationMs,
        breaker_state: breakerState,
        inflight: inflightCount(),
        queue_position: queuePosition,
        waited_ms: waitedMs,
        error: e instanceof Error ? e.message : "unknown",
      }));
      throw e;
    } finally {
      releaseSlot();
    }
  }

  // GETs (info polling, etc.) pass through without slot tracking.
  return rewriteWsUrl(rewriteErrors(await copilotApp.fetch(proxiedReq)));
}

// ---- Thread-state proxy ----
// Fetches persisted LangGraph checkpoint for a thread so the frontend can
// restore the canvas when the user switches to a previous thread.
//
// FALLBACK: the in-memory LangGraph runtime wipes state on restart. The
// agent snapshots restore-relevant state to B2 (snapshots/<threadId>.json)
// after every mutation, so when LangGraph can no longer serve real state
// we rehydrate the canvas from the durable snapshot.
const LANGGRAPH_URL = process.env.LANGGRAPH_DEPLOYMENT_URL ?? "http://localhost:8123";
// NOTE: B2_PUBLIC_URL_BASE already includes `/file/<bucket>`.
const SNAP_URL_BASE = (process.env.B2_PUBLIC_URL_BASE ?? "").replace(/\/$/, "");

async function fetchSnapshot(threadId: string): Promise<Record<string, unknown> | null> {
  if (!SNAP_URL_BASE) return null;
  try {
    const res = await fetch(
      `${SNAP_URL_BASE}/snapshots/${encodeURIComponent(threadId)}.json`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function handleThreadState(threadId: string): Promise<Response> {
  try {
    const upstream = await fetch(`${LANGGRAPH_URL}/threads/${encodeURIComponent(threadId)}/state`, {
      signal: AbortSignal.timeout(5000),
    });
    const body = await upstream.text();
    // Live checkpoint wins when it actually carries content; a 200 with an
    // empty/absent values object (post-restart wipe) falls through to B2.
    if (upstream.ok) {
      try {
        const parsed = JSON.parse(body) as { values?: Record<string, unknown> };
        const vals = parsed.values ?? {};
        const shots = Array.isArray(vals.shots) ? vals.shots : [];
        if (Object.keys(vals).length > 0 && (shots.length > 0 || vals.storyboard)) {
          return new Response(body, {
            status: upstream.status,
            headers: { "content-type": "application/json" },
          });
        }
      } catch { /* unparseable → try snapshot */ }
    }
    const snap = await fetchSnapshot(threadId);
    if (snap) {
      return new Response(JSON.stringify({ values: snap, source: "b2-snapshot" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(body, {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    const snap = await fetchSnapshot(threadId);
    if (snap) {
      return new Response(JSON.stringify({ values: snap, source: "b2-snapshot" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "upstream_timeout" }), {
      status: 504,
      headers: { "content-type": "application/json" },
    });
  }
}

async function handleRunVault(threadId: string): Promise<Response> {
  try {
    const upstream = await fetch(`${LANGGRAPH_URL}/threads/${encodeURIComponent(threadId)}/state`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!upstream.ok) {
      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: { "content-type": "application/json" },
      });
    }
    const raw = (await upstream.json()) as { values?: Record<string, unknown> };
    const vault = vaultFromThreadValues(raw.values);
    return new Response(JSON.stringify(vault), {
      headers: { "content-type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "upstream_timeout" }), {
      status: 504,
      headers: { "content-type": "application/json" },
    });
  }
}

const app = { fetch: handleRequest };

const port = Number(process.env.PORT) || 4000;

serve({ fetch: app.fetch, port }, () => {
  console.log(`BFF ready at http://localhost:${port}`);
});
