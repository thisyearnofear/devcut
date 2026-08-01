/** DevCut product constants — single source for doors, prompts, brand. */

export const DEVCUT = {
  name: "DevCut",
  tagline: "The video desk for hackathons",
  description:
    "Organizers commission challenge reference films. Builders enhance HyperFrames submissions into Devpost-ready cuts. Agents pay per job via x402.",
} as const;

export type DevCutDoorId = "challenge" | "submit" | "agent";

export interface DevCutDoor {
  id: DevCutDoorId;
  label: string;
  title: string;
  body: string;
  /** Prompt injected into the director agent when the door is chosen. */
  prompt: string;
  /** Optional external href for the agent door. */
  href?: string;
}

export const DEVCUT_DOORS: DevCutDoor[] = [
  {
    id: "challenge",
    label: "I’m hosting a hackathon",
    title: "Challenge Cut",
    body: "Turn your prize brief and judging criteria into a 30–60s reference film builders can’t misread — plus a forkable kit.",
    prompt: [
      "Mode: Challenge Cut (hackathon organizer).",
      "Create a ~45s challenge reference film that visually specs what winning looks like.",
      "Shot grammar (use these beats, adapt wording to the brief):",
      "1) Problem — who hurts and why.",
      "2) Constraint — stack / API / rules builders must use.",
      "3) Winning artifact — what judges should open.",
      "4) Anti-pattern — what not to build.",
      "5) CTA — fork the kit / start building.",
      "Call generate_storyboard_plan, then generate_all_references, generate_all_videos, and stitch_final_cut.",
      "After export, the canvas attaches a HyperFrames handoff (BRIEF.md + assets/devcut/). Remind the builder: HF owns composition HTML.",
      "Brief follows:",
    ].join(" "),
  },
  {
    id: "submit",
    label: "I’m submitting",
    title: "Submit Ready",
    body: "From a HyperFrames project, repo, or product URL — generative heroes + packaging into a Devpost-ready MP4.",
    prompt: [
      "Mode: Submit Ready (hackathon builder).",
      "Create a Devpost / product-launch demo cut.",
      "Shot grammar: problem → product → proof (demo or metric) → optional CTA.",
      "Prefer landscape 1280:720 unless the brief says vertical / TikTok / Reels.",
      "Call generate_storyboard_plan, then generate_all_references, generate_all_videos, and stitch_final_cut.",
      "After export, point at the HyperFrames handoff panel — paste BRIEF.md, stage heroes under assets/devcut/, finish in HF.",
      "Project / URL / brief follows:",
    ].join(" "),
  },
  {
    id: "agent",
    label: "I’m an agent",
    title: "OpenAPI + x402",
    body: "Start a metered job — unlock the canvas. Protocol probe under Integrators.",
    prompt: "",
    href: "/director?mode=agent",
  },
];

/** Fixed HyperFrames-track demo — partner walkthrough without door shopping. */
export const DEVCUT_HF_DEMO = {
  label: "HyperFrames track demo",
  mode: "submit" as const,
  brief:
    "Submit Ready for a HyperFrames product-launch project: generative hero shots around a problem → product → proof arc. Product: HTML→video for agents (HyperFrames). After stitch, builders paste BRIEF.md and stage assets/devcut/ — HyperFrames keeps composition ownership. DevCut only supplies Runway heroes + packaging.",
} as const;

/**
 * Golden Challenge Cut — Genblaze + B2 visual judging spec.
 * Full notes: docs/demos/golden-challenge-cut.md
 */
export const DEVCUT_GOLDEN_CHALLENGE = {
  label: "Golden · Genblaze+B2",
  scene: "Durable media · HF builder kit",
  mode: "challenge" as const,
  titleHint: "Genblaze + B2 Challenge Cut",
  brief: [
    "Hackathon: Backblaze Generative Media (Genblaze + B2 track).",
    "Audience: builders shipping creator/agent video tools under time pressure.",
    "Judging: must use Genblaze (or equivalent) + Backblaze B2 for durable storage and provenance.",
    "HyperFrames (or HTML→video) is the preferred composition path for the final Devpost cut.",
    "Show what winning looks like in ~45s:",
    "1) Problem — gorgeous local demo; judges can't open assets Monday; links 404; no provenance.",
    "2) Constraint — Runway-class generate + persist stills/clips/finals to B2 with a verifiable manifest.",
    "3) Winning artifact — public durable MP4 + manifest JSON + HyperFrames BRIEF/assets drop.",
    "4) Anti-pattern — BYOK chaos, laptop-only files, fake NLE competing with HyperFrames.",
    "5) CTA — fork the builder kit; pin this Challenge Cut in Discord.",
    'Title the piece "Genblaze + B2 Challenge Cut".',
  ].join(" "),
} as const;

/** Example briefs that reinforce the wedge (not generic cinema). */
export const DEVCUT_CHALLENGE_EXAMPLES = [
  {
    label: DEVCUT_GOLDEN_CHALLENGE.label,
    scene: DEVCUT_GOLDEN_CHALLENGE.scene,
    brief: DEVCUT_GOLDEN_CHALLENGE.brief,
  },
  {
    label: "HyperFrames track",
    scene: "HTML compositions · Agent-authored MP4",
    brief:
      "HyperFrames builder challenge: winning submissions are code-native HTML compositions with a clear product story. Show the bar — data chart beat, product UI motion, Devpost-ready cut.",
  },
  {
    label: "x402 agent payments",
    scene: "Pay-per-job · No API key paste",
    brief:
      "x402 agent track: builders meter paid APIs via spending sessions. Visualize a winning flow where an agent buys a video job, gets assets back, and never holds a vendor key.",
  },
] as const;

export const DEVCUT_SUBMIT_EXAMPLES = [
  {
    label: "Product URL",
    scene: "SaaS landing → launch cut",
    brief:
      "https://hyperframes.heygen.com — Submit Ready polish: problem → product → proof for a Devpost demo of HyperFrames as HTML→video for agents.",
  },
  {
    label: "Repo demo",
    scene: "GitHub → submission film",
    brief:
      "Repo https://github.com/heygen-com/hyperframes — Submit Ready: 30s Devpost cut explaining write-HTML-render-video for hackathon judges.",
  },
  {
    label: "HF project note",
    scene: "Existing composition → heroes",
    brief:
      "Submit Ready for a HyperFrames product-launch project: add generative hero shots around a data-chart beat and stitch a Devpost MP4. Product: a developer API that meters generative media via x402.",
  },
] as const;
