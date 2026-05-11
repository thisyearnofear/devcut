"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// ---------------------------------------------------------------------------
// Scene data — each scene is a scroll section with title + subtitle
// ---------------------------------------------------------------------------

const SCENES = [
  {
    title: "One brief.",
    subtitle: "The agent handles the rest.",
    detail: "Type a single sentence. The Director decomposes it into shots.",
  },
  {
    title: "Shot by shot.",
    subtitle: "Runway Gen-4 reference stills.",
    detail: "Each beat gets a reference image. Character consistency across every frame.",
  },
  {
    title: "Frame by frame.",
    subtitle: "Gen-4.5 animation.",
    detail: "Every still becomes a clip. The astronaut in shot 4 looks like shot 1.",
  },
  {
    title: "Final cut.",
    subtitle: "One MP4. One button.",
    detail: "FFmpeg stitches all clips. Download or share.",
  },
];

const BRIEFS = [
  {
    label: "Sci-fi opener",
    scene: "Lone astronaut · Glass-domed city · Golden hour",
    brief: "Direct a 30-second sci-fi opening: a lone astronaut steps onto a glass-domed alien city at golden hour. 4 shots.",
  },
  {
    label: "Product reveal",
    scene: "Ceramic mug · Studio light · Slow rotation",
    brief: "Direct a 20-second cinematic product reveal for a wireless ceramic coffee mug, premium minimalist style. 4 shots.",
  },
  {
    label: "Travel reel",
    scene: "Lisbon · Blue hour · Trams and tile",
    brief: "Direct a 25-second travel reel for Lisbon at blue hour — trams, azulejo tiles, the river. 5 shots.",
  },
  {
    label: "Vertical TikTok",
    scene: "Indie band · Neon · Static Garden",
    brief: "Direct a 15-second vertical TikTok teaser for an indie band's new track 'Static Garden'. 3 shots, 720:1280.",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressTextRef = useRef<HTMLSpanElement>(null);
  const sceneRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lightLeakRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const ctx = gsap.context(() => {
      // Progress bar scrub
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
                Math.round(self.progress * 100).toString().padStart(3, "0") + "%";
            }
          },
        },
      });

      // Light leak parallax
      gsap.to(lightLeakRef.current, {
        y: "-30%",
        ease: "none",
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: "bottom bottom",
          scrub: true,
        },
      });

      // Per-scene text reveals
      sceneRefs.current.forEach((el, i) => {
        if (!el) return;
        const title = el.querySelector(".scene-title");
        const sub = el.querySelector(".scene-sub");
        const detail = el.querySelector(".scene-detail");

        // Split title into chars
        if (title) {
          const text = title.textContent ?? "";
          title.innerHTML = text
            .split("")
            .map((c) =>
              c === " "
                ? '<span style="display:inline-block;width:0.3em"> </span>'
                : `<span class="char" style="display:inline-block;opacity:0;transform:translateX(-40px)">${c}</span>`
            )
            .join("");
        }

        const chars = el.querySelectorAll(".char");

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: el,
            start: "top 70%",
            end: "bottom 30%",
            toggleActions: "play reverse play reverse",
          },
        });

        tl.to(chars, {
          opacity: 1,
          x: 0,
          duration: 0.6,
          stagger: 0.025,
          ease: "power3.out",
        })
          .to(sub, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, "-=0.3")
          .to(detail, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, "-=0.2");

        // Set initial state
        gsap.set(sub, { opacity: 0, y: 16 });
        gsap.set(detail, { opacity: 0, y: 12 });
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={containerRef} className="relative bg-black text-white">

      {/* ── Fixed background — pure CSS cinematic atmosphere ── */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        {/* Deep black base */}
        <div className="absolute inset-0 bg-[#050505]" />

        {/* Light leak — projector beam from top-right */}
        <div
          ref={lightLeakRef}
          className="absolute -top-1/4 right-0 h-[150%] w-[60%]"
          style={{
            background:
              "radial-gradient(ellipse 60% 80% at 100% 0%, rgba(255,220,120,0.06) 0%, rgba(255,180,60,0.03) 40%, transparent 70%)",
          }}
        />

        {/* Vignette */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, rgba(0,0,0,0.7) 100%)",
          }}
        />

        {/* Subtle horizontal scan lines */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 3px)",
            backgroundSize: "100% 4px",
          }}
        />

        {/* Film grain */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundSize: "180px 180px",
          }}
        />
      </div>

      {/* ── Fixed UI chrome ── */}

      {/* Nav */}
      <nav className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between px-8 py-6">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/40">
          🦬 Director&apos;s Canvas
        </span>
        <div className="flex items-center gap-8">
          <a href="/about" className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30 hover:text-white/70 transition-colors">
            About
          </a>
          <Link
            href="/director"
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/50 hover:text-white/90 transition-colors"
          >
            Enter →
          </Link>
        </div>
      </nav>

      {/* Scroll arrow — left rail */}
      <div className="fixed left-8 top-1/2 z-50 -translate-y-1/2 pointer-events-none">
        <div className="flex flex-col items-center gap-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/20 [writing-mode:vertical-rl]">
            Scroll
          </span>
          <div className="h-12 w-px bg-gradient-to-b from-white/20 to-transparent" />
        </div>
      </div>

      {/* Progress — bottom centre, codrops-style */}
      <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 pointer-events-none w-48">
        {/* Corner brackets */}
        <div className="absolute -top-2 left-0 h-2 w-2 border-l border-t border-white/20" />
        <div className="absolute -top-2 right-0 h-2 w-2 border-r border-t border-white/20" />
        <div className="absolute -bottom-2 left-0 h-2 w-2 border-l border-b border-white/20" />
        <div className="absolute -bottom-2 right-0 h-2 w-2 border-r border-b border-white/20" />

        {/* Counter */}
        <div className="mb-1.5 text-center">
          <span
            ref={progressTextRef}
            className="font-mono text-[10px] tracking-[0.25em] text-white/30"
          >
            000%
          </span>
        </div>

        {/* Bar */}
        <div className="h-px w-full bg-white/10">
          <div
            ref={progressBarRef}
            className="h-full origin-left bg-white/50"
            style={{ transform: "scaleX(0)" }}
          />
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="relative z-10">

        {/* Hero — first viewport */}
        <section className="flex h-screen flex-col items-center justify-center px-8 text-center">
          {/* Letterbox bars */}
          <div className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[clamp(20px,4vh,48px)] bg-black" />
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-[clamp(20px,4vh,48px)] bg-black" />

          <p className="mb-6 font-mono text-[10px] uppercase tracking-[0.35em] text-white/25">
            Runway API · Hackathon 2026
          </p>

          <h1
            className="text-[clamp(3rem,9vw,8rem)] font-semibold leading-[0.92] tracking-tight text-white"
            style={{ textShadow: "0 0 80px rgba(255,220,120,0.08)" }}
          >
            One brief.
            <br />
            <span className="text-white/35">One film.</span>
          </h1>

          <p className="mx-auto mt-8 max-w-xs font-mono text-[11px] leading-relaxed tracking-wide text-white/35">
            An AI director that turns your idea into shots,
            generates Runway stills, animates each into a clip,
            and stitches a final MP4.
          </p>

          <div className="mt-10 flex items-center gap-8">
            <Link
              href="/director"
              className="rounded-full border border-white/20 bg-white/5 px-8 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-white/70 backdrop-blur-sm transition-all hover:border-white/40 hover:bg-white/10 hover:text-white"
            >
              Start directing
            </Link>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/20">
              No sign-up · MOCK mode instant
            </span>
          </div>
        </section>

        {/* Scene sections — scroll-driven reveals */}
        {SCENES.map((scene, i) => (
          <section
            key={i}
            ref={(el) => { sceneRefs.current[i] = el; }}
            className="flex h-screen items-center px-[12vw]"
            style={{ justifyContent: i % 2 === 0 ? "flex-start" : "flex-end" }}
          >
            <div className="max-w-lg" style={{ textAlign: i % 2 === 0 ? "left" : "right" }}>
              {/* Scene number */}
              <p className="mb-4 font-mono text-[9px] uppercase tracking-[0.4em] text-white/20">
                {String(i + 1).padStart(2, "0")} / {String(SCENES.length).padStart(2, "0")}
              </p>

              {/* Title — chars split by JS */}
              <h2
                className="scene-title text-[clamp(2rem,5vw,4.5rem)] font-semibold leading-[0.95] tracking-tight text-white"
              >
                {scene.title}
              </h2>

              {/* Subtitle */}
              <p className="scene-sub mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
                {scene.subtitle}
              </p>

              {/* Detail */}
              <p className="scene-detail mt-4 max-w-xs text-[12px] leading-relaxed text-white/25">
                {scene.detail}
              </p>

              {/* Decorative rule */}
              <div
                className="mt-6 h-px bg-gradient-to-r from-white/20 to-transparent"
                style={{ width: "clamp(60px, 8vw, 120px)", marginLeft: i % 2 !== 0 ? "auto" : undefined }}
              />
            </div>
          </section>
        ))}

        {/* Brief cards — final section */}
        <section className="min-h-screen px-8 py-24 md:px-16">
          <div className="mx-auto max-w-4xl">
            <p className="mb-12 font-mono text-[10px] uppercase tracking-[0.35em] text-white/25">
              Or choose a scene
            </p>

            <div className="grid gap-px bg-white/[0.06] sm:grid-cols-2">
              {BRIEFS.map(({ label, scene, brief }) => (
                <Link
                  key={label}
                  href={`/director?brief=${encodeURIComponent(brief)}`}
                  className="group relative bg-black px-8 py-8 transition-colors hover:bg-white/[0.03]"
                >
                  {/* Corner bracket on hover */}
                  <div className="absolute left-3 top-3 h-3 w-3 border-l border-t border-white/0 transition-colors group-hover:border-white/20" />
                  <div className="absolute right-3 top-3 h-3 w-3 border-r border-t border-white/0 transition-colors group-hover:border-white/20" />

                  <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/30 transition-colors group-hover:text-white/60">
                    {label}
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-white/20 transition-colors group-hover:text-white/40">
                    {scene}
                  </p>
                  <span className="absolute right-6 top-1/2 -translate-y-1/2 font-mono text-white/15 transition-all group-hover:right-4 group-hover:text-white/50">
                    →
                  </span>
                </Link>
              ))}
            </div>

            {/* CTA */}
            <div className="mt-16 flex flex-col items-center gap-4 text-center">
              <Link
                href="/director"
                className="rounded-full border border-white/15 bg-white/5 px-10 py-4 font-mono text-[11px] uppercase tracking-[0.25em] text-white/60 transition-all hover:border-white/30 hover:bg-white/10 hover:text-white"
              >
                Open the canvas
              </Link>
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/15">
                No Runway key needed · MOCK mode runs instantly
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/[0.06] px-8 py-10">
          <div className="mx-auto flex max-w-4xl items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/20">
              Director&apos;s Canvas · 2026
            </span>
            <div className="flex gap-8">
              {[
                { label: "About", href: "/about" },
                { label: "GitHub", href: "https://github.com/thisyearnofear/gen-ui" },
                { label: "Runway", href: "https://docs.dev.runwayml.com" },
              ].map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  target={href.startsWith("http") ? "_blank" : undefined}
                  rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/20 hover:text-white/50 transition-colors"
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
