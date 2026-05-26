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
