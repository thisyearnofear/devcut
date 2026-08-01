# Backblaze Generative Media Hackathon — Submission Notes

## App

**DevCut** (repo: gen-ui) — hackathon video desk.
Organizers commission Challenge Cuts; builders run Submit Ready (HyperFrames / repo / URL → Devpost MP4).
Engine: LangGraph storyboard → Runway stills → **Genblaze Pipeline** clips → stitch → **B2 durable objects + job manifest** → HyperFrames kit.

- Live app: https://director.thisyearnofear.com/director
- Repo: https://github.com/thisyearnofear/gen-ui

## AI providers and models

| Stage | Provider | Model / API |
| --- | --- | --- |
| Reference stills | Runway (direct SDK) → B2 `put_asset` | `gen4_image_turbo` |
| Shot video | Runway via **Genblaze** `RunwayProvider` + `ObjectStorageSink` | `gen4.5` image→video |
| Winning artifact | Genblaze **`AgentLoop`** (max 2 takes, verify until manifest verifies) | same |
| Voiceover / SFX | Runway → B2 | `eleven_multilingual_v2` / `eleven_text_to_sound_v2` |
| Restyle | Runway → B2 | `gen4_aleph` |
| Planning / agent | NVIDIA → Venice → Gemini | LangGraph + CopilotKit ([`providers.md`](./providers.md)) |

## How we use Genblaze

| API | Where | Why |
| --- | --- | --- |
| `Pipeline` + `RunwayProvider` | [`genblaze_bridge.py`](../apps/agent/src/genblaze_bridge.py) | Image→video spine with hashed `external_inputs` |
| `RetryPolicy.conservative()` | video provider | Production checklist for expensive video |
| `ObjectStorageSink` + `S3StorageBackend.for_backblaze()` | pipeline + [`media_storage.py`](../apps/agent/src/media_storage.py) | Durable rewrite + SHA-256 |
| `ObjectLockConfig` | sink `manifest_lock` | WORM window on manifests (`B2_MANIFEST_LOCK_DAYS`) |
| `KeyStrategy.HIERARCHICAL` / `CONTENT_ADDRESSABLE` | runs vs stills | Browseable Vault + dedupe |
| `AgentLoop` + `CallableEvaluator` | [`genblaze_agent_loop.py`](../apps/agent/src/genblaze_agent_loop.py) | Winning artifact quality gate |
| Job manifest JSON | [`job_manifest.py`](../apps/agent/src/job_manifest.py) | Whole-run provenance beside final MP4 |

Toggle (demo): `GENBLAZE_ENABLED=1` + `B2_*` + `B2_REQUIRE_DURABLE=1` + `B2_PUBLIC_URL_BASE=…`.

## How we use Backblaze B2

- **Public bucket** + `B2_PUBLIC_URL_BASE` for credential-free `<video src>` / Vault.
- **Application key** (S3-compatible), not master key.
- **CORS** via [`scripts/setup-b2-cors.sh`](../scripts/setup-b2-cors.sh) for `director.thisyearnofear.com` + localhost.
- **Lifecycle** via `auto_lifecycle=True` (orphaned multipart + noncurrent versions).
- **Object Lock (GOVERNANCE)** on Genblaze manifests when `B2_MANIFEST_LOCK_DAYS>0`.
- **Event Notifications** → `POST /api/b2-events` → Discord (`DISCORD_WEBHOOK_URL`) for “cut ready” alerts.
- **Provenance Vault UI** — Job outcome → **Vault** tab: durable MP4, job + clip manifests, SHA-256, Verify, Monday test.
- **BFF** `GET /api/runs/:threadId/vault` shapes the same payload from LangGraph state.

## Judge-facing surfaces

1. **Vault** tab — open B2 URL + Verify manifest (no leaving the app).
2. **HyperFrames** tab — kit.zip (BRIEF.md + assets.json).
3. **Share** — Discord/email invite with durable link.

## Demo script

- Partner walkthrough: [`demo-script.md`](./demo-script.md)
- Golden brief: [`demos/golden-challenge-cut.md`](./demos/golden-challenge-cut.md)
- **3-minute Devpost film** timing is in `demo-script.md` § “Devpost 3-minute cut”

### Short B2-focused path (~3 min, LIVE + Genblaze)

1. Open `/` → **Run golden Challenge Cut**.
2. Ledger shows stills → Genblaze clips (Winning beat shows AgentLoop takes).
3. Stitch → Job outcome opens on **Vault** when `durable_url` is set.
4. Click **Verify manifest** → open durable MP4 in a private window.
5. **HyperFrames** → download kit.zip; **Share** → copy invite.

## Ops checklist (before filming)

- [ ] Public B2 bucket + app key on nuncio (`GENBLAZE_ENABLED=1`, `B2_REQUIRE_DURABLE=1`)
- [ ] `B2_PUBLIC_URL_BASE` set; `bash scripts/setup-b2-cors.sh`
- [ ] `uv run python scripts/smoke_genblaze_b2.py --upload` prints a durable URL
- [ ] Object Lock enabled on bucket if using `B2_MANIFEST_LOCK_DAYS`
- [ ] Optional: B2 Event Notification → `https://<bff>/api/b2-events`
- [ ] Star Genblaze repo; file feedback issue (see [`docs/genblaze-feedback-issue.md`](./genblaze-feedback-issue.md))
