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
| Agent | Buy generative footage + packaging mid-hack without holding vendor keys | `402` → pay → assets land in the HyperFrames `assets/` (or export folder) |

## 3. The product (what DevCut *is*)

Four modes, one pipeline:

1. **Challenge Cut (organizer)** — brief / Devpost URL / judging criteria → storyboard → generative hero shots → stitched reference film → **builder kit** (shot list, `BRIEF.md` seed, HyperFrames starter pointers, “what good looks like” stills).
2. **Submit Ready (builder)** — HyperFrames project, deployed app, or product URL → generative heroes + packaging → Devpost-ready MP4 on durable storage (B2) with optional provenance.
3. **Product Launch Cut (founder/PM)** — product URL / feature list → polished ~30s demo cut with logo reveal, feature highlights, social proof, and CTA — no hackathon framing.

HyperFrames remains the **code-native composition OS**. DevCut is the **generative footage + packaging layer** that feeds it — not a competing authoring tool.

## 4. Creative monopoly

**If DevCut disappeared:** organizers lose the visual brief; builders’ HyperFrames demos stay unfinished; agents can’t meter Runway-class jobs via x402 for hackathon video.

**We are not:** a general AI film studio, a CapCut replacement, or “Director’s Canvas for everyone.”

**We refuse:** sci-fi playground demos, open-ended “make any video,” consumer creator cosplay, BYOK as the hero UX.

**Design = distribution:** the challenge film *is* the invite; the Submit Ready cut *is* the Devpost artifact. Growth rides hackathon invites and submission links, not ads.

## 5. x402 SKUs

| SKU | Who | What they buy |
| --- | --- | --- |
| `challenge_film` | Organizer | Reference film + builder kit |
| `submission_polish` | Builder / agent | HyperFrames/repo/URL → submission MP4 |
| `hero_shot_pack` | Builder / agent | N consistent generative stills/clips for an existing HF composition |
| `product_launch` | Founder / PM | Polished product demo cut (~30s) |

Price in stable units per job; meter generation + stitch + durable host.

## 6. Empty-state IA (the doors)

```
DevCut
├── I’m hosting a hackathon     → Challenge Cut
├── I’m submitting              → Submit Ready
├── I have a product to launch  → Product Launch Cut
└── I’m an agent                → OpenAPI + x402 (skill / docs)
```

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

## 11. Near-term build order

1. Lock this thesis in UI copy + empty state (rename surface to **DevCut**).  
2. Ship one golden **Challenge Cut** for a live hackathon (start with one we enter or host adjacent to).  
3. Ship **Submit Ready** for HyperFrames project zip / repo URL.  
4. Expose the three SKUs behind x402. → **shipped** (see `docs/x402.md`; demo settle default, live facilitator optional)
5. Harden B2/Genblaze as durable + provenance for those jobs — infrastructure in service of the wedge, not the identity.
6. Run-ledger UX (human tool cards + DevCut stage labels) on the AG-UI surface. → **shipped** (`devcut-ledger.ts`)
7. HyperFrames handoff (BRIEF.md + `assets/devcut/` drop). → **shipped** (`docs/hyperframes.md`)
8. Outcome UX (Watch / HyperFrames / Share + kit.zip + HF demo CTA). → **shipped**
9. Golden Challenge Cut brief + partner demo script. → **shipped** (`docs/demos/golden-challenge-cut.md`, `docs/demo-script.md`)
10. Film the golden cut LIVE and record fixtures (film URL, kit, screenshots).

---

*Galvanize here. If a feature doesn’t make Challenge Cut sharper, Submit Ready more forkable, or x402 jobs more reliable for hackathon agents — don’t build it.*
