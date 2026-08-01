/** DevCut run-ledger copy — human labels for stages + backend tools. */

export const DEVCUT_STAGE_LABELS = {
  plan: "Brief → storyboard",
  stills: "Hero stills",
  clips: "Motion clips",
  export: "Devpost cut",
} as const;

export const DEVCUT_STAGE_ESTIMATES: Record<string, number> = {
  [DEVCUT_STAGE_LABELS.plan]: 15,
  [DEVCUT_STAGE_LABELS.stills]: 60,
  [DEVCUT_STAGE_LABELS.clips]: 180,
  [DEVCUT_STAGE_LABELS.export]: 30,
};

export const DEVCUT_PLANNING_PHRASES = [
  "Reading the hackathon brief…",
  "Mapping Challenge / Submit beats…",
  "Composing the shot list…",
  "Structuring problem → product → proof…",
  "Planning the builder kit…",
] as const;

interface ToolCopy {
  title: string;
  /** One-line status while running / when done (args optional). */
  summarize: (args: Record<string, unknown> | undefined, done: boolean) => string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function shotHint(args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  const id = args.shot_id ?? args.shotId;
  if (typeof id === "string" && id.length > 0) return ` · ${id.slice(0, 12)}`;
  const idx = args.shot_index ?? args.index;
  if (typeof idx === "number") return ` · shot ${idx + 1}`;
  return "";
}

const TOOL_COPY: Record<string, ToolCopy> = {
  generate_storyboard_plan: {
    title: "Plan storyboard",
    summarize: (_a, done) =>
      done ? "Shot list laid onto the canvas" : "Decomposing brief into beats",
  },
  generate_shot_reference: {
    title: "Generate still",
    summarize: (a, done) =>
      done ? `Still ready${shotHint(a)}` : `Generating still${shotHint(a)}`,
  },
  generate_all_references: {
    title: "Batch stills",
    summarize: (_a, done) =>
      done ? "Hero stills complete" : "Generating reference stills in parallel",
  },
  generate_shot_video: {
    title: "Animate clip",
    summarize: (a, done) =>
      done ? `Clip ready${shotHint(a)}` : `Animating still → clip${shotHint(a)}`,
  },
  generate_all_videos: {
    title: "Batch clips",
    summarize: (_a, done) =>
      done ? "Motion clips complete" : "Animating clips in parallel",
  },
  regenerate_shot: {
    title: "Regenerate shot",
    summarize: (a, done) =>
      done ? `Shot refreshed${shotHint(a)}` : `Regenerating${shotHint(a)}`,
  },
  stitch_final_cut: {
    title: "Stitch final cut",
    summarize: (_a, done) =>
      done ? "MP4 ready for Devpost / kit" : "Stitching clips into one MP4",
  },
  selectShot: {
    title: "Select shot",
    summarize: (a, done) =>
      done ? `Focused${shotHint(a)}` : `Opening shot${shotHint(a)}`,
  },
  updateShotPrompt: {
    title: "Update prompt",
    summarize: (a, done) =>
      done ? `Prompt saved${shotHint(a)}` : `Editing prompt${shotHint(a)}`,
  },
  renderShotPreview: {
    title: "Shot preview",
    summarize: (_a, done) => (done ? "Preview shown" : "Rendering preview"),
  },
  renderStoryboardSummary: {
    title: "Storyboard summary",
    summarize: (_a, done) => (done ? "Summary shown" : "Summarizing canvas"),
  },
};

export function humanizeToolCall(
  name: string,
  status: string,
  parameters?: unknown,
): { title: string; summary: string; technicalName: string } {
  const args = asRecord(parameters);
  const isDone = status === "complete";
  const copy = TOOL_COPY[name];
  if (!copy) {
    return {
      title: name.replace(/_/g, " "),
      summary: isDone ? "Done" : status,
      technicalName: name,
    };
  }
  return {
    title: copy.title,
    summary: copy.summarize(args, isDone),
    technicalName: name,
  };
}

export { asRecord };
