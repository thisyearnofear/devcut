// Auth.js v5 session-cookie decoding for the BFF.
//
// The frontend uses next-auth (v5) with JWT sessions. Because Next rewrites
// /api/* to the BFF same-origin, the browser's session cookie flows through
// to us — we just need to JWE-decrypt it with the shared AUTH_SECRET to get
// the GitHub user id. Anonymous requests simply decrypt to nothing and stay
// on the "default" identity path (unchanged behavior).
//
// Auth.js v5 cookie: [__Secure-]authjs.session-token, JWE A256CBC-HS512,
// key = HKDF-SHA256(secret, salt=<cookie name>,
//        info="Auth.js Generated Encryption Key (<cookie name>)", 64 bytes).

import { hkdfSync } from "node:crypto";
import { jwtDecrypt } from "jose";
import Redis from "ioredis";

const AUTH_SECRET = process.env.AUTH_SECRET ?? "";
const COOKIE_NAMES = ["__Secure-authjs.session-token", "authjs.session-token"] as const;

export const authEnabled = Boolean(
  process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET && AUTH_SECRET,
);

function deriveKey(secret: string, salt: string): Uint8Array {
  const info = `Auth.js Generated Encryption Key (${salt})`;
  const buf = hkdfSync("sha256", secret, salt, info, 64);
  return new Uint8Array(buf);
}

function cookieValue(cookieHeader: string, name: string): string | null {
  const re = new RegExp(`(?:^|;)\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]+)`);
  const m = cookieHeader.match(re);
  return m ? decodeURIComponent(m[1]) : null;
}

export interface AuthIdentity {
  /** DevCut user id: `gh:<github-numeric-id>` */
  id: string;
  name: string;
  authenticated: true;
}

let _redis: Redis | null = null;
function redis(): Redis {
  if (!_redis) {
    _redis = new Redis(
      process.env.REDIS_URL ?? `redis://localhost:${process.env.REDIS_HOST_PORT ?? 6379}`,
      { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1, connectTimeout: 2000 },
    );
    _redis.connect().catch(() => {});
  }
  return _redis;
}

/** Decode the Auth.js session cookie → identity, or null when anonymous/disabled. */
export async function identityFromCookie(cookieHeader: string | null): Promise<AuthIdentity | null> {
  if (!authEnabled || !cookieHeader) return null;
  for (const name of COOKIE_NAMES) {
    const token = cookieValue(cookieHeader, name);
    if (!token) continue;
    try {
      const { payload } = await jwtDecrypt(token, deriveKey(AUTH_SECRET, name), {
        clockTolerance: 60,
      });
      if (payload.sub) {
        return {
          id: `gh:${payload.sub}`,
          name: (payload.name as string) ?? (payload.email as string) ?? `gh:${payload.sub}`,
          authenticated: true,
        };
      }
    } catch {
      /* try next cookie name */
    }
  }
  return null;
}

// ---- ensure-user ----
// Intelligence does NOT auto-create users (cpki.threads FK violation — we hit
// this with '1_default'). Seed new identities lazily on first sight.
const INTELLIGENCE_PG_URL =
  process.env.INTELLIGENCE_PG_URL ?? "postgres://intelligence:intelligence@localhost:5433/intelligence_app";
const INTELLIGENCE_ORG = process.env.INTELLIGENCE_ORG_ID ?? "casa-de-erlang";

let _pgModule: typeof import("pg") | null = null;
async function pgModule() {
  if (!_pgModule) _pgModule = await import("pg");
  return _pgModule;
}

export async function ensureUser(id: string, name: string): Promise<void> {
  const r = redis();
  try {
    const seen = await r.set(`devcut:user-seen:${id}`, "1", "EX", 86400, "NX");
    if (seen !== "OK") return; // already ensured recently
  } catch {
    /* redis down → fall through to insert anyway (idempotent) */
  }
  try {
    const pg = await pgModule();
    const client = new pg.Client({ connectionString: INTELLIGENCE_PG_URL, connectionTimeoutMillis: 3000 });
    await client.connect();
    try {
      await client.query(
        "INSERT INTO cpki.users (id, organization_id, created_at) VALUES ($1, $2, NOW()) ON CONFLICT (id) DO NOTHING",
        [id, INTELLIGENCE_ORG],
      );
    } finally {
      await client.end().catch(() => {});
    }
  } catch (e) {
    console.warn(JSON.stringify({ msg: "ensure_user_failed", id, error: e instanceof Error ? e.message : String(e) }));
  }
}

/** The runtime's identifyUser callback (async, receives the raw Request). */
export async function identifyUser(request: Request): Promise<{ id: string; name: string }> {
  const ident = await identityFromCookie(request.headers.get("cookie"));
  if (ident) {
    void ensureUser(ident.id, ident.name);
    return { id: ident.id, name: ident.name };
  }
  return { id: "default", name: "Hackathon User" };
}
