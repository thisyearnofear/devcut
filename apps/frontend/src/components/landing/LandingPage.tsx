"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  DEVCUT,
  DEVCUT_CHALLENGE_EXAMPLES,
  DEVCUT_DOORS,
  DEVCUT_GOLDEN_CHALLENGE,
  DEVCUT_HF_DEMO,
  DEVCUT_SUBMIT_EXAMPLES,
  type DevCutDoorId,
} from "@/lib/devcut";
import { AgentPaymentsPanel } from "@/components/devcut/AgentPaymentsPanel";
import { ClipDoors } from "@/components/landing/ClipDoors";
import { useCutToCanvas } from "@/components/landing/CutToCanvas";
import { RunwayMarquee } from "@/components/landing/RunwayMarquee";
import { useCutSound } from "@/components/landing/useCutSound";
import { cutWatchUrl } from "@/lib/cut-share";
import { lastJobRemixHref, readLastJob, type LastJob } from "@/lib/last-job";
import "./landing.css";

const WaveGrid = dynamic(
  () => import("@/components/landing/WaveGrid").then((m) => m.WaveGrid),
  { ssr: false },
);

const StoryStrip = dynamic(
  () => import("@/components/landing/StoryStrip").then((m) => m.StoryStrip),
  { ssr: false },
);

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

function formatTimecode(ms: number) {
  const total = Math.floor(ms / 10);
  const frames = total % 100;
  const secs = Math.floor(total / 100) % 60;
  const mins = Math.floor(total / 6000) % 60;
  const hours = Math.floor(total / 360000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}:${pad(frames)}`;
}

function LeaderCountdown({
  onDone,
  onSkip,
}: {
  onDone: () => void;
  onSkip: () => void;
}) {
  const [n, setN] = useState(3);
  const finish = useCallback(() => onDone(), [onDone]);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      finish();
      return;
    }
    try {
      if (sessionStorage.getItem("devcut-skip-intro") === "1") {
        finish();
        return;
      }
    } catch {
      /* ignore */
    }
    if (n < 0) {
      finish();
      return;
    }
    const t = window.setTimeout(() => setN((v) => v - 1), n === 0 ? 280 : 420);
    return () => window.clearTimeout(t);
  }, [n, finish]);

  if (n < 0) return null;

  return (
    <motion.div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[var(--dc-ink)]"
      initial={{ opacity: 1 }}
      animate={{ opacity: n === 0 ? 0 : 1 }}
      transition={{ duration: 0.28, ease: EASE_OUT }}
      aria-hidden={n === 0}
    >
      <motion.span
        key={n}
        className="dc-display text-[clamp(5rem,22vw,12rem)] font-bold leading-none tracking-tight text-[var(--dc-signal)]"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: EASE_OUT }}
      >
        {n === 0 ? "CUT" : n}
      </motion.span>
      <button
        type="button"
        onClick={onSkip}
        className="dc-mono relative z-30 mt-8 text-[10px] uppercase tracking-[0.2em] text-[var(--dc-dim)] hover:text-[var(--dc-mute)]"
      >
        Skip to desk
      </button>
    </motion.div>
  );
}

/**
 * DevCut landing — developers × Runway edit bay.
 */
export function LandingPage() {
  const [door, setDoor] = useState<DevCutDoorId>("challenge");
  const [brief, setBrief] = useState(DEVCUT_GOLDEN_CHALLENGE.brief);
  const [clock, setClock] = useState(0);
  const [introDone, setIntroDone] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return (
        sessionStorage.getItem("devcut-skip-intro") === "1" ||
        window.location.hash === "#desk"
      );
    } catch {
      return false;
    }
  });
  const [grammarOpen, setGrammarOpen] = useState(false);
  const [lastJob, setLastJob] = useState<LastJob | null>(null);
  const markIntroDone = useCallback(() => setIntroDone(true), []);
  const skipIntro = useCallback(() => {
    try {
      sessionStorage.setItem("devcut-skip-intro", "1");
    } catch {
      /* ignore */
    }
    setIntroDone(true);
    window.requestAnimationFrame(() => {
      document.getElementById("desk")?.scrollIntoView({ behavior: "smooth" });
    });
  }, []);
  const { armed, toggle: toggleSound, playCut, playRec, playCanvasCut } =
    useCutSound();
  const { cutTo, Overlay, busy: cutting } = useCutToCanvas({
    playCut: playCanvasCut,
  });

  useEffect(() => {
    setLastJob(readLastJob());
    if (typeof window !== "undefined" && window.location.hash === "#desk") {
      skipIntro();
    }
  }, [skipIntro]);

  useEffect(() => {
    if (!introDone) return;
    playRec();
  }, [introDone, playRec]);

  useEffect(() => {
    if (!introDone) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      setClock(t - start);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [introDone]);

  const examples = useMemo(
    () => (door === "submit" ? DEVCUT_SUBMIT_EXAMPLES : DEVCUT_CHALLENGE_EXAMPLES),
    [door],
  );

  const activeDoor = DEVCUT_DOORS.find((d) => d.id === door)!;

  const directorHref = useMemo(() => {
    if (door === "agent") return "/director?mode=agent";
    const payload = `${activeDoor.prompt} ${brief}`.trim();
    return `/director?mode=${door}&brief=${encodeURIComponent(payload)}`;
  }, [door, brief, activeDoor.prompt]);

  const goldenHref = useMemo(() => {
    const challengeDoor = DEVCUT_DOORS.find((d) => d.id === "challenge")!;
    const payload = `${challengeDoor.prompt} ${DEVCUT_GOLDEN_CHALLENGE.brief}`.trim();
    return `/director?mode=challenge&demo=golden&brief=${encodeURIComponent(payload)}`;
  }, []);

  const hfDemoHref = useMemo(() => {
    const submitDoor = DEVCUT_DOORS.find((d) => d.id === "submit")!;
    const payload = `${submitDoor.prompt} ${DEVCUT_HF_DEMO.brief}`.trim();
    return `/director?mode=submit&demo=hf&brief=${encodeURIComponent(payload)}`;
  }, []);

  const selectDoor = useCallback(
    (id: DevCutDoorId) => {
      playCut();
      setDoor(id);
      if (id === "challenge") setBrief(DEVCUT_CHALLENGE_EXAMPLES[0].brief);
      if (id === "submit") setBrief(DEVCUT_SUBMIT_EXAMPLES[0].brief);
    },
    [playCut],
  );

  return (
    <div data-devcut-landing className="min-h-svh overflow-x-hidden">
      {Overlay}
      <section className="relative flex min-h-svh flex-col">
        {!introDone && (
          <LeaderCountdown onDone={markIntroDone} onSkip={skipIntro} />
        )}

        <div className="absolute inset-0 overflow-hidden" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/devcut-hero-bay.jpg"
            alt=""
            className="h-full w-full scale-105 object-cover object-center opacity-70"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,6,7,0.62)_0%,rgba(5,6,7,0.4)_38%,rgba(5,6,7,0.92)_78%,#050607_100%)]" />
          {introDone ? <WaveGrid className="z-[1]" /> : null}
          <div className="dc-grain pointer-events-none absolute -inset-[8%] z-[2] opacity-[0.06] mix-blend-overlay bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E')]" />
          <div className="pointer-events-none absolute inset-y-0 left-0 z-[2] w-5 dc-sprocket opacity-70 sm:w-7" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-[2] w-5 dc-sprocket opacity-70 sm:w-7" />
          <div className="pointer-events-none absolute inset-x-0 top-[42%] z-[2] h-px overflow-hidden">
            <div className="dc-playhead h-px w-1/5 bg-[linear-gradient(90deg,transparent,var(--dc-cyan),transparent)] shadow-[0_0_18px_var(--dc-cyan)]" />
          </div>
        </div>

        <header className="relative z-10 flex items-center justify-between gap-4 px-5 pt-5 sm:px-8 sm:pt-6">
          <div className="dc-mono flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-[var(--dc-mute)]">
            <span className="inline-flex items-center gap-2 text-[var(--dc-signal)]">
              <span className="dc-rec inline-block size-2 rounded-full bg-[var(--dc-cut)]" />
              Rec
            </span>
            <span className="text-[var(--dc-cyan)] tabular-nums">{formatTimecode(clock)}</span>
          </div>
          <nav className="dc-mono flex items-center gap-4 text-[11px] uppercase tracking-[0.14em] text-[var(--dc-mute)]">
            <button
              type="button"
              onClick={toggleSound}
              className="transition-colors duration-200 hover:text-[var(--dc-paper)]"
              aria-pressed={armed}
              title={armed ? "Mute cut sound" : "Arm cut sound"}
            >
              {armed ? "Sound on" : "Sound off"}
            </button>
            <Link
              href="/about"
              className="transition-colors duration-200 hover:text-[var(--dc-paper)]"
            >
              About
            </Link>
            <a
              href="#desk"
              onClick={(e) => {
                e.preventDefault();
                skipIntro();
              }}
              className="transition-colors duration-200 hover:text-[var(--dc-paper)]"
            >
              Desk
            </a>
            <button
              type="button"
              onClick={() => {
                setGrammarOpen(true);
                window.requestAnimationFrame(() => {
                  document.getElementById("grammar")?.scrollIntoView({ behavior: "smooth" });
                });
              }}
              className="transition-colors duration-200 hover:text-[var(--dc-paper)]"
            >
              Grammar
            </button>
            <button
              type="button"
              onClick={() => cutTo(goldenHref, "golden")}
              disabled={cutting}
              className="hidden transition-colors duration-200 hover:text-[var(--dc-paper)] sm:inline"
            >
              Golden cut
            </button>
          </nav>
        </header>

        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-end px-5 pb-14 pt-24 sm:px-8 sm:pb-20">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={introDone ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
            transition={{ duration: 0.45, ease: EASE_OUT }}
            className="max-w-3xl"
          >
            <p className="dc-mono mb-4 text-[11px] uppercase tracking-[0.22em] text-[var(--dc-cyan)]">
              Developers × Runway
            </p>
            <h1 className="dc-display dc-brand text-[clamp(3.25rem,14vw,7.5rem)] font-bold leading-[0.88] tracking-[-0.04em] text-[var(--dc-paper)]">
              {DEVCUT.name}
            </h1>
            <p className="dc-display mt-5 max-w-xl text-[clamp(1.35rem,3.4vw,2rem)] font-medium leading-tight tracking-[-0.02em] text-[var(--dc-paper)]">
              Ship like it&apos;s 3 AM in the edit bay.
            </p>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-[var(--dc-mute)] sm:text-lg">
              Plan shots. Generate Runway stills and clips. Stitch a durable MP4. Hand off to
              HyperFrames — without becoming a film studio.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => cutTo(goldenHref, "golden")}
                disabled={cutting}
                data-cuelume-press
                data-cuelume-release
                className="dc-btn inline-flex items-center bg-[var(--dc-signal)] px-5 py-3 dc-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--dc-ink)] hover:bg-[var(--dc-paper)] disabled:opacity-50"
              >
                Run golden cut
              </button>
              <button
                type="button"
                onClick={() => cutTo(hfDemoHref, "hf")}
                disabled={cutting}
                data-cuelume-press
                data-cuelume-release
                className="dc-btn inline-flex items-center border border-[var(--dc-cyan)]/45 bg-[var(--dc-cyan-soft)] px-5 py-3 dc-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--dc-cyan)] hover:border-[var(--dc-cyan)] hover:bg-[var(--dc-cyan)]/20 disabled:opacity-50"
              >
                HyperFrames demo
              </button>
            </div>
          </motion.div>

          <motion.a
            href="#desk"
            initial={{ opacity: 0 }}
            animate={introDone ? { opacity: 1 } : { opacity: 0 }}
            transition={{ delay: 0.2, duration: 0.35, ease: EASE_OUT }}
            className="dc-mono mt-12 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[var(--dc-dim)] hover:text-[var(--dc-mute)]"
          >
            <span className="inline-block h-8 w-px bg-[var(--dc-signal)]" />
            Open the desk
          </motion.a>
        </div>
      </section>

      <RunwayMarquee />

      <section id="desk" className="relative border-t border-[var(--dc-line)] bg-[var(--dc-ink)]">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="dc-mono text-[11px] uppercase tracking-[0.18em] text-[var(--dc-signal)]">
                Desk
              </p>
              <h2 className="dc-display mt-1 text-2xl font-semibold tracking-tight text-[var(--dc-paper)] sm:text-3xl">
                Pick a door. Commission the cut.
              </h2>
            </div>
          </div>

          {lastJob && (
            <div className="mb-6 flex flex-wrap items-center gap-3 border border-[var(--dc-cyan)]/30 bg-[var(--dc-cyan-soft)] px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="dc-mono text-[10px] uppercase tracking-[0.14em] text-[var(--dc-cyan)]">
                  Continue the loop
                </p>
                <p className="mt-0.5 truncate text-sm text-[var(--dc-paper)]">
                  Last cut: {lastJob.title}
                </p>
              </div>
              <Link
                href={lastJobRemixHref(lastJob)}
                className="dc-btn bg-[var(--dc-cyan)] px-4 py-2 dc-mono text-[10px] uppercase tracking-[0.12em] text-[var(--dc-ink)]"
              >
                Remix last
              </Link>
              <a
                href={cutWatchUrl({
                  v: lastJob.video,
                  t: lastJob.title,
                  m: lastJob.mode,
                  s: lastJob.still,
                  b: lastJob.brief,
                })}
                className="dc-btn border border-[var(--dc-line)] px-4 py-2 dc-mono text-[10px] uppercase tracking-[0.12em] text-[var(--dc-mute)]"
              >
                Watch
              </a>
            </div>
          )}

          <ClipDoors door={door} onSelect={selectDoor} />

          {/* One beat: brief + CTA flush under the rail */}
          <div className="border-x border-b border-[var(--dc-line)] bg-[var(--dc-panel)]">
            <AnimatePresence mode="wait">
              <motion.div
                key={door}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: EASE_OUT }}
              >
                {door === "agent" ? (
                  <div className="p-5 sm:p-6">
                    <AgentPaymentsPanel embedded />
                  </div>
                ) : (
                  <div className="flex flex-col gap-0">
                    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--dc-line)] px-4 py-2.5">
                      <span className="dc-mono text-[10px] uppercase tracking-[0.14em] text-[var(--dc-dim)]">
                        Seed
                      </span>
                      {examples.map((ex) => (
                        <button
                          key={ex.label}
                          type="button"
                          onClick={() => setBrief(ex.brief)}
                          className={`dc-btn border px-2.5 py-1 dc-mono text-[10px] uppercase tracking-[0.1em] ${
                            brief === ex.brief
                              ? "border-[var(--dc-signal)]/55 bg-[var(--dc-signal-soft)] text-[var(--dc-signal)]"
                              : "border-transparent text-[var(--dc-dim)] hover:text-[var(--dc-mute)]"
                          }`}
                        >
                          {ex.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-stretch sm:gap-4">
                      <textarea
                        value={brief}
                        onChange={(e) => setBrief(e.target.value)}
                        rows={3}
                        className="min-h-[5.5rem] w-full flex-1 resize-y border border-[var(--dc-line)] bg-black/50 px-3 py-2.5 dc-mono text-sm leading-6 text-[var(--dc-paper)] outline-none placeholder:text-[var(--dc-dim)] focus:border-[var(--dc-cyan)]/50 sm:min-h-0"
                        placeholder={
                          door === "challenge"
                            ? "Product brief, constraint stack, or judging criteria…"
                            : "Product URL, GitHub repo, or HyperFrames notes…"
                        }
                      />
                      <button
                        type="button"
                        onClick={() => cutTo(directorHref, door)}
                        disabled={cutting || !brief.trim()}
                        data-cuelume-press
                        data-cuelume-release
                        className="dc-btn inline-flex shrink-0 items-center justify-center self-stretch bg-[var(--dc-signal)] px-5 py-3 dc-mono text-xs font-medium uppercase tracking-[0.12em] text-[var(--dc-ink)] hover:bg-[var(--dc-paper)] disabled:opacity-40 sm:min-w-[11rem]"
                      >
                        {door === "challenge" ? "Commission cut" : "Run Submit Ready"}
                      </button>
                    </div>
                    <p className="border-t border-[var(--dc-line)] px-4 py-2 dc-mono text-[10px] text-[var(--dc-dim)]">
                      Hard-cut to canvas · MOCK without a Runway key
                    </p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>

      {!grammarOpen ? (
        <section
          id="grammar"
          className="border-t border-[var(--dc-line)] bg-[var(--dc-ink)]"
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-10 sm:px-8">
            <div>
              <p className="dc-mono text-[11px] uppercase tracking-[0.18em] text-[var(--dc-cyan)]">
                Shot grammar
              </p>
              <p className="dc-display mt-2 text-xl font-semibold text-[var(--dc-paper)] sm:text-2xl">
                Brief → Runway → durable cut → HyperFrames
              </p>
              <p className="mt-2 max-w-lg text-sm text-[var(--dc-mute)]">
                Deep dive optional — commission first if you already know the door.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setGrammarOpen(true)}
                className="dc-btn border border-[var(--dc-signal)]/50 bg-[var(--dc-signal-soft)] px-5 py-3 dc-mono text-[11px] uppercase tracking-[0.14em] text-[var(--dc-signal)]"
              >
                See shot grammar
              </button>
              <button
                type="button"
                onClick={() => cutTo(goldenHref, "golden")}
                disabled={cutting}
                className="dc-btn bg-[var(--dc-signal)] px-5 py-3 dc-mono text-[11px] uppercase tracking-[0.14em] text-[var(--dc-ink)] disabled:opacity-50"
              >
                Run golden cut
              </button>
            </div>
          </div>
        </section>
      ) : (
        <StoryStrip
          goldenHref={goldenHref}
          hfDemoHref={hfDemoHref}
          onCut={(href: string, mode: "golden" | "hf") => cutTo(href, mode)}
          onCollapse={() => setGrammarOpen(false)}
        />
      )}

      <section className="border-t border-[var(--dc-line)] bg-[var(--dc-rail)]">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
          >
            <p className="dc-mono text-[11px] uppercase tracking-[0.18em] text-[var(--dc-cyan)]">
              Developers × Runway × HyperFrames
            </p>
            <h2 className="dc-display mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-[var(--dc-paper)] sm:text-4xl">
              Runway heroes. HyperFrames composition.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--dc-mute)]">
              HyperFrames owns code→video. DevCut owns the generative gap: consistent Runway stills
              and clips, a stitch you can share, and a handoff kit you paste into an HF project.
            </p>
          </motion.div>

          <ol className="mt-12 grid gap-8 md:grid-cols-3 md:gap-6">
            {[
              {
                step: "01",
                title: "Generate on Runway",
                body: "Challenge Cut or Submit Ready → stills → clips → stitch on the live canvas.",
              },
              {
                step: "02",
                title: "Copy the handoff",
                body: "BRIEF.md seed + assets/devcut/ drop map attach automatically after export.",
              },
              {
                step: "03",
                title: "Finish in HyperFrames",
                body: "Paste BRIEF, stage media, keep HTML composition + render where it belongs.",
              },
            ].map((row, i) => (
              <motion.li
                key={row.step}
                className="relative"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-8%" }}
                transition={{ duration: 0.35, delay: i * 0.04, ease: EASE_OUT }}
              >
                {i < 2 && (
                  <span
                    aria-hidden
                    className="absolute top-4 hidden h-px w-8 bg-[var(--dc-line)] md:block"
                    style={{ right: "-1rem" }}
                  />
                )}
                <p className="dc-mono text-[clamp(2.5rem,5vw,3.5rem)] font-medium leading-none tracking-tight text-[var(--dc-signal)]/35">
                  {row.step}
                </p>
                <p className="dc-display mt-3 text-lg font-semibold text-[var(--dc-paper)]">
                  {row.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--dc-mute)]">{row.body}</p>
              </motion.li>
            ))}
          </ol>

          <p className="dc-mono mt-10 text-[11px] text-[var(--dc-dim)]">
            <Link href="/about" className="hover:text-[var(--dc-mute)]">
              About
            </Link>
            {" · "}
            <a
              href="https://github.com/thisyearnofear/gen-ui/blob/main/docs/hyperframes.md"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--dc-mute)]"
            >
              DevCut × HyperFrames
            </a>
          </p>
        </div>
      </section>

      <section className="border-t border-[var(--dc-line)]">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 sm:py-20 md:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
          >
            <h2 className="dc-mono text-[11px] uppercase tracking-[0.18em] text-[var(--dc-signal)]">
              Why this exists
            </h2>
            <p className="mt-4 text-base leading-7 text-[var(--dc-mute)]">
              READMEs stay abstract. Runway alone is stills and clips without a desk. HyperFrames
              already owns code→video. DevCut owns the gap: shot grammar, generative heroes, and
              packaging so builders ship a cut without a video team.
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.35, delay: 0.05, ease: EASE_OUT }}
          >
            <h2 className="dc-mono text-[11px] uppercase tracking-[0.18em] text-[var(--dc-cut)]">
              What we refuse
            </h2>
            <p className="mt-4 text-base leading-7 text-[var(--dc-mute)]">
              Generic film studios. Sci-fi playground demos. Competing with HyperFrames authoring.
              BYOK as the hero UX — x402 jobs are the default path we&apos;re building toward.
            </p>
          </motion.div>
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--dc-line)] px-5 py-6 sm:px-8">
        <span className="dc-display text-sm font-semibold tracking-tight">{DEVCUT.name}</span>
        <a
          href="https://github.com/thisyearnofear/gen-ui/blob/main/docs/devcut-thesis.md"
          className="dc-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dc-dim)] hover:text-[var(--dc-mute)]"
          target="_blank"
          rel="noopener noreferrer"
        >
          Product thesis
        </a>
      </footer>
    </div>
  );
}
