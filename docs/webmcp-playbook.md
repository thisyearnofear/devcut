# DevCut × WebMCP Challenge — Implementation Playbook

> **Deadline: Wed 3 Sept 2026, 9:00pm GMT+1.** This playbook assumes you start
> Thu 27 Aug → **7 working days**. Do not renegotiate Phase 0 or Phase 5.
>
> Status tracking: tick the checkboxes as you go. When you come back for review,
> bring this file with ticks filled in and notes added under each phase's
> **Review notes:** placeholder — the reviewer will read those first.

---

## Why this is worth doing (30-second version)

The challenge asks for "an app that becomes meaningfully better when people and
their agents can use it together." DevCut already has the hard part built: a
real-time mutable canvas (`StoryboardState`, synced from LangGraph via AG-UI
`STATE_SNAPSHOT`) where agent actions visibly change what the human sees. Most
entrants will ship CRUD demos (the challenge's own example is
`search_products`). Our job is to surface what exists — not build a product.

Judging criteria and where we score:

| Criterion | Our angle |
| --- | --- |
| WebMCP Leverage | Non-trivial read/write/cancel tools over a genuinely mutable canvas |
| Execution | Working production product today; tools ride existing session/auth/budget plumbing |
| Potential Impact | Hackathon organizers + builders; x402-metered agents paying per job |
| Creativity | Human commissions a cut; an *external* agent (ChatGPT) inspects, diagnoses an erroring shot, fixes it; both watch the stitch |

## Core design decisions (agreed upfront — don't relitigate mid-week)

1. **Start-don't-block.** Mutating tools (`start_cutdown`, `regenerate_shot`)
   kick off a run and return immediately. Video pipelines take minutes; WebMCP
   tool calls must not block for minutes. Agents poll `get_storyboard_state`.
   The live canvas updating while ChatGPT narrates IS the demo.
2. **No COOP/COEP cargo cult.** `COEP: require-corp` would blank the canvas
   (cross-origin Runway/B2 media carries no CORP headers). Verify empirically
   whether isolation is required at all (Phase 1); only add
   `credentialless` if proven necessary.
3. **Auth-gate mutation.** Read-only tools register always. Mutating tools
   register only when signed in (ADR-0002 preserved).
4. **Session identity is free.** Tools execute in-page with the user's cookies,
   so BYOK vault decryption, `budgetKey(userId, threadId)` budgets, and
   `ui_thread_id` billing injection all work unchanged. Zero BFF changes planned.
5. **One tool = one thing the human already does on the canvas.** No
   kitchen-sink tools; descriptions written for how agents actually behave
   (iterate on them in Phase 4).

---

## Phase 0 — Compliance lock-in (do TODAY, ~45 min, non-negotiable)

These are silent-failure disqualifiers if missed. Do them before any coding.

- [ ] **Add an OSI license at repo root.** No `LICENSE` file exists.
      Choose MIT unless there's a reason otherwise:

      ```
      cp /dev/null LICENSE   # then paste MIT text with: Copyright (c) 2026 thisyearnofear
      git add LICENSE && git commit -m "Add MIT license"
      ```

- [ ] **Confirm repo is PUBLIC** at https://github.com/thisyearnofear/gen-ui —
      judges must reach source without credentials. Check Settings → Danger Zone
      → Change visibility. If it stays private for hygiene reasons, fork a
      public mirror instead (and note which one goes on the submission form).
- [ ] **Verify license appears in the GitHub About sidebar** (Devpost says it
      must be detectable there). May need a force-push/repo edit to refresh.
- [ ] **Create the Devpost submission draft NOW** (don't wait for day 7):
      - Title, one-liner, tags (AI, Web, MCP).
      - Note the required fields: live URL, YouTube link (public, ≤3 min,
        with audio), repo URL, text description answering the four prompts.
- [ ] **Book the demo-filming slot** (Day 6, see Phase 5). Audio required —
      check mic today, not on filming day.

**Review notes:** _(what you actually did, anything deviated)_

---

## Phase 1 — Spike: verify the environment (Day 1, half day)

Everything below is *verification*, not building. Each item either unblocks a
later phase or kills an assumption. Do them in order; record results in the
review notes.

- [ ] **1.1 Local Chrome flag test with a toy page.** Enable
      `chrome://flags/#enable-webmcp-testing`, restart Chrome. Host any page
      (even `localhost`) calling `document.modelContext.registerTool(...)`
      per the challenge snippet shape:

      ```ts
      document.modelContext.registerTool({
        name: "ping",
        description: "Returns pong",
        inputSchema: { type: "object", properties: {} },
        execute: async () => "pong",
      });
      ```

      Confirm in DevTools `document.modelContext` exists and registration
      doesn't throw. Record **the exact runtime API surface**: does
      `registerTool` return a promise? Is there an unregister path? What events
      exist (`ontoolchange` or otherwise)? Screenshot flag state.

- [ ] **1.2 ChatGPT in-app browser test** — deploy the toy page to any public
      HTTPS host and open it via ChatGPT's browser; confirm tool discovery with
      no flag. If this fails entirely, Phase 5's plan changes (screen-record
      the Chrome-flag demo instead) — decide early.
- [ ] **1.3 COOP/COEP check — try to BREAK the claim, don't add headers.**
      Open `https://devcut.thisyearnofear.com/director` in flag-enabled Chrome
      and run 1.2 against prod. If tools work with no cross-origin-isolation
      requirement → skip COOP/COEP permanently. Only if isolation is explicitly
      demanded, add `credentialless` (NEVER `require-corp`) via
      `async headers()` in `apps/frontend/next.config.ts` (see risk R3).
- [ ] **1.4 Auth-in-webview probe.** On prod `/director`, click GitHub sign-in
      from inside ChatGPT's browser. If OAuth fails there, we lean on:
      (a) anonymous read-only demo + (b) pre-submitted credentials on the
      Devpost form (rules allow this). Record the failure mode now.
- [ ] **1.5 Baseline prod sanity** (so later debugging isn't confounded):
      - `curl -s https://devcut.thisyearnofear.com/api/auth-probe`
      - Start one normal cut in the browser; confirm LIVE stitch, not the MOCK
        Big Buck Bunny placeholder (ffmpeg must stay installed on nuncio-vultr).
      - Confirm budget counter increments (`runway:budget:` Redis key).

**Review notes:** _(flag version/behavior observed, OAuth verdict, COOP verdict)_


## Phase 2 — Extract the storyboard controller (Days 2–3, the real work)

### The problem

Every action a WebMCP tool must perform currently lives as a React callback
inside `apps/frontend/src/app/director/page.tsx` (~2055 lines):
`injectPrompt` (line ~1124), `handleCancel` (line ~1343), `handleRegenerate`
(line ~1481), plus live state from `useLiveStoryboardState()` (line ~110).
Browser-context tools cannot reach into component closures. We lift a thin
controller out; tools call the controller; the page keeps using its own
callbacks (zero UX regression).

### Step-by-step

- [ ] **2.1 Create `apps/frontend/src/lib/webmcp/types.d.ts`** — minimal ambient
      typing for the draft API (verify exact shapes during Phase 1 and adjust):

      ```ts
      export interface WebMcpTool {
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
        annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
        execute(input: Record<string, unknown>): Promise<unknown>;
      }

      export interface ModelContext {
        registerTool(tool: WebMcpTool): Promise<void> | void;
        // keep only what Phase 1 confirmed exists:
        unregisterTool?(name: string): Promise<void> | void;
        ontoolchange?: ((ev: Event) => void) | null;
      }

      declare global {
        interface Document {
          modelContext?: ModelContext;
        }
      }
      ```

- [ ] **2.2 Create `apps/frontend/src/lib/webmcp/controller.ts`** — a plain
      singleton holding getters/setters that both the page and the tools use:

      ```ts
      import type { StoryboardState } from "@/lib/storyboard/types";

      /** Actions the director page exposes to consumers outside React. */
      export interface DirectorActions {
        /** Equivalent of injectPrompt/handleComposeSend — starts an agent run. */
        startRun(brief: string): void;
        /** Regenerate a single shot (mirrors handleRegenerate). */
        regenerateShot(shotId: string): void;
        /** Mirrors handleCancel → agent.abortRun(). */
        cancelRun(): void;
        /** True while copilotkit.runAgent is in flight. */
        isRunning(): boolean;
      }

      class DirectorController {
        private actions: DirectorActions | null = null;
        private lastKnownState: StoryboardState | null = null;

        setActions(actions: DirectorActions | null) { this.actions = actions; }
        setStateSnapshot(state: StoryboardState) { this.lastKnownState = state; }

        hasActions() { return this.actions !== null; }
        requireActions(): DirectorActions {
          if (!this.actions) throw new Error("Director canvas not mounted");
          return this.actions;
        }
        snapshot(): StoryboardState | null { return this.lastKnownState; }
      }

      export const directorController = new DirectorController();
      ```

- [ ] **2.3 Wire the page to the controller** in `Page()` (~line 2047):

      ```ts
      useEffect(() => {
        directorController.setStateSnapshot(state);
      }, [state]);

      useEffect(() => {
        directorController.setActions({
          startRun: (brief) => handleComposeSend(brief),   // confirm arg-shape
          regenerateShot: (id) => handleRegenerate(id),
          cancelRun: () => handleCancel(),
          isRunning: () => isRunningRef.current,
        });
        return () => directorController.setActions(null);
      }, [handleComposeSend, handleRegenerate, handleCancel]);
      ```

      Notes:
      - Add an `isRunningRef` mirroring `isRunning` state (same pattern as
        `cancelledRef`) so `isRunning()` stays fresh — state captured at
        effect-registration time goes stale. **#1 bug class here; test it.**
      - `handleComposeSend` wraps pendingCommission staging (~line 1265); adapt
        the controller's signature rather than bending the existing function.

- [ ] **2.4 Verify locally** (`npm run dev`) that normal UX is unchanged:
      compose→send→cancel all work. Commit.

**Review notes:** _(arg-signature surprises, stale-ref bugs, commit sha)_

---

## Phase 3 — Register WebMCP tools (Days 3–4)

### Step-by-step

- [ ] **3.1 Create `apps/frontend/src/lib/webmcp/register-tools.ts`.**
      Read-only tools register always; mutating tools only when signed in.
      Descriptions are written for how agents behave (iterated in Phase 4).
      Full implementation sketch (adapt to whatever the Phase-1 API surface
      turned out to be — e.g. sync vs async `registerTool`):

      ```ts
      "use client";

      import { directorController } from "./controller";
      import type { StoryboardState } from "@/lib/storyboard/types";

      type ToolRegistrar = NonNullable<Document["modelContext"]>["registerTool"];

      function storyboardSummary(state: StoryboardState | null) {
        if (!state) return { error: "canvas not initialized" };
        return {
          title: state.storyboard.title,
          logline: state.storyboard.logline,
          aspect_ratio: state.storyboard.aspect_ratio,
          runway_mode: state.storyboard.runway_mode,
          export_status: state.export_status,
          final_video_url: state.final_video_url,
          durable_url: state.durable_url,
          hyperframes_kit_available: Boolean(state.builder_kit),
          is_running: directorController.requireActions().isRunning(),
          shots: state.shots.map((s) => ({
            id: s.id,
            index: s.index,
            beat: s.beat,
            status: s.status,            // pending | image | ready | error
            error: s.error ?? undefined, // lets agents self-diagnose
            prompt: s.prompt,
            ref_image_url: s.ref_image_url ?? undefined,
            video_url: s.video_url ?? undefined,
            progress_label: s.progress_label ?? undefined,
          })),
        };
      }
      ```

      Continue the same file — the tool definitions:

      ```ts
      const readOnly: Parameters<ToolRegistrar>[0][] = [
        {
          name: "get_storyboard_state",
          description:
            "Read the current DevCut storyboard canvas: brief (title/logline), " +
            "every shot with generation status and error details, whether a run " +
            "is executing, and the final cut URL when exported. Poll this after " +
            "starting work rather than assuming completion.",
          inputSchema: { type: "object", properties: {} },
          annotations: { readOnlyHint: true },
          execute: async () => storyboardSummary(directorController.snapshot()),
        },
        {
          name: "get_export",
          description:
            "Get export artifacts for a finished cut: MP4 URLs (final + durable), " +
            "HyperFrames builder-kit availability (BRIEF.md + asset drop map). " +
            "Returns an error string if nothing is exported yet.",
          inputSchema: { type: "object", properties: {} },
          annotations: { readOnlyHint: true },
          execute: async () => {
            const s = directorController.snapshot();
            if (!s?.final_video_url && !s?.durable_url)
              return { error: "No cut exported yet. Start a run first." };
            return {
              final_video_url: s.final_video_url,
              durable_url: s.durable_url,
              sha256: s.final_sha256,
              hyperframes_kit: s.builder_kit
                ? { summary: s.builder_kit.summary, asset_count: s.builder_kit.assets.length }
                : null,
            };
          },
        },
      ];

      /** Mutating tools — register ONLY for an authenticated session. */
      export function mutatingTools(): Parameters<ToolRegistrar>[0][] {
        return [
          {
            name: "start_cutdown",
            description:
              "Commission a Challenge Cut from a text brief. STARTS generation " +
              "(shot plan → reference images → clips → stitch) and returns " +
              "immediately; it does NOT block. Poll get_storyboard_state. Fails " +
              "if a run is already active.",
            inputSchema: {
              type: "object",
              properties: { brief: { type: "string", description: "The cut's premise/logline" } },
              required: ["brief"],
            },
            annotations: { destructiveHint: true },
            execute: async ({ brief }) => {
              const a = directorController.requireActions();
              if (a.isRunning()) return { error: "A run is already active." };
              a.startRun(String(brief));
              return { started: true, note: "Poll get_storyboard_state for progress." };
            },
          },
          {
            name: "regenerate_shot",
            description:
              "Re-generate one shot by shot id (exact id from get_storyboard_state), " +
              "e.g. after an error or to improve it. Returns immediately; poll for results.",
            inputSchema: {
              type: "object",
              properties: { shot_id: { type: "string" } },
              required: ["shot_id"],
            },
            annotations: { destructiveHint: true },
            execute: async ({ shot_id }) => {
              const shot = directorController.snapshot()?.shots.find((x) => x.id === shot_id);
              if (!shot) return { error: `Unknown shot id "${String(shot_id)}".` };
              directorController.requireActions().regenerateShot(shot.id);
              return { started: true, shot_id: shot.id };
            },
          },
          {
            name: "cancel_run",
            description:
              "Cancel the in-flight run. Completed shots are kept and stay visible.",
            inputSchema: { type: "object", properties: {} },
            annotations: { destructiveHint: true },
            execute: async () => {
              const a = directorController.requireActions();
              if (!a.isRunning()) return { error: "No run is active." };
              a.cancelRun(); // → agent.abortRun()
              return { cancelled: true };
            },
          },
        ];
      }
      ```

- [ ] **3.2 Hook registration into the page** (also in `Page()`):

      ```ts
      // Read-only tools at mount; mutating only when signed in.
      useEffect(() => {
        if (typeof document === "undefined" || !document.modelContext?.registerTool) return;
        const register = async () => {
          for (const tool of readOnly) {
            try { await document.modelContext!.registerTool(tool); }
            catch (e) { console.error("[webmcp] register failed", tool.name, e); }
          }
        };
        void register();
      }, []);

      useEffect(() => {
        if (!session?.user) return; // session from Auth.js v5 (useSession)
        if (!document.modelContext?.registerTool) return;
        const register = async () => {
          for (const tool of mutatingTools()) {
            try { await document.modelContext!.registerTool(tool); }
            catch (e) { console.error("[webmcp] register failed", tool.name, e); }
          }
        };
        void register();
      }, [session?.user]);
      ```

      Where `session` comes from your existing Auth.js v5 setup
      (`apps/frontend/src/auth.ts`, env-gated). If the page uses a different
      session hook already, reuse it — do not add a second provider.

- [ ] **3.3 Client-side defense-in-depth:** inside each mutating `execute`,
      additionally check the session before acting. WebMCP executes in-page, so
      server endpoints are cookie-protected anyway (BFF auth gate +
      vault/budget middleware), but fail fast and *tell the agent why*:

      ```ts
      if (!authEnabledClient) return { error: "Sign in on this page to run cuts." };
      ```

- [ ] **3.4 SSR guards:** everything must no-op silently during static prerender
      (`typeof document === "undefined"` / missing `modelContext`). The page is
      a client component but Next still renders it on the server.

- [ ] **3.5 `npx tsc` passes** in `apps/frontend`; manual test in flag-enabled
      Chrome local + prod. Commit.

---

## Phase 4 — Real-agent testing & description hardening (Days 4–5)

- [ ] **4.1 Deploy to prod**: standard path —
      `bash scripts/deploy-local.sh` (no FORCE_BUILD needed; no build-time env
      flags changed). Verify `/director` unchanged for humans.
- [ ] **4.2 Scripted agent runs through ChatGPT's in-app browser**, 10+ times,
      varying phrasing. Log every misunderstanding:
      - Does it poll `get_storyboard_state` or assume instant completion?
      - Does it try unknown shot ids? Invent tools that don't exist?
      - Does it attempt a second `start_cutdown` mid-run?
- [ ] **4.3 Fix descriptions based ONLY on observed failures** (e.g. add
      "There are typically 6–8 shots" if it guesses wrong counts).
- [ ] **4.4 Also test in Chrome-flag mode** (it's the fallback demo path).
- [ ] **4.5 Anonymous-mode UX check**: signed-out judge sees read-only tools;
      mutation attempts get a clear sign-in message.
- [ ] **4.6 Budget/billing verification**: after an agent-driven run, confirm
      one budget increment per Runway call in Redis and that `ui_thread_id`
      billing matches what BFF logged (twin-thread model still aligned).

**Review notes:** _(agent behavior log → description diffs made)_

---

## Phase 5 — Demo film (Day 6, ~half day)

The video is judged as much as the code. ≤3 minutes, public YouTube, WITH audio.

### Shot list (rehearse once, then record in one take per scene)

1. **0:00–0:20 Problem framing.** "Agents that build video today get a JSON API
   or nothing. DevCut gives them a live canvas they share with you."
2. **0:20–1:00 The core moment.** Human signs into `/director` inside ChatGPT's
   browser and commissions a cut by typing to ChatGPT (not the page). Canvas
   populates: shot plan → stills → clips. Point at it happening live.
3. **1:00–1:50 Agent-as-pilot.** Inject/arrange an erroring shot; ask ChatGPT
   to inspect; it calls `get_storyboard_state`, reads `status:"error"`, calls
   `regenerate_shot`; the human watches the fix land on canvas. This is the
   "difficult or impossible before" beat — say so explicitly.
4. **1:50–2:20 Export + handoff.** Agent calls `get_export`; show MP4 playing
   and the HyperFrames builder kit zip.
5. **2:20–2:50 Credibility.** Quick cut of code (`register-tools.ts`), budget
   counter ticking, one line on x402 metering. End card.

- [ ] Record screen at readable zoom (agents' tool-call panes are small).
- [ ] Show which environment each scene runs in (ChatGPT browser vs Chrome flag).
- [ ] Upload public/unlisted-public, add chapters.

## Phase 6 — Submit (Day 7, buffer day)

- [ ] README section in repo root explaining the WebMCP integration
      (+ link from docs/). Requirements say repo must contain all instructions.
- [ ] Fill the four text prompts on Devpost:

      1. *Strong fit:* shared live canvas; agent actions visibly change what the
         human watches; tools mirror exact human moves.
      2. *Better UX:* sign in once; agent inherits your identity, vaulted
         Runway key, and metered budget — no key pasting, no separate auth.
      3. *New capability:* external agent diagnoses and repairs individual
         failing shots mid-pipeline while the human watches; agent hands off a
         HyperFrames kit artifact, not just an mp4.
      4. *Implementation:* brief paragraphs on controller extraction +
         auth-gated `document.modelContext.registerTool` registration.

- [ ] Paste live URL (`https://devcut.thisyearnofear.com/director`), YouTube,
      repo URL. If OAuth needed for judging full flow, submit credentials on
      the form (allowed) AND keep anonymous demo possible.
- [ ] Final end-to-end run **as a judge would**: fresh incognito + ChatGPT.
- [ ] Submit ≥3h before deadline. Deadlines miss for boring reasons.

---

## Risk register (check these if/when things break)

| # | Risk | Symptom | Mitigation |
| --- | --- | --- | --- |
| R1 | Spec drift — `document.modelContext` API differs from the challenge snippet (early Draft CG Report) | `registerTool` missing / signature mismatch in Phase 1 | Adapt `types.d.ts` + registration to observed reality; the *tool shapes* stay identical. Never assume event names (`ontoolchange` etc.) without seeing them. |
| R2 | ChatGPT in-app browser doesn't surface tools on prod URL | Phase 1.2 fails | Demo via Chrome flag screen-recording; still deploy normally. Decide by end of Day 1. |
| R3 | COOP/COEP demanded somewhere | Tool discovery silently fails cross-origin | If truly required, use `credentialless` ONLY. NEVER `require-corp` — it blanks canvas media from Runway/B2 (no CORP headers there). Test with one cheap shot, not a full run. |
| R4 | GitHub OAuth broken inside webview | Sign-in loops or popup blocked | Fall back: anonymous read-only demo + credentials on submission form (explicitly allowed). Do NOT restructure auth mid-week. |
| R5 | Stale `isRunning` closure → agent starts concurrent runs; budget double-spend | Two pipelines interleaving shots | The ref pattern (2.3). Also test the guard: second `start_cutdown` mid-run must return `{error}`. BFF budget/admission is the backstop but don't rely on it. |
| R6 | Long run makes agent poll-loop forever / give up and misreport failure | Judge sees "it failed" while cut completes 30s later | Descriptions say "returns immediately, poll". Demo flow keeps total runtime short (~6 shots) — commission a SHORT brief for filming. |
| R7 | Deploy breaks human UX | `/director` regression post-deploy | Standard safety net holds: selective restarts, drain gate, `.health-ok` rollback via `scripts/deploy-local.sh`. Verify canvas after every deploy before touching code again. |
| R8 | Wiped LangGraph state mid-demo (agent restart) | Canvas goes blank | Known mitigations already live: Postgres checkpointer (ADR-0001) + B2 snapshots restore via `/api/thread-state`. Don't restart PM2 services during filming window. |

## Out of scope (do NOT attempt this week)

- WS push of storyboard deltas into tool results (polling is enough).
- A dedicated WebMCP "widget" UI inside ChatGPT.
- Refactoring `page.tsx` beyond what controller extraction requires.
- Any change to BFF, vault, x402 routes, or the Python agent.

## Review protocol (when you come back)

Bring: this file with boxes ticked + review notes filled, commit SHAs per
phase, the Phase-1 API-surface findings, and any deviation from decisions
§"Core design decisions" with your reasoning. Review will focus on:
(1) correctness of stale-ref handling, (2) whether descriptions were hardened
against *observed* failures, (3) R3/R4 outcomes, (4) submission-form readiness.







