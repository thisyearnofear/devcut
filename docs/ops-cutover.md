# Ops: hostname cutover + B2 (secure checklist)

Living checklist for moving prod to **devcut.thisyearnofear.com** and enabling Genblaze→B2.  
Do **not** put secrets in this file — only status and pointers.

## Hostname cutover (recommended)

**Primary (target):** `https://devcut.thisyearnofear.com`  
**Legacy (keep during cutover):** `https://director.thisyearnofear.com`  
**Canvas path:** keep `/director` (no path rename in this cutover)

| Step | Owner | Status |
| --- | --- | --- |
| DNS A/CNAME `devcut.thisyearnofear.com` → nuncio | Human | pending |
| Coolify / Traefik route + TLS for `devcut…` → `:3100` | Human (+ agent if SSH) | pending |
| Dual-host Traefik: both hostnames work | Human | pending |
| Set `NEXT_PUBLIC_APP_URL=https://devcut.thisyearnofear.com` in `/opt/gen-ui/.env` + local `.env` | Agent after DNS | pending |
| Set `X402_RESOURCE_BASE` to primary host | Agent after DNS | pending |
| B2 CORS allowlist includes both hosts | Agent (`scripts/setup-b2-cors.sh`) | pending (needs bucket) |
| Smoke new host: landing + `/director` + Vault video | Both | pending |
| Update Devpost / Discord / pins to `devcut…` | Human | pending |
| 301 legacy → primary (optional, 1 week) | Human | pending |
| Drop legacy from CORS / Traefik | Later | pending |

Code already dual-host aware: share URLs via `NEXT_PUBLIC_APP_URL` / browser origin; CORS script lists both hosts.

## Backblaze B2 + Genblaze

| Step | Status |
| --- | --- |
| Application key `devcut` in gitignored `.env` / `apps/agent/.env` (mode 600) | done (local) |
| Public bucket created + name known | **blocked — need bucket name** |
| `B2_BUCKET` / `B2_REGION` / `B2_PUBLIC_URL_BASE` set | pending |
| `GENBLAZE_ENABLED=1` + `B2_REQUIRE_DURABLE=1` | pending (after bucket) |
| CORS applied | pending |
| `smoke_genblaze_b2.py --upload` | pending |
| Same vars on nuncio `/opt/gen-ui/.env` (app key only — not master) | pending |
| Film golden Challenge Cut LIVE | pending |

### Security rules (keep)

- **Never commit** `.env`, application keys, or master keys.
- Runtime uses **application key** (`B2_KEY_ID` / `B2_APP_KEY`) scoped to the media bucket.
- **Master key** is optional and only for one-shot bucket/CORS setup; prefer console, or store as `B2_MASTER_KEY_ID` + `B2_MASTER_APP_KEY` locally then remove after setup.
- If a key was pasted into chat: **rotate** the application key in B2 after cutover when practical.
- Chat / docs: refer to keys as “set” — never paste full secrets into markdown or commits.

## What we need from you (unblockers)

Reply with these (bucket console is enough — master secret optional):

1. **DNS:** Confirm you can add `devcut.thisyearnofear.com` (or that it’s already pointed at nuncio).  
2. **B2 bucket (pick one):**  
   - **A (preferred):** Public bucket name + region from endpoint (e.g. `us-west-004`) + friendly URL base if shown, **or**  
   - **B:** Full master pair `keyID` + `applicationKey` (`K005…`) so we can create `devcut-media` via API.  
3. **SSH:** OK for agent to update Coolify Traefik + `/opt/gen-ui/.env` on nuncio? (yes/no)  
4. **Rotate:** After we’re live, OK to rotate the `devcut` app key that appeared in chat? (recommended yes)

## Progress log

| Date | Note |
| --- | --- |
| 2026-08-01 | Dual-host code + CORS allowlist + this checklist. App key stored locally only. Genblaze still off until bucket. |
