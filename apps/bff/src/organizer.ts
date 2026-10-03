// Organizer dashboard: list all threads in the signed-in user's org.
//
// ADR-0003 interim: one Intelligence org per hackathon event. Until org
// creation + invite links are built, all gh:<id> users land in the seeded
// casa-de-erlang org — so this endpoint shows every thread ever created
// on the shared deployment, scoped to the viewer's org.

import { identityFromCookie, authEnabled } from "./auth.js";
import { ensureUser } from "./auth.js";
import { listLinksForThreadIds } from "./thread-links.js";

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
  // Hackathon graph edge (devcut_thread_links):
  hackathon_thread_id?: string;
  link_kind?: string;
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

  // Attach hackathon graph edges (devcut_thread_links) when present.
  let links: Record<string, { hackathon_thread_id: string; kind: string }> = {};
  try {
    links = await listLinksForThreadIds(rows.map((r) => r.thread_id));
  } catch {
    /* links table unavailable → dashboard still lists threads ungrouped */
  }

  return {
    threads: enriched.map((e, i) => {
      const base = e.status === "fulfilled" ? e.value : {
        thread_id: rows[i].thread_id,
        name: rows[i].name,
        user_id: rows[i].user_id,
        created_at: rows[i].created_at,
        archived: rows[i].archived,
        agent_id: rows[i].agent_id,
      };
      const link = links[base.thread_id];
      return link ? { ...base, hackathon_thread_id: link.hackathon_thread_id, link_kind: link.kind } : base;
    }),
    org,
  };
}

// ---- Recap commission (ADR-0005) — auth-gated paid job --------------------

export interface RecapRequest {
  thread_ids: string[];
  hackathon_thread_id?: string | null;
  title?: string;
  cta_text?: string | null;
}

export interface RecapValidation {
  ok: boolean;
  status: number;
  error?: string;
  brief?: string;
  logo_url?: string | null;
  resolved?: number;
}

async function fetchSnapshotJson(threadId: string): Promise<Record<string, unknown> | null> {
  if (!SNAP_URL_BASE) return null;
  try {
    const res = await fetch(
      `${SNAP_URL_BASE}/snapshots/${encodeURIComponent(threadId)}.json`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function brandLogoFrom(brandKit: unknown): string | null {
  if (!brandKit || typeof brandKit !== "object") return null;
  const kit = brandKit as Record<string, unknown>;
  for (const key of ["logo_url", "sponsor_logo_url"]) {
    const v = kit[key];
    if (typeof v === "string" && v.startsWith("http")) return v;
  }
  const sponsors = kit.sponsors;
  if (Array.isArray(sponsors)) {
    for (const sp of sponsors) {
      if (sp && typeof sp === "object") {
        const o = sp as Record<string, unknown>;
        for (const key of ["logo_url", "logo"]) {
          const v = o[key];
          if (typeof v === "string" && v.startsWith("http")) return v;
        }
      }
    }
  }
  return null;
}

/**
 * Validate an organizer's recap selection: same-org threads, finished cuts
 * only, plus the challenge thread's brand-kit logo. Returns the brief seed
 * for the recap_reel x402 commission.
 */
export async function validateRecapRequest(
  cookieHeader: string | null,
  req: RecapRequest,
): Promise<RecapValidation> {
  const data = await listOrgThreads(cookieHeader);
  if (!data) return { ok: false, status: 401, error: "auth_required" };

  const ids = (req.thread_ids || []).map((t) => t.trim()).filter(Boolean);
  if (ids.length < 2) {
    return { ok: false, status: 400, error: "select at least 2 winner threads" };
  }
  const byId = new Map(data.threads.map((t) => [t.thread_id, t]));
  const notMine = ids.filter((t) => !byId.has(t));
  if (notMine.length > 0) {
    return { ok: false, status: 403, error: `threads not in your org: ${notMine.join(",")}` };
  }
  const notReady = ids.filter((t) => (byId.get(t)!.export_status ?? "") !== "ready");
  if (notReady.length > 0) {
    return { ok: false, status: 400, error: `threads without a finished cut: ${notReady.join(",")}` };
  }

  let logo: string | null = null;
  let hackathonTitle = "";
  if (req.hackathon_thread_id) {
    if (!byId.has(req.hackathon_thread_id)) {
      return { ok: false, status: 403, error: "hackathon thread not in your org" };
    }
    const snap = await fetchSnapshotJson(req.hackathon_thread_id);
    logo = brandLogoFrom(snap?.brand_kit);
    const sb = snap?.storyboard as Record<string, unknown> | undefined;
    hackathonTitle = (sb?.title as string) ?? "";
  }

  const title = req.title?.trim() ||
    `${hackathonTitle || "Hackathon"} — Winners Recap`;
  const brief = [
    `Mode: Recap Reel (organizer — post-hackathon). Paid via x402 SKU recap_reel.`,
    `Recap title: ${title}`,
    `Recap source threads: ${ids.join(",")}`,
    req.cta_text ? `CTA text: ${req.cta_text}` : "",
    logo ? `Sponsor logo URL: ${logo}` : "",
    "Call generate_recap ONCE with these thread ids. Re-stitch only — no new Runway generation, silent audio.",
  ]
    .filter(Boolean)
    .join("\n");

  return { ok: true, status: 200, brief, logo_url: logo, resolved: ids.length };
}
