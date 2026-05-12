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

const app = { fetch: handleRequest };

const port = Number(process.env.PORT) || 4000;

serve({ fetch: app.fetch, port }, () => {
  console.log(`BFF ready at http://localhost:${port}`);
});
