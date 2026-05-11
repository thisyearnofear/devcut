"use client";

/**
 * CanvasLoadingOverlay — a cinematic full-canvas overlay shown while the
 * agent is working. Displays animated pipeline stages with time estimates,
 * a progress ring, and director-themed messaging to keep users engaged.
 */

import { useEffect, useMemo, useRef, useState } from "react";

interface Stage {
  label: string;
  detail: string;
  status: "done" | "active" | "waiting" | "error";
}

interface CanvasLoadingOverlayProps {
  isRunning: boolean;
  stages: Stage[];
  shotCount: number;
  refsReady: number;
  videosReady: number;
  /** Queue position (1-based) when waiting for a concurrency slot. 0 = not queued. */
  queuePosition?: number;
  /** Estimated wait in seconds returned by the BFF X-Estimated-Wait header. */
  estimatedWaitSec?: number;
}

const DIRECTOR_TIPS = [
  "Great scenes start with a single line…",
  "Every frame tells a story.",
  "The best cuts feel invisible.",
  "Lighting sets the mood before a word is spoken.",
  "A storyboard is a film's first draft.",
  "Patience is a director's secret weapon.",
  "The camera doesn't lie — it interprets.",
];

function useElapsedSeconds(running: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (!running) {
      setElapsed(0);
      return;
    }
    startRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [running]);

  return elapsed;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function ProgressRing({ progress }: { progress: number }) {
  const radius = 38;
  const stroke = 3;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width="88" height="88" className="rotate-[-90deg]">
      <circle
        cx="44"
        cy="44"
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={stroke}
      />
      <circle
        cx="44"
        cy="44"
        r={radius}
        fill="none"
        stroke="url(#progressGradient)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-all duration-700 ease-out"
      />
      <defs>
        <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function CanvasLoadingOverlay({
  isRunning,
  stages,
  shotCount,
  refsReady,
  videosReady,
  queuePosition = 0,
  estimatedWaitSec = 0,
}: CanvasLoadingOverlayProps) {
  const isQueued = queuePosition > 0 && !isRunning;
  const elapsed = useElapsedSeconds(isRunning);
  const [tipIndex, setTipIndex] = useState(0);
  const [tipVisible, setTipVisible] = useState(true);

  // Rotate tips every 6 seconds
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setTipVisible(false);
      setTimeout(() => {
        setTipIndex((i) => (i + 1) % DIRECTOR_TIPS.length);
        setTipVisible(true);
      }, 400);
    }, 6000);
    return () => clearInterval(interval);
  }, [isRunning]);

  // Compute a more granular progress including partial stage completion
  const granularProgress = useMemo(() => {
    if (shotCount === 0) return stages.some((s) => s.status === "active") ? 10 : 0;
    const planDone = shotCount > 0 ? 25 : 0;
    const refProgress = shotCount > 0 ? (refsReady / shotCount) * 25 : 0;
    const vidProgress = shotCount > 0 ? (videosReady / shotCount) * 25 : 0;
    const exportStage = stages[3];
    const exportProgress =
      exportStage?.status === "done" ? 25 : exportStage?.status === "active" ? 12 : 0;
    return Math.min(100, Math.round(planDone + refProgress + vidProgress + exportProgress));
  }, [shotCount, refsReady, videosReady, stages]);

  const activeStage = stages.find((s) => s.status === "active");

  if (!isRunning && !isQueued) return null;

  if (isQueued) {
    const waitMin = estimatedWaitSec > 0 ? Math.ceil(estimatedWaitSec / 60) : null;
    return (
      <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/85 backdrop-blur-sm">
        <div className="flex max-w-sm flex-col items-center gap-5 px-6 text-center">
          <span className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-indigo-400" />
          <div className="space-y-1.5">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-white/55">Queued</p>
            <p className="text-sm font-medium text-white/85">
              Position {queuePosition} in queue
              {waitMin !== null ? ` — ~${waitMin} min wait` : ""}
            </p>
            <p className="text-xs text-white/40">A slot will open when the current run finishes.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-background/85 backdrop-blur-sm">
      <div className="flex max-w-md flex-col items-center gap-6 px-6 text-center">
        {/* Progress ring with percentage */}
        <div className="relative flex items-center justify-center">
          <ProgressRing progress={granularProgress} />
          <span className="absolute font-mono text-lg font-semibold text-white/90">
            {granularProgress}%
          </span>
        </div>

        {/* Active stage label */}
        <div className="space-y-1.5">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-white/55">
            {activeStage?.label ?? "Processing"}
          </p>
          <p className="text-sm font-medium text-white/85">
            {activeStage?.detail ?? "Working on your storyboard…"}
          </p>
        </div>

        {/* Pipeline stages */}
        <div className="w-full max-w-xs space-y-2.5">
          {stages.map((stage, i) => (
            <div
              key={stage.label}
              className={`flex items-center gap-3 transition-opacity duration-500 ${
                stage.status === "waiting" ? "opacity-40" : "opacity-100"
              }`}
            >
              {/* Stage indicator */}
              <div className="relative flex h-6 w-6 shrink-0 items-center justify-center">
                {stage.status === "done" ? (
                  <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : stage.status === "active" ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-indigo-400" />
                ) : stage.status === "error" ? (
                  <span className="text-xs text-rose-400">✕</span>
                ) : (
                  <span className="h-2 w-2 rounded-full bg-white/20" />
                )}
              </div>

              {/* Stage text */}
              <div className="min-w-0 flex-1 text-left">
                <p className={`text-xs font-medium ${
                  stage.status === "active" ? "text-white/90" : "text-white/65"
                }`}>
                  {stage.label}
                </p>
                <p className="truncate text-[11px] text-white/45">{stage.detail}</p>
              </div>

              {/* Connector line */}
              {i < stages.length - 1 && (
                <div className="absolute left-3 top-6 h-2.5 w-px bg-white/10" />
              )}
            </div>
          ))}
        </div>

        {/* Elapsed time */}
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/40">
          Elapsed {formatTime(elapsed)}
        </p>

        {/* Rotating director tips */}
        <p
          className={`min-h-[1.5rem] text-xs italic text-white/35 transition-opacity duration-400 ${
            tipVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          &ldquo;{DIRECTOR_TIPS[tipIndex]}&rdquo;
        </p>
      </div>
    </div>
  );
}
