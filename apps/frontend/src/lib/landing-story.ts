/** Landing story strip + clip-door copy — developers × Runway. */

export const LANDING_STRIP = {
  eyebrow: "Shot grammar",
  headline: "From brief to durable Runway cut.",
} as const;

export type LandingBeatId =
  | "problem"
  | "constraint"
  | "winning"
  | "antipattern"
  | "handoff";

export interface LandingBeat {
  id: LandingBeatId;
  step: string;
  title: string;
  body: string;
  image: string;
}

export const LANDING_BEATS: LandingBeat[] = [
  {
    id: "problem",
    step: "01",
    title: "Demos die locally",
    body: "Gorgeous Runway clips on a laptop — links 404, no provenance, reviewers can’t reopen Monday.",
    image: "/landing/beats/problem.jpg",
  },
  {
    id: "constraint",
    step: "02",
    title: "Runway + durable store",
    body: "Generate stills and clips on Runway-class models, persist with a verifiable manifest.",
    image: "/landing/beats/constraint.jpg",
  },
  {
    id: "winning",
    step: "03",
    title: "Public durable cut",
    body: "MP4 + manifest JSON + HyperFrames BRIEF/assets drop — a reel someone else can actually open.",
    image: "/landing/beats/winning.jpg",
  },
  {
    id: "antipattern",
    step: "04",
    title: "No BYOK chaos",
    body: "Laptop-only files and fake NLEs competing with HyperFrames — that’s how demos get buried.",
    image: "/landing/beats/antipattern.jpg",
  },
  {
    id: "handoff",
    step: "05",
    title: "Finish in HF",
    body: "Paste BRIEF.md, stage assets/devcut/, keep HTML composition where it belongs.",
    image: "/landing/beats/handoff.jpg",
  },
];

export const LANDING_DOOR_CLIPS = {
  challenge: {
    clipLabel: "Challenge Cut",
    panelLine: "Lock the shot grammar for your builders",
    image: "/landing/doors/challenge.jpg",
  },
  submit: {
    clipLabel: "Submit Ready",
    panelLine: "Package a launch-ready stitch",
    image: "/landing/doors/submit.jpg",
  },
  product: {
    clipLabel: "Product Launch",
    panelLine: "Polished demo without the hackathon frame",
    image: "/landing/doors/product.jpg",
  },
  agent: {
    clipLabel: "x402 Agent",
    panelLine: "Meter the job. Unlock the canvas",
    image: "/landing/doors/agent.jpg",
  },
} as const;

export const LANDING_DURABLE = {
  eyebrow: "Runway → durable URL",
  title: "The cut reviewers can reopen",
  body: "Export doesn’t die on a laptop — public MP4, manifest, HyperFrames drop. Provenance that survives the demo.",
  image: "/landing/beats/durable.jpg",
  urlHint: "f005.backblazeb2.com/file/devcut-media/…",
} as const;

/** Kinetic marquee chips — developers × Runway stack. */
export const LANDING_RUNWAY_CHIPS = [
  "Runway Gen-4",
  "stills → clips",
  "live storyboard",
  "stitch MP4",
  "durable B2 URL",
  "HyperFrames handoff",
  "x402 metered jobs",
  "MOCK without a key",
] as const;
