# DevCut × Remotion

How DevCut **supplements** Remotion — a second code-native composition
target next to HyperFrames.

## Split of ownership

| Layer | Owner | Job |
| --- | --- | --- |
| Composition OS | **HyperFrames** (HTML) *or* **Remotion** (React) | timeline → render MP4 |
| Generative footage + packaging | **DevCut** | Brief → stills/clips (Runway · fal.ai) → stitch / kit |
| Metering | DevCut x402 | Pay per job so agents don’t paste vendor keys |

DevCut perturbs nothing about Remotion authoring. After a run we emit a
drop-in Remotion scaffold (`remotion_kit`) that plays the generated clips
linearly with a beat caption — a working first render the builder then
owns. HyperFrames stays the default handoff; Remotion is for React-native
teams or builders who want the timeline in TypeScript.

## What builders get from a DevCut run

On the **Handoff** tab of the outcome panel (or `emit_remotion_kit()`):

- **Download Remotion kit.zip** — namespaced `*-remotion-kit/`:
  `package.json`, `remotion.config.ts`, `tsconfig.json`, `src/index.ts`,
  `src/Root.tsx`, `src/DevCutComposition.tsx`, generated `src/shots.ts`,
  plus `BRIEF.md` / `assets.json` / `README.md`.

```bash
cd <kit> && npm install
npx remotion studio                       # iterate captions / timeline
npx remotion render DevCut out/final.mp4  # first render, zero edits
```

- `src/shots.ts` — generated manifest (beat, src, durationInFrames).
  `kind: "video"` uses `<OffthreadVideo>`; `kind: "image"` uses `<Img>`.
- Remote MP4 URLs play out of the box. For big renders, download clips
  into `public/assets/devcut/` and swap to `staticFile()`.

## Typical flows

**Challenge Cut / Submit Ready → Remotion** — pick Remotion on the Handoff
tab, download the scaffold, `npm run render`. DevCut supplied heroes +
working sequence; the builder levels up the cut in React.

**Hero shot pack (x402)** — stills/clips only, for an existing Remotion
`assets/` or an existing `src/shots.ts`.

## What we never do

- Replace Remotion’s timeline/transitions/motion authoring.
- Pretend DevCut renders Remotion (that’s `npx remotion render`).
- Ship MP4-only with no scaffold/asset manifest (dead-end for builders).

## Code

| Piece | Path |
| --- | --- |
| Remotion kit builder (agent) | `apps/agent/src/remotion_kit.py` |
| Attached on stitch / emitted | `remotion_kit` state + `emit_remotion_kit` |
| Kit ZIP (client) | `apps/frontend/src/lib/builder-kit-download.ts` → `downloadRemotionKitZip` |
| Handoff UI | `apps/frontend/src/components/devcut/JobOutcomePanel.tsx` (`RemotionHandoff`) |
| Media provider (fallback) | `apps/agent/src/media_provider.py` + `fal_client.py` |

See also [`hyperframes.md`](./hyperframes.md) (default handoff) and
[`providers.md`](./providers.md) (media backends).
