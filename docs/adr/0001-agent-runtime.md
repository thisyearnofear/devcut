# ADR 0001 — Agent runtime: persistence & concurrency strategy

**Status:** Interim implemented (2026-08-04) — langgraph-api 0.11.2, runtime-inmem 0.31.2, `--n-jobs-per-worker 4`; B2 snapshots shipped. Postgres checkpointer target deferred. · **Date:** 2026-08-03

## Context

DevCut runs the LangGraph agent via `langgraph-cli[inmem]` (runtime-inmem
+ langgraph-api 0.8.7 — **End of Life**). Consequences observed in
production:

- **State wipes on every restart** — canvases, checkpoints and run locks
  vanish when the process restarts (deploys, crashes). Mitigated today by
  per-shot B2 snapshots (`snapshots/<thread>.json`, see
  `apps/agent/src/state_snapshots.py` + BFF `/api/thread-state` fallback).
- **Single global worker** — all runs for ALL users serialize through one
  in-process queue. Two concurrent users = one waits minutes behind the
  other's full pipeline. First thing multi-user traffic will feel.
- EOL dependency in the request path we actively develop against.

## Decision

**Interim (shipped 2026-08-04):** `runtime-inmem` with
`--n-jobs-per-worker 4` (env `LANGGRAPH_JOBS_PER_WORKER`), B2 snapshots as
the durability story, langgraph-api upgraded from 0.8.7 (EOL) → 0.11.2,
runtime-inmem 0.28.1 → 0.31.2, cli 0.4.25 → 0.4.31. Verified: full golden
run (5/5 clips + LIVE stitch + durable MP4) on 0.11.2; concurrent runs
confirmed via ThreadPoolExecutor fan-out.

**Target (Phase 1):** self-hosted `langgraph-api` container backed by the
existing Postgres (5433) — real checkpointer, durable run state, queue
semantics, horizontal scaling. **Gate:** license terms for the standalone
container image (LangChain changed licensing/telemetry terms across
2025/26 releases) must be reviewed before adopting; if the terms are
unacceptable, option (b): own job queue (Redis-backed) + `langgraph` SDK
in-process, keeping B2 snapshots as the only persistence layer.

## Alternatives considered

- **Keep single-worker inmem + snapshots only** — cheapest, but global
  serialization fails the "two users at once" test that organizers +
  builders guarantee.
- **LangSmith Deployment (hosted)** — least ops, most lock-in + cost;
  conflicts with the self-hosted/x402 narrative.
- **Temporal/Durable-execution rewrite** — over-engineered for current
  scale; revisit if Runway fan-out (batch stills) grows.

## Consequences

- Inmem interim: restarts still wipe *locks* (separate lock TTL handling
  already in BFF: 45s), snapshots cover *content*.
- Postgres checkpointer target: `/api/thread-state` reads switch from B2
  fallback-first to checkpoint-first with B2 as archive-grade backup.
- Worker count bounded by Runway key rate limits — needs a small load
  test before raising above ~4.

## Links

- B2 snapshot fallback: `apps/agent/src/state_snapshots.py`, `apps/bff/src/server.ts`
- langgraph-api EOL warning observed in prod logs 2026-08-03
