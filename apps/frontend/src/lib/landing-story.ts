/** Landing story strip + clip-door copy (Manus-informed, wedge-accurate). */

export const LANDING_STRIP = {
  eyebrow: "Challenge Cut grammar",
  headline: "Show the bar. Ship the cut.",
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
    title: "Links rot Monday",
    body: "Gorgeous local demos — judges can’t open assets, provenance gone, pitch dies in Discord.",
    image: "/landing/beats/problem.jpg",
  },
  {
    id: "constraint",
    step: "02",
    title: "Genblaze + B2",
    body: "Generate like Runway, persist stills, clips, and finals with a verifiable manifest.",
    image: "/landing/beats/constraint.jpg",
  },
  {
    id: "winning",
    step: "03",
    title: "Durable artifact",
    body: "Public MP4 + manifest JSON + HyperFrames BRIEF/assets drop judges can reopen.",
    image: "/landing/beats/winning.jpg",
  },
  {
    id: "antipattern",
    step: "04",
    title: "No BYOK chaos",
    body: "Laptop-only files and fake NLEs competing with HyperFrames — that’s how hacks get buried.",
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
    panelLine: "Lock the shot grammar organizers pin",
    image: "/landing/doors/challenge.jpg",
  },
  submit: {
    clipLabel: "Submit Ready",
    panelLine: "Package a Devpost-ready stitch",
    image: "/landing/doors/submit.jpg",
  },
  agent: {
    clipLabel: "x402 Agent",
    panelLine: "Meter the job. Unlock the canvas",
    image: "/landing/doors/agent.jpg",
  },
} as const;

export const LANDING_DURABLE = {
  eyebrow: "Genblaze + B2",
  title: "The cut judges can reopen",
  body: "Export doesn’t die on a laptop — public MP4, manifest, HyperFrames drop. Provenance that survives Monday.",
  image: "/landing/beats/durable.jpg",
  urlHint: "f005.backblazeb2.com/file/devcut-media/…",
} as const;
