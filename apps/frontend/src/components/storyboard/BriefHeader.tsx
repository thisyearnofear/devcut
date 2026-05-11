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

/**
 * Minimal cinematic header. Shows the project title/logline and only the
 * status signals that matter to the user: LIVE vs MOCK, key state, progress.
 * Technical details (FFmpeg mode, consistency anchor) are hidden — they're
 * visible in the About page for those who care.
 */
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
    <header className="flex items-center justify-between gap-4 px-1 py-2">
      {/* Title / logline */}
      <div className="min-w-0 flex-1">
        {storyboard.title ? (
          <>
            <h1 className="truncate font-mono text-sm font-medium uppercase tracking-[0.15em] text-foreground">
              {storyboard.title}
            </h1>
            {storyboard.logline && (
              <p className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/60">
                {storyboard.logline}
              </p>
            )}
          </>
        ) : (
          <h1 className="font-mono text-sm font-medium uppercase tracking-[0.15em] text-muted-foreground/40">
            Director&apos;s Canvas
          </h1>
        )}
      </div>

      {/* Right controls */}
      <div className="flex shrink-0 items-center gap-3">
        {/* Progress — only when shots exist */}
        {shotCount > 0 && (
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50">
            {readyCount}/{shotCount}
          </span>
        )}

        {/* LIVE / MOCK indicator */}
        <span
          className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] ${
            isLive ? "text-emerald-500" : "text-amber-500/70"
          }`}
          title={isLive ? "Live Runway API" : "MOCK mode — no credits used"}
        >
          <span
            className={`size-1.5 rounded-full ${isLive ? "bg-emerald-500" : "bg-amber-500/70"}`}
          />
          {isLive ? "Live" : "Mock"}
        </span>

        {/* Key button */}
        {onKeyClick && (
          <button
            type="button"
            onClick={onKeyClick}
            className={`font-mono text-[10px] uppercase tracking-[0.15em] transition-colors ${
              hasPersonalKey
                ? "text-emerald-500 hover:text-emerald-400"
                : "text-muted-foreground/40 hover:text-muted-foreground"
            }`}
            title={hasPersonalKey ? "Using your Runway key" : "Add your Runway API key"}
          >
            {hasPersonalKey ? "Your key ✓" : "Add key"}
          </button>
        )}
      </div>
    </header>
  );
}
