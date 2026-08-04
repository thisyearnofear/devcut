// Organizer dashboard: list all threads in the signed-in user's org.
//
// ADR-0003 interim: one Intelligence org per hackathon event. Until org
// creation + invite links are built, all gh:<id> users land in the seeded
// casa-de-erlang org — so this endpoint shows every thread ever created
// on the shared deployment, scoped to the viewer's org.

import { identityFromCookie, authEnabled } from "./auth.js";
import { ensureUser } from "./auth.js";

const PG_URL =
  process.env.INTELLIGENCE_PG_URL ??
  "postgres://intelligence:intelligence@localhost:5433/intelligence_app";
const SNAP_URL_BASE = (process.env.B2_PUBLIC_URL_BASE ?? "").replace(/\/$/, "");

let _pg: typeof import("pg") | null = null;
async function pg() {
  if (!_pg) _pg = await import("pg");
  return _pg;
}

interface OrgThread {
  thread_id: string;
  name: string | null;
  user_id: string;
  created_at: string;
  archived: boolean;
  agent_id: string;
  // Enriched from B2 snapshot (best-effort):
  title?: string;
  shots_total?: number;
  shots_ready?: number;
  export_status?: string;
  final_video_url?: string;
  final_video_size?: number;
}

export async function listOrgThreads(cookieHeader: string | null): Promise<{
  threads: OrgThread[];
  org: string;
} | null> {
  if (!authEnabled) return null;
  const ident = await identityFromCookie(cookieHeader);
  if (!ident) return null;
  await ensureUser(ident.id, ident.name).catch(() => {});

  // Resolve the viewer's org.
  const mod = await pg();
  const client = new mod.Client({ connectionString: PG_URL, connectionTimeoutMillis: 3000 });
  await client.connect();
  let org = "casa-de-erlang";
  let rows: { thread_id: string; name: string | null; user_id: string; created_at: string; archived: boolean; agent_id: string }[] = [];
  try {
    const ures = await client.query(
      "SELECT organization_id FROM cpki.users WHERE id = $1",
      [ident.id],
    );
    if (ures.rows.length > 0) org = ures.rows[0].organization_id as string;

    const tres = await client.query(
      `SELECT thread_id, name, user_id, created_at, archived, agent_id
       FROM cpki.threads
       WHERE organization_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 50`,
      [org],
    );
    rows = (tres.rows as Array<Record<string, unknown>>).map((r) => ({
      thread_id: String(r.thread_id),
      name: (r.name as string) ?? null,
      user_id: String(r.user_id),
      created_at: r.created_at instanceof Date ? (r.created_at as Date).toISOString() : String(r.created_at),
      archived: Boolean(r.archived),
      agent_id: String(r.agent_id),
    }));
  } finally {
    await client.end().catch(() => {});
  }

  // Enrich from B2 snapshots (parallel, best-effort, 3s timeout each).
  const enriched = await Promise.allSettled(
    rows.map(async (r): Promise<OrgThread> => {
      const base: OrgThread = {
        thread_id: r.thread_id,
        name: r.name,
        user_id: r.user_id,
        created_at: r.created_at,
        archived: r.archived,
        agent_id: r.agent_id,
      };
      if (!SNAP_URL_BASE) return base;
      try {
        const snapRes = await fetch(
          `${SNAP_URL_BASE}/snapshots/${encodeURIComponent(r.thread_id)}.json`,
          { signal: AbortSignal.timeout(3000) },
        );
        if (!snapRes.ok) return base;
        const snap = (await snapRes.json()) as Record<string, unknown>;
        const shots = Array.isArray(snap.shots) ? (snap.shots as Array<Record<string, unknown>>) : [];
        const ready = shots.filter((s) => s.video_url || s.clip_url).length;
        const sb = snap.storyboard as Record<string, unknown> | undefined;
        return {
          ...base,
          title: (sb?.title as string) ?? r.name ?? "Untitled",
          shots_total: shots.length,
          shots_ready: ready,
          export_status: (snap.export_status as string) ?? undefined,
          final_video_url: (snap.final_video_url as string) ?? undefined,
        };
      } catch {
        return base;
      }
    }),
  );

  return {
    threads: enriched.map((e, i) => (e.status === "fulfilled" ? e.value : {
      thread_id: rows[i].thread_id,
      name: rows[i].name,
      user_id: rows[i].user_id,
      created_at: rows[i].created_at,
      archived: rows[i].archived,
      agent_id: rows[i].agent_id,
    })),
    org,
  };
}
