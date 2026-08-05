# ADR 0001 — Agent runtime: persistence & concurrency strategy

**Status:** Postgres checkpointer adopted (2026-08-05) — `langgraph dev --runtime-edition postgres` against the existing `langgraph_app` database. No license key required (ELv2, noop license middleware). B2 snapshots retained as secondary fallback. · **Date:** 2026-08-03

## Context

DevCut runs the LangGraph agent via `langgraph-cli` (langgraph-api 0.11.2,
runtime-inmem 0.31.2, cli 0.4.31). The original deployment used
`runtime-inmem` — checkpoints stored in process memory. Consequences
observed in production:

- **State wipes on every restart** — canvases, checkpoints and run locks
  vanish when the process restarts (deploys, crashes). Mitigated by B2
  snapshots (`snapshots/<thread>.json`, see
  `apps/agent/src/state_snapshots.py` + BFF `/api/thread-state` fallback)
  — but snapshots cover *canvas content*, not *run execution state*. A
  run interrupted mid-pipeline could not resume.
- **Single global worker** — all runs for ALL users serialized through one
  in-process queue. Two concurrent users = one waits minutes behind the
  other's full pipeline. Fixed by `--n-jobs-per-worker 4` (shipped
  2026-08-04).

## Decision

**Postgres checkpointer (adopted 2026-08-05):** run the agent with
`langgraph dev --runtime-edition postgres`, pointing at the existing
`langgraph_app` Postgres database (already provisioned on the server at
`localhost:5433`). Checkpoints persist to Postgres; runs survive restarts;
the agent can resume mid-pipeline after a crash or deploy.

**B2 snapshots retained as secondary fallback** — the BFF
`/api/thread-state` and `/api/cut-card` endpoints still fall back to B2
snapshots when LangGraph state is unavailable (e.g., during a brief
restart window). With Postgres checkpointer, this fallback rarely fires,
but it remains as defense-in-depth.

## Licensing research (2026-08-05)

- `langgraph-api` 0.11.2 is licensed under **Elastic License 2.0 (ELv2)**.
  ELv2 permits self-hosting, internal use, modification, and use within a
  larger product. The one restriction — "you may not provide the software
  to third parties as a hosted or managed service" — does NOT apply to
  DevCut, which is a video product that *uses* LangGraph internally, not a
  hosted LangGraph service.
- The `langgraph_license.validation` module in the installed package is a
  **noop**: `get_license_status()` always returns `True`;
  `plus_features_enabled()` always returns `True`;
  `check_license_periodically()` logs "No license check is performed."
  No `LANGGRAPH_CLOUD_LICENSE_KEY` is required.
- `langgraph-cli` and `langgraph-sdk` are **MIT** licensed.
- `langgraph-runtime-inmem` is ELv2 (same as langgraph-api).
- `--runtime-edition postgres` is a first-class CLI flag (cli.py:467),
  not a premium feature. It reads `DATABASE_URI` + `REDIS_URI` env vars
  and auto-runs migrations against the target database.
- **Cost: $0. No license key. No Docker changes. No new infrastructure.**
  The `langgraph_app` database already exists on the server.

## Alternatives considered

- **Keep `runtime-inmem` + B2 snapshots only** — cheapest, but runs
  interrupted mid-pipeline cannot resume. B2 snapshots cover canvas
  *content* but not *execution state* (which node was active, what tools
  were pending). Rejected: the Postgres path is free and strictly better.
- **`langgraph up` (Docker container)** — production-grade, but adds a
  Docker container to the stack and requires `--postgres-uri`. The PM2
  `langgraph dev --runtime-edition postgres` path is simpler (same process
  model as today, no Docker changes) and uses the same Postgres.
- **LangSmith Deployment (hosted)** — least ops, most lock-in + cost;
  conflicts with the self-hosted/x402 narrative.
- **Temporal / durable-execution rewrite** — over-engineered for current
  scale.

## Consequences

- Runs survive agent restarts (deploys, crashes). A run interrupted
  mid-pipeline resumes from its last Postgres checkpoint.
- The BFF drain gate (`/readyz.inflight==0` before agent restart) remains
  valuable — it prevents interrupting a run *at all*. But if a run IS
  interrupted (crash, `FORCE_DEPLOY=1`), it can now resume.
- B2 snapshots become secondary: the BFF `/api/thread-state` fallback
  chain is LangGraph (now persistent) → B2 snapshot → empty. The fallback
  rarely fires but remains as defense-in-depth.
- The `langgraph_app` database on the server (already provisioned) gets
  langgraph-api's auto-migrations on first boot. No manual schema work.
- Worker count (`--n-jobs-per-worker 4`) is unchanged; bounded by Runway
  rate limits. Postgres checkpointer unlocks horizontal scaling (multiple
  agent replicas against the same Postgres) if needed later.

## Configuration

```bash
# /opt/gen-ui/.env
DATABASE_URI=postgresql://intelligence:intelligence@localhost:5433/langgraph_app
REDIS_URI=redis://localhost:6381
```

```js
// ecosystem.config.js — agent args
args: `dev --host 0.0.0.0 --port 8123 --no-browser --n-jobs-per-worker ${process.env.LANGGRAPH_JOBS_PER_WORKER || '4'} --runtime-edition postgres`
```

## Links

- B2 snapshot fallback: `apps/agent/src/state_snapshots.py`, `apps/bff/src/server.ts`
- Deploy safety (drain gate, selective restarts): `scripts/deploy-local.sh`
- License research: `langgraph_license.validation` (noop), `langgraph-api` ELv2
