"use client";

import type { Storyboard } from "@/lib/storyboard/types";

interface BriefHeaderProps {
  title: string;
  subtitle: string;
  storyboard: Storyboard;
  shotCount: number;
  readyCount: number;
}

/**
 * Sticky header at the top of the director canvas. Shows title, logline,
 * Runway mode pill, stitch mode pill, and a per-shot progress summary.
 */
export function BriefHeader({
  title,
  subtitle,
  storyboard,
  shotCount,
  readyCount,
}: BriefHeaderProps) {
  const isRunwayLive = storyboard.runway_mode === "LIVE";
  const isStitchLive = storyboard.stitch_mode === "LIVE";

  return (
    <header className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-foreground">
            {storyboard.title || title}
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {storyboard.logline || subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Runway generation mode */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
              isRunwayLive
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-amber-300 bg-amber-50 text-amber-700"
            }`}
            title={
              isRunwayLive
                ? "Calling the live Runway API."
                : "RUNWAY_API_KEY unset — using deterministic placeholder media."
            }
          >
            <span
              className={`size-1.5 rounded-full ${isRunwayLive ? "bg-emerald-500" : "bg-amber-500"}`}
            />
            Runway {storyboard.runway_mode}
          </span>

          {/* Stitch / FFmpeg mode — only shown once a stitch_mode is known */}
          {storyboard.stitch_mode && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                isStitchLive
                  ? "border-sky-300 bg-sky-50 text-sky-700"
                  : "border-amber-300 bg-amber-50 text-amber-700"
              }`}
              title={
                isStitchLive
                  ? "FFmpeg is available — exports will be real MP4 files."
                  : "FFmpeg not found or STITCH_MODE=mock — export returns a placeholder URL."
              }
            >
              <span
                className={`size-1.5 rounded-full ${isStitchLive ? "bg-sky-500" : "bg-amber-500"}`}
              />
              FFmpeg {storyboard.stitch_mode}
            </span>
          )}

          {shotCount > 0 ? (
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {readyCount}/{shotCount} shots ready
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}
