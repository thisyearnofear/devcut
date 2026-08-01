"use client";

import { LANDING_RUNWAY_CHIPS } from "@/lib/landing-story";

/**
 * Continuous stack marquee — keeps post-hero energy without competing with the brand.
 */
export function RunwayMarquee() {
  const row = [...LANDING_RUNWAY_CHIPS, ...LANDING_RUNWAY_CHIPS];

  return (
    <div
      className="relative overflow-hidden border-y border-[var(--dc-line)] bg-[var(--dc-rail)]"
      aria-hidden
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-16 bg-[linear-gradient(90deg,var(--dc-rail),transparent)]" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-16 bg-[linear-gradient(270deg,var(--dc-rail),transparent)]" />
      <div className="dc-marquee flex w-max gap-10 py-3">
        {row.map((chip, i) => (
          <span
            key={`${chip}-${i}`}
            className="dc-mono shrink-0 text-[11px] uppercase tracking-[0.18em] text-[var(--dc-mute)]"
          >
            <span className="mr-10 text-[var(--dc-signal)]">▸</span>
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
}
