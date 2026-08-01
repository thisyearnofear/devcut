# Available scripts

## Development

| Command | What it does |
|---|---|
| `npm run dev` | Boots infra, then UI + BFF + agent concurrently |
| `npm run dev:full` | Same as `dev` plus the MCP server |
| `npm run dev:infra` | Postgres + Redis + Intelligence composite |
| `npm run dev:infra:down` | Tear infra down |
| `npm run dev:ui` | Frontend only (Next.js, port 3010) |
| `npm run dev:bff` | CopilotKit runtime BFF only (Hono, port 4010) |
| `npm run dev:agent` | Agent only (`langgraph dev`, port 8133) |
| `npm run dev:mcp` | MCP server only (port 3011) |
| `npm run license` | Issue a CopilotKit license token |
| `npm run build` | Production build (frontend only) |

## Deployment

| Command | What it does |
|---|---|
| `bash scripts/deploy-local.sh` | Full deploy: build → release → rsync → symlink flip → PM2 reload → health check → rollback on failure → prune old releases |
| `bash scripts/deploy-local.sh` (with `FORCE_BUILD=1`) | Force rebuild even if artifacts exist |
| `bash scripts/check-env.sh` | Validate required env vars are set |
| `bash scripts/smoke-test.sh [base_url]` | Post-deploy end-to-end smoke test (default: `http://localhost:4010`) |
| `bash scripts/smoke-golden-mock.sh` | MOCK golden Challenge Cut: kit unit tests + fixture materialize (no API keys) |
| `bash scripts/setup-b2-cors.sh` | Apply CORS on B2 bucket for director + localhost playback |
| `uv run python scripts/materialize_hf_kit.py --golden` | Write MOCK kit to `docs/demos/fixtures/golden-challenge-cut/` |
| `uv run python scripts/materialize_hf_kit.py --zip <kit.zip> --out ./devcut-kit` | Unpack a browser-downloaded HyperFrames kit.zip |
| `node scripts/assert-frontend-kit.mjs` | Assert golden constant + kit.zip file set in frontend sources |
| `cd apps/agent && uv run python scripts/smoke_genblaze_b2.py --upload` | LIVE B2 upload smoke (requires `GENBLAZE_ENABLED=1` + `B2_*`) |
