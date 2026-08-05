import type { Metadata } from "next";
import { Suspense } from "react";
import { CutPageClient } from "../CutPageClient";
import type { CutShareCard } from "@/lib/cut-share";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  let card: CutShareCard | null = null;
  try {
    const res = await fetch(
      `${process.env.BFF_URL ?? "http://localhost:4010"}/api/cut-card/${encodeURIComponent(id)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (res.ok) card = (await res.json()) as CutShareCard;
  } catch { /* not found — render empty */ }

  const title = card?.t ? `${card.t} · DevCut` : "Shared cut · DevCut";
  return {
    title,
    description: card
      ? `Watch "${card.t}" — made with DevCut + Runway. Remix on the live canvas.`
      : "Watch a DevCut on Runway. Remix on the live canvas.",
    openGraph: {
      title,
      description: card?.t ? `Watch "${card.t}" — made with DevCut + Runway.` : undefined,
      images: card?.s ? [{ url: card.s, width: 1280, height: 720 }] : [{ url: "/banner.jpg", width: 1280, height: 420 }],
      type: "video.other",
      ...(card?.v ? { videos: [{ url: card.v, type: "video/mp4", width: 1280, height: 720 }] } : {}),
    },
  };
}

export default async function CutByIdPage({ params }: Props) {
  const { id } = await params;
  let card: CutShareCard | null = null;
  try {
    const res = await fetch(
      `${process.env.BFF_URL ?? "http://localhost:4010"}/api/cut-card/${encodeURIComponent(id)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (res.ok) card = (await res.json()) as CutShareCard;
  } catch { /* not found */ }

  // Encode the card into the same ?c= format CutPageClient expects.
  const c = card
    ? btoa(unescape(encodeURIComponent(JSON.stringify({
        v: card.v, t: card.t, m: card.m, s: card.s, b: card.b,
      })))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    : "";

  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center bg-[#050607] font-mono text-xs uppercase tracking-widest text-white/40">
          Loading cut…
        </div>
      }
    >
      <CutPageClient initialC={c} />
    </Suspense>
  );
}
