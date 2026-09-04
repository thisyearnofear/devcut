"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  DEVCUT,
  DEVCUT_CHALLENGE_EXAMPLES,
  DEVCUT_DOORS,
  DEVCUT_GOLDEN_CHALLENGE,
  DEVCUT_PRODUCT_EXAMPLES,
  DEVCUT_SUBMIT_EXAMPLES,
  type DevCutDoor,
  type DevCutDoorId,
} from "@/lib/devcut";
import { useCutToCanvas } from "@/components/landing/CutToCanvas";
import { useCutSound } from "@/components/landing/useCutSound";
import { cutWatchUrl } from "@/lib/cut-share";
import { lastJobRemixHref, readLastJob, type LastJob } from "@/lib/last-job";
import { briefHash } from "@/lib/brief-hash";
import "./landing.css";

const WaveGrid = dynamic(
  () => import("@/components/landing/WaveGrid").then((m) => m.WaveGrid),
  { ssr: false },
);

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

type CutDoorId = Exclude<DevCutDoorId, "agent">;

/** Human cut doors only — the x402 "agent" path lives in docs, not the rail. */
const CUT_DOORS = DEVCUT_DOORS.filter(
  (d): d is DevCutDoor & { id: CutDoorId } => d.id !== "agent",
);

const DOOR_META: Record<CutDoorId, { tab: string; cta: string; placeholder: string; hint: string }> = {
  submit: {
    tab: "Submit my project",
    cta: "Get my demo video",
    placeholder: "Paste a product URL, repo, or one-line pitch…",
    hint: "For builders — turn your project into a Devpost-ready demo cut",
  },
  challenge: {
    tab: "Challenge cut",
    cta: "Start challenge cut",
    placeholder: "What should builders understand, build, or avoid?",
    hint: "For organizers — a reference film + forkable builder kit",
  },
  product: {
    tab: "Product launch",
    cta: "Start launch cut",
    placeholder: "Paste a product URL, brand guidelines, or feature list…",
    hint: "For founders & PMs — a polished demo video for a shipped product",
  },
};

const STEPS = [
  {
    step: "01",
    title: "Paste your brief",
    body: "A repo, product URL, or one line is enough — no storyboard skills needed.",
  },
  {
    step: "02",
    title: "Watch it build",
    body: "Shot plan, stills, and clips land on a live canvas as they generate.",
  },
  {
    step: "03",
    title: "Ship the cut",
    body: "Stitched MP4 plus a HyperFrames kit, ready to drop into Devpost.",
  },
];

/**
 * DevCut landing — the hero IS the desk. Pain-first headline, one brief input,
 * one Start action above the fold. No intro gate, and no duplicated door/brief
 * step on the next page (a staged brief shows a "Ready to cut" panel instead).
 */
export function LandingPage() {
  const [door, setDoor] = useState<CutDoorId>("submit");
  const [brief, setBrief] = useState("");
  const [lastJob, setLastJob] = useState<LastJob | null>(null);
  const { armed, toggle: toggleSound, playCut } = useCutSound();
  const { cutTo, Overlay, busy: cutting } = useCutToCanvas({ playCut });

  useEffect(() => {
    setLastJob(readLastJob());
  }, []);

  const examples = useMemo(
    () =>
      door === "challenge"
        ? DEVCUT_CHALLENGE_EXAMPLES
        : door === "product"
          ? DEVCUT_PRODUCT_EXAMPLES
          : DEVCUT_SUBMIT_EXAMPLES,
    [door],
  );

  const meta = DOOR_META[door];

  const directorHref = useMemo(
    () => `/director?mode=${door}&brief=${encodeURIComponent(brief.trim())}`,
    [door, brief],
  );

  // Sample-cut dedup: hash the same canonical prompt the director will stage,
  // so the "view previous cut (free)" ledger lookup keeps working.
  const goldenPayload = useMemo(() => {
    const challengeDoor = DEVCUT_DOORS.find((d) => d.id === "challenge")!;
    return `${challengeDoor.prompt} ${DEVCUT_GOLDEN_CHALLENGE.brief}`.trim();
  }, []);
  const goldenHref = useMemo(
    () => `/director?mode=challenge&brief=${encodeURIComponent(DEVCUT_GOLDEN_CHALLENGE.brief)}`,
    [],
  );

  // Resume-vs-fresh guard: if this exact brief already produced a (still-
  // resumable) cut, offer the free rewatch before commissioning another run.
  const [resumeOffer, setResumeOffer] = useState<{
    threadId: string;
    href: string;
    mode: "golden" | "hf";
    status: string;
    shotsReady: number;
  } | null>(null);

  const guardedCut = useCallback(
    async (href: string, payload: string, mode: "golden" | "hf") => {
      try {
        const hash = await briefHash(payload);
        const res = await fetch(`/api/cut-lookup?hash=${hash}`, { cache: "no-store" });
        const data = res.ok ? ((await res.json()) as Record<string, unknown>) : null;
        if (data?.found && data.resumable && typeof data.threadId === "string") {
          setResumeOffer({
            threadId: data.threadId,
            href,
            mode,
            status: typeof data.status === "string" ? data.status : "",
            shotsReady: typeof data.shotsReady === "number" ? data.shotsReady : 0,
          });
          return;
        }
      } catch {
        /* lookup failure → normal launch */
      }
      cutTo(href, mode);
    },
    [cutTo],
  );

  const startCut = useCallback(() => {
    if (!brief.trim()) return;
    cutTo(directorHref, door);
  }, [brief, directorHref, door, cutTo]);

  return (
    <div data-devcut-landing className="min-h-svh overflow-x-hidden">
      {Overlay}
      {resumeOffer && (
        <div className="fixed inset-x-4 bottom-6 z-[90] mx-auto max-w-md rounded-xl border border-[var(--dc-line)] bg-[var(--dc-ink,#050607)]/95 p-4 shadow-2xl backdrop-blur">
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setResumeOffer(null)}
            className="absolute right-2.5 top-2.5 font-mono text-xs text-[var(--dc-dim)] hover:text-[var(--dc-paper)]"
          >
            ✕
          </button>
          <p className="dc-mono text-[11px] uppercase tracking-[0.18em] text-[var(--dc-cyan)]">
            {resumeOffer.status === "running" ? "Already running" : "Already cut"}
          </p>
          <p className="mt-1.5 pr-6 text-sm leading-5 text-[var(--dc-paper)]/85">
            {resumeOffer.status === "running"
              ? "This cut is generating right now — watch it finish instead of starting a duplicate."
              : `You already ran this ${resumeOffer.mode === "golden" ? "golden cut" : "demo"}${resumeOffer.shotsReady > 0 ? ` (${resumeOffer.shotsReady} shots ready)` : ""} — watching it costs nothing.`}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                const t = resumeOffer.threadId;
                setResumeOffer(null);
                cutTo(`/director?thread=${encodeURIComponent(t)}`);
              }}
              className="dc-btn flex-1 bg-[var(--dc-signal)] px-3 py-2 dc-mono text-[11px] uppercase tracking-[0.14em] text-[var(--dc-ink)]"
            >
              {resumeOffer.status === "running" ? "Watch progress" : "View previous cut · free"}
            </button>
            <button
              type="button"
              onClick={() => {
                const { href, mode } = resumeOffer;
                setResumeOffer(null);
                cutTo(href, mode);
              }}
              className="dc-btn flex-1 border border-[var(--dc-line)] px-3 py-2 dc-mono text-[11px] uppercase tracking-[0.14em] text-[var(--dc-paper)]/75 hover:border-[var(--dc-paper)]/40"
            >
              Start fresh · ~5 min
            </button>
          </div>
        </div>
      )}

      <section className="relative flex min-h-svh flex-col">
        {/* Backdrop: hero still + gradient + wave grid (grain/sprockets removed). */}
        <div className="absolute inset-0 overflow-hidden" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/devcut-hero-bay.jpg"
            alt=""
            className="h-full w-full scale-105 object-cover object-center opacity-70"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,6,7,0.62)_0%,rgba(5,6,7,0.4)_38%,rgba(5,6,7,0.92)_78%,#050607_100%)]" />
          <WaveGrid className="z-[1]" />
        </div>

        <header className="relative z-10 flex items-center justify-between gap-4 px-5 pt-5 sm:px-8 sm:pt-6">
          <span className="dc-display text-sm font-semibold tracking-tight text-[var(--dc-paper)]">
            {DEVCUT.name}
          </span>
          <nav className="dc-mono flex items-center gap-4 text-[11px] uppercase tracking-[0.14em] text-[var(--dc-mute)]">
            <button
              type="button"
              onClick={toggleSound}
              aria-pressed={armed}
              title={armed ? "Mute cut sound" : "Arm cut sound"}
              className="transition-colors duration-200 hover:text-[var(--dc-paper)]"
            >
              {armed ? "Sound on" : "Sound off"}
            </button>
            <button
              type="button"
              onClick={() => void guardedCut(goldenHref, goldenPayload, "golden")}
              disabled={cutting}
              className="transition-colors duration-200 hover:text-[var(--dc-paper)] disabled:opacity-50"
            >
              Sample cut
            </button>
            <Link
              href="/about"
              className="transition-colors duration-200 hover:text-[var(--dc-paper)]"
            >
              About
            </Link>
            <a
              href="https://github.com/thisyearnofear/devcut"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors duration-200 hover:text-[var(--dc-paper)]"
            >
              GitHub
            </a>
          </nav>
        </header>


        {/* Hero = the desk: pain, one input, one action — all above the fold. */}
        <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-14 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE_OUT }}
          >
            <p className="dc-mono mb-4 text-[11px] uppercase tracking-[0.22em] text-[var(--dc-cyan)]">
              You shipped it this weekend. Now you need the demo.
            </p>
            <h1 className="dc-display max-w-2xl text-[clamp(2.25rem,6.5vw,4rem)] font-bold leading-[1.02] tracking-[-0.03em] text-[var(--dc-paper)]">
              Turn your project into a judge-ready demo video.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--dc-mute)] sm:text-lg">
              Paste a product URL, repo, or one-line brief. DevCut writes the shots, generates the
              footage, stitches the MP4, and packs a HyperFrames kit — ready for Devpost.
            </p>

            {lastJob && (
              <div className="mt-6 flex flex-wrap items-center gap-3 border border-[var(--dc-cyan)]/30 bg-[var(--dc-cyan-soft)] px-4 py-3">
                <p className="min-w-0 flex-1 truncate text-sm text-[var(--dc-paper)]">
                  <span className="dc-mono mr-2 text-[10px] uppercase tracking-[0.14em] text-[var(--dc-cyan)]">
                    Last cut
                  </span>
                  {lastJob.title}
                </p>
                <Link
                  href={lastJobRemixHref(lastJob)}
                  className="dc-btn bg-[var(--dc-cyan)] px-3 py-1.5 dc-mono text-[10px] uppercase tracking-[0.12em] text-[var(--dc-ink)]"
                >
                  Remix
                </Link>
                <a
                  href={cutWatchUrl({
                    v: lastJob.video,
                    t: lastJob.title,
                    m: lastJob.mode,
                    s: lastJob.still,
                    b: lastJob.brief,
                  })}
                  className="dc-btn border border-[var(--dc-line)] px-3 py-1.5 dc-mono text-[10px] uppercase tracking-[0.12em] text-[var(--dc-mute)]"
                >
                  Watch
                </a>
              </div>
            )}

            {/* Door tabs — pick the outcome, not a settings page. */}
            <div role="tablist" aria-label="What are you making?" className="mt-8 flex flex-wrap gap-2">
              {CUT_DOORS.map((d) => {
                const selected = door === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => {
                      playCut();
                      setDoor(d.id);
                    }}
                    className={`dc-mono border px-3.5 py-2 text-[11px] uppercase tracking-[0.12em] transition-colors ${
                      selected
                        ? "border-[var(--dc-signal)] bg-[var(--dc-signal-soft)] text-[var(--dc-signal)]"
                        : "border-[var(--dc-line)] text-[var(--dc-dim)] hover:border-[var(--dc-mute)] hover:text-[var(--dc-mute)]"
                    }`}
                  >
                    {DOOR_META[d.id].tab}
                  </button>
                );
              })}
            </div>

            <p className="mt-2 dc-mono text-[10px] uppercase tracking-[0.1em] text-[var(--dc-dim)]">
              {meta.hint}
            </p>

            {/* Brief + one action */}
            <div className="mt-3 border border-[var(--dc-line)] bg-[var(--dc-panel)]/80 backdrop-blur">
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    startCut();
                  }
                }}
                rows={3}
                aria-label="Cut brief"
                placeholder={meta.placeholder}
                className="w-full resize-none bg-transparent px-4 py-3 dc-mono text-sm leading-6 text-[var(--dc-paper)] outline-none placeholder:text-[var(--dc-dim)]"
              />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--dc-line)] px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {examples.map((ex) => (
                    <button
                      key={ex.label}
                      type="button"
                      onClick={() => setBrief(ex.brief)}
                      className="border border-[var(--dc-line)] px-2 py-1 dc-mono text-[10px] uppercase tracking-[0.1em] text-[var(--dc-dim)] hover:border-[var(--dc-cyan)]/40 hover:text-[var(--dc-mute)]"
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={startCut}
                  disabled={cutting || !brief.trim()}
                  data-cuelume-press
                  data-cuelume-release
                  className="dc-btn bg-[var(--dc-signal)] px-5 py-2.5 dc-mono text-xs font-medium uppercase tracking-[0.12em] text-[var(--dc-ink)] hover:bg-[var(--dc-paper)] disabled:opacity-40"
                >
                  {meta.cta}
                </button>
              </div>
            </div>

            <p className="dc-mono mt-3 text-[11px] leading-5 text-[var(--dc-dim)]">
              Storyboard → footage → stitched MP4 · ~5 min · MOCK preview works without a key.{" "}
              <button
                type="button"
                onClick={() => void guardedCut(goldenHref, goldenPayload, "golden")}
                disabled={cutting}
                className="text-[var(--dc-cyan)] underline-offset-2 hover:underline disabled:opacity-50"
              >
                Watch a 10s sample →
              </button>
            </p>
          </motion.div>
        </div>
      </section>

      {/* How it works — three steps, nothing else. */}
      <section id="how" className="border-t border-[var(--dc-line)] bg-[var(--dc-rail)]">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
          >
            <p className="dc-mono text-[11px] uppercase tracking-[0.18em] text-[var(--dc-cyan)]">
              How it works
            </p>
            <h2 className="dc-display mt-2 max-w-xl text-2xl font-semibold tracking-tight text-[var(--dc-paper)] sm:text-3xl">
              Brief to finished cut in three steps
            </h2>
          </motion.div>
          <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-6">
            {STEPS.map((row, i) => (
              <motion.li
                key={row.step}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-10%" }}
                transition={{ duration: 0.35, delay: i * 0.05, ease: EASE_OUT }}
                className="relative"
              >
                <p className="dc-mono text-[clamp(2rem,4vw,3rem)] font-medium leading-none tracking-tight text-[var(--dc-signal)]/35">
                  {row.step}
                </p>
                <p className="dc-display mt-3 text-lg font-semibold text-[var(--dc-paper)]">
                  {row.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--dc-mute)]">{row.body}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--dc-line)] px-5 py-6 sm:px-8">
        <span className="dc-display text-sm font-semibold tracking-tight">{DEVCUT.name}</span>
        <nav className="dc-mono flex flex-wrap items-center gap-4 text-[11px] uppercase tracking-[0.12em] text-[var(--dc-dim)]">
          <Link href="/about" className="hover:text-[var(--dc-mute)]">
            About
          </Link>
          <a
            href="https://github.com/thisyearnofear/devcut/blob/main/docs/x402.md"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--dc-mute)]"
          >
            For agents · x402
          </a>
          <a
            href="https://github.com/thisyearnofear/devcut/blob/main/docs/devcut-thesis.md"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--dc-mute)]"
          >
            Product thesis
          </a>
        </nav>
      </footer>
    </div>
  );
}

