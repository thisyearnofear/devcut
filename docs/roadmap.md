# Roadmap

Aligned to [`devcut-thesis.md`](./devcut-thesis.md). If it doesn’t sharpen Challenge Cut, Submit Ready, or x402 jobs — don’t build it.

## Shipped (engine)

- Agent storyboard pipeline: plan → references → videos → stitch
- Live canvas, batch generation, MOCK mode, BYOK + budget guard
- Cross-shot style anchor, audio tools, restyle tools
- B2/Genblaze wiring (optional durable export + provenance)
- **DevCut thesis + three-door IA** (product north star)

## Now (product alignment)

- [x] Lock thesis in docs / README / AGENTS
- [x] Landing + `/director` empty state = three doors only
- [x] Agent prompt = Challenge Cut / Submit Ready modes
- [x] x402 SKUs on BFF + Agent door (catalog, 402, demo settle, canvas unlock)
- [x] Planner providers: NVIDIA → Venice → Gemini; AISA removed ([`providers.md`](./providers.md))
- [x] Run ledger UX — DevCut-shaped stages + human tool cards (AG-UI)
- [x] HyperFrames handoff — BRIEF.md seed + asset drop on stitch ([`hyperframes.md`](./hyperframes.md))
- [x] Outcome UX — Watch / HyperFrames / Share + downloadable kit.zip + HF demo CTA + mode chrome + agent Start job
- [x] Golden Challenge Cut **brief + demo script** ([`demos/golden-challenge-cut.md`](./demos/golden-challenge-cut.md), [`demo-script.md`](./demo-script.md))
- [x] MOCK golden path — unit tests + materialize fixture kit ([`scripts/smoke-golden-mock.sh`](../scripts/smoke-golden-mock.sh), [`demos/fixtures/golden-challenge-cut/`](./demos/fixtures/golden-challenge-cut/))
- [x] Genblaze spine — Pipeline+sink, AgentLoop winning beat, job manifest, Vault UI, B2 CORS/lifecycle/Object Lock knobs, B2→Discord events
- [ ] Film the golden cut LIVE (fill fixture table) + pin kit for partners
- [ ] `X402_MODE=live` facilitator settle in production

## Next

- Film golden Challenge Cut with real keys → record film URL / kit in fixture table
- Hero shot pack SKU → `assets/devcut/` only (no stitch) for existing compositions
- Agent OpenAPI surface documented for Cursor/Claude skills
- Optional: Venice x402 for inference metering (agent wallets) — after job SKUs are live

## Explicit non-goals

- General film studio / open-ended cinema demos
- Competing with HyperFrames catalog or `/product-launch-video` authoring
- Full NLE, consumer social scheduling, multi-provider marketplace UI
