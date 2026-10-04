# ADR 0005 — Organizer GTM surface: variant packs + post-hackathon SKUs

**Status:** Implemented, **verified locally in LIVE stitch mode**, deployed to prod 2026-10-03 — engine, SKUs, hackathon graph and recap commission are shipped. **What prod has actually been seen doing:** serving 6 SKUs with `&thread=`/`&hackathon=` in `canvas_path`, refusing unauthenticated `POST /api/organizer/recap` (`401 {"error":"auth_required"}`), and running ffmpeg 6.1.1 with libass + drawtext (deploy gate cleared). **What prod has not:** the tools have never *executed* there — `grep cut_variant_pack /opt/gen-ui/logs/agent-out.log` returns only `graph_build` registration lines. Local proof (zero-Runway path, thread `146a8f07…`): `cut_variant_pack` healed the wiped checkpoint from its own B2 snapshot, re-stitched 3/3 renditions, ffprobe 1280×720 / 1080×1080 / 1080×1920 (teaser 15s), libass burn-in verified frame-by-frame, SRT sidecar times shifted onto the concatenated timeline, Runway call counter delta 0, `/director?thread=` Variants tab shows "3/3 platform cuts". Three defects found and fixed by that verification: missing `/api/thread-links` rewrite, snapshot publish erasing a restored thread, and a 5-field ASS `Format:` line against 10-field events (captions rendered ",0,0,0,,Problem"). · **Date:** 2026-10-03

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

## Follow-up hardening (2026-10-04, verified locally: 72 agent tests OK)

Wedge-scoped lessons from three sibling cutroom builds — only what sharpens
Challenge Cut, Submit Ready, or x402 reliability; renderers, capture
services, provider marketplaces, and Supabase/OTIO rewrites deliberately
not taken (see chat record):

- **Trim contract** (`variant_plan.validate_plan_trims`, enforced in
  `stitcher.stitch_plan` before any download): plans may only window inside
  existing captures (≥0.25s kept, in/out inside source +0.02 tolerance).
  Zero-length caption windows drop instead of failing the paid job.
- **Teaser beat-fit** (`variant_plan.fit_durations_to_cap`): over-cap teaser
  durations scale down and quantize to a 0.4s grid via largest-remainder;
  under-cap totals pass through untouched; no entry ever exceeds its source.
- **Critic-lite** (`critic_lite.critique_plan`): advisory warnings only
  (weak-open, narration-overrun @2.3w/s, caption-drift, over-cap, missing
  sponsor lockup), appended to variant/recap record notes. Never blocks,
  never spends generation budget.
- **Caption truth prompts** (`storyboard_prompts`): typography cards silent,
  re-scoped lines describe only visible benefits — no invented stats,
  prices, or testimonials.
- **Per-clip ledger** (`hyperframes_kit.build_assets_lines`,
  `job_manifest.build_job_manifest`): every row carries `origin`
  (`generated:devcut/runway` / `stitched:devcut/ffmpeg`), `duration`, and
  `has_audio` for HF handoff verification.

## Links

- Thesis: `docs/devcut-thesis.md` (§2 Jobs, §5 SKUs, §6 doors)
- SKUs: `apps/bff/src/x402/skus.ts`
- Stitch primitives: `apps/agent/src/main.py` (`stitch_final_cut`, cutdown path)
- WebMCP cutdown tool: `apps/frontend/src/lib/webmcp/register-tools.ts` (ADR-0004)
- Organizer dashboard: `apps/bff/src/organizer.ts`, `apps/frontend/src/app/organizer/` (ADR-0003)
