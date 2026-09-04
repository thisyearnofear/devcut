"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { decodeCutShare, remixDirectorHref } from "@/lib/cut-share";
import "@/components/landing/landing.css";

/**
 * Public watch page for a shared cut — viral hook + Remix CTA.
 */
export function CutPageClient({ initialC }: { initialC?: string }) {
  const params = useSearchParams();
  const [copied, setCopied] = useState(false);
  const card = useMemo(() => {
    const c = initialC ?? params.get("c");
    if (!c) return null;
    return decodeCutShare(c);
  }, [params, initialC]);

  const sharePage = useCallback(async () => {
    if (!card) return;
    const url = typeof window !== "undefined" ? window.location.href : "";
    const title = card.t || "DevCut";
    const text = `Watch “${title}” — made with DevCut + Runway. Remix on the live canvas.`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
    } catch {
      /* dismissed */
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [card]);

  if (!card) {
    return (
      <div data-devcut-landing className="flex min-h-svh flex-col items-center justify-center px-5 text-center">
        <p className="dc-mono text-[11px] uppercase tracking-[0.18em] text-[var(--dc-dim)]">
          Cut not found
        </p>
        <p className="dc-display mt-3 text-2xl font-semibold text-[var(--dc-paper)]">
          This share link is missing or expired.
        </p>
        <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--dc-mute)]">
          The cut may have been removed or the link is incomplete. You can still
          make your own demo video in a few minutes.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/#desk"
            className="dc-btn bg-[var(--dc-signal)] px-5 py-3 dc-mono text-[11px] uppercase tracking-[0.14em] text-[var(--dc-ink)]"
          >
            Open the desk
          </Link>
          <Link
            href="/about"
            className="dc-btn border border-[var(--dc-line)] px-5 py-3 dc-mono text-[11px] uppercase tracking-[0.14em] text-[var(--dc-mute)]"
          >
            What is DevCut?
          </Link>
        </div>
      </div>
    );
  }

  const remixHref = remixDirectorHref(card);
  const modeLabel =
    card.m === "submit" ? "Submit Ready" : card.m === "agent" ? "Agent job" : "Challenge Cut";

  return (
    <div data-devcut-landing className="min-h-svh bg-[var(--dc-ink)] text-[var(--dc-paper)]">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--dc-line)] px-5 py-4 sm:px-8">
        <Link href="/" className="dc-display text-sm font-semibold tracking-tight">
          DevCut
        </Link>
        <p className="dc-mono text-[10px] uppercase tracking-[0.16em] text-[var(--dc-cyan)]">
          Shared cut · {modeLabel}
        </p>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-8 px-5 py-10 sm:px-8">
        <div>
          <p className="dc-mono text-[11px] uppercase tracking-[0.18em] text-[var(--dc-signal)]">
            Made with DevCut + Runway
          </p>
          <h1 className="dc-display mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            {card.t || "Untitled cut"}
          </h1>
        </div>

        <div className="overflow-hidden border border-[var(--dc-line)] bg-black">
          <video
            src={card.v}
            poster={card.s}
            controls
            playsInline
            className="aspect-video w-full bg-black"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={remixHref}
            className="dc-btn inline-flex items-center bg-[var(--dc-signal)] px-5 py-3 dc-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--dc-ink)] hover:bg-[var(--dc-paper)]"
          >
            Remix in DevCut
          </Link>
          <button
            type="button"
            onClick={sharePage}
            className="dc-btn inline-flex items-center border border-[var(--dc-cyan)]/45 bg-[var(--dc-cyan-soft)] px-5 py-3 dc-mono text-[11px] uppercase tracking-[0.14em] text-[var(--dc-cyan)]"
          >
            {copied ? "Link copied" : "Share cut"}
          </button>
          <a
            href={card.v}
            target="_blank"
            rel="noopener noreferrer"
            className="dc-btn inline-flex items-center border border-[var(--dc-line)] px-5 py-3 dc-mono text-[11px] uppercase tracking-[0.14em] text-[var(--dc-mute)]"
          >
            Open MP4
          </a>
          <Link
            href="/director"
            className="dc-mono text-[11px] uppercase tracking-[0.14em] text-[var(--dc-dim)] hover:text-[var(--dc-mute)]"
          >
            Start fresh →
          </Link>
        </div>

        <p className="max-w-xl text-sm leading-6 text-[var(--dc-mute)]">
          Remix opens the live canvas with this brief seeded — regenerate Runway heroes, restitch,
          hand off to HyperFrames. DevCut is the Runway desk for developers.
        </p>

        {/* First-time viewer context — what is this? */}
        <div className="flex flex-col gap-3 border border-[var(--dc-line)] bg-[var(--dc-panel)]/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="dc-mono text-[10px] uppercase tracking-[0.16em] text-[var(--dc-cyan)]">
              What is DevCut?
            </p>
            <p className="mt-1.5 text-sm leading-6 text-[var(--dc-mute)]">
              Paste a project URL or brief → get a judge-ready demo video with Runway footage,
              stitched MP4, and a HyperFrames handoff kit. Built for hackathon builders.
            </p>
          </div>
          <Link
            href="/#desk"
            className="dc-btn shrink-0 bg-[var(--dc-signal)] px-5 py-3 dc-mono text-[11px] uppercase tracking-[0.14em] text-[var(--dc-ink)]"
          >
            Make your own →
          </Link>
        </div>
      </main>
    </div>
  );
}
