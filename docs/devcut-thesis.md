# DevCut — Product Thesis

> **North star:** DevCut is the x402-metered video desk for hackathons — organizers commission a challenge reference film; builders enhance HyperFrames submissions into Devpost-ready cuts. Agents pay per job, not per API key.

One page. Everything else is implementation detail.

---

## 1. Who

**Primary customer:** Hackathon organizers (platforms, sponsor teams, community leads) who need builders to *see* what winning looks like.

**Primary user / volume:** Developers in those hackathons — especially ones shipping with HyperFrames, agent skills, or a product URL — who need a finished demo film without a video team.

**Buyer of compute:** The agent (or the human via the agent) through an **x402 spending session**. No Runway key paste as the default path.

## 2. Job to be done

| Role | Job | Done when |
| --- | --- | --- |
| Organizer | Turn prize brief + criteria into a visual spec builders can’t misread | Invite email / Discord pin includes a 30–60s **challenge film** + a forkable builder kit |
| Builder | Turn repo / product URL / HyperFrames project into a submission-grade launch cut | Devpost (or equivalent) has an MP4 that shows problem → product → proof, with durable link |
| Builder | Share one finished cut across the platforms it will actually appear on | Judge / customer / teaser renditions exist at their own aspect ratios, captions burned where the platform plays muted — without a second generation run |
| Organizer | Make the hackathon visible *after* it ends — sponsor proof + next-edition recruiting | A 60–90s **recap reel** cut from the winners’ own submissions, carrying the sponsor lockup and CTA |
| Agent | Buy generative footage + packaging mid-hack without holding vendor keys | `402` → pay → assets land in the HyperFrames `assets/` (or export folder) |

## 3. The product (what DevCut *is*)

Five modes, one pipeline:

1. **Challenge Cut (organizer)** — brief / Devpost URL / judging criteria → storyboard → generative hero shots → stitched reference film → **builder kit** (shot list, `BRIEF.md` seed, HyperFrames starter pointers, “what good looks like” stills). A **sponsor brand kit** (logos, lockup rules, palette, mandatory mentions) is a required input — variants and recap reels inherit it.
2. **Submit Ready (builder)** — HyperFrames project, deployed app, or product URL → generative heroes + packaging → Devpost-ready MP4 on durable storage (B2) with optional provenance.
3. **Product Launch Cut (founder/PM)** — product URL / feature list → polished ~30s demo cut with logo reveal, feature highlights, social proof, and CTA — no hackathon framing.
4. **Variant Pack (builder)** — a finished cut re-stitched into three platform renditions (judge 16:9 · customer 1:1 with captions · teaser 9:16 ≤15s). **No new generation** — re-frames, burns captions and overlays from footage that already exists.
5. **Recap Reel (organizer)** — 60–90s post-hackathon film assembled from selected winner threads, with sponsor lockup and next-edition CTA. Also re-stitch only, read across threads via their B2 snapshots.

Modes 4 and 5 are the post-submission half of the wedge: the organizer gets a reason to come back after the winners are announced, and the builder gets the cut each platform actually wants. They cost no generation, so they are margin-positive at $1 and $4 where a fresh film is not.

HyperFrames remains the **code-native composition OS**. DevCut is the **generative footage + packaging layer** that feeds it — not a competing authoring tool.

## 4. Creative monopoly

**If DevCut disappeared:** organizers lose the visual brief; builders’ HyperFrames demos stay unfinished; agents can’t meter Runway-class jobs via x402 for hackathon video.

**We are not:** a general AI film studio, a CapCut replacement, or “Director’s Canvas for everyone.”

**We refuse:** sci-fi playground demos, open-ended “make any video,” consumer creator cosplay, BYOK as the hero UX.

**Design = distribution:** the challenge film *is* the invite; the Submit Ready cut *is* the Devpost artifact. Growth rides hackathon invites and submission links, not ads.

## 5. x402 SKUs

| SKU | Price | Who | What they buy |
| --- | --- | --- | --- |
| `challenge_film` | $2.00 | Organizer | Reference film + builder kit |
| `submission_polish` | $1.00 | Builder / agent | HyperFrames/repo/URL → submission MP4 |
| `hero_shot_pack` | $0.50 | Builder / agent | N consistent generative stills/clips for an existing HF composition |
| `product_launch` | $1.50 | Founder / PM | Polished product demo cut (~30s) |
| `variant_pack` | $1.00 | Builder / agent | 3 platform cuts (judge 16:9 · customer 1:1 captions · teaser 9:16 ≤15s) re-stitched from a finished thread — no new generation |
| `recap_reel` | $4.00 | Organizer | 60–90s post-hackathon recap from selected winner threads + sponsor logo overlay + CTA |

Prices are the `skus.ts` catalog; live metering in [`x402.md`](./x402.md). Production currently settles in **demo mode** (`X402_MODE=demo`, Base testnet) — the live facilitator path is built but unexercised.

## 6. Empty-state IA (the doors)

```
DevCut
├── I’m hosting a hackathon     → Challenge Cut
├── I’m submitting              → Submit Ready
├── I have a product to launch  → Product Launch Cut
└── I’m an agent                → OpenAPI + x402 (skill / docs)
```

Three human doors render as landing tabs; the **agent** door is the x402 panel on `/director` + `docs/x402.md`, not a landing tab. `variant_pack` and `recap_reel` are deliberately **not** doors — they are follow-on jobs commissioned against a thread that already exists (the CTA on a finished cut, or the organizer dashboard), because they have nothing to brief.

## 7. Success metrics (north-star, not vanity)

1. **Challenge films shipped** with real organizer logos (lighthouse: 3 hackathons).
2. **% of those hackathons’ top-10 submissions** that used DevCut polish or the kit.
3. **x402 job completion rate** (paid → asset delivered) and median time-to-MP4 for `submission_polish`.
4. **HyperFrames-native handoff rate** — jobs that write usable `BRIEF.md` / assets into an HF project vs dead-end MP4-only.

## 8. Non-goals (12 months)

- Full NLE / timeline editor  
- Competing with HyperFrames catalog blocks or `/product-launch-video` authoring  
- Consumer social scheduling  
- Multi-provider “any model” marketplace UI  
- Replacing Devpost, Discord, or sponsor CRMs  

## 9. Relationship to this codebase

| Today (Director’s Canvas) | Tomorrow (DevCut) |
| --- | --- |
| Generic brief → storyboard → Runway → stitch | Same engine, **hackathon-shaped** doors + copy |
| BYOK / shared key | x402 job meter as default; BYOK optional power-user |
| Grove / B2 as afterthought | Durable submission URL + provenance as builder deliverable |
| Cinema cosplay empty state | Organizer / Builder / Agent only |

Keep the pipeline; change the product.

## 10. Foundation (don’t dilute)

- **Spine:** LangGraph + CopilotKit / AG-UI — shared storyboard state, tool-driven canvas, visible run ledger.
- **Planner inference:** NVIDIA → Venice → Gemini (see [`providers.md`](./providers.md)). No AISA. No end-user model marketplace.
- **Media:** Runway (+ optional Genblaze/B2). HyperFrames remains the composition OS.
- **Generation budget:** the two post-submission modes re-stitch existing footage and spend **zero** new Runway calls by default (ADR-0005). That constraint is what makes $1 and $4 viable prices — relaxing it silently kills the margin, so treat `regenerate_vo` as the opt-in exception, not a convenience.

## 11. Near-term build order

1. Lock this thesis in UI copy + empty state (rename surface to **DevCut**).  
2. Ship one golden **Challenge Cut** for a live hackathon (start with one we enter or host adjacent to).  
3. Ship **Submit Ready** for HyperFrames project zip / repo URL.  
4. Expose the SKUs behind x402 — six today, across four doors. → **shipped** (see `docs/x402.md`; demo settle default, live facilitator optional)
5. Harden B2/Genblaze as durable + provenance for those jobs — infrastructure in service of the wedge, not the identity.
6. Run-ledger UX (human tool cards + DevCut stage labels) on the AG-UI surface. → **shipped** (`devcut-ledger.ts`)
7. HyperFrames handoff (BRIEF.md + `assets/devcut/` drop). → **shipped** (`docs/hyperframes.md`)
8. Outcome UX (Watch / HyperFrames / Share + kit.zip + HF demo CTA). → **shipped**
9. Golden Challenge Cut brief + partner demo script. → **shipped** (`docs/demos/golden-challenge-cut.md`, `docs/demo-script.md`)
10. Film the golden cut LIVE and record fixtures (film URL, kit, screenshots).

---

*Galvanize here. If a feature doesn’t make Challenge Cut sharper, Submit Ready more forkable, or x402 jobs more reliable for hackathon agents — don’t build it.*
