"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Toaster, toast } from "sonner";
import {
  CopilotChatConfigurationProvider,
  CopilotSidebar,
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
  type StoryboardState,
  initialStoryboardState,
} from "@/lib/storyboard/types";
import { BriefHeader } from "@/components/storyboard/BriefHeader";
import { ExportPanel } from "@/components/storyboard/ExportPanel";
import { ApiKeyPanel, useRunwayApiKey } from "@/components/storyboard/ApiKeyPanel";
import { StoryboardTimeline } from "@/components/storyboard/StoryboardTimeline";
import { ShotPreview } from "@/components/storyboard/ShotPreview";
import { ToolFallbackCard } from "@/components/copilot/ToolFallbackCard";

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

function LiveShotPreview({
  shotId,
  beat,
}: {
  shotId: string;
  beat?: string;
}) {
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

function DirectorCanvas() {
  const { agent } = useAgent();
  const { copilotkit } = useCopilotKit();
  const [showKeyPanel, setShowKeyPanel] = useState(false);
  const { key: runwayKey } = useRunwayApiKey();

  useConfigureSuggestions({
    available: "before-first-message",
    suggestions: [
      {
        title: "Sci-fi opener",
        message:
          "Direct a 30-second sci-fi opening: a lone astronaut steps onto a glass-domed alien city at golden hour. 4 shots.",
      },
      {
        title: "Product reveal",
        message:
          "Direct a 20-second cinematic product reveal for a wireless ceramic coffee mug, premium minimalist style. 4 shots.",
      },
      {
        title: "Travel reel",
        message:
          "Direct a 25-second travel reel for Lisbon at blue hour — trams, azulejo tiles, the river. 5 shots.",
      },
      {
        title: "Vertical TikTok",
        message:
          "Direct a 15-second vertical TikTok teaser for an indie band's new track 'Static Garden'. 3 shots, 720:1280.",
      },
    ],
  });

  const injectPrompt = useCallback(
    (prompt: string) => {
      if (!agent) return;
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `msg-${Date.now()}`;
      agent.addMessage({ id, role: "user", content: prompt });
      void copilotkit.runAgent({ agent }).catch((error: unknown) => {
        console.error("injectPrompt: runAgent failed", error);
        const msg =
          error && typeof error === "object" && "message" in error
            ? String((error as { message: unknown }).message)
            : "Agent run failed";
        toast.error(msg, { duration: 6000 });
      });
    },
    [agent, copilotkit],
  );

  const state = mergeStoryboardState(agent?.state);

  const updateState = useCallback(
    (updater: (prev: StoryboardState) => StoryboardState) => {
      agent?.setState(updater(mergeStoryboardState(agent?.state)));
    },
    [agent],
  );

  // ----- Frontend tools the director agent calls --------------------------

  useFrontendTool({
    name: "setHeader",
    description: "Set the workspace header (title and subtitle).",
    parameters: z.object({
      title: z.string().optional(),
      subtitle: z.string().optional(),
    }),
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
    description:
      "Edit a shot's prompt without regenerating media. Use when refining wording before regenerate_shot.",
    parameters: z.object({ shotId: z.string(), prompt: z.string() }),
    handler: async ({ shotId, prompt }) => {
      updateState((prev) => ({
        ...prev,
        shots: prev.shots.map((s) =>
          s.id === shotId ? { ...s, prompt } : s,
        ),
      }));
      return "prompt updated";
    },
  });

  useFrontendTool({
    name: "renderShotPreview",
    description:
      "Render an inline shot mini-card in chat. Pass shotId; optional beat label.",
    parameters: z.object({
      shotId: z.string(),
      beat: z.string().optional(),
    }),
    render: ({ args }) => (
      <LiveShotPreview shotId={args.shotId!} beat={args.beat} />
    ),
  });

  useFrontendTool({
    name: "renderStoryboardSummary",
    description:
      "Render a compact storyboard progress summary inline in chat. Takes no args.",
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
      />
    ),
  });

  // ----- Local UI handlers -----------------------------------------------

  // ----- Derived state -----------------------------------------------

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
      injectPrompt(
        `Regenerate shot ${id}. Call regenerate_shot then generate_shot_reference then generate_shot_video.`,
      );
    },
    [injectPrompt],
  );

  const handleDownload = useCallback(
    (_shotId: string, url: string, filename: string) => {
      // Create a temporary <a> element to trigger the download.
      // This works for same-origin URLs (Runway returns signed URLs
      // that are directly downloadable).
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
    [],
  );

  const handleDownloadFinal = useCallback((url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const handleExport = useCallback(() => {
    // Optimistically flip to "stitching" so the spinner appears immediately,
    // then let the agent tool update it to "ready" or "error".
    updateState((prev) => ({
      ...prev,
      export_status: "stitching",
      export_error: null,
    }));
    injectPrompt(
      "Stitch all ready shots into the final cut now. Call stitch_final_cut.",
    );
  }, [injectPrompt, updateState]);

  const selectedShot: Shot | undefined = state.selectedShotId
    ? state.shots.find((s) => s.id === state.selectedShotId)
    : undefined;

  return (
    <>
      <main className="flex h-screen flex-col gap-4 overflow-hidden bg-background px-6 py-6">
        <BriefHeader
          title={state.header.title}
          subtitle={state.header.subtitle}
          storyboard={state.storyboard}
          shotCount={state.shots.length}
          readyCount={readyShots}
          onKeyClick={() => setShowKeyPanel((v) => !v)}
          hasPersonalKey={Boolean(runwayKey)}
        />

        {showKeyPanel && (
          <ApiKeyPanel onClose={() => setShowKeyPanel(false)} />
        )}

        {state.shots.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
            <div className="max-w-lg space-y-4">
              <p className="text-base font-medium text-foreground">
                Give the director a brief
              </p>
              <p className="text-sm text-muted-foreground">
                The agent decomposes your brief into shots, generates a Runway
                reference still for each, animates every still into a clip, and
                stitches a final MP4 — all here on the canvas, in real time.
              </p>
              <p className="text-xs text-muted-foreground/70">
                Try a suggestion chip below, or type your own brief.{" "}
                {!runwayKey && (
                  <>
                    No Runway key?{" "}
                    <button
                      type="button"
                      onClick={() => setShowKeyPanel(true)}
                      className="underline hover:text-foreground"
                    >
                      Add yours
                    </button>{" "}
                    or run in MOCK mode — same UI, placeholder media, no credits.
                  </>
                )}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Pipeline action bar */}
            {totalShots > 0 && readyShots < totalShots && (
              <div className="flex items-center justify-between rounded-xl border border-border bg-card/60 p-3 shadow-sm">
                <p className="text-xs text-muted-foreground">
                  {readyShots}/{totalShots} shots ready
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      injectPrompt(
                        `Generate all references and all videos for every shot now. Call generate_all_references then generate_all_videos.`,
                      )
                    }
                    className="rounded-full border border-border bg-primary px-4 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    ⚡ Run Pipeline
                  </button>
                  {readyShots > 0 && state.shots.some((s) => s.ref_image_url && !s.video_url) && (
                    <button
                      type="button"
                      onClick={() =>
                        injectPrompt(
                          `Generate all remaining videos now. Call generate_all_videos.`,
                        )
                      }
                      className="rounded-full border border-border px-3 py-1.5 text-[11px] hover:bg-muted"
                    >
                      Generate Remaining Videos
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* All shots ready — show Export button when not yet exporting */}
            {readyShots > 0 &&
              readyShots === totalShots &&
              state.export_status === "idle" && (
                <div className="flex items-center justify-between rounded-xl border border-border bg-card/60 p-3 shadow-sm">
                  <p className="text-xs text-muted-foreground">
                    All {totalShots} shots ready
                  </p>
                  <button
                    type="button"
                    onClick={handleExport}
                    className="rounded-full border border-border bg-primary px-4 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    🎬 Export Final Cut
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

            {/* Export panel — visible once stitching starts */}
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

        {selectedShot ? (
          <aside className="flex max-h-[40vh] shrink-0 flex-col gap-3 overflow-auto rounded-xl border border-border bg-card/60 p-4 text-xs">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">
                #{selectedShot.index + 1} · {selectedShot.beat}
              </p>
              <button
                type="button"
                onClick={() => handleSelect(selectedShot.id)}
                className="text-[10px] uppercase text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
            <p className="text-muted-foreground">{selectedShot.prompt}</p>
            <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
              <span>Status: {selectedShot.status}</span>
              <span>Duration: {selectedShot.duration}s</span>
              <span>Aspect: {selectedShot.aspect_ratio}</span>
            </div>
            {selectedShot.video_url ? (
              <video
                src={selectedShot.video_url}
                poster={selectedShot.ref_image_url ?? undefined}
                controls
                playsInline
                className="max-h-[28vh] w-full rounded-lg bg-black object-contain"
              />
            ) : selectedShot.ref_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedShot.ref_image_url}
                alt={selectedShot.beat}
                className="max-h-[28vh] w-full rounded-lg object-contain"
              />
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleRegenerate(selectedShot.id)}
                className="rounded-full border border-border px-3 py-1 text-[11px] hover:bg-muted"
              >
                Regenerate
              </button>
              <button
                type="button"
                onClick={() =>
                  injectPrompt(
                    `Rewrite the prompt for shot ${selectedShot.id} with more cinematic detail, then regenerate it.`,
                  )
                }
                className="rounded-full border border-border px-3 py-1 text-[11px] hover:bg-muted"
              >
                Rewrite + regenerate
              </button>
              {(selectedShot.ref_image_url || selectedShot.video_url) && (
                <button
                  type="button"
                  onClick={() => {
                    const url = selectedShot.video_url || selectedShot.ref_image_url!;
                    const filename = selectedShot.video_url
                      ? `${selectedShot.beat || `shot_${selectedShot.index + 1}`}.mp4`
                      : `${selectedShot.beat || `shot_${selectedShot.index + 1}`}_ref.png`;
                    handleDownload(selectedShot.id, url, filename);
                  }}
                  className="rounded-full border border-border px-3 py-1 text-[11px] hover:bg-muted"
                >
                  ↓ Download
                </button>
              )}
            </div>
          </aside>
        ) : null}
      </main>

      <CopilotSidebar
        defaultOpen
        width={420}
        input={{ disclaimer: () => null, className: "pb-6" }}
      />

      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            error: "!bg-rose-50 !text-rose-900 !border !border-rose-200",
          },
        }}
      />
    </>
  );
}

function DirectorPage() {
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  return (
    <div className={drawerStyles.layout}>
      <ThreadsDrawer
        agentId="director"
        threadId={threadId}
        onThreadChange={setThreadId}
      />
      <div className={drawerStyles.mainPanel}>
        <CopilotChatConfigurationProvider
          agentId="director"
          threadId={threadId}
        >
          <DirectorCanvas />
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
