# Backblaze Generative Media Hackathon — Submission Notes

## App

**DevCut** (repo: gen-ui) — hackathon video desk.
Organizers commission Challenge Cuts; builders run Submit Ready (HyperFrames / repo / URL → Devpost MP4).
Engine: LangGraph storyboard → Runway stills/clips → stitch, with optional Genblaze + B2 durable storage.

- Live app: https://director.thisyearnofear.com/director
- Repo: https://github.com/thisyearnofear/gen-ui

## AI providers and models

| Stage | Provider | Model / API |
| --- | --- | --- |
| Reference stills | Runway (direct SDK) | `gen4_image_turbo` |
| Shot video | Runway via **Genblaze** `RunwayProvider` | `gen4.5` image→video (env: `RUNWAY_VIDEO_MODEL`) |
| Voiceover / SFX | Runway | `eleven_multilingual_v2` / `eleven_text_to_sound_v2` |
| Restyle | Runway | `gen4_aleph` |
| Planning / agent | NVIDIA → Venice → Gemini | LangGraph + CopilotKit ([`providers.md`](./providers.md)) |

Genblaze's Runway adapter is video-only, so stills and audio stay on the
existing Runway client; video orchestration + durable storage use Genblaze.

## How we use Genblaze

1. **`genblaze_bridge.py`** — per-shot `Pipeline` with `RunwayProvider`,
   `external_inputs=[Asset(image)]` for image→video, `tenant_id=thread_id`.
2. **`ObjectStorageSink(S3StorageBackend.for_backblaze())`** — sink on
   `pipeline.run()` so each clip + SHA-256 provenance `manifest.json` lands
   in B2 under hierarchical keys:
   `{prefix}/runs/{tenant}/{date}/{run_id}/assets/...`
3. **`media_storage.py`** — single SoT for non-Pipeline uploads (stills,
   VO, SFX, final stitched MP4) via `ObjectStorageSink.put_asset`.

Toggle: `GENBLAZE_ENABLED=1` + `B2_KEY_ID` / `B2_APP_KEY` / `B2_BUCKET` / `B2_REGION`.

## How we use Backblaze B2

- Public bucket for credential-free durable URLs (safe to put in `<video src>`).
- Application key (S3-compatible), not master key.
- Genblaze handles endpoint, hashing, multipart, and URL rewrite — no hand-rolled boto3.
- Canvas `durable_url` + `manifest_uri` surface B2 objects in the Export panel.

## Demo script

Partner walkthrough (Challenge Cut + HF demo + agent door): [`demo-script.md`](./demo-script.md).  
Golden brief: [`demos/golden-challenge-cut.md`](./demos/golden-challenge-cut.md).

### Short B2-focused path (~3 min, LIVE + Genblaze)

1. Open `/` → **Run golden Challenge Cut** (or `/director?mode=challenge&demo=golden`).
2. Agent plans → stills → clips; B2 rewrite when `GENBLAZE_ENABLED=1`.
3. Stitch → Job outcome **HyperFrames** tab → download kit.zip.
4. Share tab → copy invite; open `manifest_uri` if present.
