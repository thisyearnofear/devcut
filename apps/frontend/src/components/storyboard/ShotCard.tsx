"use client";

import { type Shot, STATUS_COLOR, STATUS_LABEL } from "@/lib/storyboard/types";

interface ShotCardProps {
  shot: Shot;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  onRegenerate?: (id: string) => void;
  onDownload?: (shotId: string, url: string, filename: string) => void;
}

/**
 * One shot in the storyboard timeline. Shows beat label, status pill,
 * reference still (if generated), and a video player (if generated).
 *
 * Three visual states stack: empty pending card, ref image only,
 * ref image with video overlay/replacement.
 */
export function ShotCard({
  shot,
  isSelected,
  onSelect,
  onRegenerate,
  onDownload,
}: ShotCardProps) {
  const ratio = shot.aspect_ratio === "720:1280" ? "9 / 16" : "16 / 9";
  const ringClass = isSelected
    ? "ring-2 ring-indigo-400"
    : "ring-1 ring-border";

  return (
    <div
      className={`group flex w-full flex-col gap-2 rounded-xl bg-card/80 p-3 text-card-foreground shadow-sm transition hover:shadow-md ${ringClass}`}
    >
      {/* Header: beat label + status */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onSelect?.(shot.id)}
          className="truncate text-left text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
          title={shot.beat}
        >
          #{shot.index + 1} · {shot.beat || "Shot"}
        </button>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{
            backgroundColor: `${STATUS_COLOR[shot.status]}22`,
            color: STATUS_COLOR[shot.status],
          }}
        >
          <span
            className={`size-1.5 rounded-full ${
              shot.status === "image" ? "animate-pulse" : ""
            }`}
            style={{ backgroundColor: STATUS_COLOR[shot.status] }}
          />
          {STATUS_LABEL[shot.status]}
        </span>
      </div>

      {/* Media well */}
      <div
        className="relative overflow-hidden rounded-lg bg-muted"
        style={{ aspectRatio: ratio }}
      >
        {shot.video_url ? (
          <video
            key={shot.video_url}
            src={shot.video_url}
            poster={shot.ref_image_url ?? undefined}
            controls
            playsInline
            muted
            loop
            className="h-full w-full object-cover"
          />
        ) : shot.ref_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shot.ref_image_url}
            alt={shot.beat}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[11px] uppercase tracking-wider text-muted-foreground">
            {shot.status === "error" ? "Error" : "Awaiting reference"}
          </div>
        )}
        {shot.status === "image" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
            <span className="rounded-full bg-black/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-white">
              Generating still…
            </span>
          </div>
        )}
      </div>

      {/* Per-shot progress bar — visible while generating */}
      {(shot.status === "image" || shot.status === "pending") && (
        <div className="h-0.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={`Shot ${shot.index + 1} progress`} aria-valuenow={shot.status === "image" ? 50 : 10} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={`h-full rounded-full ${shot.status === "image" ? "animate-pulse bg-amber-400/70" : "bg-white/20"}`}
            style={{ width: shot.status === "image" ? "60%" : "10%" }}
          />
        </div>
      )}
      {shot.status === "ready" && (
        <div className="h-0.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={`Shot ${shot.index + 1} complete`} aria-valuenow={100} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full w-full rounded-full bg-emerald-400/60" />
        </div>
      )}

      {/* Prompt + actions */}
      <p
        className="line-clamp-2 text-xs leading-snug text-muted-foreground"
        title={shot.prompt}
      >
        {shot.prompt || "(no prompt)"}
      </p>
      {shot.error ? (
        <p className="line-clamp-2 text-xs text-rose-500" title={shot.error}>
          {shot.error}
        </p>
      ) : null}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{shot.duration}s</span>
        <div className="flex items-center gap-1.5">
          {shot.ref_image_url && (
            <button
              type="button"
              onClick={() =>
                onDownload?.(
                  shot.id,
                  shot.ref_image_url!,
                  `${shot.beat || `shot_${shot.index + 1}`}_ref.png`,
                )
              }
              className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-muted"
              title="Download reference image"
            >
              ↓ Ref
            </button>
          )}
          {shot.video_url && (
            <button
              type="button"
              onClick={() =>
                onDownload?.(
                  shot.id,
                  shot.video_url!,
                  `${shot.beat || `shot_${shot.index + 1}`}.mp4`,
                )
              }
              className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-muted"
              title="Download video"
            >
              ↓ Video
            </button>
          )}
          {onRegenerate ? (
            <button
              type="button"
              onClick={() => onRegenerate(shot.id)}
              className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-muted"
            >
              Regenerate
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
