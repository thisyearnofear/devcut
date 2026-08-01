"use client";

import type { Storyboard } from "@/lib/storyboard/types";
import { DEVCUT } from "@/lib/devcut";

interface BriefHeaderProps {
  title: string;
  subtitle: string;
  storyboard: Storyboard;
  shotCount: number;
  readyCount: number;
  onKeyClick?: () => void;
  hasPersonalKey?: boolean;
  /** Paid x402 SKU id when canvas was unlocked via job receipt */
  paidSku?: string | null;
  /** Challenge Cut vs Submit Ready */
  jobMode?: "challenge" | "submit" | "agent" | string | null;
}

export function BriefHeader({
  title,
  subtitle,
  storyboard,
  shotCount,
  readyCount,
  onKeyClick,
  hasPersonalKey,
  paidSku,
  jobMode,
}: BriefHeaderProps) {
  const isLive = storyboard.runway_mode === "LIVE";
  // Always show the mode badge so users can switch before the agent responds.
  const showModeBadge = true;
  const modeLabel =
    jobMode === "challenge"
      ? "Challenge Cut"
      : jobMode === "submit"
        ? "Submit Ready"
        : jobMode === "agent"
          ? "Agent job"
          : null;
  const modeHint =
    jobMode === "challenge"
      ? "Problem → Constraint → Winning → Anti-pattern → CTA"
      : jobMode === "submit"
        ? "Problem → Product → Proof → HF handoff"
        : jobMode === "agent"
          ? "Pay-per-job · Start once unlocked"
          : null;
  const modeBadgeClass =
    jobMode === "submit"
      ? "border-sky-400/35 bg-sky-500/10 text-sky-100/90"
      : jobMode === "agent"
        ? "border-amber-400/35 bg-amber-500/10 text-amber-100/85"
        : "border-[#7a9e88]/40 bg-[#7a9e88]/10 text-[#c5d4c8]";

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
            {DEVCUT.name}
          </h1>
        )}
      </div>

      {/* Right controls */}
      <div className="flex shrink-0 items-center gap-3 sm:gap-4">
        {modeLabel && (
          <div className="hidden text-right sm:block">
            <span
              className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${modeBadgeClass}`}
            >
              {modeLabel}
            </span>
            {modeHint && (
              <p className="mt-1 max-w-[14rem] truncate font-mono text-[9px] uppercase tracking-[0.08em] text-white/35">
                {modeHint}
              </p>
            )}
          </div>
        )}
        {paidSku && (
          <span className="rounded-full border border-[#7a9e88]/40 bg-[#7a9e88]/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#c5d4c8]">
            x402 · {paidSku}
          </span>
        )}
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
