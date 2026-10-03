# ADR 0006 — Event tenancy: hackathon orgs, invite links, and link-scoped authorization

**Status:** Proposed · **Date:** 2026-10-03

## Context

ADR-0003 shipped the interim: every signed-in user gets a private
Intelligence org (`user:<ghId>`, set in `ensureUser`, `apps/bff/src/auth.ts`).
That gives tester privacy, but it structurally blocks the organizer-GTM
product ADR-0005 just built:

- The organizer dashboard (`listOrgThreads`) filters `cpki.threads` by the
  viewer's org — with per-user orgs an organizer can never see builders'
  entries, so event grouping, winner selection, and recap composition are
  single-player demos.
- `validateRecapRequest` (ADR-0005) refuses any thread "not in your org" —
  correct behavior that currently makes multi-user recaps impossible.
- x402 jobs (variant pack on a builder's thread, recap on an event) have no
  notion of "who may act on this event" beyond sole ownership.

Things already true in the code that lower the cost of fixing this:

- Thread → org is a single column (`cpki.threads.organization_id`); the BFF
  already assumes one org per viewer everywhere, so widening *who* is in an
  org is the whole tenancy lift — no data-model change to threads.
- `devcut_thread_links` (ADR-0005) already records submission → challenge
  edges with an `org_id` column — an embryonic event membership signal.
- Budget/alert counters are Redis day keys at global and per-user scope
  (`devcut:cost:<day>`, `devcut:cost:<userId>:<day>`); an event tier is one
  more key, not a subsystem.

## Decision

**Introduce event orgs (`hackathon:<slug>`) with a lightweight membership
table, created on demand — no separate onboarding app.**

1. **Event creation = first commission.** When a signed-in user confirms a
   Challenge Cut with event metadata (`slug`, name, optional brand kit), the
   BFF creates org `hackathon:<slug>` (a `cpki.users`-style insert is not
   needed — cpki only requires the org id string on threads) and records the
   creator as `role: "organizer"` in the new devcut table:

   `devcut_org_members(user_id, org_id, role, created_at, PK(user_id, org_id))`
   + `devcut_events(org_id PK, slug UNIQUE, name, brand_kit jsonb,
   created_by, created_at)` — ensureTable pattern, same PG as the vault.

2. **Invite links, not approvals.** `/join/<slug>` (public page) → signed-in
   visitor inserts themselves as `role: "builder"` and their
   `cpki.users.organization_id` is *re-pointed* to the event org for the
   duration of the event; `/director` thread creation inherits org from the
   user row exactly as today, so zero agent/stitcher changes. A
   "Leave event" action restores `user:<ghId>`. (Personal cuts and event cuts
   never mix on one dashboard because the active org *is* the switch.)

3. **Authorization rule replaces org-equality where it matters.** A viewer
   may act on a thread if `thread.organization_id == viewer.active_org` OR
   the viewer is `organizer` of the thread's event org (via
   `devcut_org_members`). `validateRecapRequest` + `listOrgThreads` +
   `POST /api/thread-links` switch to this rule; nothing else changes.

4. **Per-event budgets ride the counter pattern.** `trackDailyCost` gains
   `devcut:cost:org:<orgId>:<day>`; `userDailyCallsRemaining` gains an org
   ceiling read from `devcut_events.budget` (nullable = no cap). Sponsored
   events get a cap + cost-alert webhook target row; unsponsored stay
   unlimited.

5. **x402 door prompts stay org-blind** — the canvas_path already carries
   `&thread=`/`&hackathon=`; the BFF resolves org at fulfill time from the
   commissioning session, never from the token.

6. **Migration for existing data:** none. Pre-event threads stay in
   `user:<ghId>` orgs; links/recaps for them keep working single-user. On
   first organizer-dashboard visit, an empty-state CTA offers
   "Create a hackathon" → inline slug/name form (decision 1).

## Alternatives considered

- **Treat `devcut_thread_links` as the tenancy primitive** (no cpki org
  re-pointing; dashboard unions all threads linked to your challenge
  thread). Cheaper, and tempting because the table exists — but API keys,
  Intelligence run scoping, and per-event budgets all hang off
  `organization_id`, so we would re-implement orgs badly. Rejected; kept as
  the *fallback* if cpki re-pointing proves hostile (spike 2a below).
- **Multiple memberships with an org switcher UI** (ADR-0003's target shape)
  — right end-state, wrong size for now; the re-point model gets 90% of it
  with one row and no switcher. Deferred, not rejected.
- **One shared event org for all hackathons + tags** — ADR-0003 already
  rejected the tag variant; budgets/keys collide.

## Consequences

- Organizer GTM becomes multiplayer: real event dashboards, real winner
  selection, recaps that satisfy the plan's Verification §7 cross-org tests.
- `validateRecapRequest`'s same-org rule gains its first non-owner caller —
  the authorization rule (decision 3) must be centralized, not copy-pasted
  per route.
- Re-pointing `cpki.users.organization_id` is the one write into cpki-owned
  data; if the Intelligence vendor's sync/assumptions choke on it, fallback
  (alt 1) ships the same UX with weaker budgets. Spiked explicitly.
- Dashboard "org:" label changes to event name; anonymous mode unaffected.

## Rollout (each step independently shippable)

- **2a-spike (½ day):** re-point a test `cpki.users` row → confirm thread
  creation + `/api/thread-state` + organizer list all follow the new org;
  confirm Intelligence doesn't cascade-delete anything.
- **Step 1:** tables + `POST /api/events` (create) + `/join/<slug>` +
  leave; dashboard empty-state CTA.
- **Step 2:** authorization rule centralized; `listOrgThreads` /
  `validateRecapRequest` / thread-links switch to it; event name on cards.
- **Step 3:** org cost counters + `devcut_events.budget` + sponsor alert.

## Links

- Supersedes the interim section of ADR-0003 (target model unchanged in shape)
- Enabled-by: ADR-0005 (`devcut_thread_links`, recap validation, brand kit)
- Code: `apps/bff/src/{auth.ts,organizer.ts,thread-links.ts,server.ts}`,
  `apps/frontend/src/app/join/` (new), `apps/frontend/src/app/organizer/`
