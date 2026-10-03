# Roadmap

Aligned to [`devcut-thesis.md`](./devcut-thesis.md). If it doesn’t sharpen Challenge Cut, Submit Ready, or x402 jobs — don’t build it.

## Shipped (engine)

- Agent storyboard pipeline: plan → references → videos → stitch
- Live canvas, batch generation, MOCK mode, BYOK + budget guard
- Cross-shot style anchor, audio tools, restyle tools
- B2/Genblaze wiring (optional durable export + provenance)
- **DevCut thesis + door IA** (product north star) — 3 human landing doors + the agent door, 5 modes, 6 x402 SKUs

## Now (product alignment)

- [x] Lock thesis in docs / README / AGENTS
- [x] Landing + `/director` empty state = four doors (challenge / submit / product / agent)
- [x] Agent prompt = Challenge Cut / Submit Ready / Product Launch modes
- [x] Product Launch Cut — fourth door + `product_launch` x402 SKU ($1.50) for founders/PMs
- [x] WebMCP — 5 canvas tools on `document.modelContext` (ADR-0004, PR #1; prod **serves** the registrations — bundle-fetched 2026-10-03 — and the Phase-1 runtime spike on Chrome 154 behind `#enable-webmcp-testing` ran against the local dev build, so a flagged load of prod is still owed)
- [x] x402 SKUs on BFF + Agent door (catalog, 402, demo settle, canvas unlock)
- [x] Planner providers: NVIDIA → Venice → Gemini; AISA removed ([`providers.md`](./providers.md))
- [x] Run ledger UX — DevCut-shaped stages + human tool cards (AG-UI)
- [x] HyperFrames handoff — BRIEF.md seed + asset drop on stitch ([`hyperframes.md`](./hyperframes.md))
- [x] Outcome UX — Watch / HyperFrames / Share + downloadable kit.zip + HF demo CTA + mode chrome + agent Start job
- [x] Golden Challenge Cut **brief + demo script** ([`demos/golden-challenge-cut.md`](./demos/golden-challenge-cut.md), [`demo-script.md`](./demo-script.md))
- [x] MOCK golden path — unit tests + materialize fixture kit ([`scripts/smoke-golden-mock.sh`](../scripts/smoke-golden-mock.sh), [`demos/fixtures/golden-challenge-cut/`](./demos/fixtures/golden-challenge-cut/))
- [x] Genblaze spine — Pipeline+sink, AgentLoop winning beat, job manifest, Vault UI, B2 CORS/lifecycle/Object Lock knobs, B2→Discord events
- [x] **Organizer GTM surface** ([ADR-0005](./adr/0005-organizer-gtm-variant-pack-recap.md)) — implemented, tested locally, and deployed to prod 2026-10-03 (`release=20261003_152353`). **On prod the new tools are registered but have never been invoked** (`grep cut_variant_pack /opt/gen-ui/logs/agent-out.log` → only `graph_build` tool-list lines), so everything below marked "verified" was verified **locally in LIVE stitch mode**, not on the server:
  - [x] `variant_pack` — 3 platform renditions (judge 16:9 · customer 1:1 captions · teaser 9:16 ≤15s) via plan-driven `stitch_plan()`, re-stitch only. Verified locally: ffprobe dims correct, teaser ≤15s, libass burn-in frame-checked, Runway counter delta 0. Prod ffmpeg 6.1.1 carries `subtitles` + `drawtext`, so the burn-in path is not expected to degrade there
  - [x] Sponsor brand kit as a required `challenge_film` input; inherited by variants + recaps
  - [x] `recap_reel` commission endpoint (`POST /api/organizer/recap`) refuses unauthenticated callers — verified on prod 2026-10-03 (`401 {"error":"auth_required"}`)
  - [ ] **The rest of the recap validation ladder is code-only**: cross-org, `<2 threads`, non-ready, and bad-hackathon refusals are implemented in `validateRecapRequest` but never exercised — the BFF has no test suite, and no signed-in session has hit them yet
  - [ ] **Recap never rendered end-to-end on prod.** The endpoint, plan builder and `generate_recap` tool all exist and are unit-tested, but no paid (demo-settled) recap has been driven through a signed-in organizer session yet — so the 60–90s output, logo overlays and cross-thread asset reads are **unproven in production**
  - [ ] **Hackathon graph edge unproven on prod**: `devcut_thread_links` does not exist on the prod database yet (it self-creates on first write), and no `&hackathon=` run has settled there — so dashboard grouping per event is still unexercised
- [ ] Film the golden cut LIVE (fill fixture table) + pin kit for partners
- [ ] `X402_MODE=live` facilitator settle in production — prod still settles in **demo mode on Base testnet**, so no SKU has ever taken real money

## Next

- **Prove ADR-0005's untested half** (code shipped, production behaviour not yet seen): drive one recap through a signed-in organizer session → 60–90s MP4 + overlays on prod; let one `&hackathon=` run settle so `devcut_thread_links` exists and the dashboard groups by event
- **Event tenancy** ([ADR-0006](./adr/0006-event-tenancy.md), proposed): `hackathon:<slug>` orgs, `/join/<slug>` invite links, centralized organizer/member authorization (unblocks multiplayer dashboards + real recap selection), per-event budget counters
- **WebMCP variant surface** — `cut_variant_pack` exists as a backend tool but no canvas tool wraps it; real `start_cutdown` cutdown stays ADR-0004 debt
- **Conformance loop ("judge view")** — score a builder's cut against the challenge brief before submission; leans on the same hackathon-graph edge
- Film golden Challenge Cut with real keys → record film URL / kit in fixture table
- Hero shot pack SKU → `assets/devcut/` only (no stitch) for existing compositions
- Agent OpenAPI surface documented for Cursor/Claude skills
- Optional: Venice x402 for inference metering (agent wallets) — after job SKUs are live
- Follow-on pricing experiment: per-hackathon organizer bundle (kit + variants + recap) vs per-job SKUs

## Explicit non-goals

- General film studio / open-ended cinema demos
- Competing with HyperFrames catalog or `/product-launch-video` authoring
- Full NLE, consumer social scheduling, multi-provider marketplace UI
