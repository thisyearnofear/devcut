"use client";

import { type Shot } from "@/lib/storyboard/types";
import { ShotCard } from "./ShotCard";

interface StoryboardTimelineProps {
  shots: Shot[];
  selectedShotId: string | null;
  onSelect: (id: string) => void;
  onRegenerate: (id: string) => void;
  onDownload: (shotId: string, url: string, filename: string) => void;
}

/**
 * Horizontal scrollable timeline of shot cards. Connectors between
 * cards visually communicate sequence.
 */
export function StoryboardTimeline({
  shots,
  selectedShotId,
  onSelect,
  onRegenerate,
  onDownload,
}: StoryboardTimelineProps) {
  if (shots.length === 0) return (
    <div className="flex min-h-[120px] flex-1 items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 px-6 py-8 text-center">
      <div className="space-y-1.5">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-white/40">Timeline empty</p>
        <p className="text-xs text-white/30">Shots will appear here as the agent plans your storyboard</p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 items-stretch gap-3 overflow-x-auto pb-4 pt-1">
      {shots.map((shot, idx) => (
        <div key={shot.id} className="flex items-center gap-2">
          <ShotCard
            shot={shot}
            isSelected={selectedShotId === shot.id}
            onSelect={onSelect}
            onRegenerate={onRegenerate}
            onDownload={onDownload}
          />
          {idx < shots.length - 1 ? (
            <div className="hidden h-0.5 w-8 shrink-0 rounded-full bg-border md:block" />
          ) : null}
        </div>
      ))}
    </div>
  );
}
