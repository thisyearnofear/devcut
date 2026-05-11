"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// Respect prefers-reduced-motion at the module level so GSAP skips
// all scroll-driven animations for users who have opted out.
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const SCENES = [
  {
    title: "Brief to storyboard.",
    subtitle: "The agent breaks your idea into cinematic beats.",
    detail:
      "Type one sentence. Director's Canvas plans 3–6 shots with subject, framing, lighting, and mood already mapped.",
    // Visual preview: storyboard planning UI mock
    previewBg: "from-[#1a1a2e] to-[#16213e]",
    previewAccent: "#8f95ff",
    previewLabel: "Storyboard",
    previewItems: [
      { label: "01 · Establishing dome city", status: "planned" },
      { label: "02 · Astronaut exits airlock", status: "planned" },
      { label: "03 · Reflective visor close-up", status: "planned" },
      { label: "04 · Walk into golden skyline", status: "planned" },
    ],
  },
  {
    title: "Still to motion.",
    subtitle: "Runway reference stills become animated clips.",
    detail:
      "Each shot gets its own reference image, then Gen-4.5 turns that frame into motion while preserving visual intent.",
    previewBg: "from-[#1a1200] to-[#1e1600]",
    previewAccent: "#ffbe70",
    previewLabel: "Motion synthesis",
    previewItems: [
      { label: "Optical flow computed", status: "done" },
      { label: "Gen-4.5 motion pass", status: "active" },
      { label: "Temporal consistency", status: "active" },
      { label: "Clip encoded", status: "waiting" },
    ],
  },
  {
    title: "Consistent by design.",
    subtitle: "Characters and style stay coherent across scenes.",
    detail:
      "Shot 0 anchors every subsequent still, so the astronaut in shot four still looks like the astronaut in shot one.",
    previewBg: "from-[#0d1a1a] to-[#0a1520]",
    previewAccent: "#c5b6ff",
    previewLabel: "Consistency engine",
    previewItems: [
      { label: "Style anchor · Shot 0", status: "done" },
      { label: "Character tracking", status: "done" },
      { label: "Visor reflection match", status: "active" },
      { label: "Cross-shot coherence", status: "active" },
    ],
  },
  {
    title: "Final cut ready.",
    subtitle: "Export one stitched MP4 in a single flow.",
    detail:
      "No prompt juggling, no timeline assembly, no manual NLE pass just to see the result.",
    previewBg: "from-[#1a0d00] to-[#1a1200]",
    previewAccent: "#ffd08d",
    previewLabel: "Master export",
    previewItems: [
      { label: "4 clips stitched", status: "done" },
      { label: "LUT applied", status: "done" },
      { label: "H.264 encoded", status: "done" },
      { label: "MP4 ready", status: "done" },
    ],
  },
];

const BRIEFS = [
  {
    label: "Sci-fi opener",
    scene: "Lone astronaut · Glass-domed city · Golden hour",
    brief:
      "Direct a 30-second sci-fi opening: a lone astronaut steps onto a glass-domed alien city at golden hour. 4 shots.",
  },
  {
    label: "Product reveal",
    scene: "Ceramic mug · Studio light · Slow rotation",
    brief:
      "Direct a 20-second cinematic product reveal for a wireless ceramic coffee mug, premium minimalist style. 4 shots.",
  },
  {
    label: "Travel reel",
    scene: "Lisbon · Blue hour · Trams and tile",
    brief:
      "Direct a 25-second travel reel for Lisbon at blue hour — trams, azulejo tiles, the river. 5 shots.",
  },
  {
    label: "Vertical TikTok",
    scene: "Indie band · Neon · Static Garden",
    brief:
      "Direct a 15-second vertical TikTok teaser for an indie band's new track 'Static Garden'. 3 shots, 720:1280.",
  },
];

// Status dot colors for the workflow preview cards
const STATUS_DOT: Record<string, string> = {
  done: "bg-emerald-400",
  active: "bg-amber-400 animate-pulse",
  waiting: "bg-white/20",
  planned: "bg-indigo-400",
};
const STATUS_TEXT: Record<string, string> = {
  done: "text-emerald-400/80",
  active: "text-amber-400/80",
  waiting: "text-white/35",
  planned: "text-indigo-300/80",
};
const STATUS_LABEL_MAP: Record<string, string> = {
  done: "Done",
  active: "Running",
  waiting: "Queued",
  planned: "Planned",
};

/**
 * WorkflowVisual — replaces the old "Simulated shot N" placeholder with a
 * real-looking pipeline UI card that reflects what the Director actually does.
 * Each scene has its own color accent and status items.
 */
function WorkflowVisual({ index }: { index: number }) {
  const scene = SCENES[index];

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${scene.previewBg} shadow-2xl lg:rounded-[28px]`}
    >
      {/* Ambient glow matching scene accent */}
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          background: `radial-gradient(ellipse 70% 60% at 50% 0%, ${scene.previewAccent}40, transparent 70%)`,
        }}
      />

      <div className="relative p-5 sm:p-6 lg:p-7">
        {/* Header row */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: scene.previewAccent }}
            />
            <p
              className="font-mono text-[11px] uppercase tracking-[0.16em]"
              style={{ color: scene.previewAccent }}
            >
              {scene.previewLabel}
            </p>
          </div>
          <span className="font-mono text-[11px] text-white/40">
            {String(index + 1).padStart(2, "0")} / 04
          </span>
        </div>

        {/* Pipeline items */}
        <div className="space-y-2.5">
          {scene.previewItems.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3.5 py-2.5"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[item.status]}`} />
                <span className="truncate text-xs text-white/75">{item.label}</span>
              </div>
              <span className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] ${STATUS_TEXT[item.status]}`}>
                {STATUS_LABEL_MAP[item.status]}
              </span>
            </div>
          ))}
        </div>

        {/* Bottom accent bar */}
        <div className="mt-5 h-px w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${(scene.previewItems.filter((i) => i.status === "done" || i.status === "planned").length / scene.previewItems.length) * 100}%`,
              backgroundColor: scene.previewAccent,
              opacity: 0.6,
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [activeScene, setActiveScene] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressTextRef = useRef<HTMLSpanElement>(null);
  const sceneRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lightLeakRef = useRef<HTMLDivElement>(null);
  const heroFrameRef = useRef<HTMLDivElement>(null);
  const heroGlowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      // Progress bar
      gsap.to(progressBarRef.current, {
        scaleX: 1,
        ease: "none",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: "bottom bottom",
          scrub: true,
          onUpdate: (self) => {
            if (progressTextRef.current) {
              progressTextRef.current.textContent =
                Math.round(self.progress * 100)
                  .toString()
                  .padStart(3, "0") + "%";
            }
          },
        },
      });

      // Parallax and glows
      gsap.to(lightLeakRef.current, {
        y: "-26%",
        ease: "none",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: "bottom bottom",
          scrub: true,
        },
      });

      gsap.to(heroGlowRef.current, {
        scale: 1.18,
        opacity: 0.34,
        ease: "none",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: "40% top",
          scrub: true,
        },
      });

      gsap.to(heroFrameRef.current, {
        y: -34,
        scale: 1.01,
        ease: "none",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: "30% top",
          scrub: true,
        },
      });

      // Sticky Scenes Logic
      sceneRefs.current.forEach((el, index) => {
        if (!el) return;
        
        const title = el.querySelector("h2");
        const sub = el.querySelector(".scene-sub");
        const detail = el.querySelector(".scene-detail");
        const num = el.querySelector(".scene-num");

        gsap.fromTo([num, title, sub, detail], 
          { opacity: 0, y: 30 },
          {
            opacity: 1,
            y: 0,
            duration: 0.8,
            stagger: 0.1,
            ease: "power3.out",
            scrollTrigger: {
              trigger: el,
              start: "top 75%",
              end: "bottom 25%",
              toggleActions: "play reverse play reverse",
            }
          }
        );

        // Update visual state based on scroll
        ScrollTrigger.create({
          trigger: el,
          start: "top center",
          end: "bottom center",
          onToggle: (self) => {
            if (self.isActive) {
              setActiveScene(index);
            }
          }
        });
      });

    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="relative overflow-x-hidden bg-[#09090d] text-white">
      <div className="fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[#09090d]" />
        <div
          ref={lightLeakRef}
          className="absolute -top-[18%] right-[-6%] h-[130%] w-[58%]"
          style={{
            background:
              "radial-gradient(ellipse 62% 80% at 100% 0%, rgba(255,210,120,0.12) 0%, rgba(255,174,74,0.08) 28%, rgba(125,92,255,0.06) 52%, transparent 72%)",
          }}
        />
        <div
          ref={heroGlowRef}
          className="absolute left-[8%] top-[14%] h-[42%] w-[32%] rounded-full opacity-25 blur-[100px]"
          style={{
            background:
              "radial-gradient(circle at center, rgba(124,132,255,0.34) 0%, rgba(124,132,255,0.14) 35%, transparent 70%)",
          }}
        />
        <div
          className="absolute left-[-8%] top-[18%] h-[54%] w-[42%]"
          style={{
            background:
              "radial-gradient(circle at 30% 30%, rgba(109,117,255,0.16) 0%, rgba(109,117,255,0.08) 35%, transparent 68%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 90% 85% at 50% 45%, transparent 36%, rgba(0,0,0,0.58) 100%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.45) 2px, rgba(255,255,255,0.45) 3px)",
            backgroundSize: "100% 4px",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            backgroundSize: "180px 180px",
          }}
        />
      </div>

      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[clamp(20px,4vh,44px)] bg-black/80 backdrop-blur-sm" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-[clamp(20px,4vh,44px)] bg-black/80 backdrop-blur-sm" />

      <nav className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between px-6 py-5 md:px-8 md:py-6">
        <span className="min-w-0 truncate font-mono text-[11px] uppercase tracking-[0.18em] text-white/72 sm:tracking-[0.3em]">
          🦬 Director&apos;s Canvas
        </span>
        <div className="flex shrink-0 items-center gap-3 sm:gap-5 md:gap-8">
          <a
            href="/about"
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/68 transition-colors hover:text-white/90"
          >
            About
          </a>
          <Link
            href="/director"
            className="rounded-full border border-white/20 bg-white px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-black transition-all hover:bg-white/90 sm:px-4"
          >
            <span className="hidden sm:inline">Launch </span>Director
          </Link>
        </div>
      </nav>

      <div className="fixed bottom-6 left-1/2 z-50 w-52 -translate-x-1/2 pointer-events-none md:bottom-8">
        <div className="absolute -top-2 left-0 h-2 w-2 border-l border-t border-white/20" />
        <div className="absolute -top-2 right-0 h-2 w-2 border-r border-t border-white/20" />
        <div className="absolute -bottom-2 left-0 h-2 w-2 border-l border-b border-white/20" />
        <div className="absolute -bottom-2 right-0 h-2 w-2 border-r border-b border-white/20" />
        <div className="mb-1.5 text-center">
          <span
            ref={progressTextRef}
            className="font-mono text-[11px] tracking-[0.2em] text-white/58"
          >
            000%
          </span>
        </div>
        <div className="h-px w-full bg-white/12">
          <div
            ref={progressBarRef}
            className="h-full origin-left bg-gradient-to-r from-[#ffb766] via-[#b7b9ff] to-white/80"
            style={{ transform: "scaleX(0)" }}
          />
        </div>
      </div>

      <div className="relative z-10">
        <section className="flex min-h-screen items-center px-6 pb-20 pt-28 md:px-10 lg:px-16">
          <div
            ref={heroFrameRef}
            className="mx-auto grid w-full max-w-7xl gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] lg:items-center"
          >
            <div className="max-w-3xl">
              <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.22em] text-[#f7c982]/88 md:tracking-[0.35em]">
                Runway API · Agent-directed video production
              </p>

              <h1
                className="text-[clamp(2.35rem,9vw,6.9rem)] font-semibold leading-[1.02] tracking-tight text-white sm:leading-[0.96] lg:tracking-[-0.04em]"
                style={{ textShadow: "0 0 100px rgba(125,92,255,0.08)" }}
              >
                Turn one-line briefs
                <br />
                <span className="bg-gradient-to-r from-white via-[#d5d7ff] to-[#ffcf8f] bg-clip-text text-transparent">
                  into storyboarded AI video.
                </span>
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-8 text-white/72 md:text-lg">
                Describe a scene. Director&apos;s Canvas plans the shots, generates Runway stills,
                animates clips, and exports a final cut all inside one cinematic workspace.
              </p>

              <div className="mt-8 flex flex-col gap-3 md:flex-row md:items-center">
                <Link
                  href="/director"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white px-7 py-3.5 font-mono text-[12px] uppercase tracking-[0.16em] text-black transition-all hover:bg-white/90"
                >
                  Launch Director
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-emerald-400">
                    Mock-ready
                  </span>
                </Link>
                <Link
                  href="/about"
                  className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-6 py-3.5 font-mono text-[12px] uppercase tracking-[0.16em] text-white/72 transition-all hover:border-white/26 hover:bg-white/[0.08] hover:text-white"
                >
                  See how it works
                </Link>
              </div>

              <div className="mt-10 grid gap-5 border-t border-white/10 pt-8 sm:grid-cols-3 sm:gap-6 lg:gap-8">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/60">Platform</p>
                  <p className="mt-1 text-sm text-white/80">Runway Gen-3 Alpha / Gen-4.5</p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/60">Output</p>
                  <p className="mt-1 text-sm text-white/80">4K Stitched MP4</p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/60">Speed</p>
                  <p className="mt-1 text-sm text-white/80">~2min / 30s film</p>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-4 rounded-[32px] bg-gradient-to-br from-[#7c84ff]/18 via-transparent to-[#ffbe70]/12 blur-3xl" />
              <div className="relative overflow-hidden rounded-[28px] border border-white/12 bg-[#111118]/88 p-5 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-between border-b border-white/8 pb-4">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/60">
                      Example workflow
                    </p>
                    <p className="mt-1 text-sm text-white/68">Brief → shots → clips → final cut</p>
                  </div>
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-emerald-300">
                    Mock-ready
                  </span>
                </div>

                <div className="mt-5 space-y-4">
                  <div className="rounded-2xl border border-[#8f95ff]/18 bg-[#8f95ff]/10 p-4">
                    <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#d6d8ff]">
                      Brief
                    </p>
                    <p className="mt-2 text-sm leading-7 text-white/88">
                      “Direct a 30-second sci-fi opener: a lone astronaut steps onto a glass-domed alien city at golden hour.”
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/60">
                        Generated shots
                      </p>
                      <ul className="mt-3 space-y-2 text-sm text-white/72">
                        <li>01 · Establishing dome city</li>
                        <li>02 · Astronaut exits airlock</li>
                        <li>03 · Reflective visor close-up</li>
                        <li>04 · Walk into golden skyline</li>
                      </ul>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/60">
                        Output status
                      </p>
                      <div className="mt-3 space-y-3">
                        {[
                          ["Storyboard planned", "done"],
                          ["Reference stills", "4 / 4"],
                          ["Animated clips", "3 / 4"],
                          ["Final cut", "pending"],
                        ].map(([label, status]) => (
                          <div key={label} className="flex items-center justify-between gap-3">
                            <span className="text-sm text-white/68">{label}</span>
                            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#ffcf8f]">
                              {status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/60">
                        Why it&apos;s useful
                      </p>
                      <p className="mt-2 text-sm leading-7 text-white/66">
                        You stay inside one interface instead of jumping between prompts, stills, clips, and export tools.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[#ffbe70]/18 bg-[#ffbe70]/10 p-4">
                      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#ffe0b4]">
                        Final output
                      </p>
                      <p className="mt-2 text-sm leading-7 text-white/86">
                        One stitched MP4, ready to download, demo, or share with your team.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Example output strip ── */}
        <section className="relative border-t border-white/[0.06] px-6 py-16 md:px-10 lg:px-16">
          <div className="mx-auto max-w-7xl">
            <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#f7c982]/80">
                  Real output · Ceramic mug product reveal
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-white md:text-2xl">
                  4 shots · ~2 min · Runway Gen-4.5
                </h2>
              </div>
              <Link
                href="/director"
                className="shrink-0 self-start rounded-full border border-white/14 bg-white/[0.05] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white/72 transition-all hover:border-white/26 hover:bg-white/[0.09] hover:text-white sm:self-auto"
              >
                Make your own →
              </Link>
            </div>

            {/* Shot grid */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { beat: "Establishing", label: "01 · Studio wide", status: "Ready ✓ · 18s" },
                { beat: "Close-up", label: "02 · Mug detail", status: "Ready ✓ · 22s" },
                { beat: "Rotation", label: "03 · Slow spin", status: "Ready ✓ · 19s" },
                { beat: "Hero", label: "04 · Steam rising", status: "Ready ✓ · 21s" },
              ].map((shot) => (
                <div
                  key={shot.beat}
                  className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
                  style={{ aspectRatio: "16/9" }}
                >
                  {/* Gradient placeholder simulating a generated still */}
                  <div className="absolute inset-0 bg-gradient-to-br from-[#1a1200] via-[#2a1e00] to-[#1a1200]" />
                  <div
                    className="absolute inset-0 opacity-30"
                    style={{
                      background: `radial-gradient(ellipse 80% 60% at 50% 40%, #ffbe7040, transparent 70%)`,
                    }}
                  />
                  <div className="absolute inset-0 flex flex-col justify-between p-3">
                    <span className="self-start rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white/70 backdrop-blur-sm">
                      {shot.label}
                    </span>
                    <span className="self-start rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
                      {shot.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Final cut bar */}
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="size-2 shrink-0 rounded-full bg-emerald-400" />
                <div>
                  <p className="text-sm font-semibold text-white">Final cut ready</p>
                  <p className="text-xs text-white/50">ceramic-mug-product-reveal.mp4 · 4 shots stitched · FFmpeg concat</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-400 ring-1 ring-sky-500/20">
                  <span>⬡</span> Saved to Grove
                </span>
                <Link
                  href="/director"
                  className="rounded-full border border-white/14 bg-white/[0.06] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-white/80 transition-all hover:bg-white/[0.12]"
                >
                  Try it yourself
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="relative px-6 py-20 md:px-10 lg:px-16">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col lg:flex-row lg:items-start lg:gap-20">
              {/* Sticky Visual Rail */}
              <div className="order-2 hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[48%] lg:items-center lg:order-1">
                <WorkflowVisual index={activeScene} />
              </div>

              {/* Scrolling Beats */}
              <div className="order-1 flex-1 space-y-12 pb-8 pt-0 lg:order-2 lg:space-y-[45vh] lg:pb-[30vh] lg:pt-[15vh]">
                <div className="max-w-xl">
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/62 md:tracking-[0.35em]">
                    The Workflow
                  </p>
                  <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
                    Coordinated production,
                    <br />
                    not just isolated clips.
                  </h2>
                </div>

                {SCENES.map((scene, i) => (
                  <div
                    key={scene.title}
                    ref={(el) => {
                      sceneRefs.current[i] = el;
                    }}
                    className="max-w-xl"
                  >
                    <p className="scene-num mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">
                      Beat {String(i + 1).padStart(2, "0")}
                    </p>
                    <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white md:text-4xl">
                      {scene.title}
                    </h2>
                    <p className="scene-sub mt-5 text-base leading-7 text-[#d4d7ff]/88">
                      {scene.subtitle}
                    </p>
                    <p className="scene-detail mt-4 text-sm leading-7 text-white/58">
                      {scene.detail}
                    </p>
                    <div className="mt-6 lg:hidden">
                      <WorkflowVisual index={i} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-6 py-24 md:px-10 lg:px-16 border-t border-white/5">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)] lg:items-center">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/58 md:tracking-[0.35em]">
                  Ready to direct?
                </p>
                <h2 className="mt-6 text-4xl font-semibold tracking-tight text-white md:text-5xl lg:text-6xl">
                  Start from a brief,
                  <br />
                  <span className="text-[#ffbe70]">finish with a film.</span>
                </h2>
                <p className="mt-8 max-w-xl text-lg leading-8 text-white/60">
                  Open the canvas and describe your scene. Use MOCK mode to explore the workflow instantly, or connect your Runway API key for live 4K generation.
                </p>
                
                <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
                  <Link
                    href="/director"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white px-8 py-4 font-mono text-[12px] uppercase tracking-[0.16em] text-black transition-all hover:bg-white/90"
                  >
                    Launch Director
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-emerald-400">
                      Mock-ready
                    </span>
                  </Link>
                  <Link
                    href="/about"
                    className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.05] px-8 py-4 font-mono text-[12px] uppercase tracking-[0.16em] text-white/72 transition-all hover:bg-white/[0.1] hover:border-white/20"
                  >
                    Read the specs
                  </Link>
                </div>
              </div>

              <div className="space-y-3">
                <p className="mb-6 font-mono text-[11px] uppercase tracking-[0.16em] text-white/58">Quick start templates</p>
                {BRIEFS.map(({ label, scene, brief }) => (
                  <Link
                    key={label}
                    href={`/director?brief=${encodeURIComponent(brief)}`}
                    className="group block rounded-2xl border border-white/5 bg-white/[0.02] p-5 transition-all hover:border-[#ffbe70]/30 hover:bg-[#ffbe70]/5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/62 group-hover:text-[#ffbe70]/90">
                        {label}
                      </span>
                      <span className="opacity-0 transition-opacity group-hover:opacity-100 text-[#ffbe70]">→</span>
                    </div>
                    <p className="mt-2 text-sm text-white/60 group-hover:text-white/80 line-clamp-1">{scene}</p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-white/[0.06] px-6 py-8 md:px-10 lg:px-16">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/52">
              Director&apos;s Canvas · 2026
            </span>
            <div className="flex flex-wrap gap-6">
              {[
                { label: "About", href: "/about" },
                { label: "GitHub", href: "https://github.com/thisyearnofear/directors-canvas" },
                { label: "Runway", href: "https://docs.dev.runwayml.com" },
              ].map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  target={href.startsWith("http") ? "_blank" : undefined}
                  rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/52 transition-colors hover:text-white/78"
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
