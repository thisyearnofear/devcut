# Golden Challenge Cut — Generative Media + Durable Storage

**Status:** Brief + expected kit locked. Film when `NVIDIA_API_KEY` + `RUNWAY_API_KEY` (+ optional B2) are live.  
**Audience:** Hackathon organizers, Runway partners, HyperFrames builders.  
**Mode:** Challenge Cut (~45s, 1280:720).

This is the **proof artifact** for “DevCut feeds HyperFrames” — not a sci-fi playground reel.

---

## One-line judging intent (logline)

> Winning apps generate media with Runway-class models, land durable assets + provenance on B2, and hand builders a HyperFrames-ready kit — not a `/tmp` demo that dies after the weekend.

## Full brief (paste into DevCut)

```
Mode: Challenge Cut (hackathon organizer).

Hackathon: Backblaze Generative Media (Genblaze + B2 track).
Audience: builders shipping creator/agent video tools under time pressure.
Judging: must use Genblaze (or equivalent orchestration) + Backblaze B2 for durable storage and provenance. HyperFrames (or HTML→video) is the preferred composition path for the final Devpost cut.

Create a ~45s Challenge Cut that visually specs what winning looks like:

1) Problem — A hackathon team ships a gorgeous local demo; judges can't open the assets Monday; links 404; no provenance.
2) Constraint — Builders must generate with a Runway-class pipeline and persist stills/clips/finals to B2 with a verifiable manifest (Genblaze ObjectStorageSink / equivalent).
3) Winning artifact — A public durable MP4 URL + manifest JSON + a HyperFrames BRIEF/assets drop so another builder can fork the composition.
4) Anti-pattern — BYOK chaos, files only on a laptop, "trust me it rendered," competing with HyperFrames as a fake NLE.
5) CTA — Fork the builder kit: paste BRIEF.md, stage assets/devcut/, finish in HyperFrames; pin this Challenge Cut in Discord.

Title suggestion: "Genblaze + B2 Challenge Cut".
After stitch: HyperFrames handoff must attach (BRIEF.md + assets/devcut/ map + kit.zip).
```

**Product constant:** `DEVCUT_GOLDEN_CHALLENGE` in `apps/frontend/src/lib/devcut.ts` (same text, door-ready).

---

## Expected shot grammar

| # | Beat | Visual intent (for the agent) |
| --- | --- | --- |
| 1 | Problem | Tired builder, broken link / empty player, laptop glow, deadline energy |
| 2 | Constraint | Clean diagram-ish UI: Runway → Genblaze → B2 bucket + lock/hash motif |
| 3 | Winning artifact | Browser with durable URL playing; beside it BRIEF.md + assets folder |
| 4 | Anti-pattern | Messy desk, sticky notes “API key??”, `/tmp` folder crossed out |
| 5 | CTA | Discord pin / “Fork kit” card; HyperFrames logo-adjacent composition IDE vibe |

Durations: ~5s each → ~25–45s total after stitch.

---

## Success criteria (pass / fail)

- [ ] Title contains **Challenge Cut** (mode inference for kit)
- [ ] Five beats match Problem → Constraint → Winning → Anti-pattern → CTA
- [ ] Stitch completes; **Job outcome** opens on **HyperFrames** tab
- [ ] `*-hyperframes-kit.zip` downloads with `BRIEF.md`, `assets.json`, `README.md`
- [ ] BRIEF frontmatter has `workflow: product-launch-video` and durable asset paths under `assets/devcut/`
- [ ] Share tab invite blurb mentions film + kit (organizer-pinable)
- [ ] (LIVE) Optional: `durable_url` + `manifest_uri` when `GENBLAZE_ENABLED=1`

## Fixture notes (after first LIVE run)

Record here (do not commit secrets):

| Field | Value |
| --- | --- |
| Thread / job id | |
| Film URL (local or B2) | |
| Manifest URI | |
| Kit zip hash / date | |
| Screenshots | `docs/demos/fixtures/` (optional, git-LFS later) |

---

## Why this brief (Runway + HF)

| Partner | What they see |
| --- | --- |
| **Runway** | Their models generate the *heroes* of a hackathon visual spec — not a toy cinema demo |
| **HyperFrames** | DevCut stops at BRIEF + assets; composition OS stays with them |
| **Backblaze** | Winning = durable URL + provenance, not ephemeral CDN |
| **Organizers** | One film to pin + a kit builders can open without a walkthrough |
