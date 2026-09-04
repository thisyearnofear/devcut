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
    <div className="flex min-h-[180px] flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-10 text-center">
      <div className="flex items-center gap-1.5" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="h-8 w-12 rounded-sm border border-white/10 bg-white/[0.02]"
            style={{
              animation: "pulse 1.6s ease-in-out infinite",
              animationDelay: `${i * 180}ms`,
            }}
          />
        ))}
      </div>
      <div className="space-y-1">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-white/45">
          The canvas is ready
        </p>
        <p className="text-xs text-white/30">
          Send a brief and shot cards will appear here as the agent plans your storyboard
        </p>
      </div>
    </div>
  );

  return (
    <div className="grid gap-4 pb-4 pt-1 grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
      {shots.map((shot) => (
        <ShotCard
          key={shot.id}
          shot={shot}
          isSelected={selectedShotId === shot.id}
          onSelect={onSelect}
          onRegenerate={onRegenerate}
          onDownload={onDownload}
        />
      ))}
    </div>
  );
}
