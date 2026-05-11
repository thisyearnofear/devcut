"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const SCENES = [
  {
    title: "Brief to storyboard.",
    subtitle: "The agent breaks your idea into cinematic beats.",
    detail:
      "Type one sentence. Director's Canvas plans 3–6 shots with subject, framing, lighting, and mood already mapped.",
    accent: "from-[#b7b9ff]/75 via-white/28 to-transparent",
  },
  {
    title: "Still to motion.",
    subtitle: "Runway reference stills become animated clips.",
    detail:
      "Each shot gets its own reference image, then Gen-4.5 turns that frame into motion while preserving visual intent.",
    accent: "from-[#ffbe70]/75 via-white/28 to-transparent",
  },
  {
    title: "Consistent by design.",
    subtitle: "Characters and style stay coherent across scenes.",
    detail:
      "Shot 0 anchors every subsequent still, so the astronaut in shot four still looks like the astronaut in shot one.",
    accent: "from-[#c5b6ff]/75 via-white/28 to-transparent",
  },
  {
    title: "Final cut ready.",
    subtitle: "Export one stitched MP4 in a single flow.",
    detail:
      "No prompt juggling, no timeline assembly, no manual NLE pass just to see the result.",
    accent: "from-[#ffd08d]/75 via-white/28 to-transparent",
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

const PROOF_CARDS = [
  {
    title: "Shot planning",
    body: "The canvas decomposes a rough idea into a shot list with prompts and pacing before generation starts.",
  },
  {
    title: "Live generation",
    body: "Watch stills, clips, and export status update inside the interface instead of bouncing between tools.",
  },
  {
    title: "Character consistency",
    body: "Runway reference chaining keeps the lead subject stable across scenes, not just within one image.",
  },
  {
    title: "Final MP4 export",
    body: "Once all clips are ready, the app stitches a final cut you can download or share immediately.",
  },
];

export default function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressTextRef = useRef<HTMLSpanElement>(null);
  const sceneRefs = useRef<(HTMLElement | null)[]>([]);
  const lightLeakRef = useRef<HTMLDivElement>(null);
  const heroFrameRef = useRef<HTMLDivElement>(null);
  const heroGlowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const ctx = gsap.context(() => {
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

      sceneRefs.current.forEach((el, index) => {
        if (!el) return;
        const card = el.querySelector(".scene-card");
        const number = el.querySelector(".scene-number");
        const title = el.querySelector(".scene-title");
        const sub = el.querySelector(".scene-sub");
        const detail = el.querySelector(".scene-detail");
        const rule = el.querySelector(".scene-rule");

        if (title) {
          const text = title.textContent ?? "";
          title.innerHTML = text
            .split("")
            .map((c) =>
              c === " "
                ? '<span style="display:inline-block;width:0.32em"> </span>'
                : `<span class="char" style="display:inline-block;opacity:0;transform:translateX(-28px)">${c}</span>`,
            )
            .join("");
        }

        const chars = el.querySelectorAll(".char");

        gsap.set([card, number, sub, detail, rule], {
          opacity: 0,
        });
        gsap.set(card, {
          y: 34,
          x: index % 2 === 0 ? -18 : 18,
        });
        gsap.set(number, { y: 16 });
        gsap.set(sub, { y: 18 });
        gsap.set(detail, { y: 14 });
        gsap.set(rule, { scaleX: 0.6, transformOrigin: index % 2 === 0 ? "left center" : "right center" });

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: el,
            start: "top 74%",
            end: "bottom 34%",
            toggleActions: "play reverse play reverse",
          },
        });

        tl.to(card, {
          opacity: 1,
          y: 0,
          x: 0,
          duration: 0.5,
          ease: "power3.out",
        })
          .to(number, { opacity: 1, y: 0, duration: 0.3 }, "-=0.32")
          .to(
            chars,
            {
              opacity: 1,
              x: 0,
              duration: 0.55,
              stagger: 0.02,
              ease: "power3.out",
            },
            "-=0.12",
          )
          .to(sub, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, "-=0.28")
          .to(detail, { opacity: 1, y: 0, duration: 0.36, ease: "power2.out" }, "-=0.22")
          .to(rule, { opacity: 1, scaleX: 1, duration: 0.35, ease: "power2.out" }, "-=0.18");
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
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/58">
          🦬 Director&apos;s Canvas
        </span>
        <div className="flex items-center gap-5 md:gap-8">
          <a
            href="/about"
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/48 transition-colors hover:text-white/85"
          >
            About
          </a>
          <Link
            href="/director"
            className="rounded-full border border-white/16 bg-white/[0.06] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/80 transition-all hover:border-white/32 hover:bg-white/[0.12] hover:text-white"
          >
            Open Director
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
            className="font-mono text-[10px] tracking-[0.25em] text-white/35"
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
              <p className="mb-5 font-mono text-[10px] uppercase tracking-[0.35em] text-[#f7c982]/78">
                Runway API · Agent-directed video production
              </p>

              <h1
                className="text-[clamp(3rem,8vw,6.9rem)] font-semibold leading-[0.92] tracking-[-0.04em] text-white"
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

              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                <Link
                  href="/director"
                  className="inline-flex items-center justify-center rounded-full border border-white/18 bg-gradient-to-r from-[#8f95ff]/28 to-[#ffbe70]/22 px-6 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-white transition-all hover:border-white/34 hover:from-[#8f95ff]/38 hover:to-[#ffbe70]/30"
                >
                  Open Director
                </Link>
                <Link
                  href="/about"
                  className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-6 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-white/72 transition-all hover:border-white/26 hover:bg-white/[0.08] hover:text-white"
                >
                  See how it works
                </Link>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/38">
                  No sign-up · MOCK mode available
                </span>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  ["Built for", "Creative teams, founders, and directors prototyping short-form video ideas."],
                  ["Best for", "Pitch films, product reveals, mood-driven explainers, and social teasers."],
                  ["What you get", "A storyboard, generated clips, and one final MP4 instead of disconnected outputs."],
                ].map(([title, body]) => (
                  <div key={title} className="rounded-2xl border border-white/10 bg-black/24 px-4 py-4 backdrop-blur-sm">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/42">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-white/64">{body}</p>
                  </div>
                ))}
              </div>

              <div className="mt-10 grid gap-3 sm:grid-cols-3">
                {[
                  ["1", "Enter a brief"],
                  ["2", "Review generated shots"],
                  ["3", "Export the final MP4"],
                ].map(([step, label]) => (
                  <div
                    key={step}
                    className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-4 backdrop-blur-sm"
                  >
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/42">
                      Step {step}
                    </p>
                    <p className="mt-2 text-sm font-medium text-white/88">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-4 rounded-[32px] bg-gradient-to-br from-[#7c84ff]/18 via-transparent to-[#ffbe70]/12 blur-3xl" />
              <div className="relative overflow-hidden rounded-[28px] border border-white/12 bg-[#111118]/88 p-5 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-between border-b border-white/8 pb-4">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/38">
                      Example workflow
                    </p>
                    <p className="mt-1 text-sm text-white/68">Brief → shots → clips → final cut</p>
                  </div>
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-300">
                    Mock-ready
                  </span>
                </div>

                <div className="mt-5 space-y-4">
                  <div className="rounded-2xl border border-[#8f95ff]/18 bg-[#8f95ff]/10 p-4">
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#d6d8ff]">
                      Brief
                    </p>
                    <p className="mt-2 text-sm leading-7 text-white/88">
                      “Direct a 30-second sci-fi opener: a lone astronaut steps onto a glass-domed alien city at golden hour.”
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/42">
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
                      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/42">
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
                            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#ffcf8f]">
                              {status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/42">
                        Why it&apos;s useful
                      </p>
                      <p className="mt-2 text-sm leading-7 text-white/66">
                        You stay inside one interface instead of jumping between prompts, stills, clips, and export tools.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[#ffbe70]/18 bg-[#ffbe70]/10 p-4">
                      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#ffe0b4]">
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

        <section className="px-6 py-10 md:px-10 lg:px-16">
          <div className="mx-auto max-w-7xl rounded-[30px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md md:p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/38">
                  Product proof
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white md:text-3xl">
                  More than a prompt box with a video API behind it.
                </h2>
              </div>
              <p className="max-w-xl text-sm leading-7 text-white/62 md:text-right">
                The platform coordinates planning, generation, consistency, and export so the output feels like a directed sequence rather than isolated clips. It is designed to replace a fragmented workflow of prompts, stills, clip generations, and manual stitching.
              </p>
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {PROOF_CARDS.map((card, index) => (
                <div
                  key={card.title}
                  className="rounded-2xl border border-white/10 bg-[#0f1016]/84 p-5"
                >
                  <p className="text-base font-medium text-white/90">{card.title}</p>
                  <p className="mt-3 text-sm leading-7 text-white/60">{card.body}</p>
                  <div
                    className={`mt-5 h-px w-16 bg-gradient-to-r ${
                      index % 2 === 0
                        ? "from-[#b7b9ff]/70 via-white/24 to-transparent"
                        : "from-[#ffbe70]/70 via-white/24 to-transparent"
                    }`}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {SCENES.map((scene, i) => (
          <section
            key={scene.title}
            ref={(el) => {
              sceneRefs.current[i] = el;
            }}
            className="flex min-h-[86vh] items-center px-6 py-16 md:px-10 lg:px-16"
            style={{ justifyContent: i % 2 === 0 ? "flex-start" : "flex-end" }}
          >
            <div
              className="scene-card max-w-2xl rounded-[32px] border border-white/10 bg-black/28 px-6 py-8 shadow-[0_40px_120px_rgba(0,0,0,0.22)] backdrop-blur-md md:px-8 md:py-10"
              style={{ textAlign: i % 2 === 0 ? "left" : "right" }}
            >
              <p className="scene-number mb-4 font-mono text-[9px] uppercase tracking-[0.4em] text-white/26">
                {String(i + 1).padStart(2, "0")} / {String(SCENES.length).padStart(2, "0")}
              </p>
              <h2 className="scene-title text-[clamp(2.2rem,5vw,4.7rem)] font-semibold leading-[0.95] tracking-[-0.03em] text-white">
                {scene.title}
              </h2>
              <p className="scene-sub mt-4 text-base leading-7 text-[#d4d7ff]/88">
                {scene.subtitle}
              </p>
              <p className="scene-detail mt-4 max-w-xl text-sm leading-7 text-white/58">
                {scene.detail}
              </p>
              <div
                className={`scene-rule mt-6 h-px bg-gradient-to-r ${scene.accent}`}
                style={{
                  width: "clamp(90px, 12vw, 160px)",
                  marginLeft: i % 2 !== 0 ? "auto" : undefined,
                }}
              />
            </div>
          </section>
        ))}

        <section className="px-6 py-20 md:px-10 lg:px-16">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-white/30">
                  Try a prompt
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white md:text-3xl">
                  Start from a ready-made scene.
                </h2>
              </div>
              <p className="max-w-2xl text-sm leading-7 text-white/60">
                Pick an example to open the director with a pre-filled brief, or start from scratch in MOCK mode and see the full workflow instantly.
              </p>
            </div>

            <div className="mt-8 grid gap-3 bg-white/[0.06] sm:grid-cols-2">
              {BRIEFS.map(({ label, scene, brief }) => (
                <Link
                  key={label}
                  href={`/director?brief=${encodeURIComponent(brief)}`}
                  className="group relative bg-[#0d0e13] px-6 py-6 transition-all hover:bg-[#141622]"
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#8f95ff]/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#d8dbff]/72 transition-colors group-hover:text-white">
                    {label}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-white/58 transition-colors group-hover:text-white/78">
                    {scene}
                  </p>
                  <span className="absolute right-6 top-1/2 -translate-y-1/2 font-mono text-white/22 transition-all group-hover:right-4 group-hover:text-[#ffcf8f]">
                    →
                  </span>
                </Link>
              ))}
            </div>

            <div className="mt-12 flex flex-col items-start gap-4 rounded-[28px] border border-white/10 bg-gradient-to-r from-[#12141f]/95 via-[#12131b]/95 to-[#1a1510]/95 px-6 py-6 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/36">
                  Ready to try it?
                </p>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-white/68">
                  Open the canvas, use mock mode if you just want to explore, or add your Runway key when you&apos;re ready for live generation.
                </p>
              </div>
              <Link
                href="/director"
                className="inline-flex items-center justify-center rounded-full border border-white/18 bg-white/[0.08] px-6 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-white/86 transition-all hover:border-white/34 hover:bg-white/[0.14] hover:text-white"
              >
                Open the canvas
              </Link>
            </div>
          </div>
        </section>

        <footer className="border-t border-white/[0.06] px-6 py-8 md:px-10 lg:px-16">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/22">
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
                  className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/24 transition-colors hover:text-white/56"
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
