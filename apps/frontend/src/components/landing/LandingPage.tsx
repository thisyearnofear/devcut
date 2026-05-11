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

export default function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressTextRef = useRef<HTMLSpanElement>(null);
  const sceneRefs = useRef<(HTMLDivElement | null)[]>([]);
  const visualRef = useRef<HTMLDivElement>(null);
  const lightLeakRef = useRef<HTMLDivElement>(null);
  const heroFrameRef = useRef<HTMLDivElement>(null);
  const heroGlowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

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
              updateVisualState(index);
            }
          }
        });
      });

      function updateVisualState(index: number) {
        if (!visualRef.current) return;
        
        const content = visualRef.current.querySelector(".visual-content");
        if (!content) return;

        gsap.to(content, {
          opacity: 0,
          scale: 0.98,
          duration: 0.2,
          onComplete: () => {
            // Update content based on index
            const labels = [
              "01 · Storyboard Beat",
              "02 · Motion Synthesis",
              "03 · Consistency Engine",
              "04 · Master Export"
            ];
            
            const states = [
              ["Briefing scene", "Mapping 4 shots", "Setting mood", "Ready"],
              ["Still frames", "Optical flow", "Gen-3 Motion", "Processing"],
              ["Anchoring Shot 0", "Tracking Visor", "Refining Skin", "Stable"],
              ["Stitching MP4", "Applying LUTs", "Encoding H.264", "Finished"]
            ];

            content.innerHTML = `
              <div class="space-y-6">
                <div class="flex items-center justify-between">
                  <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-[#ffbe70]">${labels[index]}</p>
                  <span class="h-1.5 w-1.5 rounded-full bg-[#ffbe70] animate-pulse"></span>
                </div>
                <div class="grid gap-3">
                  ${states[index].map((state, i) => `
                    <div class="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] p-3 px-4">
                      <span class="text-xs text-white/50">${state}</span>
                      <span class="font-mono text-[9px] text-white/20">${i === states[index].length - 1 && index < 3 ? "..." : "DONE"}</span>
                    </div>
                  `).join("")}
                </div>
                <div class="aspect-video w-full rounded-2xl border border-white/10 bg-black/40 flex items-center justify-center overflow-hidden">
                   <div class="h-full w-full bg-gradient-to-br from-white/5 to-transparent flex items-center justify-center">
                      <p class="font-mono text-[9px] uppercase tracking-[0.2em] text-white/10">Simulated Shot ${index + 1}</p>
                   </div>
                </div>
              </div>
            `;

            gsap.to(visualRef.current, {
              borderColor: index % 2 === 0 ? "rgba(183, 185, 255, 0.2)" : "rgba(255, 190, 112, 0.2)",
              duration: 0.5
            });
            
            gsap.to(content, {
              opacity: 1,
              scale: 1,
              duration: 0.4,
              ease: "power2.out"
            });
          }
        });
      }

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

              <div className="mt-10 flex items-center gap-8 border-t border-white/10 pt-8">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/42">Platform</p>
                  <p className="mt-1 text-sm text-white/80">Runway Gen-3 Alpha / Gen-4.5</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/42">Output</p>
                  <p className="mt-1 text-sm text-white/80">4K Stitched MP4</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/42">Speed</p>
                  <p className="mt-1 text-sm text-white/80">~2min / 30s film</p>
                </div>
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

        <section className="relative px-6 py-20 md:px-10 lg:px-16">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col lg:flex-row lg:items-start lg:gap-20">
              {/* Sticky Visual Rail */}
              <div className="lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[48%] lg:items-center order-2 lg:order-1">
                <div 
                  ref={visualRef}
                  className="relative aspect-video w-full overflow-hidden rounded-[32px] border border-white/12 bg-[#111118]/88 shadow-2xl backdrop-blur-xl"
                >
                  <div className="visual-content h-full w-full p-8 flex flex-col justify-center">
                    <div className="h-full w-full rounded-2xl border border-white/5 bg-white/[0.02] flex items-center justify-center">
                       <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/20 text-center px-6">
                         Product Preview evolving with scroll...
                       </p>
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-br from-[#7c84ff]/5 via-transparent to-[#ffbe70]/5 pointer-events-none" />
                </div>
              </div>

              {/* Scrolling Beats */}
              <div className="flex-1 space-y-[45vh] pb-[30vh] pt-[15vh] order-1 lg:order-2">
                <div className="max-w-xl">
                  <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-white/38">
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
                    <p className="scene-num mb-4 font-mono text-[10px] uppercase tracking-[0.4em] text-white/26">
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
                <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-white/30">
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
                    className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white px-8 py-4 font-mono text-[12px] uppercase tracking-[0.2em] text-black transition-all hover:bg-white/90"
                  >
                    Launch Director
                  </Link>
                  <Link
                    href="/about"
                    className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.05] px-8 py-4 font-mono text-[12px] uppercase tracking-[0.2em] text-white transition-all hover:bg-white/[0.1] hover:border-white/20"
                  >
                    Read the specs
                  </Link>
                </div>
              </div>

              <div className="space-y-3">
                <p className="mb-6 font-mono text-[10px] uppercase tracking-[0.2em] text-white/20">Quick start templates</p>
                {BRIEFS.map(({ label, scene, brief }) => (
                  <Link
                    key={label}
                    href={`/director?brief=${encodeURIComponent(brief)}`}
                    className="group block rounded-2xl border border-white/5 bg-white/[0.02] p-5 transition-all hover:border-[#ffbe70]/30 hover:bg-[#ffbe70]/5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40 group-hover:text-[#ffbe70]/80">
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
