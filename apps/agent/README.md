# DevCut Agent

LangGraph agent for **DevCut** — Challenge Cuts + Submit Ready films on a live storyboard.

North star: [`docs/devcut-thesis.md`](../../docs/devcut-thesis.md)  
Planner LLMs: [`docs/providers.md`](../../docs/providers.md) (NVIDIA → Venice → Gemini)

## Genblaze + Backblaze B2

When `GENBLAZE_ENABLED=1` and B2 credentials are set:

- **Video** runs through Genblaze `Pipeline` + `RunwayProvider` (`genblaze_bridge.py`)
- **All durable assets** (stills, clips, VO, SFX, final cuts) upload via
  Genblaze `ObjectStorageSink` → `S3StorageBackend.for_backblaze` (`media_storage.py`)
- Provenance manifests land alongside assets in hierarchical B2 keys

```bash
GENBLAZE_ENABLED=1
B2_KEY_ID=...
B2_APP_KEY=...
B2_BUCKET=directors-canvas-media
B2_REGION=us-west-004
RUNWAY_API_KEY=...   # also used as Genblaze RunwayProvider api_secret
```

Create a **public** B2 bucket and an **application key** (not the master key).
See: https://www.backblaze.com/docs/cloud-storage-developer-quick-start-guide

## Dev

```bash
uv sync
uv run langgraph dev
```
