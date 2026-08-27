/**
 * DevCut x402 SKUs — four jobs (thesis).
 * Prices are USD strings; USDC on Base (mainnet or Sepolia via env).
 */

export type DevCutSkuId =
  | "challenge_film"
  | "submission_polish"
  | "hero_shot_pack"
  | "product_launch";

export interface DevCutSku {
  id: DevCutSkuId;
  title: string;
  description: string;
  /** Human price label, e.g. "$2.00" */
  price: string;
  /** USDC atomic units (6 decimals) as decimal string for x402 maxAmountRequired */
  amountAtomic: string;
  door: "challenge" | "submit" | "product" | "agent";
  /** Mode prompt prefix injected into the canvas after unlock */
  modePrompt: string;
}

/** $1 USDC = 1_000_000 atomic */
function usdc(usd: number): string {
  return String(Math.round(usd * 1_000_000));
}

export const DEVCUT_SKUS: Record<DevCutSkuId, DevCutSku> = {
  challenge_film: {
    id: "challenge_film",
    title: "Challenge Cut",
    description:
      "Organizer reference film + builder kit seed (problem → constraint → winning artifact → anti-pattern → CTA).",
    price: "$2.00",
    amountAtomic: usdc(2),
    door: "challenge",
    modePrompt:
      "Mode: Challenge Cut (hackathon organizer). Paid via x402 SKU challenge_film. Create a ~45s challenge reference film. Shot grammar: Problem → Constraint → Winning artifact → Anti-pattern → CTA. Call generate_storyboard_plan, generate_all_references, generate_all_videos, stitch_final_cut. End with Builder Kit bullets.",
  },
  submission_polish: {
    id: "submission_polish",
    title: "Submit Ready",
    description:
      "Builder Devpost / launch cut from product URL, repo, or HyperFrames notes (problem → product → proof).",
    price: "$1.00",
    amountAtomic: usdc(1),
    door: "submit",
    modePrompt:
      "Mode: Submit Ready (hackathon builder). Paid via x402 SKU submission_polish. Create a Devpost demo cut: problem → product → proof. Call generate_storyboard_plan, generate_all_references, generate_all_videos, stitch_final_cut.",
  },
  hero_shot_pack: {
    id: "hero_shot_pack",
    title: "Hero shot pack",
    description:
      "N consistent generative stills/clips for an existing HyperFrames composition (assets drop, no full stitch required).",
    price: "$0.50",
    amountAtomic: usdc(0.5),
    door: "agent",
    modePrompt:
      "Mode: Submit Ready (hero_shot_pack). Paid via x402. Generate 3–4 consistent hero reference stills only (generate_storyboard_plan + generate_all_references). Skip video/stitch unless asked.",
  },
  product_launch: {
    id: "product_launch",
    title: "Product Launch Cut",
    description:
      "Polished demo cut for founders and PMs — logo reveal → core features → social proof → CTA. No hackathon framing.",
    price: "$1.50",
    amountAtomic: usdc(1.5),
    door: "product",
    modePrompt:
      "Mode: Product Launch Cut (founder / PM demo). Paid via x402 SKU product_launch. Create a ~30s polished product demo cut. Shot grammar: 1) Logo reveal — brand mark animates in clean, 2) Feature A — screen recording or hero shot of core workflow, 3) Feature B — second capability, 4) Feature C — third capability, 5) Proof — metric, testimonial, or social proof visual, 6) CTA — website URL or tagline. Constraint rules: all on-screen text must be spelled verbatim with exact case; no accidental characters or symbols beyond what is specified; lock color palette to the accent color from the brief plus neutral pair; maintain 3 depth layers (background / mid / foreground) moving at different speeds until the final hold. Prefer landscape 1280:720 unless the brief says vertical / TikTok / Reels. Call generate_storyboard_plan, then generate_all_references, generate_all_videos, and stitch_final_cut. After export, point at the HyperFrames handoff panel — paste BRIEF.md, stage heroes under assets/devcut/, finish in HF.",
  },
};

export const SKU_IDS = Object.keys(DEVCUT_SKUS) as DevCutSkuId[];

export function isSkuId(id: string): id is DevCutSkuId {
  return id in DEVCUT_SKUS;
}
