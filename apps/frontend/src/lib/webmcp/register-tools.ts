"use client";

import { directorController } from "./controller";
import type { StoryboardState } from "@/lib/storyboard/types";

type ToolRegistrar = NonNullable<Document["modelContext"]>["registerTool"];
type ToolDef = Parameters<ToolRegistrar>[0];

/**
 * Build the JSON-serialisable summary agents read from the canvas. Returns an
 * `{ error }` shape (not a throw) when the canvas is not initialised so the
 * agent can self-diagnose instead of receiving an exception.
 */
function storyboardSummary(state: StoryboardState | null) {
  if (!state) return { error: "canvas not initialized" };
  return {
    title: state.storyboard.title,
    logline: state.storyboard.logline,
    aspect_ratio: state.storyboard.aspect_ratio,
    runway_mode: state.storyboard.runway_mode,
    export_status: state.export_status,
    final_video_url: state.final_video_url,
    durable_url: state.durable_url,
    hyperframes_kit_available: Boolean(state.builder_kit),
    // Read isRunning through the controller so a stale effect closure can never
    // report a finished run as "still running" (bug class #1 in the playbook).
    is_running: directorController.hasActions()
      ? directorController.requireActions().isRunning()
      : false,
    shots: state.shots.map((s) => ({
      id: s.id,
      index: s.index,
      beat: s.beat,
      status: s.status, // pending | image | ready | error
      error: s.error ?? undefined, // lets agents self-diagnose failing shots
      prompt: s.prompt,
      ref_image_url: s.ref_image_url ?? undefined,
      video_url: s.video_url ?? undefined,
      progress_label: s.progress_label ?? undefined,
    })),
  };
}

/** Read-only tools — register always (anonymous browsing preserved). */
export const readOnlyTools: ToolDef[] = [
  {
    name: "get_storyboard_state",
    description:
      "Read the current DevCut storyboard canvas: brief (title/logline), " +
      "every shot with generation status and error details, whether a run " +
      "is executing, and the final cut URL when exported. Poll this after " +
      "starting work rather than assuming completion.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute: async () => storyboardSummary(directorController.snapshot()),
  },
  {
    name: "get_export",
    description:
      "Get export artifacts for a finished cut: MP4 URLs (final + durable), " +
      "HyperFrames builder-kit availability (BRIEF.md + asset drop map). " +
      "Returns an error string if nothing is exported yet.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute: async () => {
      const s = directorController.snapshot();
      if (!s?.final_video_url && !s?.durable_url)
        return { error: "No cut exported yet. Start a run first." };
      return {
        final_video_url: s.final_video_url,
        durable_url: s.durable_url,
        sha256: s.final_sha256,
        hyperframes_kit: s.builder_kit
          ? { summary: s.builder_kit.summary, asset_count: s.builder_kit.assets.length }
          : null,
      };
    },
  },
];

/**
 * Mutating tools — register ONLY for an authenticated (or auth-disabled)
 * session. `isAuthed` is read fresh at execute time (ref-backed on the page)
 * as defense-in-depth: WebMCP executes in-page so server endpoints are
 * cookie-protected anyway (BFF auth gate + vault/budget middleware), but we
 * fail fast and tell the agent why.
 */
export function mutatingTools(isAuthed: () => boolean): ToolDef[] {
  return [
    {
      name: "start_cutdown",
      description:
        "Commission a Challenge Cut from a text brief. STARTS generation " +
        "(shot plan → reference images → clips → stitch) and returns " +
        "immediately; it does NOT block. Poll get_storyboard_state. Fails " +
        "if a run is already active.",
      inputSchema: {
        type: "object",
        properties: { brief: { type: "string", description: "The cut's premise/logline" } },
        required: ["brief"],
      },
      annotations: { destructiveHint: true },
      execute: async ({ brief }) => {
        if (!isAuthed()) return { error: "Sign in on this page to run cuts." };
        const a = directorController.requireActions();
        if (a.isRunning()) return { error: "A run is already active." };
        a.startRun(String(brief));
        return { started: true, note: "Poll get_storyboard_state for progress." };
      },
    },
    {
      name: "regenerate_shot",
      description:
        "Re-generate one shot by shot id (exact id from get_storyboard_state), " +
        "e.g. after an error or to improve it. Returns immediately; poll for results.",
      inputSchema: {
        type: "object",
        properties: { shot_id: { type: "string" } },
        required: ["shot_id"],
      },
      annotations: { destructiveHint: true },
      execute: async ({ shot_id }) => {
        if (!isAuthed()) return { error: "Sign in on this page to run cuts." };
        const shot = directorController.snapshot()?.shots.find((x) => x.id === shot_id);
        if (!shot) return { error: `Unknown shot id "${String(shot_id)}".` };
        directorController.requireActions().regenerateShot(shot.id);
        return { started: true, shot_id: shot.id };
      },
    },
    {
      name: "cancel_run",
      description:
        "Cancel the in-flight run. Completed shots are kept and stay visible.",
      inputSchema: { type: "object", properties: {} },
      annotations: { destructiveHint: true },
      execute: async () => {
        if (!isAuthed()) return { error: "Sign in on this page to run cuts." };
        const a = directorController.requireActions();
        if (!a.isRunning()) return { error: "No run is active." };
        a.cancelRun(); // → agent.abortRun()
        return { cancelled: true };
      },
    },
  ];
}
