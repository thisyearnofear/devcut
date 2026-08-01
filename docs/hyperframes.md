# DevCut × HyperFrames

How we **supplement** HyperFrames — not compete with it.

## Split of ownership

| Layer | Owner | Job |
| --- | --- | --- |
| Composition OS | **HyperFrames** | HTML → seekable timeline → render MP4 (`BRIEF.md` → `STORYBOARD.md` → compositions) |
| Generative footage + hackathon packaging | **DevCut** | Brief → Runway stills/clips → stitch reference / hero pack → durable URL |
| Metering | DevCut x402 | Pay per job so agents don’t paste Runway keys |

HyperFrames already owns **code-native video**. DevCut fills the gap organizers and builders hit mid-hack: *“I need consistent generative heroes and a Devpost-shaped cut without becoming a video team.”*

## What builders get from a DevCut run

After stitch, the canvas exposes a **HyperFrames handoff** (`builder_kit` on agent state):

1. **`BRIEF.md` seed** — valid HyperFrames intent frontmatter (`workflow`, `flow`, `storyboard`, `message`, …) plus Intent / Assets / Notes.
2. **Asset drop list** — still + clip URLs (and durable B2 URLs when enabled) mapped to suggested `assets/devcut/` paths.
3. **Drop instructions** — paste BRIEF, stage media, keep HTML composition in HyperFrames.

Canonical BRIEF shape: HyperFrames core `brief-format.md` (frontmatter + Intent / Assets / Customizations / Notes).

## Typical flows

**Challenge Cut → builder kit**  
Organizer film becomes the visual spec. Builders fork the kit: paste `BRIEF.md`, drop stills into `assets/devcut/`, finish motion/layout in HyperFrames (`product-launch-video` or `general-video`).

**Submit Ready → heroes into an existing HF project**  
Builder already has (or will init) a HyperFrames project. DevCut generates problem → product → proof heroes; handoff lists where each file lands. HyperFrames remains the authoring surface.

**Hero shot pack (x402)**  
Stills/clips only — no full stitch required — for an existing composition’s `assets/`.

## What we never do

- Replace HyperFrames catalog blocks or `/product-launch-video` authoring  
- Pretend DevCut is a general NLE or HTML composition tool  
- Ship MP4-only with no BRIEF / asset map (dead-end for HF builders)

## Code

| Piece | Path |
| --- | --- |
| Kit builder | `apps/agent/src/hyperframes_kit.py` |
| Attached on stitch | `stitch_final_cut` → `builder_kit` state |
| UI panel | `apps/frontend/src/components/devcut/HyperFramesHandoffPanel.tsx` |
| Product thesis | [`devcut-thesis.md`](./devcut-thesis.md) |
