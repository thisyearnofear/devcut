# ADR 0004 — WebMCP: expose the director canvas to external browser agents

**Status:** Implemented (merged 2026-08-27, PR #1; live on prod `release=20260827_160002` — 5 tools registered on `document.modelContext` at `/director`) · **Date:** 2026-08-27

## Context

The WebMCP Challenge (Devpost/OpenAI, deadline 2026-09-03) asks for "an app
that becomes meaningfully better when people and their agents can use it
together." DevCut already has the hard part: a real-time mutable canvas
(`StoryboardState`, synced from LangGraph via AG-UI `STATE_SNAPSHOT`) where
agent actions visibly change what the human sees. Today only the *embedded*
CopilotKit agent can drive it — external agents (ChatGPT's in-app browser,
flag-enabled Chrome) get nothing.

Constraints that shaped the design:

- Video pipelines take **minutes**; WebMCP tool calls must not block.
- WebMCP executes in-page **with the user's cookies** — BYOK vault, budgets,
  and billing should inherit the session, not re-implement auth.
- The draft spec is early; the exact `document.modelContext` surface must be
  treated as unverified until probed (playbook Phase 1).
- All actions a tool needs live as React callbacks inside
  `apps/frontend/src/app/director/page.tsx` — unreachable from
  browser-context tool closures.

## Decision

1. **Controller singleton** (`apps/frontend/src/lib/webmcp/controller.ts`):
   the director page publishes its handlers + latest `StoryboardState`
   snapshot to `directorController`; tools read them back at `execute` time.
   Zero change to human UX; zero BFF/agent changes.
2. **Five tools** (`register-tools.ts`), one per thing a human already does:
   - read-only (always registered): `get_storyboard_state`, `get_export`
   - auth-gated (registered only when session permits): `start_cutdown`,
     `regenerate_shot`, `cancel_run`
3. **Start-don't-block**: mutating tools kick off a run and return
   immediately; descriptions tell agents to poll `get_storyboard_state`.
   `cancel_run` reuses the existing `agent.abortRun()` path.
4. **Fresh-value guards**: `isRunning` and the auth gate are read through
   refs (`isRunningRef`, `canMutateRef`), never state captured at
   effect-registration time — stale closures are bug class #1 here.
5. **Auth gating follows ADR-0002**: read-only tools register always
   (anonymous browsing preserved); mutating tools only when
   `NEXT_PUBLIC_AUTH_ENABLED` is off (anonymous demo mode) or the user is
   signed in. Server endpoints stay cookie-protected (BFF gate + vault +
   budget) — client checks are defense-in-depth that fail fast with a
   message the agent can read.
6. **SessionProvider always mounted** (`AuthSessionProvider`): auth-disabled
   mode renders `<SessionProvider session={null}>` (defined prop ⇒ no session
   fetch, anonymous flow byte-identical). Required because `useSession()`
   destructures the raw context value, which is `undefined` with no provider
   — a production crash, not just a dev warning.
7. **No COOP/COEP** headers unless the Phase-1 spike proves they're required
   (and then `credentialless`, never `require-corp` — cross-origin Runway/B2
   media carries no CORP headers and `require-corp` would blank the canvas).

## Alternatives considered

- **REST bridge for agents** (`POST /api/agent/run` + poll endpoint) —
  duplicates BFF auth/budget/vault wiring and loses the shared-session
  property; the in-page model gets it free. Rejected.
- **Blocking `run_cutdown` tool** — multi-minute tool call reads as a hang /
  timeout during demos. Rejected (start-don't-block instead).
- **Register from `Page()`** — the handlers live in `DirectorCanvas`;
  wiring there keeps ref freshness and `useSession` inside the provider
  tree. Chosen.

## Consequences

- External agents can commission, inspect, diagnose erroring shots,
  regenerate, cancel, and fetch export artifacts — under the human's
  identity, vaulted Runway key, and metered budget.
- Tool names/descriptions are user-visible surface: Phase-4 hardening
  against observed agent failures is expected (playbook).
- `types.d.ts` ambient typings must be re-verified against the real
  `document.modelContext` surface once the Phase-1 spike runs; tool payloads
  are unaffected either way.

## Links

- Tools: `apps/frontend/src/lib/webmcp/register-tools.ts`
- Controller: `apps/frontend/src/lib/webmcp/controller.ts`
- Wiring: `apps/frontend/src/app/director/page.tsx` (`DirectorCanvas`)
- Plan + risk register: `docs/webmcp-playbook.md`
- README section: `README.md` → "WebMCP integration"
