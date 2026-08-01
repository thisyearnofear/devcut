"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import type { DevCutDoorId } from "@/lib/devcut";

const LABELS: Record<string, string> = {
  challenge: "Challenge Cut",
  submit: "Submit Ready",
  agent: "x402 Agent",
  golden: "Golden Challenge Cut",
  hf: "HyperFrames demo",
};

interface CutToCanvasProps {
  playCut?: () => void;
}

/**
 * Hard-cut wipe from landing → /director. Product continuity, not a page fade.
 */
export function useCutToCanvas({ playCut }: CutToCanvasProps = {}) {
  const router = useRouter();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const setOverlayNode = useCallback((node: HTMLDivElement | null) => {
    overlayRef.current = node;
  }, []);

  const cutTo = useCallback(
    (href: string, mode: DevCutDoorId | "golden" | "hf" = "challenge") => {
      if (busy) return;
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (reduced) {
        router.push(href);
        return;
      }

      setBusy(true);
      setLabel(LABELS[mode] ?? "DevCut");
      playCut?.();

      const el = overlayRef.current;
      if (!el) {
        router.push(href);
        return;
      }

      const tl = gsap.timeline({
        onComplete: () => {
          router.push(href);
        },
      });

      tl.set(el, { display: "flex", pointerEvents: "auto" })
        .fromTo(
          el,
          { clipPath: "inset(0 0 100% 0)", opacity: 1 },
          { clipPath: "inset(0 0 0% 0)", duration: 0.22, ease: "power3.in" },
        )
        .to({}, { duration: 0.12 }); // hold on black/amber
    },
    [busy, playCut, router],
  );

  const Overlay = (
    <div
      ref={setOverlayNode}
      className="fixed inset-0 z-[80] hidden flex-col items-center justify-center bg-[var(--dc-ink,#050607)]"
      style={{ clipPath: "inset(0 0 100% 0)" }}
      aria-hidden
    >
      <span className="mb-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[#ff9f1c]">
        <span className="size-2 rounded-full bg-[#ff3b55]" />
        Cutting to canvas
      </span>
      <p className="dc-display text-[clamp(1.75rem,6vw,3rem)] font-bold tracking-tight text-[#f4efe4]">
        {label}
      </p>
      <div className="mt-8 h-px w-40 bg-[linear-gradient(90deg,transparent,#2de2c5,transparent)]" />
    </div>
  );

  return { cutTo, Overlay, busy };
}
