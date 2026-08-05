# ADR 0001 — Agent runtime: persistence & concurrency strategy

**Status:** Interim (inmem + B2 snapshots). Postgres checkpointer **blocked** — `langgraph-runtime-postgres` package is not published on PyPI (404); it's gated behind the LangGraph Platform Docker distribution, not available via pip/uv. · **Date:** 2026-08-03

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
  run interrupted mid-pipeline cannot resume.
- **Single global worker** — all runs for ALL users serialized through one
  in-process queue. Two concurrent users = one waits minutes behind the
  other's full pipeline. Fixed by `--n-jobs-per-worker 4` (shipped
  2026-08-04).

## Decision

**Interim (current):** `runtime-inmem` with `--n-jobs-per-worker 4` (env
`LANGGRAPH_JOBS_PER_WORKER`), B2 snapshots as the durability story,
langgraph-api 0.11.2, runtime-inmem 0.31.2, cli 0.4.31. Verified: full
golden run (5/5 clips + LIVE stitch + durable MP4) on 0.11.2; concurrent
runs confirmed via ThreadPoolExecutor fan-out.

**Postgres checkpointer: BLOCKED.** The `--runtime-edition postgres` flag
exists in `langgraph_api/cli.py` (line 468) and the `run_server` function
accepts `runtime_edition: Literal["inmem", "community", "postgres"]`. The
`langgraph_runtime` package dynamically imports `langgraph_runtime_postgres`
when `LANGGRAPH_RUNTIME_EDITION=postgres`. **However, the
`langgraph-runtime-postgres` package is not published on PyPI** (confirmed:
`https://pypi.org/pypi/langgraph-runtime-postgres/json` → 404). It is
gated behind the LangGraph Platform Docker distribution
(`langchain/langgraph-server` image via `langgraph up`), not available as a
standalone pip/uv install.

## Licensing research (2026-08-05)

- `langgraph-api` 0.11.2 is licensed under **Elastic License 2.0 (ELv2)**.
  ELv2 permits self-hosting, internal use, modification, and use within a
  larger product. The restriction ("you may not provide the software to
  third parties as a hosted or managed service") does NOT apply to DevCut.
- The `langgraph_license.validation` module is a **noop**: always returns
  `True`. No `LANGGRAPH_CLOUD_LICENSE_KEY` is required for the inmem path.
- `langgraph-cli` and `langgraph-sdk` are **MIT** licensed.
- `langgraph-runtime-inmem` is ELv2 (same as langgraph-api).
- **The Postgres runtime backend (`langgraph-runtime-postgres`) is not
  publicly available.** It ships only inside the `langchain/langgraph-server`
  Docker image (used by `langgraph up`). Running it outside Docker would
  require extracting the package from the image or using `langgraph up`
  with `--postgres-uri`.

## Alternatives considered

- **`langgraph up` (Docker)** — launches a Docker container with the
  `langchain/langgraph-server` image, which includes the Postgres runtime.
  Requires Docker on the server (already available). Would replace the PM2
  `langgraph dev` process with a Docker container. This is the viable path
  to Postgres checkpointer — but it's a bigger infrastructure change (Docker
  networking, volume management, the agent runs inside a container instead
  of PM2). **Deferred** — the B2 snapshot + drain gate covers the user-
  facing pain for now.
- **Keep `runtime-inmem` + B2 snapshots only** — current approach. Runs
  interrupted mid-pipeline cannot resume, but completed work survives via
  snapshots. The drain gate prevents deploying during active runs.
- **LangSmith Deployment (hosted)** — least ops, most lock-in + cost;
  conflicts with the self-hosted/x402 narrative.
- **Temporal / durable-execution rewrite** — over-engineered for current
  scale.

## Consequences

- Inmem interim: restarts wipe *locks* (separate lock TTL handling in BFF:
  45s) and *run execution state* (cannot resume mid-pipeline). B2 snapshots
  cover *canvas content* (shots, media URLs, export status) — the canvas
  restores after restart, but an interrupted run must be re-commissioned.
- The drain gate (`/readyz.inflight==0` before agent restart) prevents
  interrupting runs during deploys. `FORCE_DEPLOY=1` overrides (interrupts).
- B2 snapshots + `/api/thread-state` fallback + `/api/cut-card` endpoint
  provide durable canvas restore and shareable cut URLs even after restart.
- Worker count (`--n-jobs-per-worker 4`) is unchanged; bounded by Runway
  rate limits.

## Path to Postgres checkpointer (when ready)

1. Switch from PM2 `langgraph dev` to `langgraph up --postgres-uri ...`
   (Docker container with the `langchain/langgraph-server` image).
2. The container includes `langgraph-runtime-postgres` — no PyPI install
   needed.
3. Point at the existing `langgraph_app` Postgres database (5433).
4. Runs survive restarts; the agent can resume mid-pipeline.
5. B2 snapshots become secondary (defense-in-depth, not primary).

## Links

- B2 snapshot fallback: `apps/agent/src/state_snapshots.py`, `apps/bff/src/server.ts`
- Deploy safety (drain gate, selective restarts): `scripts/deploy-local.sh`
- License research: `langgraph_license.validation` (noop), `langgraph-api` ELv2
- PyPI 404: `https://pypi.org/pypi/langgraph-runtime-postgres/json`
