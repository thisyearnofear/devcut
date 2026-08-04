"use client";

import { useEffect, useState } from "react";

interface OrgThread {
  thread_id: string;
  name: string | null;
  user_id: string;
  created_at: string;
  archived: boolean;
  title?: string;
  shots_total?: number;
  shots_ready?: number;
  export_status?: string;
  final_video_url?: string;
}

export function OrganizerDashboard() {
  const [threads, setThreads] = useState<OrgThread[]>([]);
  const [org, setOrg] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/organizer/threads")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: { threads: OrgThread[]; org: string }) => {
        setThreads(d.threads);
        setOrg(d.org);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="font-mono text-sm text-white/40">Loading cuts…</p>;
  }
  if (error) {
    return (
      <div className="rounded-lg border border-rose-400/25 bg-rose-500/10 p-4">
        <p className="font-mono text-sm text-rose-200">Failed to load: {error}</p>
      </div>
    );
  }
  if (threads.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-8 text-center">
        <p className="font-mono text-sm text-white/45">No cuts yet in this org.</p>
        <p className="mt-2 font-mono text-xs text-white/30">
          When builders commission cuts they appear here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.14em] text-white/40">
        {threads.length} cut{threads.length > 1 ? "s" : ""} · org: {org}
      </p>
      <div className="space-y-2">
        {threads.map((t) => {
          const date = new Date(t.created_at);
          const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
          const ready = t.shots_ready ?? 0;
          const total = t.shots_total ?? 0;
          const exportReady = t.export_status === "ready";
          const hasVideo = Boolean(t.final_video_url);
          return (
            <a
              key={t.thread_id}
              href={`/director?thread=${encodeURIComponent(t.thread_id)}`}
              className="block rounded-lg border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-white/25 hover:bg-white/[0.05]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white/85">
                    {t.title ?? t.name ?? "Untitled cut"}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-white/35">
                    {t.user_id.startsWith("gh:") ? `gh:${t.user_id.slice(3, 11)}…` : t.user_id} · {dateStr}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 font-mono text-[11px]">
                  {total > 0 && (
                    <span className="text-white/45">
                      {ready}/{total} clips
                    </span>
                  )}
                  {exportReady && (
                    <span className="rounded-full border border-[#2de2c5]/40 bg-[#2de2c5]/10 px-2 py-0.5 text-[#2de2c5]">
                      ✓ ready
                    </span>
                  )}
                  {hasVideo && (
                    <span className="rounded-full border border-[var(--dc-signal,#ff9f1c)]/40 bg-[var(--dc-signal-soft)]/20 px-2 py-0.5 text-[var(--dc-signal,#ff9f1c)]">
                      MP4
                    </span>
                  )}
                  {t.archived && (
                    <span className="text-white/25">archived</span>
                  )}
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
