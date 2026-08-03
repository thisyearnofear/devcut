// health.ts — Liveness, readiness, and error-rewriting helpers

import { breakersOpenCount, inflightCount } from "./admission.js";

// ---- Liveness ----
export function handleLivez(): Response {
  return new Response("ok", { status: 200 });
}

// ---- Readiness ----
export async function handleReadyz(): Promise<Response> {
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
      inflight: inflightCount(),
      breakers_open: breakersOpenCount(),
    }),
    {
      status: allOk ? 200 : 503,
      headers: { "content-type": "application/json" },
    },
  );
}

// ---- Error rewriting ----
// Maps known 5xx bodies to structured { error, hint, command } payloads
// the UI renders as actionable toasts.
export async function rewriteErrors(res: Response): Promise<Response> {
  const status = res.status;
  if (status < 500 || status > 599) return res;
  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("json") && !ctype.includes("text")) return res;
  let body: string;
  try { body = await res.clone().text(); } catch { return res; }

  if (
    body.includes("threads_user_id_fkey") ||
    (body.includes("Failed to initialize thread") && body.includes("user_id"))
  ) {
    return new Response(
      JSON.stringify({
        error: "Postgres user seed missing",
        hint: "Run `npm run seed` to seed the default user, then retry.",
        command: "npm run seed",
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  if (
    body.includes("AgentThreadLockedError") ||
    /Thread\s+[0-9a-f-]{36}\s+is locked/i.test(body)
  ) {
    return new Response(
      JSON.stringify({
        error: "Thread is locked",
        hint:
          "A previous turn errored mid-stream and didn't release the run " +
          "lock. Start a new conversation (sidebar → +) to continue.",
        command: "new-thread",
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  return res;
}

// ---- WS URL rewrite ----
// When PUBLIC_INTELLIGENCE_WS_URL is set, rewrite the wsUrl field in
// runtime-info JSON so the browser connects through the public proxy.
const PUBLIC_INTELLIGENCE_WS_URL = process.env.PUBLIC_INTELLIGENCE_WS_URL ?? "";

export async function rewriteWsUrl(resPromise: Response | Promise<Response>): Promise<Response> {
  const res = await resPromise;
  if (!PUBLIC_INTELLIGENCE_WS_URL) return res;
  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("json")) return res;
  let text: string;
  try { text = await res.text(); } catch { return res; }
  let json: Record<string, unknown>;
  try { json = JSON.parse(text); } catch { return new Response(text, res); }
  let changed = false;
  const intel = json.intelligence as Record<string, unknown> | undefined;
  if (intel?.wsUrl) {
    intel.wsUrl = PUBLIC_INTELLIGENCE_WS_URL;
    changed = true;
  }
  const realtime = json.realtime as Record<string, unknown> | undefined;
  if (realtime?.clientUrl && typeof realtime.clientUrl === "string") {
    realtime.clientUrl = `${PUBLIC_INTELLIGENCE_WS_URL.replace(/\/$/, "")}/client`;
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
