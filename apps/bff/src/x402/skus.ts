/**
 * DevCut x402 SKUs — three jobs only (thesis).
 * Prices are USD strings; USDC on Base (mainnet or Sepolia via env).
 */

export type DevCutSkuId =
  | "challenge_film"
  | "submission_polish"
  | "hero_shot_pack";

export interface DevCutSku {
  id: DevCutSkuId;
  title: string;
  description: string;
  /** Human price label, e.g. "$2.00" */
  price: string;
  /** USDC atomic units (6 decimals) as decimal string for x402 maxAmountRequired */
  amountAtomic: string;
  door: "challenge" | "submit" | "agent";
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
};

export const SKU_IDS = Object.keys(DEVCUT_SKUS) as DevCutSkuId[];

export function isSkuId(id: string): id is DevCutSkuId {
  return id in DEVCUT_SKUS;
}
