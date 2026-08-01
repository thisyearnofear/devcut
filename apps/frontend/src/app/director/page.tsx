"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Toaster, toast } from "sonner";
import {
  CopilotChatConfigurationProvider,
  useAgent,
  useConfigureSuggestions,
  useCopilotKit,
  useDefaultRenderTool,
  useFrontendTool,
} from "@copilotkit/react-core/v2";
import { ThreadsDrawer } from "@/components/threads-drawer";
import drawerStyles from "@/components/threads-drawer/threads-drawer.module.css";

import {
  type Shot,
  type Storyboard,
  type StoryboardState,
  initialStoryboardState,
} from "@/lib/storyboard/types";
import { BriefHeader } from "@/components/storyboard/BriefHeader";
import { JobOutcomePanel } from "@/components/devcut/JobOutcomePanel";
import { ApiKeyPanel, useRunwayApiKey } from "@/components/storyboard/ApiKeyPanel";
import { StoryboardTimeline } from "@/components/storyboard/StoryboardTimeline";
import { ShotPreview } from "@/components/storyboard/ShotPreview";
import { ToolFallbackCard } from "@/components/copilot/ToolFallbackCard";
import {
  DEVCUT_PLANNING_PHRASES,
  DEVCUT_STAGE_ESTIMATES,
  DEVCUT_STAGE_LABELS,
} from "@/lib/devcut-ledger";
import { AvatarShowcase } from "@/components/storyboard/AvatarShowcase";
import { AvatarPanel } from "@/components/storyboard/AvatarPanel";
import {
  DEVCUT,
  DEVCUT_CHALLENGE_EXAMPLES,
  DEVCUT_DOORS,
  DEVCUT_GOLDEN_CHALLENGE,
  DEVCUT_HF_DEMO,
  DEVCUT_SUBMIT_EXAMPLES,
  type DevCutDoorId,
} from "@/lib/devcut";
import { AgentPaymentsPanel } from "@/components/devcut/AgentPaymentsPanel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div data-theme="cinema" className="flex min-h-svh items-center justify-center bg-background px-6 text-center">
        <div className="space-y-3">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-white/60">
            Loading {DEVCUT.name}
          </p>
          <div className="mx-auto flex w-fit items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-1.5 rounded-full bg-white/50 animate-pulse"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function mergeStoryboardState(raw: unknown): StoryboardState {
  const partial =
    raw && typeof raw === "object" ? (raw as Partial<StoryboardState>) : {};
  return {
    ...initialStoryboardState,
    ...partial,
    storyboard: {
      ...initialStoryboardState.storyboard,
      ...(partial.storyboard ?? {}),
    },
    header: {
      ...initialStoryboardState.header,
      ...(partial.header ?? {}),
    },
    shots: partial.shots ?? initialStoryboardState.shots,
    selectedShotId: partial.selectedShotId ?? null,
    durable_url: partial.durable_url ?? null,
    manifest_uri: partial.manifest_uri ?? null,
    job_manifest_uri: partial.job_manifest_uri ?? null,
    job_manifest: partial.job_manifest ?? null,
    final_sha256: partial.final_sha256 ?? null,
    canonical_hash: partial.canonical_hash ?? null,
    agent_loop: partial.agent_loop ?? null,
    builder_kit: partial.builder_kit ?? null,
  };
}

function useLiveStoryboardState() {
  // Must pass agentId: "director" so the storyboard state hooks bind to the
  // director graph, not the default (leads) graph. Without this, useAgent()
  // returns the "default" agent and the canvas stays in its initial state
  // because no storyboard updates ever arrive.
  const { agent } = useAgent({ agentId: "director" });
  const state = mergeStoryboardState(agent?.state);
  const setState = (updater: (prev: StoryboardState) => StoryboardState) => {
    agent?.setState(updater(mergeStoryboardState(agent?.state)));
  };
  return { agent, state, setState };
}

// ---------------------------------------------------------------------------
// Inline render components (used by frontend tools)
// ---------------------------------------------------------------------------

function LiveShotPreview({ shotId, beat }: { shotId: string; beat?: string }) {
  const { state, setState } = useLiveStoryboardState();
  const shot = state.shots.find((s) => s.id === shotId);
  return (
    <ShotPreview
      shot={shot}
      shotId={shotId}
      beat={beat}
      onSelect={(id) => setState((prev) => ({ ...prev, selectedShotId: id }))}
    />
  );
}

function LiveStoryboardSummary() {
  const { state } = useLiveStoryboardState();
  const ready = state.shots.filter((s) => s.status === "ready").length;
  const total = state.shots.length;
  const totalSeconds = state.shots.reduce((acc, s) => acc + s.duration, 0);
  return (
    <div className="my-2 rounded-lg border border-border bg-card/80 p-3 text-xs text-foreground">
      <p className="font-medium">{state.storyboard.title || "Storyboard"}</p>
      <p className="mt-1 text-muted-foreground">
        {ready}/{total} shots ready · {totalSeconds}s total · Runway{" "}
        {state.storyboard.runway_mode}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom cinematic chat — replaces CopilotSidebar
// ---------------------------------------------------------------------------

const SUGGESTIONS = [
  ...DEVCUT_CHALLENGE_EXAMPLES.map((ex) => `${DEVCUT_DOORS[0].prompt} ${ex.brief}`),
  ...DEVCUT_SUBMIT_EXAMPLES.map((ex) => `${DEVCUT_DOORS[1].prompt} ${ex.brief}`),
];

const SUGGESTION_LABELS = [
  ...DEVCUT_CHALLENGE_EXAMPLES.map((ex) => `Challenge · ${ex.label}`),
  ...DEVCUT_SUBMIT_EXAMPLES.map((ex) => `Submit · ${ex.label}`),
];

// ---------------------------------------------------------------------------
// Production settings
// ---------------------------------------------------------------------------

interface ProductionSettings {
  orientation: "landscape" | "portrait";
  shotCount: number;
  shotDuration: number;
}

const DEFAULT_SETTINGS: ProductionSettings = {
  orientation: "landscape",
  shotCount: 4,
  shotDuration: 5,
};

function settingsSuffix(s: ProductionSettings): string {
  const ar = s.orientation === "portrait" ? "720:1280" : "1280:720";
  return ` [Settings: ${s.shotCount} shots, ${s.shotDuration}s each, ${ar}]`;
}

const MODEL_LABEL =
  process.env.NEXT_PUBLIC_AGENT_MODEL ?? "nvidia · NIM";

// True when the Runway avatar is configured — baked in at build time.
const AVATAR_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_RUNWAY_AVATAR_ID);

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface AgentProgress {
  total: number;
  refs: number;
  videos: number;
  ready: number;
  exportStatus: StoryboardState["export_status"];
  stages: Array<{
    label: string;
    detail: string;
    status: "done" | "active" | "waiting" | "error";
  }>;
}

function getAgentProgress(state: StoryboardState, isRunning: boolean): AgentProgress {
  const total = state.shots.length;
  const refs = state.shots.filter((s) => Boolean(s.ref_image_url)).length;
  const videos = state.shots.filter((s) => Boolean(s.video_url)).length;
  const ready = state.shots.filter((s) => s.status === "ready").length;
  const hasErrors = state.shots.some((s) => s.status === "error") || state.export_status === "error";

  return {
    total,
    refs,
    videos,
    ready,
    exportStatus: state.export_status,
    stages: [
      {
        label: DEVCUT_STAGE_LABELS.plan,
        detail: total > 0 ? `${total} shots planned` : isRunning ? "__planning__" : "Waiting for a brief",
        status: total > 0 ? "done" : isRunning ? "active" : "waiting",
      },
      {
        label: DEVCUT_STAGE_LABELS.stills,
        detail: total > 0 ? `${refs}/${total} stills ready` : isRunning ? "Queued" : "Starts after planning",
        status: refs === total && total > 0 ? "done" : total > 0 && isRunning ? "active" : "waiting",
      },
      {
        label: DEVCUT_STAGE_LABELS.clips,
        detail: total > 0 ? `${videos}/${total} clips ready` : isRunning ? "Queued" : "Starts after stills",
        status: videos === total && total > 0 ? "done" : refs > 0 && isRunning ? "active" : "waiting",
      },
      {
        label: DEVCUT_STAGE_LABELS.export,
        detail:
          state.export_status === "ready"
            ? "MP4 ready"
            : state.export_status === "stitching"
              ? "Stitching clips"
              : ready === total && total > 0
                ? "Ready to export"
                : isRunning ? "Queued" : "Waiting for clips",
        status:
          state.export_status === "error" || hasErrors
            ? "error"
            : state.export_status === "ready"
              ? "done"
              : state.export_status === "stitching"
                ? "active"
                : "waiting",
      },
    ],
  };
}

// Stage time estimates (seconds) based on observed production runs
const STAGE_ESTIMATES = DEVCUT_STAGE_ESTIMATES;

// Animated cycling text shown during the planning stage
const PLANNING_PHRASES = [...DEVCUT_PLANNING_PHRASES];

function PlanningText() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const cycle = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % PLANNING_PHRASES.length);
        setVisible(true);
      }, 400);
    }, 2800);
    return () => clearInterval(cycle);
  }, []);
  return (
    <span
      className="transition-opacity duration-400"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {PLANNING_PHRASES[idx]}
    </span>
  );
}

function ElapsedTimer({ isRunning }: { isRunning: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (isRunning) {
      startRef.current = Date.now();
      setElapsed(0);
      const id = setInterval(() => {
        setElapsed(Math.floor((Date.now() - (startRef.current ?? Date.now())) / 1000));
      }, 1000);
      return () => clearInterval(id);
    } else {
      startRef.current = null;
    }
  }, [isRunning]);

  if (!isRunning) return null;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return (
    <span className="font-mono text-[11px] text-white/45">
      {mins > 0 ? `${mins}m ` : ""}{secs}s elapsed
    </span>
  );
}

function DirectorChat({
  onSend,
  isRunning,
  progress,
  lastError,
  onRetry,
  shots,
  storyboard,
}: {
  onSend: (msg: string) => void;
  isRunning: boolean;
  progress: AgentProgress;
  lastError: string | null;
  onRetry: () => void;
  shots: Shot[];
  storyboard: Storyboard;
}) {
  const [settings, setSettings] = useState<ProductionSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus the chat input when the panel mounts (desktop) or becomes active (mobile)
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(timer);
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, isRunning]);

  const handleSend = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isRunning) return;
    setDraft("");
    // Append production settings as structured hint for the agent
    const withSettings = trimmed + settingsSuffix(settings);
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", content: trimmed },
    ]);
    onSend(withSettings);
    inputRef.current?.focus();
  };

  const showSuggestions = messages.length === 0 && !isRunning;

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      {/* Messages */}
      <div
        ref={messagesRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0"
      >
        {showSuggestions ? (
          <div className="space-y-3 pt-2">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-white/55">
              DevCut jobs
            </p>
            {SUGGESTIONS.map((s, i) => (
              <button
                key={SUGGESTION_LABELS[i]}
                type="button"
                onClick={() => onSend(s)}
                className="block w-full rounded-lg border border-white/10 px-3 py-2.5 text-left text-xs leading-relaxed text-white/70 transition-colors hover:border-white/25 hover:text-white/90"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--dc-cyan,#2de2c5)]">
                  {SUGGESTION_LABELS[i]}
                </span>
                <span className="mt-1 block line-clamp-2 text-white/60">
                  {s.replace(/^Mode:.*?\.\s*/, "").slice(0, 140)}…
                </span>
              </button>
            ))}
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  m.role === "user"
                    ? "bg-white/10 text-white/90"
                    : "text-white/72"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
        {isRunning && (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-white/70">
                Run ledger
              </p>
              <div className="flex items-center gap-2">
                <ElapsedTimer isRunning={isRunning} />
                <div className="flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="size-1.5 rounded-full bg-[#ffbe70] animate-pulse"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3 space-y-2.5">
              {progress.stages.map((stage) => {
                const est = STAGE_ESTIMATES[stage.label];
                // Collect shots relevant to this stage for thumbnail strip
                const stageThumbs: string[] = [];
                if (stage.label === DEVCUT_STAGE_LABELS.stills) {
                  shots.forEach((s) => { if (s.ref_image_url) stageThumbs.push(s.ref_image_url); });
                } else if (stage.label === DEVCUT_STAGE_LABELS.clips) {
                  shots.forEach((s) => { if (s.video_url) stageThumbs.push(s.video_url); });
                }
                // Sub-progress label from the most recent active shot
                const activeShot = stage.label === DEVCUT_STAGE_LABELS.stills || stage.label === DEVCUT_STAGE_LABELS.clips
                  ? shots.find((s) => s.progress_label && s.status !== "ready")
                  : undefined;
                return (
                  <div key={stage.label} className="space-y-1.5">
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 size-2 shrink-0 rounded-full ${
                          stage.status === "done"
                            ? "bg-emerald-400"
                            : stage.status === "active"
                              ? "bg-[#ffbe70] animate-pulse"
                              : stage.status === "error"
                                ? "bg-rose-400"
                                : "bg-white/18"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className="truncate text-xs font-medium text-white/82">{stage.label}</p>
                          {stage.status === "active" && est && (
                            <span className="shrink-0 font-mono text-[10px] text-white/38">~{est < 60 ? `${est}s` : `${Math.round(est/60)}m`}</span>
                          )}
                          {stage.status === "waiting" && est && (
                            <span className="shrink-0 font-mono text-[10px] text-white/22">~{est < 60 ? `${est}s` : `${Math.round(est/60)}m`}</span>
                          )}
                        </div>
                        <p className="truncate text-[11px] text-white/55">
                          {stage.detail === "__planning__" ? <PlanningText /> : (activeShot?.progress_label ?? stage.detail)}
                        </p>
                      </div>
                    </div>
                    {/* Shot thumbnail strip — appears as stills/clips arrive */}
                    {stageThumbs.length > 0 && (
                      <div className="ml-5 flex gap-1.5 overflow-x-auto pb-0.5">
                        {stageThumbs.map((url, i) => (
                          <div key={i} className="relative shrink-0 size-12 overflow-hidden rounded-md border border-white/10 bg-white/5">
                            {stage.label === DEVCUT_STAGE_LABELS.clips ? (
                              <video
                                src={url}
                                className="size-full object-cover"
                                muted
                                playsInline
                                autoPlay
                                loop
                              />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={url} alt={`Still ${i + 1}`} className="size-full object-cover" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] leading-4 text-white/35">
              Challenge Cut / Submit Ready usually ~5 min. Stills first, then clips in parallel, then stitch.
            </p>
          </div>
        )}
        {!isRunning && progress.total > 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-white/65">
              Canvas status
            </p>
            <p className="mt-1 text-xs leading-5 text-white/68">
              {progress.ready}/{progress.total} shots ready · {progress.refs}/{progress.total} stills ·{" "}
              {progress.videos}/{progress.total} clips
            </p>
          </div>
        )}
        {lastError && (
          <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-rose-200">
                Agent error
              </p>
              <button
                type="button"
                disabled={isRunning}
                onClick={onRetry}
                className="rounded-full border border-rose-400/40 px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.1em] text-rose-200 hover:bg-rose-500/20 disabled:opacity-30"
              >
                Retry
              </button>
            </div>
            <p className="text-xs leading-5 text-rose-100/80">{lastError}</p>
            <p className="text-[11px] text-rose-200/50">Try a new brief or check your Runway API key.</p>
          </div>
        )}
      </div>

      {/* Avatar — pinned above input (only when configured) */}
      {AVATAR_CONFIGURED && (
        <div className="border-t border-white/10">
          <AvatarPanel storyboard={storyboard} />
        </div>
      )}

      {/* Production settings panel */}
      {showSettings && !isRunning && (
        <div className="border-t border-white/10 bg-white/[0.03] px-3 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/50">Production settings</p>
            <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] text-white/35">{MODEL_LABEL}</span>
          </div>
          {/* Orientation */}
          <div className="space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">Orientation</p>
            <div className="flex gap-1.5">
              {(["landscape", "portrait"] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, orientation: o }))}
                  className={`flex-1 rounded-md border px-2 py-1.5 font-mono text-[11px] transition-colors ${
                    settings.orientation === o
                      ? "border-white/35 bg-white/10 text-white/90"
                      : "border-white/10 text-white/45 hover:border-white/20 hover:text-white/65"
                  }`}
                >
                  {o === "landscape" ? "⬛ Landscape 16:9" : "▮ Portrait 9:16"}
                </button>
              ))}
            </div>
          </div>
          {/* Shot count */}
          <div className="space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">Shots</p>
            <div className="flex gap-1.5">
              {[3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, shotCount: n }))}
                  className={`flex-1 rounded-md border py-1.5 font-mono text-[11px] transition-colors ${
                    settings.shotCount === n
                      ? "border-white/35 bg-white/10 text-white/90"
                      : "border-white/10 text-white/45 hover:border-white/20 hover:text-white/65"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          {/* Shot duration */}
          <div className="space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">Duration per shot</p>
            <div className="flex gap-1.5">
              {[3, 5, 8, 10].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, shotDuration: d }))}
                  className={`flex-1 rounded-md border py-1.5 font-mono text-[11px] transition-colors ${
                    settings.shotDuration === d
                      ? "border-white/35 bg-white/10 text-white/90"
                      : "border-white/10 text-white/45 hover:border-white/20 hover:text-white/65"
                  }`}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>
          <p className="font-mono text-[10px] text-white/28 leading-4">
            Settings are applied to your next brief. Longer shots and more clips increase Runway credit usage.
          </p>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(draft);
              }
            }}
            placeholder="Challenge brief, product URL, or repo…"
            rows={2}
            className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white/85 placeholder:text-white/45 focus:border-white/35 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => handleSend(draft)}
            disabled={!draft.trim() || isRunning}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.12em] text-white/75 transition-colors hover:bg-white/20 hover:text-white/90 disabled:opacity-30"
          >
            Run
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
            ↵ send · shift+↵ newline
          </p>
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            disabled={isRunning}
            className={`font-mono text-[11px] uppercase tracking-[0.12em] transition-colors disabled:opacity-30 ${
              showSettings ? "text-white/70" : "text-white/35 hover:text-white/55"
            }`}
          >
            {showSettings ? "✕ settings" : "⚙ settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main canvas
// ---------------------------------------------------------------------------


function DirectorCanvas({ onStoryboardChange, threadId }: { onStoryboardChange?: (s: Storyboard) => void; threadId?: string }) {
  // Must pass agentId: "director" — see useLiveStoryboardState above.
  const { agent } = useAgent({ agentId: "director" });
  const { copilotkit } = useCopilotKit();
  const [showKeyPanel, setShowKeyPanel] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"canvas" | "chat">("canvas");
  const [queuePosition, setQueuePosition] = useState(0);
  const [estimatedWaitSec, setEstimatedWaitSec] = useState(0);
  const { key: runwayKey } = useRunwayApiKey();
  const [paidSku, setPaidSku] = useState<string | null>(null);
  const [doorMode, setDoorMode] = useState<DevCutDoorId | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sku = params.get("sku");
    if (sku) setPaidSku(sku);
    const mode = params.get("mode");
    if (mode === "challenge" || mode === "submit" || mode === "agent") {
      setDoorMode(mode);
    }
  }, []);

  // Persisted checkpoint fetched from LangGraph on thread switch.
  // Stored locally because agent.setState() only works during an active run.
  const [restoredState, setRestoredState] = useState<StoryboardState | null>(null);
  const restoredThreadRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!threadId) return;
    if (restoredThreadRef.current === threadId) return;
    restoredThreadRef.current = threadId;
    setRestoredState(null);
    fetch(`/api/thread-state/${encodeURIComponent(threadId)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.values) return;
        setRestoredState(mergeStoryboardState(data.values));
      })
      .catch(() => { /* silently ignore */ });
  }, [threadId]);

  // Auto-inject ?brief= / paid x402 unlock from landing or agent settle
  const briefInjectedRef = useRef(false);
  useEffect(() => {
    if (briefInjectedRef.current || !agent) return;
    const params = new URLSearchParams(window.location.search);
    const brief = params.get("brief");
    const unlock = params.get("unlock");
    const sku = params.get("sku");

    const cleanUrl = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("brief");
      url.searchParams.delete("unlock");
      // keep mode + sku + job for badge
      window.history.replaceState({}, "", url.toString());
    };

    if (unlock) {
      briefInjectedRef.current = true;
      fetch(`/api/x402/unlock/verify?token=${encodeURIComponent(unlock)}`)
        .then(async (r) => {
          if (!r.ok) throw new Error("invalid unlock");
          return r.json() as Promise<{
            valid: boolean;
            mode_prompt: string;
            title: string;
            sku: string;
          }>;
        })
        .then((data) => {
          cleanUrl();
          const userBrief = brief?.trim() || "";
          const prompt = `${data.mode_prompt}${userBrief ? ` Brief follows: ${userBrief}` : ""}`;
          toast.success(`Paid ${data.title} unlocked`, { duration: 4000 });
          setTimeout(() => injectPrompt(prompt), 600);
        })
        .catch(() => {
          briefInjectedRef.current = false;
          toast.error("x402 unlock invalid or expired");
        });
      return;
    }

    if (!brief) return;
    briefInjectedRef.current = true;
    const remix = params.get("remix") === "1";
    const modeSlug = params.get("mode");
    const door = modeSlug
      ? DEVCUT_DOORS.find((d) => d.id === modeSlug)
      : undefined;
    cleanUrl();
    // Landing usually prepends the door prompt; Remix /cut links send bare brief + mode.
    const prompt =
      remix && door?.prompt && !brief.includes(door.prompt.slice(0, 40))
        ? `${door.prompt} ${brief}`
        : brief;
    setTimeout(() => injectPrompt(prompt), 800);
  }, [agent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep suggestions registered (used by the chat component)
  useConfigureSuggestions({
    available: "before-first-message",
    suggestions: SUGGESTIONS.map((s, i) => ({
      title: SUGGESTION_LABELS[i] ?? "DevCut",
      message: s,
    })),
  });

  const injectPrompt = useCallback(
    (prompt: string) => {
      if (!agent) return;
      if (isRunning) {
        toast.error("Please wait — the agent is still working.", { duration: 3000 });
        return;
      }
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `msg-${Date.now()}`;
      agent.addMessage({ id, role: "user", content: prompt });
      setIsRunning(true);
      setLastError(null);
      setQueuePosition(0);
      setEstimatedWaitSec(0);

      // Intercept fetch to read X-Queue-Position / X-Estimated-Wait headers
      // emitted by the BFF when the request had to wait for a concurrency slot.
      // Headers arrive with the first chunk of the streaming response, so we
      // can read them synchronously from the cloned Response before returning.
      const _origFetch = window.fetch;
      window.fetch = async (...args) => {
        const res = await _origFetch(...args);
        const url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url;
        if (url.includes("/api/copilotkit")) {
          const pos = Number(res.headers.get("x-queue-position") ?? 0);
          const wait = Number(res.headers.get("x-estimated-wait") ?? 0);
          setQueuePosition(pos);
          setEstimatedWaitSec(wait);
        }
        return res;
      };

      void copilotkit.runAgent({ agent }).catch((error: unknown) => {
        console.error("injectPrompt: runAgent failed", error);
        const msg =
          error && typeof error === "object" && "message" in error
            ? String((error as { message: unknown }).message)
            : "Agent run failed";
        setLastError(msg);
        toast.error(msg, { duration: 6000 });
      }).finally(() => {
        window.fetch = _origFetch;
        setIsRunning(false);
        setQueuePosition(0);
        setEstimatedWaitSec(0);
        // Toast on completion — only if shots were generated
        const finalState = mergeStoryboardState(agent?.state);
        const readyCount = finalState.shots.filter((s) => s.status === "ready").length;
        if (readyCount > 0 && finalState.export_status !== "ready") {
          toast.success(`${readyCount} shot${readyCount > 1 ? "s" : ""} ready`, {
            description: readyCount === finalState.shots.length
              ? "All shots complete — ready to export."
              : `${finalState.shots.length - readyCount} shot${finalState.shots.length - readyCount > 1 ? "s" : ""} still pending.`,
            duration: 5000,
          });
        } else if (finalState.export_status === "ready") {
          toast.success("Final cut ready", {
            description: "Your MP4 is ready to download.",
            duration: 6000,
          });
        }
      });
    },
    [agent, copilotkit, isRunning],
  );

  // Use live agent state when a run is active, otherwise fall back to the
  // locally-stored checkpoint so previous threads render without needing a run.
  const liveState = mergeStoryboardState(agent?.state);
  const state = (liveState.shots.length > 0 || isRunning) ? liveState : (restoredState ?? liveState);
  const progress = useMemo(() => getAgentProgress(state, isRunning), [state, isRunning]);
  const jobMode =
    (state.builder_kit?.mode as string | undefined) || doorMode || null;
  const stillUrls = useMemo(
    () =>
      state.shots
        .map((s) => s.ref_image_url)
        .filter((u): u is string => Boolean(u)),
    [state.shots],
  );

  useEffect(() => {
    onStoryboardChange?.({
      title: state.storyboard.title,
      logline: state.storyboard.logline,
      aspect_ratio: state.storyboard.aspect_ratio,
      runway_mode: state.storyboard.runway_mode,
      stitch_mode: state.storyboard.stitch_mode,
      style_ref_url: state.storyboard.style_ref_url,
    });
  }, [
    state.storyboard.title,
    state.storyboard.logline,
    state.storyboard.aspect_ratio,
    state.storyboard.runway_mode,
    state.storyboard.stitch_mode,
    state.storyboard.style_ref_url,
    onStoryboardChange,
  ]);

  const updateState = useCallback(
    (updater: (prev: StoryboardState) => StoryboardState) => {
      agent?.setState(updater(mergeStoryboardState(agent?.state)));
    },
    [agent],
  );

  // Frontend tools
  useFrontendTool({
    name: "setHeader",
    description: "Set the workspace header (title and subtitle).",
    parameters: z.object({ title: z.string().optional(), subtitle: z.string().optional() }),
    handler: async ({ title, subtitle }) => {
      updateState((prev) => ({
        ...prev,
        header: {
          title: title ?? prev.header.title,
          subtitle: subtitle ?? prev.header.subtitle,
        },
      }));
      return "header updated";
    },
  });

  useFrontendTool({
    name: "selectShot",
    description: "Open the detail panel for one shot. Pass null to deselect.",
    parameters: z.object({ shotId: z.string().nullable() }),
    handler: async ({ shotId }) => {
      updateState((prev) => ({ ...prev, selectedShotId: shotId }));
      return shotId ? `selected ${shotId}` : "deselected";
    },
  });

  useFrontendTool({
    name: "updateShotPrompt",
    description: "Edit a shot's prompt without regenerating media.",
    parameters: z.object({ shotId: z.string(), prompt: z.string() }),
    handler: async ({ shotId, prompt }) => {
      updateState((prev) => ({
        ...prev,
        shots: prev.shots.map((s) => (s.id === shotId ? { ...s, prompt } : s)),
      }));
      return "prompt updated";
    },
  });

  useFrontendTool({
    name: "renderShotPreview",
    description: "Render an inline shot mini-card in chat.",
    parameters: z.object({ shotId: z.string(), beat: z.string().optional() }),
    render: ({ args }) => <LiveShotPreview shotId={args.shotId!} beat={args.beat} />,
  });

  useFrontendTool({
    name: "renderStoryboardSummary",
    description: "Render a compact storyboard progress summary inline in chat.",
    parameters: z.object({}),
    render: () => <LiveStoryboardSummary />,
  });

  useDefaultRenderTool({
    render: ({ name, status, result, parameters }) => (
      <ToolFallbackCard
        name={name}
        status={status}
        result={result}
        parameters={parameters}
        variant="devcut"
      />
    ),
  });

  const totalShots = state.shots.length;
  const readyShots = useMemo(
    () => state.shots.filter((s) => s.status === "ready").length,
    [state.shots],
  );

  const handleSelect = useCallback(
    (id: string) =>
      updateState((prev) => ({
        ...prev,
        selectedShotId: prev.selectedShotId === id ? null : id,
      })),
    [updateState],
  );

  const handleRegenerate = useCallback(
    (id: string) => {
      injectPrompt(`Regenerate shot ${id}. Call regenerate_shot then generate_shot_reference then generate_shot_video.`);
    },
    [injectPrompt],
  );

  const handleDownload = useCallback((_shotId: string, url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.target = "_blank"; a.rel = "noopener noreferrer";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }, []);

  const handleDownloadFinal = useCallback((url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.target = "_blank"; a.rel = "noopener noreferrer";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }, []);

  const handleExport = useCallback(() => {
    updateState((prev) => ({ ...prev, export_status: "stitching", export_error: null }));
    injectPrompt("Stitch all ready shots into the final cut now. Call stitch_final_cut.");
  }, [injectPrompt, updateState]);

  const selectedShot: Shot | undefined = state.selectedShotId
    ? state.shots.find((s) => s.id === state.selectedShotId)
    : undefined;

  return (
    <>
      {/* ── Layout: canvas left, chat right ── */}
      <div className="flex min-h-svh flex-col overflow-y-auto bg-background lg:h-dvh lg:flex-row lg:overflow-hidden">
        <div className="sticky top-0 z-20 grid grid-cols-2 gap-1 border-b border-white/10 bg-background/95 p-2 backdrop-blur lg:hidden">
          {(["canvas", "chat"] as const).map((panel) => (
            <button
              key={panel}
              type="button"
              onClick={() => setMobilePanel(panel)}
              className={`rounded-lg px-3 py-2 font-mono text-xs uppercase tracking-[0.12em] transition ${
                mobilePanel === panel
                  ? "bg-white/12 text-white"
                  : "text-white/62 hover:bg-white/[0.06] hover:text-white/85"
              }`}
            >
              {panel === "canvas" ? `Canvas ${progress.ready}/${progress.total || 0}` : "Chat"}
            </button>
          ))}
        </div>

        {/* Canvas */}
        <main
          className={`min-w-0 flex-1 flex-col gap-3 overflow-visible p-3 sm:p-4 lg:flex lg:overflow-hidden ${
            mobilePanel === "canvas" ? "flex" : "hidden"
          }`}
        >
          <BriefHeader
            title={state.header.title}
            subtitle={state.header.subtitle}
            storyboard={state.storyboard}
            shotCount={totalShots}
            readyCount={readyShots}
            onKeyClick={() => setShowKeyPanel((v) => !v)}
            hasPersonalKey={Boolean(runwayKey)}
            paidSku={paidSku}
            jobMode={jobMode}
          />

          {showKeyPanel && <ApiKeyPanel onClose={() => setShowKeyPanel(false)} isLive={state.storyboard.runway_mode === "LIVE"} />}

          {totalShots === 0 ? (
            <DevCutEmptyState
              isRunning={isRunning}
              onStart={(prompt) => injectPrompt(prompt)}
            />
          ) : (
            <div className="relative flex flex-1 flex-col gap-3 overflow-auto">
              {/* Pipeline action bar */}
              {readyShots < totalShots && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/12 bg-white/[0.06] px-4 py-3">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.12em] text-white/65">
                      Progress · {readyShots}/{totalShots} shots ready
                    </p>
                    <p className="mt-1 text-sm text-white/72">
                      Next: generate the remaining media, then export the final cut.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={() => injectPrompt("Generate all references and all videos for every shot now. Call generate_all_references then generate_all_videos.")}
                      className="rounded-full border border-white/22 bg-white/12 px-4 py-1.5 font-mono text-xs uppercase tracking-[0.12em] text-white/82 transition-colors hover:bg-white/20 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Generate remaining media
                    </button>
                    {readyShots > 0 && state.shots.some((s) => s.ref_image_url && !s.video_url) && (
                      <button
                        type="button"
                        disabled={isRunning}
                        onClick={() => injectPrompt("Generate all remaining videos now. Call generate_all_videos.")}
                        className="rounded-full border border-white/12 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.12em] text-white/65 transition-colors hover:text-white/85 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        Animate remaining
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Export trigger */}
              {readyShots > 0 && readyShots === totalShots && state.export_status === "idle" && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/12 bg-white/[0.06] px-4 py-3">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.12em] text-white/65">
                      Ready to export · all {totalShots} shots complete
                    </p>
                    <p className="mt-1 text-sm text-white/72">
                      Stitch the storyboard into one MP4 for download and sharing.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={handleExport}
                    className="rounded-full border border-white/30 bg-white/15 px-4 py-1.5 font-mono text-xs uppercase tracking-[0.12em] text-white/84 transition-colors hover:bg-white/24 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Export final cut
                  </button>
                </div>
              )}

              {/* Final cut hero — shown above timeline when ready */}
              {state.export_status === "ready" && (
                <JobOutcomePanel
                  exportStatus={state.export_status}
                  exportError={state.export_error}
                  finalVideoUrl={state.final_video_url}
                  durableUrl={state.durable_url}
                  manifestUri={state.manifest_uri}
                  storyboardTitle={state.storyboard.title}
                  builderKit={state.builder_kit}
                  jobMode={jobMode}
                  jobBrief={
                    state.storyboard.logline ||
                    state.builder_kit?.brief_md ||
                    state.storyboard.title
                  }
                  stillUrls={stillUrls}
                  vaultState={{
                    storyboard: state.storyboard,
                    shots: state.shots,
                    final_video_url: state.final_video_url,
                    durable_url: state.durable_url,
                    manifest_uri: state.manifest_uri,
                    job_manifest_uri: state.job_manifest_uri,
                    final_sha256: state.final_sha256,
                    canonical_hash: state.canonical_hash,
                    agent_loop: state.agent_loop,
                  }}
                  onExport={handleExport}
                  onDownload={handleDownloadFinal}
                  onShipAnother={() => {
                    updateState(() => ({ ...initialStoryboardState }));
                    toast.message("Ship another", {
                      description: "Canvas cleared — pick a door and commission the next cut.",
                    });
                  }}
                />
              )}

              <StoryboardTimeline
                shots={state.shots}
                selectedShotId={state.selectedShotId}
                onSelect={handleSelect}
                onRegenerate={handleRegenerate}
                onDownload={handleDownload}
              />

              {/* Stitching / error states shown below timeline */}
              {(state.export_status === "stitching" || state.export_status === "error") && (
                <JobOutcomePanel
                  exportStatus={state.export_status}
                  exportError={state.export_error}
                  finalVideoUrl={state.final_video_url}
                  durableUrl={state.durable_url}
                  manifestUri={state.manifest_uri}
                  storyboardTitle={state.storyboard.title}
                  builderKit={state.builder_kit}
                  jobMode={jobMode}
                  jobBrief={
                    state.storyboard.logline ||
                    state.builder_kit?.brief_md ||
                    state.storyboard.title
                  }
                  stillUrls={stillUrls}
                  vaultState={{
                    storyboard: state.storyboard,
                    shots: state.shots,
                    final_video_url: state.final_video_url,
                    durable_url: state.durable_url,
                    manifest_uri: state.manifest_uri,
                    job_manifest_uri: state.job_manifest_uri,
                    final_sha256: state.final_sha256,
                    canonical_hash: state.canonical_hash,
                    agent_loop: state.agent_loop,
                  }}
                  onExport={handleExport}
                  onDownload={handleDownloadFinal}
                />
              )}
            </div>
          )}

          {/* Selected shot detail */}
          {selectedShot && (
            <aside className="flex max-h-[55svh] shrink-0 flex-col gap-3 overflow-auto rounded-xl border border-white/10 bg-white/5 p-4 text-xs lg:max-h-[38vh]">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-xs uppercase tracking-[0.12em] text-white/76">
                  #{selectedShot.index + 1} · {selectedShot.beat}
                </p>
                <button
                  type="button"
                  onClick={() => handleSelect(selectedShot.id)}
                  className="font-mono text-xs uppercase tracking-[0.12em] text-white/55 hover:text-white/80"
                >
                  Close
                </button>
              </div>
              <p className="text-xs leading-relaxed text-white/68">{selectedShot.prompt}</p>
              {selectedShot.video_url ? (
                <video
                  src={selectedShot.video_url}
                  poster={selectedShot.ref_image_url ?? undefined}
                  controls playsInline
                  className="max-h-[26vh] w-full rounded-lg bg-black object-contain"
                />
              ) : selectedShot.ref_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selectedShot.ref_image_url} alt={selectedShot.beat}
                  className="max-h-[26vh] w-full rounded-lg object-contain" />
              ) : null}
              <div className="flex gap-2">
                <button type="button" disabled={isRunning} onClick={() => handleRegenerate(selectedShot.id)}
                  className="rounded-full border border-white/15 px-3 py-1 font-mono text-xs uppercase tracking-[0.1em] text-white/68 hover:text-white/85 disabled:opacity-30 disabled:cursor-not-allowed">
                  Regenerate
                </button>
                <button type="button" disabled={isRunning}
                  onClick={() => injectPrompt(`Rewrite the prompt for shot ${selectedShot.id} with more cinematic detail, then regenerate it.`)}
                  className="rounded-full border border-white/15 px-3 py-1 font-mono text-xs uppercase tracking-[0.1em] text-white/68 hover:text-white/85 disabled:opacity-30 disabled:cursor-not-allowed">
                  Rewrite
                </button>
                {(selectedShot.ref_image_url || selectedShot.video_url) && (
                  <button type="button"
                    onClick={() => {
                      const url = selectedShot.video_url || selectedShot.ref_image_url!;
                      const ext = selectedShot.video_url ? ".mp4" : "_ref.png";
                      handleDownload(selectedShot.id, url, `${selectedShot.beat || `shot_${selectedShot.index + 1}`}${ext}`);
                    }}
                    className="rounded-full border border-white/15 px-3 py-1 font-mono text-xs uppercase tracking-[0.1em] text-white/68 hover:text-white/85">
                    ↓ Save
                  </button>
                )}
              </div>
            </aside>
          )}
        </main>

        {/* Chat panel */}
        <aside
          className={`h-[calc(100svh-3.65rem)] min-h-[24rem] shrink-0 flex-col border-t border-white/10 lg:flex lg:h-auto lg:w-[360px] lg:border-l lg:border-t-0 ${
            mobilePanel === "chat" ? "flex" : "hidden"
          }`}
        >
          <DirectorChat
            onSend={injectPrompt}
            isRunning={isRunning}
            progress={progress}
            lastError={lastError}
            shots={state.shots}
            storyboard={state.storyboard}
            onRetry={() => {
              setLastError(null);
              const lastUserMsg = state.shots.length > 0
                ? "Continue generating any missing media and export the final cut."
                : "Please try again.";
              injectPrompt(lastUserMsg);
            }}
          />
        </aside>
      </div>

      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            error: "!bg-rose-950 !text-rose-200 !border !border-rose-800",
          },
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// DevCut empty state — three doors only
// ---------------------------------------------------------------------------

function DevCutEmptyState({
  isRunning,
  onStart,
}: {
  isRunning: boolean;
  onStart: (prompt: string) => void;
}) {
  const initialMode =
    typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("mode") as DevCutDoorId | null)
      : null;
  const [door, setDoor] = useState<DevCutDoorId>(
    initialMode === "submit" || initialMode === "agent" || initialMode === "challenge"
      ? initialMode
      : "challenge",
  );
  const [draft, setDraft] = useState(
    initialMode === "submit"
      ? DEVCUT_SUBMIT_EXAMPLES[0].brief
      : DEVCUT_GOLDEN_CHALLENGE.brief,
  );

  const active = DEVCUT_DOORS.find((d) => d.id === door)!;
  const examples = door === "submit" ? DEVCUT_SUBMIT_EXAMPLES : DEVCUT_CHALLENGE_EXAMPLES;

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-8 px-3 py-8 sm:px-6 lg:py-0">
      <div className="w-full max-w-2xl rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-left sm:hidden">
        <p className="text-xs leading-5 text-amber-300/80">
          {DEVCUT.name} is optimised for desktop. You can start a job on mobile; the canvas
          works best on a larger screen.
        </p>
      </div>

      <div className="max-w-2xl space-y-3 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--dc-cyan,#2de2c5)]">
          {DEVCUT.name}
        </p>
        <h2 className="dc-display text-2xl font-semibold tracking-tight text-[var(--dc-paper,#f4efe4)] md:text-3xl">
          {DEVCUT.tagline}
        </h2>
        <p className="mx-auto max-w-xl text-sm leading-6 text-white/65">
          DevCut feeds HyperFrames — Runway heroes + packaging. HyperFrames keeps
          HTML composition. Pick a door to start.
        </p>
        <p className="mx-auto max-w-lg font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--dc-signal,#ff9f1c)]/70">
          No keys yet? MOCK runs the full desk — stills/clips are placeholders; kit.zip still
          ships BRIEF.md
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            disabled={isRunning}
            onClick={() => {
              setDoor("challenge");
              setDraft(DEVCUT_GOLDEN_CHALLENGE.brief);
              const challenge = DEVCUT_DOORS.find((d) => d.id === "challenge")!;
              onStart(`${challenge.prompt} ${DEVCUT_GOLDEN_CHALLENGE.brief}`);
            }}
            className="rounded-full bg-[var(--dc-signal,#ff9f1c)] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--dc-ink,#050607)] hover:bg-[var(--dc-paper,#f4efe4)] disabled:opacity-40"
          >
            Run golden cut
          </button>
          <button
            type="button"
            disabled={isRunning}
            onClick={() => {
              setDoor("submit");
              setDraft(DEVCUT_HF_DEMO.brief);
              const submit = DEVCUT_DOORS.find((d) => d.id === "submit")!;
              onStart(`${submit.prompt} ${DEVCUT_HF_DEMO.brief}`);
            }}
            className="rounded-full border border-[var(--dc-cyan,#2de2c5)]/45 bg-[var(--dc-cyan-soft,rgba(45,226,197,0.14))] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--dc-cyan,#2de2c5)] hover:bg-[var(--dc-cyan,#2de2c5)]/20 disabled:opacity-40"
          >
            HyperFrames demo
          </button>
        </div>
      </div>

      <div className="grid w-full max-w-3xl gap-3 md:grid-cols-3">
        {DEVCUT_DOORS.map((d) => {
          const selected = door === d.id;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                setDoor(d.id);
                if (d.id === "challenge") setDraft(DEVCUT_GOLDEN_CHALLENGE.brief);
                if (d.id === "submit") setDraft(DEVCUT_SUBMIT_EXAMPLES[0].brief);
              }}
              className={`rounded-xl border px-4 py-4 text-left transition-colors ${
                selected
                  ? d.id === "submit"
                    ? "border-[var(--dc-cyan)]/45 bg-[var(--dc-cyan-soft)]"
                    : d.id === "agent"
                      ? "border-[var(--dc-signal)]/45 bg-[var(--dc-signal-soft)]"
                      : "border-[var(--dc-signal)]/50 bg-[var(--dc-signal-soft)]"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20"
              }`}
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
                {d.label}
              </p>
              <p className="mt-2 text-sm font-medium text-white/90">{d.title}</p>
              <p className="mt-1 text-xs leading-5 text-white/55">{d.body}</p>
            </button>
          );
        })}
      </div>

      <div className="w-full max-w-3xl rounded-xl border border-white/10 bg-black/20 p-5 text-left">
        {door === "agent" ? (
          <AgentPaymentsPanel embedded />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {examples.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => setDraft(ex.brief)}
                  className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ${
                    draft === ex.brief
                      ? "border-[var(--dc-signal,#ff9f1c)]/45 text-[var(--dc-signal,#ff9f1c)]"
                      : "border-white/10 text-white/45 hover:text-white/75"
                  }`}
                >
                  {ex.label}
                </button>
              ))}
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              className="w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs leading-5 text-white/85 outline-none focus:border-white/30"
            />
            <button
              type="button"
              disabled={isRunning || !draft.trim()}
              onClick={() => onStart(`${active.prompt} ${draft.trim()}`)}
              className="rounded-full bg-[var(--dc-signal,#ff9f1c)] px-5 py-2 font-mono text-xs uppercase tracking-[0.12em] text-[var(--dc-ink,#050607)] hover:bg-[var(--dc-paper,#f4efe4)] disabled:opacity-40"
            >
              {door === "challenge" ? "Commission cut" : "Run Submit Ready"}
            </button>
          </div>
        )}
      </div>

      {!AVATAR_CONFIGURED && <AvatarShowcase progressNarration={null} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page chrome
// ---------------------------------------------------------------------------

function DirectorPage() {
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [storyboard, setStoryboard] = useState(initialStoryboardState.storyboard);
  const handleStoryboardChange = useCallback((next: Storyboard) => {
    setStoryboard((prev) => {
      if (
        prev.title === next.title &&
        prev.logline === next.logline &&
        prev.aspect_ratio === next.aspect_ratio &&
        prev.runway_mode === next.runway_mode &&
        prev.stitch_mode === next.stitch_mode &&
        prev.style_ref_url === next.style_ref_url
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  return (
    <div data-theme="cinema" className={drawerStyles.layout}>
      <ThreadsDrawer
        agentId="director"
        threadId={threadId}
        onThreadChange={setThreadId}
        storyboard={storyboard}
      />
      <div className={drawerStyles.mainPanel}>
        <CopilotChatConfigurationProvider key={threadId ?? "new"} agentId="director" threadId={threadId}>
          <DirectorCanvas onStoryboardChange={handleStoryboardChange} threadId={threadId} />
        </CopilotChatConfigurationProvider>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <ClientOnly>
      <DirectorPage />
    </ClientOnly>
  );
}
