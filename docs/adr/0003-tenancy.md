# ADR 0003 — Hackathon tenancy: one Intelligence org per event

**Status:** Interim implemented (2026-08-04) — organizer dashboard shipped at `/organizer` (org-scoped thread list with B2-snapshot enrichment). Org creation + invite links + per-event budgets deferred. · **Date:** 2026-08-03

## Context

DevCut's organizing metaphor is hackathon-scoped: an organizer
commissions a **Challenge Cut** (the visual spec), builders produce
**submission cuts** against it, agents transcode/judge-assist via x402.
Intelligence already models `organizations` (seeded demos:
casa-de-erlang, haus-von-haskell, cafe-du-caml) and threads/runs are
org-scoped internally.

Without a tenancy rule, all events collapse into one org: organizers
can't scope "all cuts for MY hackathon", API keys collide across events,
and per-event budgets are unenforceable.

## Decision

**One Intelligence organization per hackathon event.**

- Organizer onboarding = create org (`hackathon:<slug>`) + mint:
  (a) a human API key for the organizer's dashboard view,
  (b) N agent-scoped x402 keys for that event's agent traffic.
- Builders join an event via invite link (`/join/<slug>`) → their
  threads/runs land in the event org. Personal (non-event) cuts live in
  the user's private org (`user:<ghId>`).
- Event-scoped budget caps + daily ceilings ride the Redis counters
  already keyed by day; org id joins the key namespace
  (`devcut:cost:<org>:<day>`).
- The /director canvas gets an org switcher ONLY for users with >1 org;
  default = most recent event; anonymous = none.

**Data layout:** no schema change required — cpki tables are already
org-scoped; the BFF just stops assuming casa-de-erlang for everything.

## Alternatives considered

- **Single org + tag threads with event id** — simpler, but API keys,
  quotas and dashboards can't be scoped without re-implementing orglike
  primitives anyway.
- **Separate deployment per event** — true isolation, ops nightmare.

## Consequences

- Organizer dashboard (shipped at `/organizer`) is "list threads/runs for org" — a
  query against `cpki.threads` enriched from B2 snapshots, not a new subsystem.
- x402 pricing can differentiate per event (sponsored vs BYO).
- Seeding scripts (`scripts/seed-default-user.sh`, deploy-time insert)
  must skip hardcoded org assumptions.

## Links

- Org seeding: `docker-compose.infra.yml`, deploy script §9b
- Cost counters: `apps/bff/src/server.ts` (`trackDailyCost`)
