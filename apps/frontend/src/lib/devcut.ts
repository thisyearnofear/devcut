/** DevCut product constants — single source for doors, prompts, brand. */

export const DEVCUT = {
  name: "DevCut",
  tagline: "A judge-ready video cut from your brief",
  description:
    "Turn a hackathon brief or project into a storyboard, Runway footage, durable MP4, and HyperFrames handoff kit — without becoming a film studio.",
} as const;

export type DevCutDoorId = "challenge" | "submit" | "product" | "agent";

/** x402 SKU ids — the paid catalogue. Ids are a contract; display names are not. */
export type DevCutSkuId =
  | "challenge_film"
  | "submission_polish"
  | "hero_shot_pack"
  | "product_launch"
  | "variant_pack"
  | "recap_reel";

export interface DevCutProduct {
  name: string;
  /** Short display price. Mirrors `price` in apps/bff/src/x402/skus.ts, which is payment-authoritative. */
  price: string;
  audience: string;
  blurb: string;
}

/**
 * One vocabulary for every user-facing surface. Display-only mirror of the BFF's
 * DEVCUT_SKUS — never used for payment, routing, or agent prompts, so the ids and
 * "Mode: …" strings the agent reads stay untouched.
 */
export const DEVCUT_PRODUCTS: Record<DevCutSkuId, DevCutProduct> = {
  challenge_film: {
    name: "Challenge Cut",
    price: "$2",
    audience: "Organizers",
    blurb: "A visual spec of what winning looks like, plus a forkable builder kit.",
  },
  submission_polish: {
    name: "Demo Cut",
    price: "$1",
    audience: "Builders",
    blurb: "A judge-ready demo film from your repo, product URL, or one-line brief.",
  },
  hero_shot_pack: {
    name: "Hero Shot Pack",
    price: "$0.50",
    audience: "Builders & agents",
    blurb: "Consistent generative heroes for a composition you already built.",
  },
  product_launch: {
    name: "Product Launch Cut",
    price: "$1.50",
    audience: "Founders & PMs",
    blurb: "Logo reveal, core features, proof, CTA — no hackathon framing.",
  },
  variant_pack: {
    name: "Variant Pack",
    price: "$1",
    audience: "Builders",
    blurb:
      "Judge 16:9, customer 1:1 with captions, builder teaser 9:16 ≤15s — re-stitched from footage you already paid for.",
  },
  recap_reel: {
    name: "Recap Reel",
    price: "$4",
    audience: "Organizers",
    blurb:
      "A 60–90s winners film carrying your sponsor's logo and call to action, cut from the event's finished entries.",
  },
};

/** Door → the SKU a human buys at that door. The agent door has no single SKU. */
const DOOR_SKU: Record<DevCutDoorId, DevCutSkuId | null> = {
  challenge: "challenge_film",
  submit: "submission_polish",
  product: "product_launch",
  agent: null,
};

/** Accepts a door id, a SKU id, or a legacy display string found in older B2 snapshots. */
const SKU_ALIASES: Record<string, DevCutSkuId> = {
  challenge: "challenge_film",
  submit: "submission_polish",
  product: "product_launch",
  "submit ready": "submission_polish",
  "demo cut": "submission_polish",
  "challenge cut": "challenge_film",
  "product launch cut": "product_launch",
  "variant pack": "variant_pack",
  "recap reel": "recap_reel",
};

export function skuFor(mode: string | null | undefined): DevCutSkuId | null {
  if (!mode) return null;
  const key = mode.trim().toLowerCase();
  if (key in SKU_ALIASES) return SKU_ALIASES[key];
  if (key in DEVCUT_PRODUCTS) return key as DevCutSkuId;
  return null;
}

export function productForDoor(door: DevCutDoorId): DevCutProduct | null {
  const sku = DOOR_SKU[door];
  return sku ? DEVCUT_PRODUCTS[sku] : null;
}

/** The one name to render for a door id, SKU id, or legacy snapshot string. */
export function productName(mode: string | null | undefined): string {
  const sku = skuFor(mode);
  return sku ? DEVCUT_PRODUCTS[sku].name : "cut";
}


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
    label: "For hackathon organizers",
    title: "Challenge Cut",
    body: "Turn judging criteria and constraints into a reference film builders can follow — plus a forkable kit.",
    prompt: [
      "Mode: Challenge Cut (visual spec for builders).",
      "Create a ~45s reference film that visually specs what winning looks like.",
      "Shot grammar (use these beats, adapt wording to the brief):",
      "1) Problem — who hurts and why.",
      "2) Constraint — stack / API / rules builders must use.",
      "3) Winning artifact — what reviewers should open.",
      "4) Anti-pattern — what not to build.",
      "5) CTA — fork the kit / start building.",
      "SPONSOR BRAND KIT (required): pass brand_kit to generate_storyboard_plan — { logo_url, sponsors:[{name, logo_url}], palette?, lockup_rules?, mandatory_mentions? }. Ask the organizer for it once if the brief omits it; variants and recap films overlay this logo.",
      "Call generate_storyboard_plan, then generate_all_references, generate_all_videos, and stitch_final_cut.",
      "After export, the canvas attaches a HyperFrames handoff (BRIEF.md + assets/devcut/). Remind the builder: HF owns composition HTML.",
      "Brief follows:",
    ].join(" "),
  },
  {
    id: "submit",
    label: "For builders",
    // Display name only — the prompt below still says "Mode: Submit Ready", which is the
    // vocabulary storyboard_prompts.py detects. Ids and prompts are the agent contract.
    title: "Demo Cut",
    body: "Turn a repo, product URL, or HyperFrames project into a launch-ready demo cut.",
    prompt: [
      "Mode: Submit Ready (developer demo cut).",
      "Create a product-launch / demo cut.",
      "Shot grammar: problem → product → proof (demo or metric) → optional CTA.",
      "Prefer landscape 1280:720 unless the brief says vertical / TikTok / Reels.",
      "Call generate_storyboard_plan, then generate_all_references, generate_all_videos, and stitch_final_cut.",
      "After export, point at the HyperFrames handoff panel — paste BRIEF.md, stage heroes under assets/devcut/, finish in HF.",
      "Project / URL / brief follows:",
    ].join(" "),
  },
  {
    id: "product",
    label: "For founders & PMs",
    title: "Product Launch Cut",
    body: "Polished demo video for a shipped product — no hackathon framing, just clean proof.",
    prompt: [
      "Mode: Product Launch Cut (founder / PM demo).",
      "Create a ~30s polished product demo cut.",
      "Shot grammar:",
      "1) Logo reveal — brand mark animates in clean and stable.",
      "2) Feature hero — screen recording or hero shot of the core workflow.",
      "3) Second feature — another key capability.",
      "4) Third feature — completing the value story.",
      "5) Proof — metric, testimonial, or social proof visual.",
      "6) CTA — website URL or tagline.",
      "Constraint rules:",
      "- All on-screen text must be spelled verbatim with exact case; no accidental characters or symbols beyond what is specified.",
      "- Lock color palette to the accent color from the brief plus neutral pair (off-white, ink black, accent).",
      "- Maintain 3 depth layers (background / mid / foreground) moving at different speeds until the final hold.",
      "- Background layer features repeating outline text flowing horizontally at ultra-low speed.",
      "- Mid decorative layer features barcode bands, UI ticks, or halftone grids moving at a different speed.",
      "- Final shot holds completely still for 1.2s.",
      "Prefer landscape 1280:720 unless the brief says vertical / TikTok / Reels.",
      "Call generate_storyboard_plan, then generate_all_references, generate_all_videos, and stitch_final_cut.",
      "After export, point at the HyperFrames handoff panel — paste BRIEF.md, stage heroes under assets/devcut/, finish in HF.",
      "Product / URL / brief follows:",
    ].join(" "),
  },
  {
    id: "agent",
    label: "For integrators",
    title: "Agent jobs",
    body: "Start a metered job through x402 without pasting a Runway key.",
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
 * Golden Challenge Cut — Genblaze + B2 durable-media visual spec.
 * Full notes: docs/demos/golden-challenge-cut.md
 */
export const DEVCUT_GOLDEN_CHALLENGE = {
  label: "Golden · Genblaze+B2",
  scene: "Durable media · HF builder kit",
  mode: "challenge" as const,
  titleHint: "Genblaze + B2 Challenge Cut",
  brief: [
    "Track: Backblaze Generative Media (Genblaze + B2).",
    "Audience: developers shipping creator/agent video tools on Runway-class models.",
    "Constraint: must use Genblaze (or equivalent) + Backblaze B2 for durable storage and provenance.",
    "HyperFrames (or HTML→video) is the preferred composition path for the final cut.",
    "Show what winning looks like in ~45s:",
    "1) Problem — gorgeous local demo; reviewers can't open assets Monday; links 404; no provenance.",
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
      "HyperFrames builder challenge: winning submissions are code-native HTML compositions with a clear product story. Show the bar — data chart beat, product UI motion, launch-ready cut.",
  },
  {
    label: "x402 agent payments",
    scene: "Pay-per-job · No API key paste",
    brief:
      "x402 agent track: builders meter paid APIs via spending sessions. Visualize a winning flow where an agent buys a Runway video job, gets assets back, and never holds a vendor key.",
  },
] as const;

export const DEVCUT_SUBMIT_EXAMPLES = [
  {
    label: "Product URL",
    scene: "SaaS landing → launch cut",
    brief:
      "https://hyperframes.heygen.com — Submit Ready polish: problem → product → proof for a launch demo of HyperFrames as HTML→video for agents.",
  },
  {
    label: "Repo demo",
    scene: "GitHub → demo film",
    brief:
      "Repo https://github.com/heygen-com/hyperframes — Submit Ready: 30s cut explaining write-HTML-render-video for developer reviewers.",
  },
  {
    label: "HF project note",
    scene: "Existing composition → heroes",
    brief:
      "Submit Ready for a HyperFrames product-launch project: add generative Runway hero shots around a data-chart beat and stitch a launch MP4. Product: a developer API that meters generative media via x402.",
  },
] as const;

/** Example briefs for the Product Launch Cut door. */
export const DEVCUT_PRODUCT_EXAMPLES = [
  {
    label: "SaaS landing",
    scene: "Product URL → polished demo",
    brief:
      "Product: DevCut — the x402-metered video desk for hackathons. Demo a founder's journey: paste a product URL, get a storyboard, Runway heroes, and a polished MP4 with HyperFrames handoff. Accent color: #2de2c5 (cyan), neutral: off-white + ink black.",
  },
  {
    label: "CLI tool",
    scene: "Developer tool → feature tour",
    brief:
      "Product: a CLI tool that turns GitHub repos into motion graphics. Show the terminal workflow: clone, paste repo URL, select style, export. Accent: #ff9f1c (orange), neutral: black + white.",
  },
  {
    label: "API product",
    scene: "API docs → product cut",
    brief:
      "Product: an AI video generation API with REST endpoints. Show the API shape — POST /generate, stream response, MP4 delivery. Accent: #a78bfa (purple), neutral: dark gray + white.",
  },
] as const;
