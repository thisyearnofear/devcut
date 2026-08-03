# ADR 0001 — Agent runtime: persistence & concurrency strategy

**Status:** Proposed · **Date:** 2026-08-03

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

**Interim (now):** stay on `runtime-inmem`, raise `N_JOBS_PER_WORKER`
(default 1) to a small fan-out (3–4, bounded by Runway rate limits), keep
B2 snapshots as the durability story. Upgrade langgraph-api to current
(0.11.x) in the same change.

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
