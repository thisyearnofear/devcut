# DevCut Agent

LangGraph agent for **DevCut** — Challenge Cuts + Submit Ready films on a live storyboard.

North star: [`docs/devcut-thesis.md`](../../docs/devcut-thesis.md)  
Planner LLMs: [`docs/providers.md`](../../docs/providers.md) (NVIDIA → Venice → Gemini)  
Hackathon B2 notes: [`docs/hackathon-backblaze.md`](../../docs/hackathon-backblaze.md)

## Genblaze + Backblaze B2

When `GENBLAZE_ENABLED=1` and B2 credentials are set:

- **Video** runs through Genblaze `Pipeline` + `RunwayProvider` + conservative retries ([`genblaze_bridge.py`](src/genblaze_bridge.py))
- **Winning artifact** beat uses Genblaze `AgentLoop` until the provenance manifest verifies ([`genblaze_agent_loop.py`](src/genblaze_agent_loop.py))
- **All durable assets** (stills, clips, VO, SFX, final cuts) upload via
  Genblaze `ObjectStorageSink` → `S3StorageBackend.for_backblaze` ([`media_storage.py`](src/media_storage.py))
- **Job manifest** JSON is written after stitch ([`job_manifest.py`](src/job_manifest.py))
- Provenance manifests land alongside assets; Object Lock optional via `B2_MANIFEST_LOCK_DAYS`

```bash
GENBLAZE_ENABLED=1
B2_REQUIRE_DURABLE=1          # demo/golden: fail loudly instead of silent CDN
B2_PUBLIC_URL_BASE=https://f004.backblazeb2.com/file/YOUR_BUCKET
B2_AUTO_LIFECYCLE=1
B2_MANIFEST_LOCK_DAYS=30      # 0 to disable
B2_KEY_ID=...
B2_APP_KEY=...
B2_BUCKET=directors-canvas-media
B2_REGION=us-west-004
RUNWAY_API_KEY=...            # also Genblaze RunwayProvider api_secret
```

Create a **public** B2 bucket and an **application key** (not the master key).
Apply CORS: `bash scripts/setup-b2-cors.sh`  
Smoke: `uv run python scripts/smoke_genblaze_b2.py --upload`  
See: https://www.backblaze.com/docs/cloud-storage-genblaze-developer-guide

## Tests

```bash
uv run python -m unittest tests.test_hyperframes_kit tests.test_job_manifest -v
```

## Dev

```bash
uv sync
uv run langgraph dev
```
