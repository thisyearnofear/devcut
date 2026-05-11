"use client";

import type { Storyboard } from "@/lib/storyboard/types";

interface BriefHeaderProps {
  title: string;
  subtitle: string;
  storyboard: Storyboard;
  shotCount: number;
  readyCount: number;
  onKeyClick?: () => void;
  hasPersonalKey?: boolean;
}

export function BriefHeader({
  title,
  subtitle,
  storyboard,
  shotCount,
  readyCount,
  onKeyClick,
  hasPersonalKey,
}: BriefHeaderProps) {
  const isLive = storyboard.runway_mode === "LIVE";

  return (
    <header className="flex flex-col gap-3 border-b border-white/[0.06] px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      {/* Title / logline */}
      <div className="min-w-0 flex-1">
        {storyboard.title ? (
          <>
            <h1 className="truncate font-mono text-xs font-medium uppercase tracking-[0.16em] text-white/78">
              {storyboard.title}
            </h1>
            {storyboard.logline && (
              <p className="truncate font-mono text-[11px] uppercase tracking-[0.1em] text-white/55">
                {storyboard.logline}
              </p>
            )}
          </>
        ) : (
          <h1 className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-white/65">
            🦬 Director&apos;s Canvas
          </h1>
        )}
      </div>

      {/* Right controls */}
      <div className="flex shrink-0 items-center gap-3 sm:gap-4">
        {/* Progress */}
        {shotCount > 0 && (
          <span className="font-mono text-xs uppercase tracking-[0.12em] text-white/58">
            {readyCount}/{shotCount} shots
          </span>
        )}

        {/* LIVE/MOCK + key — single clickable control */}
        <button
          type="button"
          onClick={onKeyClick}
          className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 font-mono text-xs uppercase tracking-[0.12em] transition-all hover:border-white/20 hover:bg-white/[0.04]"
          title="Configure Runway API key"
        >
          <span
            className={`size-1.5 rounded-full ${
              isLive ? "bg-emerald-500" : "bg-amber-500/60"
            }`}
          />
          <span className={isLive ? "text-emerald-400/80" : "text-amber-400/60"}>
            {isLive ? "Live" : "Mock"}
          </span>
          {hasPersonalKey && (
            <>
              <span className="text-white/40">·</span>
              <span className="text-white/62">Your key</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
