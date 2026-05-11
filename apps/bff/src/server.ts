import { serve } from "@hono/node-server";
import {
  CopilotRuntime,
  CopilotKitIntelligence,
  createCopilotEndpoint,
} from "@copilotkit/runtime/v2";
import { LangGraphAgent } from "@copilotkit/runtime/langgraph";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";

const intelligence = new CopilotKitIntelligence({
  apiKey:
    process.env.INTELLIGENCE_API_KEY ?? "cpk_sPRVSEED_seed0privat0longtoken00",
  apiUrl: process.env.INTELLIGENCE_API_URL ?? "http://localhost:4203",
  wsUrl: process.env.INTELLIGENCE_GATEWAY_WS_URL ?? "ws://localhost:4403",
});

// Public-facing WebSocket URL that the browser can reach.
// In production the Intelligence gateway lives on an internal Docker network,
// so Caddy proxies wss://<DOMAIN>/ws/* → intelligence:4401.
// When set, the BFF rewrites the wsUrl in the runtime-info response so the
// CopilotKit client SDK connects through the public proxy instead of the
// unreachable internal hostname.
const PUBLIC_INTELLIGENCE_WS_URL = process.env.PUBLIC_INTELLIGENCE_WS_URL ?? "";

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

// ----------------------------------------------------------------- bulkheads
// Two layers of admission control sit in front of the CopilotKit endpoint:
//
// 1. Per-thread circuit breaker — if a thread accumulates K consecutive
//    failures (409 / 5xx / network error) within a sliding window, we open
//    its breaker for COOLDOWN seconds and short-circuit further requests
//    with 423 Locked + Retry-After. This is the key defense against the
//    cascade where a single stuck thread → CopilotKit retries → BFF storms
//    Intelligence → Intelligence's app-api UnhandledPromiseRejection →
//    everyone hangs. Failures must be confined to the bad thread.
//
// 2. Global concurrency semaphore with FIFO queue — a hard cap on in-flight
//    CopilotKit POST handlers. Above the cap, up to MAX_QUEUE_WAITERS requests
//    are held in a FIFO queue (max QUEUE_TIMEOUT_MS). When a slot opens the
//    oldest waiter is released. If the queue is full or the waiter times out
//    we shed with 503 + Retry-After. Queue position + estimated wait are
//    returned in X-Queue-Position / X-Estimated-Wait headers so the frontend
//    can show "Position 2 of 3 — ~4 min wait" instead of a generic spinner.
//
// Both layers are intentionally process-local (Map / counter, not Redis): the
// failure modes we're guarding against are localised to one BFF instance,
// and we want zero external dependencies on the recovery path.

const CB_FAILURES_TO_OPEN = Number(process.env.CB_FAILURES_TO_OPEN ?? 3);
const CB_WINDOW_MS        = Number(process.env.CB_WINDOW_MS ?? 15_000);
const CB_COOLDOWN_MS      = Number(process.env.CB_COOLDOWN_MS ?? 30_000);
const MAX_INFLIGHT_RUNS   = Number(process.env.MAX_INFLIGHT_RUNS ?? 3);
const MAX_QUEUE_WAITERS   = Number(process.env.MAX_QUEUE_WAITERS ?? 5);
const QUEUE_TIMEOUT_MS    = Number(process.env.QUEUE_TIMEOUT_MS ?? 60_000);
// Estimated seconds per run — used to compute X-Estimated-Wait for queued
// requests. Defaults to 5 min (300 s) which matches a full director run.
const EST_RUN_SECONDS     = Number(process.env.EST_RUN_SECONDS ?? 300);

interface ThreadBreakerState {
  failures: number[];   // ms timestamps within window
  openUntil: number;    // 0 if closed
}
const _breakers = new Map<string, ThreadBreakerState>();

function breakerCheck(threadId: string): { open: boolean; retryAfterSec: number } {
  if (!threadId) return { open: false, retryAfterSec: 0 };
  const s = _breakers.get(threadId);
  if (!s) return { open: false, retryAfterSec: 0 };
  const now = Date.now();
  if (s.openUntil > now) {
    return { open: true, retryAfterSec: Math.ceil((s.openUntil - now) / 1000) };
  }
  if (s.openUntil > 0 && s.openUntil <= now) {
    // Cooldown expired; reset.
    _breakers.delete(threadId);
  }
  return { open: false, retryAfterSec: 0 };
}

function breakerRecordFailure(threadId: string): void {
  if (!threadId) return;
  const now = Date.now();
  const s = _breakers.get(threadId) ?? { failures: [], openUntil: 0 };
  s.failures = s.failures.filter((t) => now - t < CB_WINDOW_MS);
  s.failures.push(now);
  if (s.failures.length >= CB_FAILURES_TO_OPEN) {
    s.openUntil = now + CB_COOLDOWN_MS;
    s.failures = [];
    console.warn(
      `[bff] circuit breaker OPEN thread=${threadId} cooldown=${CB_COOLDOWN_MS}ms`,
    );
  }
  _breakers.set(threadId, s);
}

function breakerRecordSuccess(threadId: string): void {
  if (!threadId) return;
  // Any success closes the breaker entirely.
  if (_breakers.has(threadId)) _breakers.delete(threadId);
}

// Periodic GC so breaker state doesn't accumulate forever for one-off threads.
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of _breakers) {
    const stale = s.failures.every((t) => now - t > CB_WINDOW_MS);
    if (stale && s.openUntil <= now) _breakers.delete(id);
  }
}, 60_000).unref();

let _inflight = 0;

// FIFO queue of resolve functions — each entry is a callback that unblocks
// one waiting request when a concurrency slot opens.
type QueueEntry = { resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };
const _queue: QueueEntry[] = [];

/** Acquire a concurrency slot. Waits in queue if at capacity. */
async function acquireSlot(): Promise<{ queuePosition: number; waitedMs: number }> {
  if (_inflight < MAX_INFLIGHT_RUNS) {
    _inflight++;
    return { queuePosition: 0, waitedMs: 0 };
  }
  if (_queue.length >= MAX_QUEUE_WAITERS) {
    throw Object.assign(new Error("queue_full"), { status: 503 });
  }
  const position = _queue.length + 1;
  const waitStart = Date.now();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = _queue.findIndex((e) => e.resolve === resolve);
      if (idx !== -1) _queue.splice(idx, 1);
      reject(Object.assign(new Error("queue_timeout"), { status: 503 }));
    }, QUEUE_TIMEOUT_MS);
    _queue.push({ resolve, reject, timer });
  });
  _inflight++;
  return { queuePosition: position, waitedMs: Date.now() - waitStart };
}

/** Release a concurrency slot and unblock the next waiter if any. */
function releaseSlot(): void {
  _inflight = Math.max(0, _inflight - 1);
  const next = _queue.shift();
  if (next) {
    clearTimeout(next.timer);
    next.resolve();
  }
}

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
  // /livez returns 200 as long as the event loop is alive. Use this for
  // PM2/Docker liveness probes — restarting the BFF because Intelligence
  // is having a bad minute makes everything worse, not better.
  if (url.pathname === "/livez") {
    return new Response("ok", { status: 200 });
  }

  // ---- Readiness + legacy /health ----
  // /readyz (and the legacy /health alias) probes downstream dependencies
  // and returns 503 when one is degraded. Use this for *load balancer*
  // and *deploy script* checks where you want traffic shifted away from a
  // sick node — but never for a process supervisor.
  if (url.pathname === "/readyz" || url.pathname === "/health") {
    const checks: Record<string, string> = {};
    const probe = async (name: string, target: string, headers?: Record<string, string>) => {
      try {
        const r = await fetch(target, { signal: AbortSignal.timeout(3000), headers });
        checks[name] = `ok (${r.status})`;
      } catch (e: unknown) {
        checks[name] = `fail (${e instanceof Error ? e.message : "unknown"})`;
      }
    };
    const intelKey = process.env.INTELLIGENCE_API_KEY ?? "";
    await Promise.all([
      probe(
        "intelligence",
        `${process.env.INTELLIGENCE_API_URL ?? "http://localhost:4203"}/api/threads`,
        intelKey ? { Authorization: `Bearer ${intelKey}` } : undefined,
      ),
      probe("agent", `${process.env.LANGGRAPH_DEPLOYMENT_URL ?? "http://localhost:8123"}/ok`),
      probe("mcp", `${process.env.MCP_SERVER_URL ?? "http://localhost:3001/mcp"}`),
    ]);
    const allOk = Object.values(checks).every((v) => v.startsWith("ok"));
    return new Response(
      JSON.stringify({
        status: allOk ? "healthy" : "degraded",
        services: checks,
        inflight: _inflight,
        breakers_open: Array.from(_breakers.values()).filter((s) => s.openUntil > Date.now()).length,
      }),
      {
        status: allOk ? 200 : 503,
        headers: { "content-type": "application/json" },
      },
    );
  }

  // ---- Budget increment endpoint (called by Python agent) ----
  if (url.pathname === "/api/runway-call-used" && req.method === "POST") {
    let body: Record<string, unknown> = {};
    try { body = await req.json() as Record<string, unknown>; } catch { /* ignore */ }
    const threadId = body.thread_id as string | undefined;
    if (threadId) {
      const next = await incrementThreadCallCount(threadId);
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
    // Refuse fast for threads that are currently flapping. This keeps the
    // failure isolated to the bad thread instead of letting CopilotKit's
    // retry loop turn into a BFF→Intelligence DoS.
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
        inflight: _inflight,
        queue_position: queuePosition,
        waited_ms: waitedMs,
      }));
      // Clone response to inject queue headers (Response headers are immutable).
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
        inflight: _inflight,
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

// ----------------------------------------------------------------- ws url rewrite
// When PUBLIC_INTELLIGENCE_WS_URL is set, rewrite the `intelligence.wsUrl`
// field in the runtime-info JSON response so the browser connects to the
// public Caddy proxy instead of the internal Docker hostname.
async function rewriteWsUrl(resPromise: Response | Promise<Response>): Promise<Response> {
  const res = await resPromise;
  if (!PUBLIC_INTELLIGENCE_WS_URL) return res;
  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("json")) return res;
  let text: string;
  try { text = await res.text(); } catch { return res; }
  let json: Record<string, unknown>;
  try { json = JSON.parse(text); } catch { return new Response(text, res); }
  let changed = false;
  // Rewrite intelligence.wsUrl in /info responses
  const intel = json.intelligence as Record<string, unknown> | undefined;
  if (intel?.wsUrl) {
    intel.wsUrl = PUBLIC_INTELLIGENCE_WS_URL;
    changed = true;
  }
  // Rewrite realtime.clientUrl in /run responses so the browser connects
  // through the public proxy instead of the internal Docker hostname.
  const realtime = json.realtime as Record<string, unknown> | undefined;
  if (realtime?.clientUrl && typeof realtime.clientUrl === "string") {
    // PUBLIC_INTELLIGENCE_WS_URL is e.g. "wss://domain/ws".
    // Nginx maps /ws/* → /client/* on the gateway, so the clientUrl
    // should be the bare public WS base — the SDK appends /websocket.
    realtime.clientUrl = PUBLIC_INTELLIGENCE_WS_URL;
    changed = true;
  }
  if (changed) {
    return new Response(JSON.stringify(json), {
      status: res.status,
      headers: res.headers,
    });
  }
  return new Response(text, res);
}

// Rewrite known 5xx error bodies into structured { error, hint, command }
// payloads the UI can render as actionable toasts.
async function rewriteErrors(res: Response): Promise<Response> {
  const status = res.status;
  if (status < 500 || status > 599) return res;
  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("json") && !ctype.includes("text")) return res;
  let body: string;
  try { body = await res.clone().text(); } catch { return res; }

  const isThreadFkey =
    body.includes("threads_user_id_fkey") ||
    (body.includes("Failed to initialize thread") && body.includes("user_id"));
  if (isThreadFkey) {
    return new Response(
      JSON.stringify({
        error: "Postgres user seed missing",
        hint: "Run `npm run seed` to seed the default user, then retry.",
        command: "npm run seed",
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const isThreadLocked =
    body.includes("AgentThreadLockedError") ||
    /Thread\s+[0-9a-f-]{36}\s+is locked/i.test(body);
  if (isThreadLocked) {
    return new Response(
      JSON.stringify({
        error: "Thread is locked",
        hint:
          "A previous turn errored mid-stream and didn't release the run " +
          "lock. Start a new conversation (sidebar → +) to continue.",
        command: "new-thread",
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  return res;
}

const app = { fetch: handleRequest };

const port = Number(process.env.PORT) || 4000;

serve({ fetch: app.fetch, port }, () => {
  console.log(`BFF ready at http://localhost:${port}`);
});
