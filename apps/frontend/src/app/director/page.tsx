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
import { ExportPanel } from "@/components/storyboard/ExportPanel";
import { ApiKeyPanel, useRunwayApiKey } from "@/components/storyboard/ApiKeyPanel";
import { StoryboardTimeline } from "@/components/storyboard/StoryboardTimeline";
import { ShotPreview } from "@/components/storyboard/ShotPreview";
import { ToolFallbackCard } from "@/components/copilot/ToolFallbackCard";
import { AvatarShowcase } from "@/components/storyboard/AvatarShowcase";
import { CanvasLoadingOverlay } from "@/components/storyboard/CanvasLoadingOverlay";

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
            Loading director
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
    grove_uri: partial.grove_uri ?? null,
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
  "Sci-fi opener: lone astronaut, glass-domed alien city, golden hour. 4 shots.",
  "Product reveal: ceramic coffee mug, studio light, slow rotation. 4 shots.",
  "Travel reel: Lisbon at blue hour — trams, tiles, the river. 5 shots.",
  "TikTok teaser: indie band 'Static Garden', neon, vertical. 3 shots, 720:1280.",
];

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
        label: "Storyboard",
        detail: total > 0 ? `${total} shots planned` : isRunning ? "Planning your storyboard…" : "Waiting for a brief",
        status: total > 0 ? "done" : isRunning ? "active" : "waiting",
      },
      {
        label: "Reference stills",
        detail: total > 0 ? `${refs}/${total} stills ready` : isRunning ? "Queued" : "Starts after planning",
        status: refs === total && total > 0 ? "done" : total > 0 && isRunning ? "active" : "waiting",
      },
      {
        label: "Motion clips",
        detail: total > 0 ? `${videos}/${total} clips ready` : isRunning ? "Queued" : "Starts after stills",
        status: videos === total && total > 0 ? "done" : refs > 0 && isRunning ? "active" : "waiting",
      },
      {
        label: "Final cut",
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
const STAGE_ESTIMATES: Record<string, number> = {
  "Storyboard": 15,
  "Reference stills": 60,
  "Motion clips": 180,
  "Final cut": 30,
};

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
}: {
  onSend: (msg: string) => void;
  isRunning: boolean;
  progress: AgentProgress;
  lastError: string | null;
  onRetry: () => void;
}) {
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
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", content: trimmed },
    ]);
    onSend(trimmed);
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
              Suggestions
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSend(s)}
                className="block w-full rounded-lg border border-white/10 px-3 py-2.5 text-left text-xs leading-relaxed text-white/70 transition-colors hover:border-white/25 hover:text-white/90"
              >
                {s}
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
                Agent working
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
                return (
                  <div key={stage.label} className="flex items-start gap-3">
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
                      <p className="truncate text-[11px] text-white/55">{stage.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] leading-4 text-white/35">
              A full run takes ~5 min. Runway generates each clip in parallel — stills first, then video.
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
            placeholder="Describe your scene…"
            rows={2}
            className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white/85 placeholder:text-white/45 focus:border-white/35 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => handleSend(draft)}
            disabled={!draft.trim() || isRunning}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.12em] text-white/75 transition-colors hover:bg-white/20 hover:text-white/90 disabled:opacity-30"
          >
            Cut
          </button>
        </div>
        <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-white/45">
          ↵ send · shift+↵ newline
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main canvas
// ---------------------------------------------------------------------------


function DirectorCanvas({ onStoryboardChange }: { onStoryboardChange?: (s: Storyboard) => void }) {
  // Must pass agentId: "director" — see useLiveStoryboardState above.
  const { agent } = useAgent({ agentId: "director" });
  const { copilotkit } = useCopilotKit();
  const [showKeyPanel, setShowKeyPanel] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"canvas" | "chat">("canvas");
  const { key: runwayKey } = useRunwayApiKey();

  // Auto-inject ?brief= from landing page
  const briefInjectedRef = useRef(false);
  useEffect(() => {
    if (briefInjectedRef.current || !agent) return;
    const params = new URLSearchParams(window.location.search);
    const brief = params.get("brief");
    if (!brief) return;
    briefInjectedRef.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("brief");
    window.history.replaceState({}, "", url.toString());
    setTimeout(() => injectPrompt(brief), 800);
  }, [agent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep suggestions registered (used by the chat component)
  useConfigureSuggestions({
    available: "before-first-message",
    suggestions: SUGGESTIONS.map((s) => ({ title: s.split(":")[0], message: s })),
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
      void copilotkit.runAgent({ agent }).catch((error: unknown) => {
        console.error("injectPrompt: runAgent failed", error);
        const msg =
          error && typeof error === "object" && "message" in error
            ? String((error as { message: unknown }).message)
            : "Agent run failed";
        setLastError(msg);
        toast.error(msg, { duration: 6000 });
      }).finally(() => {
        setIsRunning(false);
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

  const state = mergeStoryboardState(agent?.state);
  const progress = useMemo(() => getAgentProgress(state, isRunning), [state, isRunning]);

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
      <ToolFallbackCard name={name} status={status} result={result} parameters={parameters} />
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
          />

          {showKeyPanel && <ApiKeyPanel onClose={() => setShowKeyPanel(false)} isLive={state.storyboard.runway_mode === "LIVE"} />}

          {totalShots === 0 ? (
            /* Empty state — hero onboarding with optional avatar */
            <div className="relative flex flex-1 flex-col items-center justify-center gap-8 px-3 py-8 text-center sm:px-6 lg:py-0">
              {/* Loading overlay — shown on canvas while agent works */}
              <CanvasLoadingOverlay
                isRunning={isRunning}
                stages={progress.stages}
                shotCount={progress.total}
                refsReady={progress.refs}
                videosReady={progress.videos}
              />

              {/* Mobile warning */}
              <div className="w-full max-w-2xl rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-left sm:hidden">
                <p className="text-xs leading-5 text-amber-300/80">
                  Director&apos;s Canvas is optimised for desktop. On mobile you can browse and send briefs, but the canvas view works best on a larger screen.
                </p>
              </div>

              <div className="max-w-2xl space-y-4">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-white/60">
                  One brief → storyboard → clips → final cut
                </p>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight text-white/92 md:text-3xl">
                    Start with one line.
                  </h2>
                  <p className="mx-auto max-w-xl text-sm leading-6 text-white/70 md:text-[15px]">
                    Describe the scene in chat. Director&apos;s Canvas will break it into shots,
                    generate reference stills, animate each shot, and assemble a shareable MP4.
                  </p>
                </div>
              </div>

              {/* Quick-start brief chips */}
              <div className="w-full max-w-2xl">
                <p className="mb-3 text-left font-mono text-[11px] uppercase tracking-[0.16em] text-white/45">
                  Quick start
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={isRunning}
                      onClick={() => injectPrompt(s)}
                      className="group rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-left text-xs leading-relaxed text-white/65 transition-all hover:border-white/18 hover:bg-white/[0.06] hover:text-white/85 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Avatar showcase — live Runway Characters call or branded placeholder */}
              <AvatarShowcase progressNarration={isRunning ? (progress.stages.find(s => s.status === "active")?.detail ?? null) : null} />

              <div className="grid w-full max-w-3xl gap-3 text-left md:grid-cols-3">
                {[
                  ["1", "Enter a brief", "Use a suggestion above or describe a scene in one sentence."],
                  ["2", "Review shots", "Select a shot to inspect prompts, stills, and generated clips."],
                  ["3", "Export final cut", "When every shot is ready, stitch everything into one MP4."],
                ].map(([step, title, body]) => (
                  <div key={step} className="rounded-xl border border-white/10 bg-white/[0.045] p-4">
                    <p className="font-mono text-xs uppercase tracking-[0.14em] text-white/58">
                      Step {step}
                    </p>
                    <p className="mt-2 text-sm font-medium text-white/88">{title}</p>
                    <p className="mt-1 text-sm leading-6 text-white/68">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="relative flex flex-1 flex-col gap-3 overflow-auto">
              {/* Loading overlay — shown on canvas while agent works */}
              <CanvasLoadingOverlay
                isRunning={isRunning}
                stages={progress.stages}
                shotCount={progress.total}
                refsReady={progress.refs}
                videosReady={progress.videos}
              />

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
                <ExportPanel
                  exportStatus={state.export_status}
                  exportError={state.export_error}
                  finalVideoUrl={state.final_video_url}
                  groveUri={state.grove_uri}
                  storyboardTitle={state.storyboard.title}
                  onExport={handleExport}
                  onDownload={handleDownloadFinal}
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
                <ExportPanel
                  exportStatus={state.export_status}
                  exportError={state.export_error}
                  finalVideoUrl={state.final_video_url}
                  groveUri={state.grove_uri}
                  storyboardTitle={state.storyboard.title}
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
// Page
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
        <CopilotChatConfigurationProvider agentId="director" threadId={threadId}>
          <DirectorCanvas onStoryboardChange={handleStoryboardChange} />
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
