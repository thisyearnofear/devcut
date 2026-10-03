// Hackathon graph edges (ADR-0005 Phase 3).
//
// Links submission threads to the challenge thread (the "hackathon") they
// were built for, so the organizer dashboard can group entries per event
// and the recap commission can validate membership. Lives in devcut PG.
//
// Table: devcut_thread_links (thread_id PK, hackathon_thread_id, kind, org_id)

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
      CREATE TABLE IF NOT EXISTS devcut_thread_links (
        thread_id           text PRIMARY KEY,
        hackathon_thread_id text NOT NULL,
        kind                text NOT NULL DEFAULT 'submission',
        org_id              text,
        created_at          timestamptz NOT NULL DEFAULT NOW(),
        updated_at          timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(
      "CREATE INDEX IF NOT EXISTS devcut_thread_links_hackathon_idx ON devcut_thread_links (hackathon_thread_id)",
    );
    _tableEnsured = true;
  } finally {
    await client.end().catch(() => {});
  }
}

export interface ThreadLink {
  thread_id: string;
  hackathon_thread_id: string;
  kind: string;
  org_id: string | null;
}

export async function upsertLink(link: ThreadLink): Promise<void> {
  await ensureTable();
  const mod = await pg();
  const client = new mod.Client({ connectionString: PG_URL, connectionTimeoutMillis: 3000 });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO devcut_thread_links (thread_id, hackathon_thread_id, kind, org_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (thread_id) DO UPDATE SET
         hackathon_thread_id = EXCLUDED.hackathon_thread_id,
         kind = EXCLUDED.kind,
         org_id = COALESCE(EXCLUDED.org_id, devcut_thread_links.org_id),
         updated_at = NOW()`,
      [link.thread_id, link.hackathon_thread_id, link.kind, link.org_id],
    );
  } finally {
    await client.end().catch(() => {});
  }
}

/** All links whose hackathon edge belongs to the given org (or is unlabelled). */
export async function listLinksForThreadIds(
  threadIds: string[],
): Promise<Record<string, { hackathon_thread_id: string; kind: string }>> {
  if (threadIds.length === 0) return {};
  await ensureTable();
  const mod = await pg();
  const client = new mod.Client({ connectionString: PG_URL, connectionTimeoutMillis: 3000 });
  await client.connect();
  try {
    const res = await client.query(
      "SELECT thread_id, hackathon_thread_id, kind FROM devcut_thread_links WHERE thread_id = ANY($1::text[])",
      [threadIds],
    );
    const out: Record<string, { hackathon_thread_id: string; kind: string }> = {};
    for (const r of res.rows as Array<Record<string, unknown>>) {
      out[String(r.thread_id)] = {
        hackathon_thread_id: String(r.hackathon_thread_id),
        kind: String(r.kind),
      };
    }
    return out;
  } finally {
    await client.end().catch(() => {});
  }
}

export async function listLinksForHackathon(hackathonThreadId: string): Promise<ThreadLink[]> {
  await ensureTable();
  const mod = await pg();
  const client = new mod.Client({ connectionString: PG_URL, connectionTimeoutMillis: 3000 });
  await client.connect();
  try {
    const res = await client.query(
      "SELECT thread_id, hackathon_thread_id, kind, org_id FROM devcut_thread_links WHERE hackathon_thread_id = $1 ORDER BY created_at",
      [hackathonThreadId],
    );
    return (res.rows as Array<Record<string, unknown>>).map((r) => ({
      thread_id: String(r.thread_id),
      hackathon_thread_id: String(r.hackathon_thread_id),
      kind: String(r.kind),
      org_id: (r.org_id as string) ?? null,
    }));
  } finally {
    await client.end().catch(() => {});
  }
}
