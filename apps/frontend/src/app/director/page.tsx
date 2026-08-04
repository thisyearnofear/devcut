"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useSession } from "next-auth/react";
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
import { briefHash } from "@/lib/brief-hash";
import { AuthSessionProvider } from "@/components/auth/AuthSessionProvider";
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
      <div data-theme="cinema" className="flex min-h-svh items-center justify-center bg-[var(--dc-ink,#050607)] px-6 text-center">
        <div className="space-y-3">
          <p className="dc-mono text-xs uppercase tracking-[0.18em] text-[var(--dc-mute)]">
            Loading {DEVCUT.name}
          </p>
          <p className="dc-display text-lg font-semibold text-[var(--dc-paper)]">
            Opening the canvas…
          </p>
          <div className="mx-auto flex w-fit items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-1.5 rounded-full bg-[var(--dc-signal)] animate-pulse"
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
// Agent transcript — renders the agent's own voice + tool-call cards.
//
// `agent.messages` (AG-UI) holds assistant prose and tool calls produced by the
// backend. Before this existed the chat only echoed the user's own messages and
// a derived ledger, so every assistant reply and ToolFallbackCard the agent
// emitted was invisible. We render prose inline and reuse ToolFallbackCard for
// tool calls, pairing each call with its result (tool messages carry the result
// keyed by actionName/actionExecutionId).
// ---------------------------------------------------------------------------

interface AgentMessage {
  id: string;
  role?: string;
  content?: unknown;
  toolCalls?: Array<{
    id: string;
    function?: { name?: string; arguments?: string };
  }>;
}

interface AgentTranscriptItem {
  id: string;
  kind: "text" | "tool";
  text?: string;
  tool?: { name: string; args?: unknown; result?: string; status: string };
}

function buildTranscript(messages: AgentMessage[]): AgentTranscriptItem[] {
  const items: AgentTranscriptItem[] = [];
  // Index tool results by actionName/actionExecutionId for pairing.
  const resultByAction = new Map<string, string>();
  for (const m of messages) {
    if (m.role === "tool") {
      const content = typeof m.content === "string" ? m.content : "";
      const anyMsg = m as AgentMessage & { actionExecutionId?: string; actionName?: string };
      if (anyMsg.actionExecutionId) resultByAction.set(anyMsg.actionExecutionId, content);
      if (anyMsg.actionName) resultByAction.set(anyMsg.actionName, content);
    }
  }
  for (const m of messages) {
    if (m.role === "assistant" && typeof m.content === "string" && m.content.trim()) {
      items.push({ id: `${m.id}-t`, kind: "text", text: m.content.trim() });
    }
    for (const tc of m.toolCalls ?? []) {
      const name = tc.function?.name ?? "tool";
      let args: unknown;
      try {
        args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : undefined;
      } catch {
        args = tc.function?.arguments;
      }
      const result = resultByAction.get(tc.id) ?? resultByAction.get(name);
      items.push({
        id: `${m.id}-${tc.id}`,
        kind: "tool",
        tool: {
          name,
          args,
          result,
          status: result !== undefined ? "complete" : "executing",
        },
      });
    }
  }
  return items;
}

function AgentTranscript() {
  const { agent } = useAgent({ agentId: "director" });
  const messages = (agent?.messages ?? []) as unknown as AgentMessage[];
  const items = useMemo(() => buildTranscript(messages), [messages]);
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      {items.map((item) =>
        item.kind === "text" ? (
          <div key={item.id} className="flex justify-start">
            <div className="max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed text-white/72">
              {item.text}
            </div>
          </div>
        ) : (
          <ToolFallbackCard
            key={item.id}
            name={item.tool!.name}
            status={item.tool!.status}
            result={item.tool!.result}
            parameters={item.tool!.args}
            variant="devcut"
          />
        ),
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Planning skeleton — shown on the canvas while the agent plans shots.
// ---------------------------------------------------------------------------

function PlanningSkeleton({
  stalled,
  queuePosition,
  estimatedWaitSec,
  onCancel,
}: {
  stalled: boolean;
  queuePosition: number;
  estimatedWaitSec: number;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-2 rounded-full bg-[#ffbe70] animate-pulse"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
        <p className="text-sm text-white/70">
          <PlanningText />
        </p>
        {queuePosition > 0 && (
          <span className="rounded-full border border-white/12 bg-white/[0.06] px-2.5 py-0.5 font-mono text-[11px] text-white/55">
            Queued · #{queuePosition}
            {estimatedWaitSec > 0 &&
              ` · ~${estimatedWaitSec < 60 ? `${estimatedWaitSec}s` : `${Math.round(estimatedWaitSec / 60)}m`}`}
          </span>
        )}
      </div>
      {stalled && (
        <p className="text-xs text-white/45">
          Taking longer than usual. You can cancel and retry.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
            <div className="aspect-video w-full animate-pulse bg-white/5" />
            <div className="space-y-2 p-3">
              <div className="h-3 w-3/4 animate-pulse rounded bg-white/10" />
              <div className="h-2.5 w-full animate-pulse rounded bg-white/5" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-rose-400/40 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.1em] text-rose-200 hover:bg-rose-500/15"
        >
          Cancel run
        </button>
      </div>
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

/** Short, human-readable thread title derived from a staged brief. */
function deriveThreadTitle(prompt: string, modeSlug: string | null): string {
  const door = modeSlug ? DEVCUT_DOORS.find((d) => d.id === modeSlug) : undefined;
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  // Door prompts end with "Brief follows:" — prefer the user's own words.
  const afterBrief = cleaned.split(/brief follows:/i).pop()?.trim() ?? cleaned;
  const base = afterBrief.replace(/^Mode:.*?\.\s*/, "").trim() || cleaned;
  const snippet = base.length > 46 ? `${base.slice(0, 46)}…` : base;
  return door?.title ? `${door.title} — ${snippet}` : snippet || "Untitled cut";
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

// The Runway WebRTC SDK (@runwayml/avatars-react) ships a sizeable bundle and
// pulls in a styles.css. Only load it when the avatar is actually configured,
// so every /director visitor doesn't pay for it.
const AvatarShowcase: ComponentType<{ progressNarration?: string | null }> | null = AVATAR_CONFIGURED
  ? dynamic(() =>
      import("@/components/storyboard/AvatarShowcase").then((m) => m.AvatarShowcase),
    )
  : null;
const AvatarPanel: ComponentType<{ storyboard: Storyboard }> | null = AVATAR_CONFIGURED
  ? dynamic(() =>
      import("@/components/storyboard/AvatarPanel").then((m) => m.AvatarPanel),
    )
  : null;

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
  onCancel,
  onOpenKeys,
  queuePosition,
  estimatedWaitSec,
  stalled,
  shots,
  storyboard,
  canvasIsEmpty,
  preseededDraft,
  commissionHint,
}: {
  onSend: (msg: string) => void;
  isRunning: boolean;
  /** Draft staged by an external flow (landing / remix link) — user sends it. */
  preseededDraft?: string | null;
  /** One-line commission summary shown while a staged draft awaits sending. */
  commissionHint?: string | null;
  progress: AgentProgress;
  lastError: string | null;
  onRetry: () => void;
  onCancel: () => void;
  onOpenKeys: () => void;
  queuePosition: number;
  estimatedWaitSec: number;
  stalled: boolean;
  shots: Shot[];
  storyboard: Storyboard;
  canvasIsEmpty: boolean;
}) {
  const [settings, setSettings] = useState<ProductionSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState("");
  // Stage externally-supplied briefs (?brief= / remix links) into the composer —
  // the user reviews and sends explicitly (each run spends Runway credits).
  useEffect(() => {
    if (preseededDraft) setDraft(preseededDraft);
  }, [preseededDraft]);
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

  const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === "1";
  const { data: session } = useSession();
  const authRequired = AUTH_ENABLED && !session?.user;

  const handleSend = (text: string) => {
    if (authRequired) {
      window.location.href = "/signin";
      return;
    }
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

  return (      <div className="flex h-full min-h-0 flex-col bg-sidebar">

      {/* Messages */}
      <div
        ref={messagesRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0"
      >
        {showSuggestions ? (
          canvasIsEmpty ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 pt-8 text-center">
              <p className="dc-mono text-[11px] uppercase tracking-[0.14em] text-white/40">
                Pick a door on the left
              </p>
              <p className="max-w-[16rem] text-xs leading-5 text-white/50">
                Start a cut from the canvas. The chat shows live progress once a run begins.
              </p>
            </div>
          ) : (
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
          )
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
        {/* The agent's own voice + tool-call cards (assistant prose, ToolFallbackCards). */}
        <AgentTranscript />
        {isRunning && (
          <div
            className="rounded-xl border border-white/10 bg-white/[0.04] p-3"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="flex items-center justify-between gap-3">                <p className="font-mono text-xs uppercase tracking-[0.14em] text-white/70">
                Making your cut

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
            {/* Queue awareness — BFF reports a concurrency-slot wait. */}
            {queuePosition > 0 && (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5">
                <span className="size-1.5 shrink-0 rounded-full bg-[#ffbe70] animate-pulse" />
                <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-white/65">
                  Waiting for a generation slot · position {queuePosition}
                  {estimatedWaitSec > 0 && ` · about ${estimatedWaitSec < 60 ? `${estimatedWaitSec}s` : `${Math.round(estimatedWaitSec / 60)}m`}`}
                </p>
              </div>
            )}
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
                            <span className="shrink-0 font-mono text-[10px] text-white/40">~{est < 60 ? `${est}s` : `${Math.round(est/60)}m`}</span>
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
            <p className="mt-3 text-[11px] leading-4 text-white/48">
              {stalled
                ? "Taking longer than usual. You can cancel and retry — completed shots stay on the canvas."
                : "Usually about 5 minutes. Your first frames appear before the final MP4 is stitched."}
            </p>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-full border border-rose-400/40 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.1em] text-rose-200 transition-colors hover:bg-rose-500/15"
              >
                Cancel run
              </button>
            </div>
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
        {lastError && (() => {
          const lower = lastError.toLowerCase();
          const keyRelated =
            lower.includes("api key") ||
            lower.includes("budget") ||
            lower.includes("401") ||
            lower.includes("402") ||
            lower.includes("rate limit") ||
            lower.includes("429") ||
            lower.includes("quota") ||
            lower.includes("credit");
          return (
            <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-rose-200">
                  {keyRelated ? "Runway key / budget" : "Agent error"}
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
              <p className="text-[11px] text-rose-200/60">
                {keyRelated
                  ? "Add your own Runway key, or try a shorter brief to use fewer credits."
                  : "Try a new brief or check your Runway API key."}
              </p>
              {keyRelated && (
                <button
                  type="button"
                  onClick={onOpenKeys}
                  className="rounded-full border border-rose-400/40 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.1em] text-rose-100 hover:bg-rose-500/15"
                >
                  Open API keys
                </button>
              )}
            </div>
          );
        })()}
      </div>

      {/* Avatar — pinned above input (only when configured) */}
      {AVATAR_CONFIGURED && AvatarPanel && (
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
          <p className="font-mono text-[10px] text-white/42 leading-4">
            Settings are applied to your next brief. Longer shots and more clips increase Runway credit usage.
          </p>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-end gap-2">              <textarea
                id="director-brief"
                name="brief"
                aria-label="Cut brief"
                ref={inputRef}
                value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(draft);
              }
            }}
            placeholder="Paste a brief, product URL, or repo…"
            rows={2}
            className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white/85 placeholder:text-white/45 focus:border-white/35 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => handleSend(draft)}
            disabled={authRequired ? false : (!draft.trim() || isRunning)}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.12em] text-white/75 transition-colors hover:bg-white/20 hover:text-white/90 disabled:opacity-30"
          >
            {authRequired ? "Sign in to cut" : "Start cut"}
          </button>
        </div>
        {commissionHint && draft.trim() && (
          <p className="mb-1 font-mono text-[11px] leading-4 text-[var(--dc-cyan,#2de2c5)]/85">
            {commissionHint}
          </p>
        )}
        <div className="mt-1.5 flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
            ↵ start · shift+↵ newline
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
  const [stalled, setStalled] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastEventAtRef = useRef<number>(0);
  const cancelledRef = useRef(false);
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
    setRestoreFailed(false);
    fetch(`/api/thread-state/${encodeURIComponent(threadId)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.values) return;
        setRestoredState(mergeStoryboardState(data.values));
      })
      .catch(() => {
        // A failed restore must not silently show an empty canvas — the user
        // could mistake it for lost work. Surface a recoverable notice.
        setRestoreFailed(true);
      });
  }, [threadId]);

  // Staged commission (brief pre-filled, awaiting explicit send) + early
  // thread naming so the drawer shows a real title instead of "New thread".
  const [pendingCommission, setPendingCommission] = useState<{
    prompt: string;
    hint: string;
    title: string;
  } | null>(null);
  const [pendingThreadTitle, setPendingThreadTitle] = useState<string | null>(null);
  // Brief-hash ledger plumbing: hash computed at staging time is moved to
  // lastStagedRef on send, then recorded against the run's threadId so
  // landing CTAs can offer "view previous cut (free)" next time.
  const pendingHashRef = useRef<string>("");
  const lastStagedRef = useRef<{ hash: string; title: string } | null>(null);

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
          // Clean the dead unlock token from the URL so a refresh doesn't re-run
          // the same failed verify (which would toast again in a loop).
          cleanUrl();
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
    // Stage, don't auto-send: each run spends real credits, so the launch is
    // an explicit user decision (and existing threads stay visible meanwhile).
    setPendingCommission({
      prompt,
      title: deriveThreadTitle(prompt, modeSlug),
      hint:
        "Staged brief — hero stills + motion clips + stitched MP4 · ~5 min · " +
        `${runwayKey ? "your Runway key" : "server key"} · press ↵ Start cut to begin.`,
    });
    pendingHashRef.current = "";
    void briefHash(prompt).then((h) => { pendingHashRef.current = h; }).catch(() => {});
    if (isRunning) {
      toast.message("A cut is already running", {
        description:
          "This brief is staged in the composer — send it when the current run finishes.",
        duration: 5000,
      });
    }
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
      setStalled(false);
      setQueuePosition(0);
      setEstimatedWaitSec(0);

      // Run watchdog: a silently dropped stream leaves isRunning=true forever,
      // permanently disabling every control. If no activity is seen for a
      // while, flag the run as stalled so the UI can offer cancel/retry.
      lastEventAtRef.current = Date.now();
      if (watchdogRef.current) clearInterval(watchdogRef.current);
      watchdogRef.current = setInterval(() => {
        const idleMs = Date.now() - lastEventAtRef.current;
        if (idleMs > 90_000) {
          setStalled((wasStalled) => {
            if (!wasStalled) {
              toast.message("Run is taking a while", {
                description:
                  "No updates in 90s. Cancel to retry — completed shots are kept.",
                duration: 6000,
              });
            }
            return true;
          });
        }
      }, 5000);

      // Intercept fetch to read X-Queue-Position / X-Estimated-Wait headers
      // emitted by the BFF when the request had to wait for a concurrency slot.
      // Headers arrive with the first chunk of the streaming response, so we
      // can read them synchronously from the cloned Response before returning.
      const _origFetch = window.fetch;
      window.fetch = async (...args) => {
        const res = await _origFetch(...args);
        const url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url;
        if (url.includes("/api/copilotkit")) {
          lastEventAtRef.current = Date.now();
          const pos = Number(res.headers.get("x-queue-position") ?? 0);
          const wait = Number(res.headers.get("x-estimated-wait") ?? 0);
          setQueuePosition(pos);
          setEstimatedWaitSec(wait);
        }
        return res;
      };

      void copilotkit.runAgent({ agent }).catch((error: unknown) => {
        // A user-initiated cancel aborts the run — not an error to surface.
        const isAbort =
          error &&
          typeof error === "object" &&
          "name" in error &&
          (error as { name: unknown }).name === "AbortError";
        if (isAbort) return;
        console.error("injectPrompt: runAgent failed", error);
        const msg =
          error && typeof error === "object" && "message" in error
            ? String((error as { message: unknown }).message)
            : "Agent run failed";
        setLastError(msg);
        toast.error(msg, { duration: 6000 });
      }).finally(() => {
        window.fetch = _origFetch;
        if (watchdogRef.current) {
          clearInterval(watchdogRef.current);
          watchdogRef.current = null;
        }
        setIsRunning(false);
        setStalled(false);
        setQueuePosition(0);
        setEstimatedWaitSec(0);
        // Ledger: record the run outcome for brief-hash resume matching.
        const staged = lastStagedRef.current;
        const settledThreadId = (agent?.threadId ?? "") as string;
        if (staged?.hash && settledThreadId) {
          void fetch("/api/cut-record", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              hash: staged.hash,
              threadId: settledThreadId,
              title: staged.title,
              status: cancelledRef.current ? "cancelled" : "done",
            }),
          }).catch(() => {});
          lastStagedRef.current = null;
        }
        // Skip the completion toast when the user cancelled — handleCancel
        // already acknowledged it.
        if (cancelledRef.current) {
          cancelledRef.current = false;
          return;
        }
        // Toast on completion — only if shots were generated
        const finalState = mergeStoryboardState(agent?.state);
        const readyCount = finalState.shots.filter((s) => s.status === "ready").length;
        void (async () => {
          // Per-run cost signal: actual Runway calls metered for this thread.
          let callsNote = "";
          if (settledThreadId) {
            try {
              const rc = await fetch(`/api/runway-calls/${encodeURIComponent(settledThreadId)}`);
              const cd = rc.ok ? await rc.json() : null;
              if (cd && typeof cd.calls_used === "number" && cd.calls_used > 0) {
                callsNote = ` · ${cd.calls_used} Runway call${cd.calls_used > 1 ? "s" : ""} this cut`;
              }
            } catch { /* non-fatal */ }
          }
          if (readyCount > 0 && finalState.export_status !== "ready") {
            toast.success(`${readyCount} shot${readyCount > 1 ? "s" : ""} ready`, {
              description: (readyCount === finalState.shots.length
                ? "All shots complete — ready to export."
                : `${finalState.shots.length - readyCount} shot${finalState.shots.length - readyCount > 1 ? "s" : ""} still pending.`) + callsNote,
              duration: 5000,
            });
          } else if (finalState.export_status === "ready") {
            toast.success("Final cut ready", {
              description: "Your MP4 is ready to download." + callsNote,
              duration: 6000,
            });
          }
        })();
      });
    },
    [agent, copilotkit, isRunning],
  );

  // Composer send path: staged commissions clear on send and queue their
  // derived title for early thread naming once the run assigns a threadId.
  const lastTitledThreadRef = useRef<string>("");
  const handleComposeSend = useCallback(
    (msg: string) => {
      if (pendingCommission) {
        setPendingThreadTitle(pendingCommission.title);
        lastStagedRef.current = { hash: pendingHashRef.current, title: pendingCommission.title };
        setPendingCommission(null);
      }
      injectPrompt(msg);
    },
    [injectPrompt, pendingCommission],
  );

  const agentThreadId = (agent?.threadId ?? undefined) as string | undefined;
  useEffect(() => {
    if (!agentThreadId || !pendingThreadTitle) return;
    if (lastTitledThreadRef.current === agentThreadId) return;
    const staged = lastStagedRef.current;
    if (staged?.hash) {
      void fetch("/api/cut-record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash: staged.hash, threadId: agentThreadId, title: staged.title, status: "running" }),
      }).catch(() => {});
    }
    let cancelled = false;
    const attempt = () =>
      fetch(`/api/copilotkit/threads/${encodeURIComponent(agentThreadId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: "director", name: pendingThreadTitle }),
      });
    const done = (r: Response) => {
      if (r.ok) {
        lastTitledThreadRef.current = agentThreadId;
        setPendingThreadTitle(null);
      }
      return r.ok;
    };
    // First attempt shortly after the run assigns the thread; one retry to
    // absorb the server-side create/commit race (~11ms observed in prod).
    const t1 = setTimeout(() => {
      if (cancelled) return;
      attempt()
        .then(done)
        .catch(() => {})
        .then((ok) => {
          if (ok || cancelled) return;
          setTimeout(() => {
            if (cancelled) return;
            attempt().then(done).catch(() => {});
          }, 4000);
        });
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(t1);
    };
  }, [agentThreadId, pendingThreadTitle]);

  // Use live agent state when a run is active, otherwise fall back to the
  // locally-stored checkpoint so previous threads render without needing a run.
  const liveState = mergeStoryboardState(agent?.state);
  const state = (liveState.shots.length > 0 || isRunning) ? liveState : (restoredState ?? liveState);
  const progress = useMemo(() => getAgentProgress(state, isRunning), [state, isRunning]);

  // Any change to derived progress means the stream delivered an update —
  // feed the watchdog so it doesn't flag a healthy (if slow) run as stalled.
  useEffect(() => {
    if (isRunning) lastEventAtRef.current = Date.now();
  }, [isRunning, progress]);

  // Clear the watchdog if the canvas unmounts mid-run.
  useEffect(() => {
    return () => {
      if (watchdogRef.current) clearInterval(watchdogRef.current);
    };
  }, []);

  const handleCancel = useCallback(() => {
    if (!agent || !isRunning) return;
    cancelledRef.current = true;
    try {
      agent.abortRun();
    } catch {
      /* abort may no-op if the run already settled */
    }
    setLastError("Run cancelled. You can start a new brief.");
    toast.message("Run cancelled", {
      description: "Completed shots are kept on the canvas.",
      duration: 4000,
    });
  }, [agent, isRunning]);

  // Short label for the currently-active pipeline stage (mobile tab bar).
  const activeStageLabel = useMemo(() => {
    const active = progress.stages.find((s) => s.status === "active");
    return active ? active.label : "Running";
  }, [progress.stages]);

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
      <div className="flex min-h-svh flex-col overflow-y-auto bg-[var(--dc-ink)] lg:h-dvh lg:flex-row lg:overflow-hidden">
        <div className="sticky top-0 z-20 grid grid-cols-2 gap-0 border-b border-[var(--dc-line)] bg-[var(--dc-ink)]/95 backdrop-blur lg:hidden">
          {(["canvas", "chat"] as const).map((panel) => (
            <button
              key={panel}
              type="button"
              onClick={() => setMobilePanel(panel)}
              className={`px-3 py-2.5 dc-mono text-[11px] uppercase tracking-[0.12em] transition ${
                mobilePanel === panel
                  ? "bg-[var(--dc-signal-soft)] text-[var(--dc-signal)]"
                  : "text-[var(--dc-dim)] hover:text-[var(--dc-mute)]"
              }`}
            >
              {panel === "canvas"
                ? isRunning
                  ? `Canvas · ${activeStageLabel}`
                  : `Canvas ${progress.ready}/${progress.total || 0}`
                : lastError
                  ? "Chat · error"
                  : "Chat"}
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
            isRunning ? (
              <PlanningSkeleton
                stalled={stalled}
                queuePosition={queuePosition}
                estimatedWaitSec={estimatedWaitSec}
                onCancel={handleCancel}
              />
            ) : (
              <>
                {restoreFailed && (
                  <div className="flex items-center justify-between gap-3 border border-amber-400/30 bg-amber-500/10 px-4 py-2.5">
                    <p className="text-xs leading-5 text-amber-200/90">
                      Couldn&apos;t load this thread&apos;s canvas. Your previous work may need a refresh.
                    </p>
                    <button
                      type="button"
                      onClick={() => setRestoreFailed(false)}
                      className="font-mono text-[11px] uppercase tracking-[0.1em] text-amber-200/70 hover:text-amber-100"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
                <DevCutEmptyState
                  isRunning={isRunning}
                  onStart={(prompt) => injectPrompt(prompt)}
                />
              </>
            )
          ) : (
            <div className="relative flex flex-1 flex-col gap-3 overflow-auto">
              {/* Pipeline action bar */}
              {readyShots < totalShots && (
                <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--dc-line)] bg-[var(--dc-panel)] px-4 py-3">
                  <div>
                    <p className="dc-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dc-mute)]">
                      Progress · {readyShots}/{totalShots} shots ready
                    </p>
                    <p className="mt-1 text-sm text-[var(--dc-dim)]">
                      Generate remaining media, then stitch the cut.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={() => injectPrompt("Generate all references and all videos for every shot now. Call generate_all_references then generate_all_videos.")}
                      className="border border-transparent bg-[var(--dc-signal)] px-4 py-1.5 dc-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dc-ink)] hover:bg-[var(--dc-paper)] disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      Generate remaining
                    </button>
                    {readyShots > 0 && state.shots.some((s) => s.ref_image_url && !s.video_url) && (
                      <button
                        type="button"
                        disabled={isRunning}
                        onClick={() => injectPrompt("Generate all remaining videos now. Call generate_all_videos.")}
                        className="border border-[var(--dc-line)] px-3 py-1.5 dc-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dc-mute)] hover:text-[var(--dc-paper)] disabled:cursor-not-allowed disabled:opacity-30"
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
            onSend={handleComposeSend}
            preseededDraft={pendingCommission?.prompt ?? null}
            commissionHint={pendingCommission?.hint ?? null}
            isRunning={isRunning}
            progress={progress}
            lastError={lastError}
            shots={state.shots}
            storyboard={state.storyboard}
            canvasIsEmpty={totalShots === 0 && !isRunning}
            onCancel={handleCancel}
            onOpenKeys={() => {
              setShowKeyPanel(true);
              setMobilePanel("canvas");
            }}
            queuePosition={queuePosition}
            estimatedWaitSec={estimatedWaitSec}
            stalled={stalled}
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
    <div className="relative flex flex-1 flex-col items-center justify-center gap-6 px-3 py-8 sm:px-6 lg:py-0">
      <div className="w-full max-w-2xl border border-[var(--dc-signal)]/25 bg-[var(--dc-signal-soft)] px-4 py-3 text-left sm:hidden">
        <p className="text-xs leading-5 text-[var(--dc-signal)]">
          Desktop preferred — mobile works; canvas is denser on a larger screen.
        </p>
      </div>

      <div className="max-w-2xl space-y-2 text-center">
        <p className="dc-mono text-[11px] uppercase tracking-[0.18em] text-[var(--dc-cyan)]">
          {DEVCUT.name} · canvas
        </p>
        <h2 className="dc-display text-2xl font-semibold tracking-tight text-[var(--dc-paper)] md:text-3xl">
          What are you making?
        </h2>          <p className="mx-auto max-w-lg text-sm leading-6 text-[var(--dc-mute)]">
          Pick a brief and start a cut. DevCut generates Runway media, lands it on B2, and hands you a shareable MP4 + HyperFrames kit.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <button
            type="button"
            disabled={isRunning}
            onClick={() => {
              setDoor("challenge");
              setDraft(DEVCUT_GOLDEN_CHALLENGE.brief);
            }}
            className="border border-transparent bg-[var(--dc-signal)] px-4 py-2 dc-mono text-[10px] uppercase tracking-[0.12em] text-[var(--dc-ink)] hover:bg-[var(--dc-paper)] disabled:opacity-40"
          >
            Golden brief
          </button>
          <button
            type="button"
            disabled={isRunning}
            onClick={() => {
              setDoor("submit");
              setDraft(DEVCUT_HF_DEMO.brief);
            }}
            className="border border-[var(--dc-cyan)]/45 bg-[var(--dc-cyan-soft)] px-4 py-2 dc-mono text-[10px] uppercase tracking-[0.12em] text-[var(--dc-cyan)] hover:bg-[var(--dc-cyan)]/20 disabled:opacity-40"
          >
            HyperFrames brief
          </button>
        </div>
      </div>

      <div className="grid w-full max-w-3xl gap-0 border border-[var(--dc-line)] md:grid-cols-3">
        {DEVCUT_DOORS.map((d, i) => {
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
              className={`px-4 py-4 text-left transition-colors md:border-l md:first:border-l-0 ${
                i > 0 ? "border-t border-[var(--dc-line)] md:border-t-0" : ""
              } ${
                selected
                  ? d.id === "submit"
                    ? "bg-[var(--dc-cyan-soft)]"
                    : "bg-[var(--dc-signal-soft)]"
                  : "bg-[var(--dc-panel)] hover:bg-white/[0.03]"
              }`}
            >
              <p className="dc-mono text-[10px] uppercase tracking-[0.14em] text-[var(--dc-dim)]">
                {d.label}
              </p>
              <p className="dc-display mt-2 text-sm font-semibold text-[var(--dc-paper)]">
                {d.title}
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--dc-mute)]">{d.body}</p>
            </button>
          );
        })}
      </div>

      <div className="w-full max-w-3xl border border-[var(--dc-line)] bg-[var(--dc-panel)] text-left">
        {door === "agent" ? (
          <div className="p-4">
            <AgentPaymentsPanel embedded />
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--dc-line)] px-4 py-2.5">
              <span className="dc-mono text-[10px] uppercase tracking-[0.14em] text-[var(--dc-dim)]">
                Start with a seed
              </span>
              {examples.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => setDraft(ex.brief)}
                  className={`border px-2.5 py-1 dc-mono text-[10px] uppercase tracking-[0.1em] ${
                    draft === ex.brief
                      ? "border-[var(--dc-signal)]/55 bg-[var(--dc-signal-soft)] text-[var(--dc-signal)]"
                      : "border-transparent text-[var(--dc-dim)] hover:text-[var(--dc-mute)]"
                  }`}
                >
                  {ex.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-stretch">
              <textarea
                id="director-empty-brief"
                name="brief"
                aria-label="Cut brief"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className="min-h-[5rem] w-full flex-1 resize-y border border-[var(--dc-line)] bg-black/50 px-3 py-2.5 dc-mono text-sm leading-6 text-[var(--dc-paper)] outline-none focus:border-[var(--dc-cyan)]/50"
              />
              <button
                type="button"
                disabled={isRunning || !draft.trim()}
                onClick={() => onStart(`${active.prompt} ${draft.trim()}`)}
                className="shrink-0 self-stretch bg-[var(--dc-signal)] px-5 py-3 dc-mono text-xs font-medium uppercase tracking-[0.12em] text-[var(--dc-ink)] hover:bg-[var(--dc-paper)] disabled:opacity-40 sm:min-w-[10rem]"
              >
                {door === "challenge" ? "Start Challenge Cut" : "Start Submit Ready cut"}
              </button>
            </div>
          </div>
        )}
      </div>

      {!AVATAR_CONFIGURED && AvatarShowcase && <AvatarShowcase progressNarration={null} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page chrome
// ---------------------------------------------------------------------------

function DirectorPage() {
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  // Deep-links from landing ("View previous cut") select a prior thread.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("thread");
    if (!t) return;
    setThreadId(t);
    const url = new URL(window.location.href);
    url.searchParams.delete("thread");
    window.history.replaceState({}, "", url.toString());
  }, []);
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
      <AuthSessionProvider>
        <DirectorPage />
      </AuthSessionProvider>
    </ClientOnly>
  );
}
