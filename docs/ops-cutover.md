# Ops: hostname cutover + B2 (secure checklist)

Living checklist for **devcut.thisyearnofear.com** and Genblaze→B2.  
Do **not** put secrets in this file — only status and pointers.

## Hostname cutover

**Primary:** `https://devcut.thisyearnofear.com`  
**Legacy:** `https://director.thisyearnofear.com` (still routed during cutover)  
**Canvas path:** `/director` (unchanged)

| Step | Status |
| --- | --- |
| DNS `devcut.thisyearnofear.com` | done (human) |
| Traefik dual-host rule (`devcut` \|\| `director`) → `:3100` | done 2026-08-01 |
| `DOMAIN` / `NEXT_PUBLIC_APP_URL` / `X402_RESOURCE_BASE` on nuncio | done |
| Same vars in local gitignored `.env` | done |
| B2 CORS allowlist includes both hosts | done (on bucket) |
| Smoke both hosts in browser | primary `devcut` HTTPS OK (LE cert) |
| Devpost / Discord pins → `devcut…` | pending (human) |
| Drop legacy host later | done (director DNS removed; Traefik is `devcut`-only) |

## Backblaze B2 + Genblaze

| Step | Status |
| --- | --- |
| Application key in local + nuncio `.env` (mode 600; **not** master) | done |
| Bucket `devcut-media` created | done (**public** — verified 2026-08-01) |
| Region `us-east-005` / friendly base `https://f005.backblazeb2.com/file/devcut-media` | done |
| CORS on bucket | done |
| `GENBLAZE_ENABLED=1` + `B2_REQUIRE_DURABLE=1` local + nuncio | done |
| Local smoke upload OK | done |
| Anonymous GET on smoke object (Monday test) | done (HTTP 200) |
| Master key **not** on nuncio | done (local-only for bucket admin) |
| Flip bucket to **public** | done |
| Deploy Genblaze/Vault code to nuncio (replace 20260703 release) | done (`20260801_143804`) |
| Film golden Challenge Cut LIVE | pending |

### Public bucket

`devcut-media` is **allPublic**. Anonymous friendly URLs under  
`https://f005.backblazeb2.com/file/devcut-media/…` return HTTP 200 (verified).

### Security rules

- Never commit `.env` or keys.
- Runtime = application key only (`B2_KEY_ID` / `B2_APP_KEY`).
- Master key stays local (bucket/CORS admin); never in PM2 env.
- Key rotation: owner-managed (not automated here).

## Progress log

| Date | Note |
| --- | --- |
| 2026-08-01 | Dual-host Traefik; B2 bucket+CORS; Genblaze enabled; director-* PM2 reloaded only. |
| 2026-08-01 | Bucket flipped **public**; anonymous smoke GET HTTP 200. |
| 2026-08-01 | Deployed release `20260801_143804` with Genblaze/Vault; `devcut` HTTPS 200. |
| 2026-08-01 | Fixed `ERR_CERT_AUTHORITY_INVALID`: issued Let's Encrypt cert for `devcut.thisyearnofear.com`; dropped director Traefik host (DNS NXDOMAIN). |
