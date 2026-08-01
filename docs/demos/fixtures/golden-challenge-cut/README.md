# Genblaze + B2 Challenge Cut → HyperFrames kit

HyperFrames handoff ready — copy BRIEF.md, stage assets/devcut/, finish in HF.

## Drop steps

You received a Challenge Cut builder kit. HyperFrames is where builders finish the composition.

1. `npx hyperframes@latest init` (or open your existing project).
2. Paste `BRIEF.md` at the project root (merge Intent/Assets if one already exists).
3. Download each asset into the listed `assets/devcut/…` path.
4. Wire `<video>` / `<img>` sources to those paths in your composition HTML.
5. `npx hyperframes check` → preview → render in HyperFrames.

DevCut stops at generative footage + packaging. Do not re-author the film inside DevCut.

## Files

- `BRIEF.md` — paste at HyperFrames project root
- `assets.json` — download each `url` into `path`
- `ASSETS.md` — human checklist

Materialize again anytime:

```bash
uv run python scripts/materialize_hf_kit.py --golden
```
