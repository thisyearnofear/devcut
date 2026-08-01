import { publicAppOrigin } from "@/lib/public-url";

/** Compact share card for /cut?c=… (viral watch + remix). */
export type CutShareCard = {
  /** Final / durable MP4 URL */
  v: string;
  /** Title */
  t: string;
  /** Door mode */
  m?: "challenge" | "submit" | "agent" | string;
  /** Poster / still */
  s?: string;
  /** Brief seed for remix (truncated) */
  b?: string;
};

const MAX_BRIEF = 700;

export function truncateBrief(brief: string, max = MAX_BRIEF): string {
  const t = brief.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function encodeCutShare(card: CutShareCard): string {
  const payload: CutShareCard = {
    v: card.v,
    t: (card.t || "DevCut").slice(0, 120),
    m: card.m,
    s: card.s,
    b: card.b ? truncateBrief(card.b) : undefined,
  };
  const json = JSON.stringify(payload);
  const b64 =
    typeof window !== "undefined"
      ? btoa(unescape(encodeURIComponent(json)))
      : Buffer.from(json, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeCutShare(raw: string): CutShareCard | null {
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const b64 = padded + pad;
    const json =
      typeof window !== "undefined"
        ? decodeURIComponent(escape(atob(b64)))
        : Buffer.from(b64, "base64").toString("utf8");
    const data = JSON.parse(json) as CutShareCard;
    if (!data?.v || typeof data.v !== "string") return null;
    return data;
  } catch {
    return null;
  }
}

export function cutWatchUrl(card: CutShareCard): string {
  const c = encodeCutShare(card);
  return `${publicAppOrigin()}/cut?c=${encodeURIComponent(c)}`;
}

export function remixDirectorHref(card: CutShareCard): string {
  const mode = card.m === "submit" || card.m === "agent" ? card.m : "challenge";
  const params = new URLSearchParams();
  params.set("mode", mode);
  params.set("remix", "1");
  if (card.b?.trim()) {
    params.set("brief", card.b.trim());
  } else if (card.t) {
    params.set(
      "brief",
      `Remix of "${card.t}". Keep the same shot grammar; regenerate Runway heroes and stitch a fresh cut.`,
    );
  }
  return `/director?${params.toString()}`;
}
