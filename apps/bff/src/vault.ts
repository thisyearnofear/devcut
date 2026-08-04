// BYOK credential vault — server-side encrypted storage per user.
//
// Replaces the browser-localStorage Runway key: the user's key is encrypted
// at rest (AES-256-GCM, key derived from AUTH_SECRET via HKDF) and stored in
// the Intelligence Postgres. The BFF decrypts it at run time and injects it
// into the agent's configurable.runway_api_key — the agent code is unchanged.
//
// Table: devcut_credentials (user_id, provider, credential_enc, created_at)
// — created lazily on first use (ensureCredentialsTable).

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import Redis from "ioredis";

const VAULT_KEY_INFO = "DevCut BYOK vault key";
const VAULT_KEY_LEN = 32; // AES-256

function vaultKey(): Uint8Array | null {
  const secret = process.env.AUTH_SECRET ?? "";
  if (!secret) return null;
  return new Uint8Array(hkdfSync("sha256", secret, "", VAULT_KEY_INFO, VAULT_KEY_LEN));
}

function encrypt(plaintext: string): string {
  const key = vaultKey();
  if (!key) throw new Error("AUTH_SECRET not set — cannot encrypt credentials");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString("base64"),
    data: enc.toString("base64"),
    tag: tag.toString("base64"),
  });
}

export function decrypt(blob: string): string | null {
  const key = vaultKey();
  if (!key) return null;
  try {
    const { iv, data, tag } = JSON.parse(blob);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ---- Postgres (same connection as ensureUser in auth.ts) ----
const PG_URL =
  process.env.INTELLIGENCE_PG_URL ??
  "postgres://intelligence:intelligence@localhost:5433/intelligence_app";

let _pg: typeof import("pg") | null = null;
async function pg() {
  if (!_pg) _pg = await import("pg");
  return _pg;
}

let _tableEnsured = false;
async function ensureTable(): Promise<void> {
  if (_tableEnsured) return;
  const mod = await pg();
  const client = new mod.Client({ connectionString: PG_URL, connectionTimeoutMillis: 3000 });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS devcut_credentials (
        user_id       text NOT NULL,
        provider      text NOT NULL,
        credential_enc text NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT NOW(),
        updated_at    timestamptz NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, provider)
      )
    `);
    _tableEnsured = true;
  } finally {
    await client.end().catch(() => {});
  }
}

// ---- Redis cache (avoid a pg round-trip on every run) ----
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

function cacheKey(userId: string, provider: string): string {
  return `devcut:cred:${userId}:${provider}`;
}

/** Store (encrypt) a user's credential for a provider. */
export async function putCredential(userId: string, provider: string, plaintext: string): Promise<void> {
  await ensureTable();
  const enc = encrypt(plaintext);
  const mod = await pg();
  const client = new mod.Client({ connectionString: PG_URL, connectionTimeoutMillis: 3000 });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO devcut_credentials (user_id, provider, credential_enc, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, provider) DO UPDATE SET credential_enc = $3, updated_at = NOW()`,
      [userId, provider, enc],
    );
  } finally {
    await client.end().catch(() => {});
  }
  try { await redis().set(cacheKey(userId, provider), enc, "EX", 3600); } catch { /* non-fatal */ }
}

/** Retrieve + decrypt a user's credential. Returns null if not set. */
export async function getCredential(userId: string, provider: string): Promise<string | null> {
  // Cache first
  try {
    const cached = await redis().get(cacheKey(userId, provider));
    if (cached) return decrypt(cached);
  } catch { /* fall through to pg */ }

  await ensureTable();
  const mod = await pg();
  const client = new mod.Client({ connectionString: PG_URL, connectionTimeoutMillis: 3000 });
  await client.connect();
  try {
    const res = await client.query(
      "SELECT credential_enc FROM devcut_credentials WHERE user_id = $1 AND provider = $2",
      [userId, provider],
    );
    if (res.rows.length === 0) return null;
    const enc = res.rows[0].credential_enc as string;
    try { await redis().set(cacheKey(userId, provider), enc, "EX", 3600); } catch { /* non-fatal */ }
    return decrypt(enc);
  } finally {
    await client.end().catch(() => {});
  }
}

/** Delete a user's credential. */
export async function deleteCredential(userId: string, provider: string): Promise<void> {
  await ensureTable();
  const mod = await pg();
  const client = new mod.Client({ connectionString: PG_URL, connectionTimeoutMillis: 3000 });
  await client.connect();
  try {
    await client.query(
      "DELETE FROM devcut_credentials WHERE user_id = $1 AND provider = $2",
      [userId, provider],
    );
  } finally {
    await client.end().catch(() => {});
  }
  try { await redis().del(cacheKey(userId, provider)); } catch { /* non-fatal */ }
}

/** Mask a key for display: sk-...last4 */
export function maskKey(key: string): string {
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}
