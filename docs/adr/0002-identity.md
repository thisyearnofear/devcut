# ADR 0002 — Identity: GitHub OAuth + per-user scoping

**Status:** Implemented (activated 2026-08-04 — OAuth App live, env-gated scaffold verified end-to-end: providers/csrf/sign-in POST→GitHub, probe `auth_enabled:true`; hard gate on commissioning + BYOK server vault + organizer dashboard shipped) · **Date:** 2026-08-03

## Context

Everything currently runs as a shared `default` / `1_default` Intelligence
user: any visitor can see every thread, budgets are global, and there is no
way to attribute cost, abuse, or ownership. The platform's three user
populations (hackathon organizers, builders, agents) all need real
identity:

- **Builders**: own their threads/cuts; BYOK Runway keys currently stored
  per-browser in localStorage — needs server-side vaulting tied to a user.
- **Organizers**: need an event-scoped view (see ADR 0003).
- **Agents**: x402 API-key based, no OAuth — mapped to machine users.

## Decision

**Auth provider:** Auth.js (NextAuth v5) in the Next.js frontend with
**GitHub OAuth** as the only provider at launch. Builders and organizers
are GitHub-native by definition; adding Google/Discord later is config,
not code.

**Identity propagation:**

1. `session.user.id` (stable GitHub numeric id, stringified) becomes the
   Intelligence `userId`: BFF `identifyUser` reads the session token
   (already available via the same-origin rewrite — no CORS surface) and
   stops hardcoding `"default"`.
2. CopilotKit forwardedHeaders carry the id to agent runs
   (`ui_thread_id`-style injection pattern established for billing).
3. Per-user budget keys: `runway:budget:<userId>:<threadId>` —
   today's per-thread counter becomes per-user-scoped; daily global cap
   (`devcut:cost:<day>`, shipped) stays global.
4. BYOK keys: encrypted at rest (AES-256-GCM, key derived from `AUTH_SECRET`
   via HKDF) in Postgres table `devcut_credentials`; only written/read
   server-side by the BFF (`apps/bff/src/vault.ts`). Legacy
   `X-Runway-Api-Key` header kept as fallback during migration.
5. **Hard gate**: anonymous `POST /agent/director/run` → 401 "Sign in
   required". Browsing landing + `/cut` shares stays anonymous; only
   commissioning (spending) requires identity.
6. **Organizer dashboard** (`/organizer`): org-scoped thread list with
   B2-snapshot enrichment (shots/export/video status). See ADR-0003.

**Anonymous access:** the landing + `/cut/[id]` public share pages stay
anonymous; commissioning a run requires login. (Golden-run "try" CTA can
remain anonymous ONLY if we cap it harshly — decide at implementation
time; default: require login.)

## Alternatives considered

- **Clerk/Supabase Auth** — managed, faster polish, per-MAU pricing that
  punishes hackathon-shaped traffic spikes; vendor conflict with the
  self-hosted story.
- **Email magic links** — worse fit for builders; deliverability ops.
- **Stay anonymous + IP keying** — doesn't survive campuses/NAT, offers
  no BYOK vault, no organizer tooling. Rejected.

## Consequences

- Frontend gains login/logout UI + session plumbing; threads drawer
  shows only the user's threads.
- Every existing "default" thread becomes legacy-visible (migration:
  attribute to operator account on first login, or orphan).
- Agent (x402) identity intentionally separate: `agent:<keyId>` users.

## Links

- `identifyUser`: `apps/bff/src/server.ts`
- User seed: `scripts/seed-default-user.sh`
