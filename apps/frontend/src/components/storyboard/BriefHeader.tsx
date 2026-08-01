"use client";

import Link from "next/link";
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
      ? "border-[var(--dc-cyan)]/40 bg-[var(--dc-cyan-soft)] text-[var(--dc-cyan)]"
      : "border-[var(--dc-signal)]/40 bg-[var(--dc-signal-soft)] text-[var(--dc-signal)]";

  return (
    <header className="flex flex-col gap-3 border-b border-[var(--dc-line)] bg-[var(--dc-ink)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="dc-display shrink-0 text-xs font-semibold tracking-tight text-[var(--dc-mute)] hover:text-[var(--dc-paper)]"
          >
            {DEVCUT.name}
          </Link>
          <span className="hidden h-3 w-px bg-[var(--dc-line)] sm:block" aria-hidden />
          {storyboard.title ? (
            <div className="min-w-0">
              <h1 className="dc-display truncate text-sm font-semibold tracking-tight text-[var(--dc-paper)]">
                {storyboard.title}
              </h1>
              {storyboard.logline && (
                <p className="truncate dc-mono text-[10px] uppercase tracking-[0.1em] text-[var(--dc-dim)]">
                  {storyboard.logline}
                </p>
              )}
            </div>
          ) : (
            <h1 className="dc-display text-sm font-semibold tracking-tight text-[var(--dc-paper)]">
              Live canvas
            </h1>
          )}
        </div>
        {subtitle ? (
          <p className="mt-1 truncate dc-mono text-[10px] text-[var(--dc-dim)]">{subtitle}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
        {modeLabel && (
          <div className="hidden text-right sm:block">
            <span
              className={`border px-2.5 py-1 dc-mono text-[10px] uppercase tracking-[0.12em] ${modeBadgeClass}`}
            >
              {modeLabel}
            </span>
            {modeHint && (
              <p className="mt-1 max-w-[14rem] truncate dc-mono text-[9px] uppercase tracking-[0.08em] text-[var(--dc-dim)]">
                {modeHint}
              </p>
            )}
          </div>
        )}
        {paidSku && (
          <span className="border border-[var(--dc-cyan)]/40 bg-[var(--dc-cyan-soft)] px-2.5 py-1 dc-mono text-[10px] uppercase tracking-[0.12em] text-[var(--dc-cyan)]">
            x402 · {paidSku}
          </span>
        )}
        {shotCount > 0 && (
          <span className="dc-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dc-mute)]">
            {readyCount}/{shotCount} shots
          </span>
        )}

        <button
          type="button"
          onClick={onKeyClick}
          className={`flex items-center gap-2 border px-3 py-1 dc-mono text-[11px] uppercase tracking-[0.12em] transition-colors hover:bg-white/[0.04] ${
            isLive
              ? "border-[var(--dc-cyan)]/35 text-[var(--dc-cyan)]"
              : "border-[var(--dc-signal)]/35 text-[var(--dc-signal)]"
          }`}
          title={
            isLive
              ? "Live mode — click to manage API key"
              : "Mock mode — click to add Runway key for live generation"
          }
          aria-label={isLive ? "Live mode active" : "Mock mode active — click to switch to live"}
        >
          <span
            className={`inline-block size-1.5 rounded-full ${
              isLive ? "bg-[var(--dc-cut)] animate-pulse" : "bg-[var(--dc-signal)]/70"
            }`}
            aria-hidden
          />
          <span>{isLive ? "Rec · Live" : "Mock"}</span>
          <span className="text-[var(--dc-dim)]">·</span>
          <span className="text-[var(--dc-mute)]">
            {hasPersonalKey ? "Your key" : isLive ? "Server key" : "Add key"}
          </span>
        </button>
      </div>
    </header>
  );
}
