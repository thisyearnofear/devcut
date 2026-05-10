import { serve } from "@hono/node-server";
import {
  CopilotRuntime,
  CopilotKitIntelligence,
  createCopilotEndpoint,
} from "@copilotkit/runtime/v2";
import { LangGraphAgent } from "@copilotkit/runtime/langgraph";
import Redis from "ioredis";

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
const director = new LangGraphAgent({
  deploymentUrl:
    process.env.LANGGRAPH_DEPLOYMENT_URL ?? "http://localhost:8123",
  graphId: "director",
  langsmithApiKey: process.env.LANGSMITH_API_KEY ?? "",
  assistantConfig: {
    recursion_limit: Number(process.env.LANGGRAPH_RECURSION_LIMIT ?? 60),
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
const copilotApp = createCopilotEndpoint({
  basePath: "/api/copilotkit",
  runtime: new CopilotRuntime({
    intelligence,
    identifyUser: () => ({ id: "default", name: "Hackathon User" }),
    licenseToken: process.env.COPILOTKIT_LICENSE_TOKEN,
    agents: { default: agent, director },
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

  // ---- Inject BYOK key + budget into POST body ----
  const userRunwayKey = req.headers.get("x-runway-api-key") ?? "";

  let proxiedReq = req;
  if (req.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      // Not JSON — pass through as-is
      return rewriteErrors(await copilotApp.fetch(req));
    }

    // Extract thread ID from the request body (CopilotKit always sends it).
    const threadId =
      (body.threadId as string | undefined) ??
      (body.thread_id as string | undefined) ??
      "";
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
  }

  return rewriteErrors(await copilotApp.fetch(proxiedReq));
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
