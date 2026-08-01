import type { Metadata } from "next";
import { Suspense } from "react";
import { decodeCutShare } from "@/lib/cut-share";
import { CutPageClient } from "./CutPageClient";

type Props = { searchParams: Promise<{ c?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { c } = await searchParams;
  const card = c ? decodeCutShare(c) : null;
  const title = card?.t ? `${card.t} · DevCut` : "Shared cut · DevCut";
  const description = card
    ? `Watch “${card.t}” — made with DevCut + Runway. Remix on the live canvas.`
    : "Watch a DevCut on Runway. Remix on the live canvas.";
  const images = card?.s
    ? [{ url: card.s, width: 1280, height: 720 }]
    : [{ url: "/banner.jpg", width: 1280, height: 420 }];

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images,
      type: "video.other",
      ...(card?.v
        ? { videos: [{ url: card.v, type: "video/mp4", width: 1280, height: 720 }] }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: images.map((i) => i.url),
    },
  };
}

export default function CutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center bg-[#050607] font-mono text-xs uppercase tracking-widest text-white/40">
          Loading cut…
        </div>
      }
    >
      <CutPageClient />
    </Suspense>
  );
}
