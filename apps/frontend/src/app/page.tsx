import Link from "next/link";
import { ArrowRight } from "lucide-react";

const BRIEFS = [
  {
    label: "Sci-fi opener",
    scene: "Lone astronaut. Glass-domed alien city. Golden hour.",
    brief: "Direct a 30-second sci-fi opening: a lone astronaut steps onto a glass-domed alien city at golden hour. 4 shots.",
  },
  {
    label: "Product reveal",
    scene: "Ceramic mug. Studio light. Slow rotation.",
    brief: "Direct a 20-second cinematic product reveal for a wireless ceramic coffee mug, premium minimalist style. 4 shots.",
  },
  {
    label: "Travel reel",
    scene: "Lisbon. Blue hour. Trams and tile.",
    brief: "Direct a 25-second travel reel for Lisbon at blue hour — trams, azulejo tiles, the river. 5 shots.",
  },
  {
    label: "Vertical TikTok",
    scene: "Indie band. Neon. Static Garden.",
    brief: "Direct a 15-second vertical TikTok teaser for an indie band's new track 'Static Garden'. 3 shots, 720:1280.",
  },
];

export default function HomePage() {
  return (
    <>
      <style>{`
        @keyframes grain {
          0%, 100% { transform: translate(0, 0); }
          10% { transform: translate(-2%, -3%); }
          20% { transform: translate(3%, 2%); }
          30% { transform: translate(-1%, 4%); }
          40% { transform: translate(4%, -1%); }
          50% { transform: translate(-3%, 3%); }
          60% { transform: translate(2%, -4%); }
          70% { transform: translate(-4%, 1%); }
          80% { transform: translate(1%, -2%); }
          90% { transform: translate(3%, 4%); }
        }
        .grain::after {
          content: '';
          position: fixed;
          inset: -50%;
          width: 200%;
          height: 200%;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E");
          background-size: 200px 200px;
          opacity: 0.035;
          pointer-events: none;
          animation: grain 0.5s steps(1) infinite;
          z-index: 100;
        }
        .hero-bg {
          background-image: url('/banner.jpg');
          background-size: cover;
          background-position: center 30%;
        }
        .letterbox::before,
        .letterbox::after {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          height: clamp(24px, 5vh, 56px);
          background: #000;
          z-index: 10;
        }
        .letterbox::before { top: 0; }
        .letterbox::after { bottom: 0; }
        .brief-card:hover .brief-scene {
          opacity: 1;
          transform: translateY(0);
        }
        .brief-scene {
          opacity: 0;
          transform: translateY(4px);
          transition: opacity 0.2s ease, transform 0.2s ease;
        }
      `}</style>

      <div className="grain">

        {/* ── HERO — full viewport, cinematic ── */}
        <section className="hero-bg letterbox relative flex h-screen flex-col items-center justify-center overflow-hidden">
          {/* Dark overlay — heavier at top/bottom, lighter in centre */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 40%, rgba(0,0,0,0.45) 60%, rgba(0,0,0,0.85) 100%)",
            }}
          />

          {/* Nav — sits above letterbox bars */}
          <nav className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-6 py-5 md:px-12"
            style={{ top: "clamp(24px, 5vh, 56px)" }}>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/60">
              Director&apos;s Canvas
            </span>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/thisyearnofear/gen-ui"
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[11px] uppercase tracking-[0.15em] text-white/50 hover:text-white/90 transition-colors"
              >
                GitHub
              </a>
              <Link
                href="/director"
                className="font-mono text-[11px] uppercase tracking-[0.15em] text-white/50 hover:text-white/90 transition-colors"
              >
                Enter →
              </Link>
            </div>
          </nav>

          {/* Hero copy */}
          <div className="relative z-10 px-6 text-center">
            <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.3em] text-white/40">
              Runway API · Hackathon 2026
            </p>
            <h1
              className="text-[clamp(2.8rem,8vw,7rem)] font-semibold leading-[0.95] tracking-tight text-white"
              style={{ textShadow: "0 2px 40px rgba(0,0,0,0.6)" }}
            >
              One brief.
              <br />
              <span className="text-white/50">One film.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-sm text-sm leading-relaxed text-white/55">
              An AI director that decomposes your idea into shots,
              generates Runway stills, animates each into a clip,
              and stitches a final MP4 — live on the canvas.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/director"
                className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-medium text-black hover:bg-white/90 transition-colors"
              >
                Start directing
                <ArrowRight size={13} />
              </Link>
              <a
                href="/about"
                className="font-mono text-[11px] uppercase tracking-[0.15em] text-white/50 hover:text-white/80 transition-colors"
              >
                How it works
              </a>
            </div>
            <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.15em] text-white/30">
              No sign-up · No key needed · MOCK mode instant
            </p>
          </div>

          {/* Scroll hint */}
          <div className="absolute bottom-0 left-1/2 z-20 -translate-x-1/2 pb-[clamp(32px,7vh,72px)]">
            <div className="flex flex-col items-center gap-1.5">
              <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/30">
                Pick a scene
              </span>
              <div className="h-6 w-px bg-gradient-to-b from-white/30 to-transparent" />
            </div>
          </div>
        </section>

        {/* ── BRIEFS — dark, compact ── */}
        <section className="bg-black px-6 py-16 md:px-12">
          <div className="mx-auto max-w-3xl">
            <p className="mb-8 font-mono text-[10px] uppercase tracking-[0.3em] text-white/30">
              Or choose a brief
            </p>
            <div className="grid gap-px bg-white/10 sm:grid-cols-2">
              {BRIEFS.map(({ label, scene, brief }) => (
                <Link
                  key={label}
                  href={`/director?brief=${encodeURIComponent(brief)}`}
                  className="brief-card group relative bg-black px-6 py-7 transition-colors hover:bg-white/[0.04]"
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35 transition-colors group-hover:text-white/60">
                    {label}
                  </p>
                  <p className="brief-scene mt-2 text-xs text-white/40">
                    {scene}
                  </p>
                  <span className="absolute right-5 top-1/2 -translate-y-1/2 text-white/20 transition-colors group-hover:text-white/60">
                    →
                  </span>
                </Link>
              ))}
            </div>

            {/* Footer */}
            <div className="mt-16 flex items-center justify-between border-t border-white/10 pt-8">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/25">
                Director&apos;s Canvas
              </span>
              <div className="flex gap-6">
                {[
                  { label: "GitHub", href: "https://github.com/thisyearnofear/gen-ui" },
                  { label: "About", href: "/about" },
                  { label: "Runway", href: "https://docs.dev.runwayml.com" },
                ].map(({ label, href }) => (
                  <a
                    key={label}
                    href={href}
                    target={href.startsWith("http") ? "_blank" : undefined}
                    rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                    className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/25 hover:text-white/60 transition-colors"
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>

      </div>
    </>
  );
}
