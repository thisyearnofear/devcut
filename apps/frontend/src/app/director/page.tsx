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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
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
  };
}

function useLiveStoryboardState() {
  const { agent } = useAgent();
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

function DirectorChat({
  onSend,
  isRunning,
}: {
  onSend: (msg: string) => void;
  isRunning: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    <div className="flex h-full flex-col bg-sidebar border-l border-sidebar-border">
      {/* Messages */}
      <div
        ref={messagesRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0"
      >
        {showSuggestions ? (
          <div className="space-y-3 pt-2">
            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/25">
              Suggestions
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSend(s)}
                className="block w-full rounded-lg border border-white/10 px-3 py-2.5 text-left text-[11px] leading-relaxed text-white/50 transition-colors hover:border-white/25 hover:text-white/80"
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
                className={`max-w-[85%] rounded-xl px-3 py-2 text-[11px] leading-relaxed ${
                  m.role === "user"
                    ? "bg-white/10 text-white/90"
                    : "text-white/60"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
        {isRunning && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 px-1 py-2">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1 rounded-full bg-white/30 animate-pulse"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
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
            className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-[11px] text-white/80 placeholder:text-white/25 focus:border-white/25 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => handleSend(draft)}
            disabled={!draft.trim() || isRunning}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-white/60 transition-colors hover:bg-white/20 hover:text-white/90 disabled:opacity-30"
          >
            Cut
          </button>
        </div>
        <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-white/20">
          ↵ send · shift+↵ newline
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main canvas
// ---------------------------------------------------------------------------

const RUNWAY_WIDGET_KEY = "pub_01163893d305f4fceb059eba9fc49e8f7b9a53f19cd9f4235fe7486bd54f40b2";

function DirectorCanvas({ onStoryboardChange }: { onStoryboardChange?: (s: Storyboard) => void }) {
  const { agent } = useAgent();
  const { copilotkit } = useCopilotKit();
  const [showKeyPanel, setShowKeyPanel] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
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
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `msg-${Date.now()}`;
      agent.addMessage({ id, role: "user", content: prompt });
      setIsRunning(true);
      void copilotkit.runAgent({ agent }).catch((error: unknown) => {
        console.error("injectPrompt: runAgent failed", error);
        const msg =
          error && typeof error === "object" && "message" in error
            ? String((error as { message: unknown }).message)
            : "Agent run failed";
        toast.error(msg, { duration: 6000 });
      }).finally(() => setIsRunning(false));
    },
    [agent, copilotkit],
  );

  const state = mergeStoryboardState(agent?.state);

  useEffect(() => {
    onStoryboardChange?.(state.storyboard);
  }, [state.storyboard, onStoryboardChange]);

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
      <div className="flex h-screen overflow-hidden bg-background">

        {/* Canvas */}
        <main className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden p-4">
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
            /* Empty state — Runway widget as the hero onboarding */
            <div className="flex flex-1 flex-col items-center justify-center gap-8">
              {/* Runway Characters widget */}
              <div className="w-full max-w-sm">
                <runway-widget
                  pub-key={RUNWAY_WIDGET_KEY}
                  style={{ width: "100%", borderRadius: "12px", overflow: "hidden" }}
                />
              </div>
              <div className="text-center">
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/30">
                  Describe your scene in the chat →
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Pipeline action bar */}
              {readyShots < totalShots && (
                <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-2.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/40">
                    {readyShots}/{totalShots} shots ready
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => injectPrompt("Generate all references and all videos for every shot now. Call generate_all_references then generate_all_videos.")}
                      className="rounded-full border border-white/20 bg-white/10 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-white/70 hover:bg-white/20 hover:text-white"
                    >
                      ⚡ Run pipeline
                    </button>
                    {readyShots > 0 && state.shots.some((s) => s.ref_image_url && !s.video_url) && (
                      <button
                        type="button"
                        onClick={() => injectPrompt("Generate all remaining videos now. Call generate_all_videos.")}
                        className="rounded-full border border-white/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-white/40 hover:text-white/70"
                      >
                        Animate remaining
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Export trigger */}
              {readyShots > 0 && readyShots === totalShots && state.export_status === "idle" && (
                <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-2.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/40">
                    All {totalShots} shots ready
                  </span>
                  <button
                    type="button"
                    onClick={handleExport}
                    className="rounded-full border border-white/30 bg-white/15 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-white/80 hover:bg-white/25 hover:text-white"
                  >
                    🎬 Export final cut
                  </button>
                </div>
              )}

              <StoryboardTimeline
                shots={state.shots}
                selectedShotId={state.selectedShotId}
                onSelect={handleSelect}
                onRegenerate={handleRegenerate}
                onDownload={handleDownload}
              />

              {state.export_status !== "idle" && (
                <ExportPanel
                  exportStatus={state.export_status}
                  exportError={state.export_error}
                  finalVideoUrl={state.final_video_url}
                  storyboardTitle={state.storyboard.title}
                  onExport={handleExport}
                  onDownload={handleDownloadFinal}
                />
              )}
            </>
          )}

          {/* Selected shot detail */}
          {selectedShot && (
            <aside className="flex max-h-[38vh] shrink-0 flex-col gap-3 overflow-auto rounded-xl border border-white/10 bg-white/5 p-4 text-xs">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-white/70">
                  #{selectedShot.index + 1} · {selectedShot.beat}
                </p>
                <button
                  type="button"
                  onClick={() => handleSelect(selectedShot.id)}
                  className="font-mono text-[9px] uppercase tracking-[0.15em] text-white/30 hover:text-white/60"
                >
                  Close
                </button>
              </div>
              <p className="text-[11px] leading-relaxed text-white/50">{selectedShot.prompt}</p>
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
                <button type="button" onClick={() => handleRegenerate(selectedShot.id)}
                  className="rounded-full border border-white/15 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-white/50 hover:text-white/80">
                  Regenerate
                </button>
                <button type="button"
                  onClick={() => injectPrompt(`Rewrite the prompt for shot ${selectedShot.id} with more cinematic detail, then regenerate it.`)}
                  className="rounded-full border border-white/15 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-white/50 hover:text-white/80">
                  Rewrite
                </button>
                {(selectedShot.ref_image_url || selectedShot.video_url) && (
                  <button type="button"
                    onClick={() => {
                      const url = selectedShot.video_url || selectedShot.ref_image_url!;
                      const ext = selectedShot.video_url ? ".mp4" : "_ref.png";
                      handleDownload(selectedShot.id, url, `${selectedShot.beat || `shot_${selectedShot.index + 1}`}${ext}`);
                    }}
                    className="rounded-full border border-white/15 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-white/50 hover:text-white/80">
                    ↓ Save
                  </button>
                )}
              </div>
            </aside>
          )}
        </main>

        {/* Chat panel */}
        <aside className="flex w-[360px] shrink-0 flex-col border-l border-white/10">
          <DirectorChat onSend={injectPrompt} isRunning={isRunning} />
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
          <DirectorCanvas onStoryboardChange={setStoryboard} />
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
