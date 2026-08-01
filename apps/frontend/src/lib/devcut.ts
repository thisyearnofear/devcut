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
      "After export, reply with a short Builder Kit: shot list, HyperFrames BRIEF.md seed bullets, and 3 non-goals.",
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
      "Keep narration optional; prioritize clear product visuals.",
      "Project / URL / brief follows:",
    ].join(" "),
  },
  {
    id: "agent",
    label: "I’m an agent",
    title: "OpenAPI + x402",
    body: "Live catalog · HTTP 402 · demo or facilitator settle · canvas unlock. SKUs: challenge_film, submission_polish, hero_shot_pack.",
    prompt: "",
    href: "/director?mode=agent",
  },
];

/** Example briefs that reinforce the wedge (not generic cinema). */
export const DEVCUT_CHALLENGE_EXAMPLES = [
  {
    label: "Storage hackathon",
    scene: "B2 + Genblaze · Durable media pipeline",
    brief:
      "Backblaze Generative Media Hackathon: builders must use Genblaze + B2. Show a winning app that generates video, stores assets + provenance on B2, and ships a usable creator workflow.",
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
