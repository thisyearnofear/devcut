"use client";

import type { Shot } from "@/lib/storyboard/types";

interface ShotPreviewProps {
  shot: Shot | undefined;
  shotId: string;
  beat?: string;
  onSelect?: (id: string) => void;
}

/**
 * Inline mini-card the agent renders in chat to refer to a specific
 * shot — same idea as `LeadMiniCard`. Clicking selects the shot in
 * the canvas detail panel.
 */
export function ShotPreview({
  shot,
  shotId,
  beat,
  onSelect,
}: ShotPreviewProps) {
  const label = shot?.beat || beat || "Shot";
  const thumb = shot?.video_url || shot?.ref_image_url;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(shotId)}
      className="my-2 flex w-full max-w-md items-center gap-3 rounded-lg border border-border bg-card p-2 text-left transition hover:bg-muted"
    >
      <div className="size-12 shrink-0 overflow-hidden rounded-md bg-muted">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[9px] uppercase text-muted-foreground">
            …
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">{label}</p>
        <p className="truncate text-[10px] text-muted-foreground">
          {shot?.prompt || "Pending generation"}
        </p>
      </div>
      {shot?.status ? (
        <span className="text-[10px] uppercase text-muted-foreground">
          {shot.status}
        </span>
      ) : null}
    </button>
  );
}
