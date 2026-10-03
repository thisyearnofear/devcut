"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  hackathon_title?: string | null;
  link_kind?: string;
}

interface EventGroup {
  key: string;
  thread_id: string | null;
  title: string;
  rows: OrgThread[];
  finished: number;
}

const POLL_MS = 20_000;

export function OrganizerDashboard() {
  const [threads, setThreads] = useState<OrgThread[]>([]);
  const [org, setOrg] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [recapBusy, setRecapBusy] = useState(false);
  const [recapMsg, setRecapMsg] = useState<string | null>(null);
  const [recapDetail, setRecapDetail] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/organizer/threads");
      if (res.status === 401) {
        setError("Sign in to compose a recap.");
        setErrorDetail("GET /api/organizer/threads · 401");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as { threads: OrgThread[]; org: string };
      setThreads(d.threads);
      setOrg(d.org);
      setError(null);
      setErrorDetail(null);
    } catch (e) {
      // A poll that fails after we already have rows keeps them on screen.
      const detail = e instanceof Error ? e.message : String(e);
      setError((prev) => prev ?? "We couldn't reach the desk just now — try reloading.");
      setErrorDetail((prev) => prev ?? detail);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

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

  // Entries grouped under the event they were linked to (ADR-0005 graph edge).
  const groups = useMemo<EventGroup[]>(() => {
    const byEvent = new Map<string, EventGroup>();
    for (const t of threads) {
      const key = t.hackathon_thread_id ?? "__none__";
      const group = byEvent.get(key) ?? {
        key,
        thread_id: t.hackathon_thread_id ?? null,
        title: t.hackathon_title?.trim() || "Untitled event",
        rows: [],
        finished: 0,
      };
      group.rows.push(t);
      if (t.export_status === "ready") group.finished += 1;
      byEvent.set(key, group);
    }
    const list = [...byEvent.values()];
    const events = list.filter((g) => g.key !== "__none__");
    const loose = list.filter((g) => g.key === "__none__");
    events.sort((a, b) => b.rows.length - a.rows.length || a.title.localeCompare(b.title));
    return [...events, ...loose];
  }, [threads]);

  const composeRecap = async () => {
    setRecapBusy(true);
    setRecapMsg(null);
    setRecapDetail(null);
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
      const raw = typeof data?.error === "string" ? data.error : `HTTP ${res.status}`;
      if (!res.ok) {
        setRecapDetail(`POST /api/organizer/recap · ${raw}`);
        setRecapMsg(
          res.status === 402
            ? "Pricing is live — the Recap Reel is bought by an x402 agent today, and it lands right on your canvas."
            : "Only finished cuts from your event can appear in a recap.",
        );
        return;
      }
      const canvasPath = (data as { canvas_path?: string }).canvas_path;
      if (canvasPath) window.location.assign(canvasPath);
      else {
        setRecapMsg("Paid, but the desk didn't hand back a canvas. Reload and check your cuts.");
        setRecapDetail("recap response carried no canvas_path");
      }
    } catch (e) {
      setRecapMsg("That didn't go through. Try again — if it keeps failing, tell us and we'll look.");
      setRecapDetail(e instanceof Error ? e.message : String(e));
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
            className="animate-pulse rounded-lg border border-white/10 bg-white/[0.02] p-4"
            style={{ animationDelay: `${i * 200}ms` }}
          >
            <div className="h-4 w-1/2 rounded bg-white/10" />
            <div className="mt-2 h-3 w-1/3 rounded bg-white/5" />
          </div>
        ))}
      </div>
    );
  }
  if (error && threads.length === 0) {
    return (
      <div className="rounded-lg border border-rose-400/25 bg-rose-500/10 p-4">
        <p className="font-mono text-sm text-rose-200">{error}</p>
        {errorDetail && (
          <details className="mt-2 text-[10px] text-rose-200/60">
            <summary className="cursor-pointer font-mono uppercase tracking-[0.12em]">
              Integrator details
            </summary>
            <p className="mt-1 break-words font-mono">{errorDetail}</p>
          </details>
        )}
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-full border border-rose-300/40 px-3 py-1 font-mono text-[11px] text-rose-100 transition-colors hover:bg-rose-500/20"
        >
          Try again
        </button>
      </div>
    );
  }
  if (threads.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.015] p-10 text-center">
        <p className="font-mono text-sm text-white/50">No cuts yet in this workspace</p>
        <p className="mx-auto mt-2 max-w-sm font-mono text-xs leading-5 text-white/30">
          Cuts commissioned by your builders land here — entries per event, and the finished ones
          tick into a Recap Reel. This page refreshes itself every {POLL_MS / 1000}s.
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
        {threads.length} cut{threads.length > 1 ? "s" : ""} · {org}
      </p>
      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.key} className="space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-1">
              <h2 className="dc-display truncate text-sm font-semibold text-white/85">
                {g.key === "__none__" ? "Not linked to an event" : g.title}
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#2de2c5]/70">
                {g.rows.length} entr{g.rows.length > 1 ? "ies" : "y"} · {g.finished} finished
              </span>
            </div>
            <div className="space-y-2">
              {g.rows.map((t) => (
                <ThreadRow
                  key={t.thread_id}
                  thread={t}
                  picked={selected.has(t.thread_id)}
                  onToggle={() => toggle(t.thread_id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0b0d10]/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="min-w-0 font-mono text-[11px] leading-5 text-white/50">
              {selected.size === 1
                ? "Add one more finished cut to unlock the Recap Reel ($4)"
                : `${selected.size} winners selected · Recap Reel $4 — sponsor logo + CTA come from your Challenge Cut's brand kit`}
              {recapMsg ? <span className="ml-2 block text-rose-300">{recapMsg}</span> : null}
            </p>
            <div className="flex items-center gap-2">
              {recapDetail && (
                <details className="font-mono text-[10px] text-white/35">
                  <summary className="cursor-pointer uppercase tracking-[0.12em]">Details</summary>
                  <p className="mt-1 max-w-[18rem] break-words">{recapDetail}</p>
                </details>
              )}
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
                {recapBusy ? "Working…" : "Compose Recap Reel ($4)"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ThreadRow({
  thread,
  picked,
  onToggle,
}: {
  thread: OrgThread;
  picked: boolean;
  onToggle: () => void;
}) {
  const date = new Date(thread.created_at);
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const ready = thread.shots_ready ?? 0;
  const total = thread.shots_total ?? 0;
  const exportReady = thread.export_status === "ready";
  const hasVideo = Boolean(thread.final_video_url);
  return (
    <div
      className={`flex items-stretch gap-2 rounded-lg border transition-colors ${
        picked
          ? "border-[#2de2c5]/50 bg-[#2de2c5]/[0.06]"
          : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.05]"
      }`}
    >
      {exportReady ? (
        <label
          className="flex cursor-pointer items-center pl-3"
          title="Include in the Recap Reel — only finished cuts qualify"
        >
          <input
            type="checkbox"
            checked={picked}
            onChange={onToggle}
            className="h-4 w-4 accent-[#2de2c5]"
          />
        </label>
      ) : (
        <span className="w-9" aria-hidden />
      )}
      <a
        href={`/director?thread=${encodeURIComponent(thread.thread_id)}`}
        className="min-w-0 flex-1 p-4 pl-0"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white/85">
              {thread.title ?? thread.name ?? "Untitled cut"}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-white/35">{dateStr}</p>
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
            {total > 0 && !exportReady && (
              <span className="text-white/45">
                {ready}/{total} clips
              </span>
            )}
            {exportReady && (
              <span className="rounded-full border border-[#2de2c5]/40 bg-[#2de2c5]/10 px-2 py-0.5 text-[#2de2c5]">
                Cut finished
              </span>
            )}
            {hasVideo && (
              <span className="rounded-full border border-[var(--dc-signal,#ff9f1c)]/40 bg-[var(--dc-signal-soft)]/20 px-2 py-0.5 text-[var(--dc-signal,#ff9f1c)]">
                MP4
              </span>
            )}
            {thread.archived && <span className="text-white/25">archived</span>}
          </div>
        </div>
      </a>
    </div>
  );
}
