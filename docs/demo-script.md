# DevCut partner demo script

**Goal:** In ~30–40 minutes, prove DevCut **supplements** HyperFrames (and meters Runway-class jobs) — not a competing editor.  
**Audience:** Runway, HyperFrames, hackathon organizers, **Backblaze judges**.  
**Prep:** `NVIDIA_API_KEY` (or Venice/Gemini), `RUNWAY_API_KEY`, `GENBLAZE_ENABLED=1` + `B2_*` + `B2_REQUIRE_DURABLE=1`. MOCK works for UI-only; LIVE + B2 sells the story.

Canonical brief: [`demos/golden-challenge-cut.md`](./demos/golden-challenge-cut.md).  
HF complement: [`hyperframes.md`](./hyperframes.md).  
B2/Genblaze submission: [`hackathon-backblaze.md`](./hackathon-backblaze.md).

---

## Devpost 3-minute cut (strict)

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:40 | Broken link / `/tmp` mock vs empty player | “Most gen-media demos die Monday. Judges can’t open assets; no provenance.” |
| 0:40–1:40 | `/` → **Run golden Challenge Cut** · ledger | “DevCut plans a Challenge Cut. Stills hit B2; clips run Genblaze Pipeline + Runway. Winning beat uses AgentLoop until the manifest verifies.” |
| 1:40–2:20 | Job outcome → **Vault** | “Durable B2 MP4. Job manifest JSON. Verify. Monday test: expires never.” Open URL in private window if time. |
| 2:20–2:50 | **HyperFrames** → kit.zip | “Builders fork BRIEF.md + assets/devcut/. Composition stays in HyperFrames — we don’t replace their OS.” |
| 2:50–3:00 | Providers + Genblaze star | “Runway + Genblaze + B2. Star Genblaze; production knobs: Object Lock, lifecycle, event notifications.” |

---

## Path A — Golden Challenge Cut (organizer story) · ~25 min

| Step | Action | Say / show |
| --- | --- | --- |
| 0 | Open `/` | “Three doors only — Challenge Cut for organizers.” |
| 1 | Select **I’m hosting** · chip **Golden · Genblaze+B2** (or paste golden brief) | Judging intent is durable media + HF kit, not sci-fi. |
| 2 | **Commission Challenge Cut** → canvas | Mode badge: Challenge Cut + beat grammar. |
| 3 | Watch **Run ledger** | Brief → stills → Genblaze clips (AgentLoop on Winning) → stitch. |
| 4 | When ready: **Job outcome** → **Vault** (when durable_url set) | Co-primary with the MP4 — B2 + verify. |
| 5 | **HyperFrames** → **Download HF kit (.zip)** | BRIEF.md + assets.json + README. |
| 6 | **Share** tab | Copy invite blurb — Discord/email pin pack. |
| 7 | Optional: unzip → `hyperframes init` → paste BRIEF | “Composition stays in HyperFrames.” |

**Pass:** Vault opens durable URL; kit opens; BRIEF has Challenge Cut intent.

---

## Path B — HyperFrames demo CTA (builder story) · ~15 min

| Step | Action | Say / show |
| --- | --- | --- |
| 0 | Landing → **Run HyperFrames demo** | One click, no door shopping. |
| 1 | Canvas auto-starts Submit Ready | Problem → product → proof. |
| 2 | After stitch → Vault + kit.zip | Same handoff surface as Challenge Cut. |
| 3 | Emphasize | “DevCut = Runway heroes + packaging. HF = HTML → render.” |

Use Path B when time is short or the room is HF-native.

---

## Path C — Agent door (optional · 5 min)

| Step | Action | Say / show |
| --- | --- | --- |
| 1 | Agent door → pick `challenge_film` → **Start job** | Metered unlock, no key paste. |
| 2 | Open canvas | `x402 · challenge_film` pill. |
| 3 | Skip “Show integrator tools” unless audience is protocol-curious | Probe/curl stay secondary. |

---

## Talking points (keep short)

1. **Split:** HyperFrames owns composition; DevCut owns generative heroes + hackathon packaging + x402.  
2. **End state:** Watch / **Vault** / HyperFrames / Share — durable provenance is not a footer.  
3. **Golden brief:** Winning = B2 durable + Genblaze verify + forkable HF kit.  
4. **Non-goals:** No NLE, no cinema playground, no replacing `/product-launch-video`.

## Failure recovery

| Symptom | Fix |
| --- | --- |
| Noop / setup message in chat | Set planner key (`NVIDIA_API_KEY` …) — [`providers.md`](./providers.md) |
| MOCK stills only | Expected without `RUNWAY_API_KEY`; say “UI path identical; LIVE for partner assets” |
| No Vault / no durable_url | Enable `GENBLAZE_ENABLED=1` + B2; see [`hackathon-backblaze.md`](./hackathon-backblaze.md) |
| No builder_kit tab | Ensure stitch finished; or ask agent `emit_hyperframes_kit` |
| Kit zip blocked | Copy BRIEF.md from panel instead |
| CORS / video won’t play from B2 | `bash scripts/setup-b2-cors.sh` |

## After the demo

1. Fill fixture table in [`demos/golden-challenge-cut.md`](./demos/golden-challenge-cut.md).  
2. Send organizers: film URL + kit.zip + invite blurb.  
3. File Genblaze feedback issue ([`genblaze-feedback-issue.md`](./genblaze-feedback-issue.md)).  
4. Only then discuss live x402 / hero-shot-pack SKUs.
