# ADR 0005 — Organizer GTM surface: variant packs + post-hackathon SKUs

**Status:** Implemented (not yet deployed) — engine + SKUs + graph + recap landed 2026-10-03; 44 agent tests, MOCK smoke, LIVE lavfi-fixture stitch checks (dims/caps/sidecar) pass locally; prod ffmpeg confirmed libass+drawtext (deploy gate cleared) · **Date:** 2026-10-03

## Context

Hackathons are increasingly run as GTM engines by their organizers: sponsor
brand awareness, developer mindshare, and next-edition recruiting — not just
prize distribution. DevCut's current lifecycle ends at the submission MP4:
the organizer's value (challenge film + builder kit) is delivered *before*
the hackathon, and nothing after the winners are announced. Three observed
gaps:

1. **Variance is only half-attacked.** The kit standardizes inputs, but the
   product ships no artifact that consolidates the cohort's quality into the
   organizer's brand story afterwards.
2. **Sponsor awareness peaks post-event and we're absent.** Winner recaps,
   sponsor-logo lockups, and recruiting reels are the assets sponsors
   actually measure — no SKU produces them today.
3. **One MP4 ≠ platform-ready.** Builders face three audiences with three
   grammars (judges: 16:9 problem→product→proof on Devpost; customers:
   captioned square/vertical on LinkedIn/X; fellow builders: fast vertical
   teaser in Discord/social). Today they re-cut manually or submit one asset
   everywhere — the exact friction the thesis says to remove.

Engine facts that make this cheap:
- Stitching already works from per-shot clips (`stitch_final_cut`); a
  different cut is a different *stitch plan*, not new generation.
- `start_cutdown` (WebMCP, ADR-0004) and `aspect_ratio` on storyboard state
  already exist as primitives.
- The organizer dashboard (`/organizer`, ADR-0003) can already enumerate
  org-scoped threads — the raw material for a winner-set recap.

Money also points here: builders are one-shot $1.50–2 buyers; organizers hold
sponsor budgets and recur per edition. North-star metrics #1 and #2 are both
organizer-keyed.

## Decision

1. **Extend the lifecycle, not the door count.** Organizer-GTM products live
   under the **challenge door** (the organizer persona already owns it). No
   fifth door; the four-door IA and the thesis stay intact.

2. **New SKU `variant_pack`** (builder, sits on top of `submission_polish`):
   one accepted cut → three renditions, derived purely by re-stitching the
   existing shot clips:
   - **Judge cut** — 16:9, full problem → product → proof narration (the
     current submission MP4, effectively the "master").
   - **Customer cut** — 1:1 or 4:5, brand-safe framing, burned-in captions,
     no hackathon framing, CTA to the product.
   - **Builder teaser** — 9:16, ≤15s, hook-first, repo/Discord-forward.
   VO/caption tracks are re-scoped per rendition via the planner LLM; no new
   Runway generation by default (regenerate only on user opt-in, charged
   separately).

3. **New SKU `recap_reel`** (organizer): winner set + chosen submission
   masters → 60–90s post-hackathon recap — announcement beat, winning
   projects montage, sponsor-logo lockups, next-edition CTA. Input is a
   thread selection from the organizer dashboard, not a fresh brief.

4. **Sponsor brand kit becomes first-class Challenge Cut input.** The
   `challenge_film` mode prompt grows a required section: sponsor logos,
   lockup rules, palette, mandatory mentions. Everything downstream
   (kits, variants, recaps) inherits it — this is what makes the recap a
   *sponsor* deliverable rather than a highlight tape.

5. **Hackathon graph, minimally.** Thread metadata gains
   `hackathon_thread_id` (a submission/recap thread points at its challenge
   thread). No new tables beyond metadata; this single edge is what lets the
   organizer dashboard group submissions per hackathon and feed `recap_reel`.

6. **Pricing posture.** Per-job x402 SKUs initially (consistent with the
   existing four): `variant_pack` ~$1.00 (re-stitch only, near-zero gen
   cost), `recap_reel` ~$4.00. A per-hackathon bundle (organizer contract
   covering kit + variants + recap) is the follow-on pricing experiment, not
   a launch dependency.

## Alternatives considered

- **Fifth "GTM / recap" door** — fragments the IA and splits the organizer
  persona across two doors. Rejected.
- **Platform variants as manual re-cuts in the canvas (NLE-style)** —
  violates the "no full NLE" non-goal and abandons the start-don't-block
  agent story. Rejected; variants stay as deterministic re-stitch plans.
- **Regenerate media per aspect ratio** — 3× Runway cost for marginal
  fidelity gain; most shots letterbox/reframe fine. Default is re-stitch;
  regeneration is an opt-in upsell.
- **Conformance loop ("judge view" score against the brief) first** — strong
  candidate, but it needs the same hackathon-graph edge (#5) to be
  meaningful and doesn't monetize organizer budgets directly. Deferred to
  Next on the roadmap as the follow-on.
- **Sell to sponsors directly** — sponsors don't run hackathons; the
  organizer is the buyer who already holds the sponsor relationship. Skipped
  a rung.

## Consequences

- Post-hackathon, the organizer has a reason to come back each edition —
  retention story shifts from one-shot tool to per-edition workflow.
- Sponsor-visible assets make the tool sellable into sponsor budgets, which
  is a different (larger) price point than per-job builder spend.
- `submission_polish` becomes the funnel for `variant_pack`: any accepted
  cut is re-stitchable, so upsell is a state check, not a cold sale.
- Recap quality depends on submission masters sharing the kit's shot
  grammar (Decision #4 + the existing kit) — a second compounding reason
  the brief→kit conformance loop is worth building next.
- Thesis SKU table (§5) and doors copy must be extended when this ships —
  this ADR deliberately doesn't edit the north-star doc until the SKUs exist.

## Links

- Thesis: `docs/devcut-thesis.md` (§2 Jobs, §5 SKUs, §6 doors)
- SKUs: `apps/bff/src/x402/skus.ts`
- Stitch primitives: `apps/agent/src/main.py` (`stitch_final_cut`, cutdown path)
- WebMCP cutdown tool: `apps/frontend/src/lib/webmcp/register-tools.ts` (ADR-0004)
- Organizer dashboard: `apps/bff/src/organizer.ts`, `apps/frontend/src/app/organizer/` (ADR-0003)
