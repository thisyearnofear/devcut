"use client";

import { useEffect, useMemo, useState } from "react";

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
  hackathon_thread_id?: string;
  link_kind?: string;
}

export function OrganizerDashboard() {
  const [threads, setThreads] = useState<OrgThread[]>([]);
  const [org, setOrg] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [recapBusy, setRecapBusy] = useState(false);
  const [recapMsg, setRecapMsg] = useState<string | null>(null);

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

  const toggle = (tid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tid)) next.delete(tid);
      else next.add(tid);
      return next;
    });
  };

  const selectedIds = useMemo(
    () => threads.filter((t) => selected.has(t.thread_id)).map((t) => t.thread_id),
    [threads, selected],
  );

  const composeRecap = async () => {
    setRecapBusy(true);
    setRecapMsg(null);
    try {
      // The challenge thread anchors the recap (brand-kit logo + title):
      // the graph edge shared by the selected entries, else the first
      // selected cut stands in.
      const picked = threads.filter((t) => selected.has(t.thread_id));
      const counts = new Map<string, number>();
      for (const t of picked) {
        if (t.hackathon_thread_id) {
          counts.set(t.hackathon_thread_id, (counts.get(t.hackathon_thread_id) ?? 0) + 1);
        }
      }
      const hackathon =
        [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
        picked[0]?.thread_id ??
        null;
      const res = await fetch("/api/organizer/recap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "PAYMENT-SIGNATURE": "demo",
        },
        body: JSON.stringify({ thread_ids: selectedIds, hackathon_thread_id: hackathon }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setRecapMsg((data && typeof data.error === "string" ? data.error : `HTTP ${res.status}`) +
          (res.status === 402 ? " — live payment mode: commission recap_reel via POST /api/x402/jobs/recap_reel." : ""));
        return;
      }
      const canvasPath = (data as { canvas_path?: string }).canvas_path;
      if (canvasPath) window.location.assign(canvasPath);
      else setRecapMsg("Receipt missing canvas_path.");
    } catch (e) {
      setRecapMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setRecapBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-white/10 bg-white/[0.02] p-4"
            style={{ animation: "pulse 1.8s ease-in-out infinite", animationDelay: `${i * 200}ms` }}
          >
            <div className="h-4 w-1/2 rounded bg-white/10" />
            <div className="mt-2 h-3 w-1/3 rounded bg-white/5" />
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-rose-400/25 bg-rose-500/10 p-4">
        <p className="font-mono text-sm text-rose-200">Failed to load cuts</p>
        <p className="mt-1 font-mono text-xs text-rose-300/70">{error}</p>
      </div>
    );
  }
  if (threads.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.015] p-10 text-center">
        <p className="font-mono text-sm text-white/50">No cuts yet in this org</p>
        <p className="mt-2 max-w-sm mx-auto font-mono text-xs leading-5 text-white/30">
          When builders commission cuts they appear here with live progress and export status.
        </p>
        <a
          href="/director"
          className="mt-5 inline-block rounded-full border border-[#2de2c5]/40 bg-[#2de2c5]/10 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#2de2c5] transition-colors hover:bg-[#2de2c5]/20"
        >
          Commission a cut →
        </a>
      </div>
    );
  }

  return (
    <div className="pb-24">
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
          const isPicked = selected.has(t.thread_id);
          return (
            <div
              key={t.thread_id}
              className={`flex items-stretch gap-2 rounded-lg border transition-colors ${
                isPicked
                  ? "border-[#2de2c5]/50 bg-[#2de2c5]/[0.06]"
                  : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.05]"
              }`}
            >
              {exportReady ? (
                <label className="flex cursor-pointer items-center pl-3" title="Include in recap reel">
                  <input
                    type="checkbox"
                    checked={isPicked}
                    onChange={() => toggle(t.thread_id)}
                    className="h-4 w-4 accent-[#2de2c5]"
                  />
                </label>
              ) : (
                <span className="w-9" aria-hidden />
              )}
              <a
                href={`/director?thread=${encodeURIComponent(t.thread_id)}`}
                className="min-w-0 flex-1 p-4 pl-0"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white/85">
                      {t.title ?? t.name ?? "Untitled cut"}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-white/35">
                      {t.user_id.startsWith("gh:") ? `gh:${t.user_id.slice(3, 11)}…` : t.user_id} · {dateStr}
                      {t.hackathon_thread_id ? (
                        <span className="ml-2 text-white/25">· entry of {t.hackathon_thread_id.slice(0, 8)}…</span>
                      ) : null}
                    </p>
                    {total > 0 && !exportReady && (
                      <div className="mt-2 h-1 w-full max-w-[12rem] overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-[#2de2c5]/60 transition-all duration-500"
                          style={{ width: `${total > 0 ? Math.round((ready / total) * 100) : 0}%` }}
                        />
                      </div>
                    )}
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
            </div>
          );
        })}
      </div>

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0b0d10]/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
            <p className="font-mono text-[11px] text-white/50">
              {selected.size} winner{selected.size > 1 ? "s" : ""} selected
              {recapMsg ? <span className="ml-2 text-rose-300">{recapMsg}</span> : null}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded-full border border-white/15 px-3 py-1.5 font-mono text-[11px] text-white/50 transition-colors hover:bg-white/5"
              >
                Clear
              </button>
              <button
                type="button"
                disabled={selected.size < 2 || recapBusy}
                onClick={composeRecap}
                className="rounded-full border border-[#2de2c5]/40 bg-[#2de2c5]/10 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[#2de2c5] transition-colors hover:bg-[#2de2c5]/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {recapBusy ? "Settling…" : "Compose recap ($4)"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
