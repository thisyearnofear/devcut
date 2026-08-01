// Mirrors `StoryboardCanvasState` in apps/agent/src/storyboard_state.py.
// Keep field names identical — the agent writes these via Command(update=)
// or via frontend tools, and the frontend reads them off agent.state.

export type ShotStatus = "pending" | "image" | "ready" | "error";

export type AspectRatio = "1280:720" | "720:1280";

export interface Shot {
  id: string;
  index: number;
  beat: string;
  prompt: string;
  ref_image_url: string | null;
  video_url: string | null;
  status: ShotStatus;
  /** Short human-readable progress label emitted by the agent during generation. */
  progress_label: string | null;
  error: string | null;
  duration: number;
  aspect_ratio: AspectRatio;
}

export interface Storyboard {
  title: string;
  logline: string;
  aspect_ratio: AspectRatio;
  runway_mode: "LIVE" | "MOCK" | string;
  stitch_mode?: "LIVE" | "MOCK" | string;
  /** ref_image_url of shot 0 — used as the character/style anchor for all subsequent shots. */
  style_ref_url?: string | null;
}

export type ExportStatus = "idle" | "stitching" | "ready" | "error";

export interface StoryboardState {
  storyboard: Storyboard;
  shots: Shot[];
  selectedShotId: string | null;
  header: { title: string; subtitle: string };
  /** Final concatenated MP4. Set by the backend `stitch_final_cut` tool. */
  final_video_url: string | null;
  /** Durable Backblaze B2 URL for the final cut (when Genblaze/B2 is enabled). */
  durable_url: string | null;
  /** Genblaze provenance manifest URI (JSON in B2) for the last video/export run. */
  manifest_uri: string | null;
  export_status: ExportStatus;
  export_error: string | null;
}

export const initialStoryboardState: StoryboardState = {
  storyboard: {
    title: "",
    logline: "",
    aspect_ratio: "1280:720",
    // Default to LIVE — the agent will downgrade to MOCK if no server key is
    // available. This ensures users with a key get live generation immediately
    // without having to toggle anything.
    runway_mode: "LIVE",
    stitch_mode: "LIVE",
    style_ref_url: null,
  },
  shots: [],
  selectedShotId: null,
  header: {
    title: "DevCut",
    subtitle: "Hackathon video desk",
  },
  final_video_url: null,
  durable_url: null,
  manifest_uri: null,
  export_status: "idle",
  export_error: null,
};

export const STATUS_LABEL: Record<ShotStatus, string> = {
  pending: "Pending",
  image: "Generating still…",
  ready: "Ready",
  error: "Error",
};

export const STATUS_COLOR: Record<ShotStatus, string> = {
  pending: "#94a3b8",
  image: "#fbbf24",
  ready: "#34d399",
  error: "#f87171",
};
