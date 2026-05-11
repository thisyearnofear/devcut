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
  // Always show the mode badge so users can switch before the agent responds.
  const showModeBadge = true;

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
        {showModeBadge && (
          <button
            type="button"
            onClick={onKeyClick}
            className={`flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs uppercase tracking-[0.12em] transition-all hover:bg-white/[0.06] ${
              isLive
                ? "border-emerald-500/30 text-emerald-400/90 hover:border-emerald-500/50"
                : "border-amber-500/30 text-amber-400/70 hover:border-amber-500/50"
            }`}
            title={isLive ? "Live mode — click to manage API key" : "Mock mode — click to add Runway key for live generation"}
            aria-label={isLive ? "Live mode active" : "Mock mode active — click to switch to live"}
          >
            <span
              className={`size-1.5 rounded-full ${
                isLive ? "bg-emerald-500" : "bg-amber-500/60"
              }`}
            />
            <span>{isLive ? "Live" : "Mock"}</span>
            {hasPersonalKey ? (
              <>
                <span className="text-white/30">·</span>
                <span className="text-white/55">Your key</span>
              </>
            ) : (
              <>
                <span className="text-white/30">·</span>
                <span className="text-white/45">{isLive ? "Server key" : "Add key →"}</span>
              </>
            )}
          </button>
        )}
      </div>
    </header>
  );
}
