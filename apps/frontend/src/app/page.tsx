import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Clapperboard, Film, Sparkles, Zap } from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">

      {/* ── Nav ── */}
      <nav className="flex items-center justify-between px-6 py-4 md:px-12">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Clapperboard size={16} className="text-muted-foreground" />
          Director&apos;s Canvas
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/thisyearnofear/gen-ui"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            GitHub
          </a>
          <Link
            href="/director"
            className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            Open canvas →
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="mx-auto max-w-4xl px-6 pb-16 pt-16 text-center md:px-12 md:pt-24">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Powered by Runway Gen-4 · Built for the Runway API Hackathon
        </div>

        <h1 className="text-4xl font-semibold leading-tight tracking-tight text-foreground md:text-6xl">
          Type a brief.
          <br />
          <span className="text-muted-foreground">Watch it become a film.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
          Director&apos;s Canvas is an AI agent that decomposes your one-line
          idea into shots, generates Runway reference stills, animates each
          into a clip, and stitches a final MP4 — all on a live canvas you
          can direct in real time.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/director"
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90"
          >
            Start directing
            <ArrowRight size={14} />
          </Link>
          <a
            href="/about"
            className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-medium text-foreground hover:bg-muted"
          >
            How it works
          </a>
        </div>

        <p className="mt-4 text-[11px] text-muted-foreground">
          No sign-up. No Runway key needed to try — runs in MOCK mode instantly.
        </p>
      </section>

      {/* ── Banner image ── */}
      <section className="mx-auto max-w-5xl px-6 md:px-12">
        <div className="overflow-hidden rounded-2xl border border-border shadow-lg">
          <Image
            src="/banner.jpg"
            alt="Director's Canvas — storyboard timeline with shot cards"
            width={1280}
            height={420}
            priority
            className="w-full object-cover"
          />
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="mx-auto max-w-4xl px-6 py-20 md:px-12">
        <p className="mb-10 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
          The pipeline
        </p>
        <div className="grid gap-4 md:grid-cols-4">
          {[
            {
              icon: Sparkles,
              step: "1. Brief",
              body: "One sentence. The agent handles the rest.",
            },
            {
              icon: Clapperboard,
              step: "2. Storyboard",
              body: "3–6 shots decomposed with cinematic prompts, live on the canvas.",
            },
            {
              icon: Film,
              step: "3. Generate",
              body: "Runway Gen-4 stills → Gen-4.5 animation. Character consistency across every shot.",
            },
            {
              icon: Zap,
              step: "4. Export",
              body: "FFmpeg stitches all clips into one MP4. One button.",
            },
          ].map(({ icon: Icon, step, body }) => (
            <div
              key={step}
              className="rounded-xl border border-border bg-card p-5"
            >
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-foreground/5">
                <Icon size={15} className="text-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground">{step}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── What makes it different ── */}
      <section className="border-t border-border bg-card/40">
        <div className="mx-auto max-w-4xl px-6 py-20 md:px-12">
          <p className="mb-10 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Not just a prompt box
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                title: "Cross-shot consistency",
                body: "Shot 0's reference image anchors every subsequent shot via Runway's referenceImages API. The astronaut in shot 4 looks like the astronaut in shot 1 — automatically.",
              },
              {
                title: "Agent-directed iteration",
                body: "\"Regenerate shot 3 — make it more dramatic.\" The agent rewrites the prompt, re-calls Runway, and patches only that shot. The rest is untouched.",
              },
              {
                title: "BYOK + MOCK mode",
                body: "No Runway key? Run the full pipeline with placeholder media — same canvas, same flow. Add your own key to go live. Charges go to your account.",
              },
            ].map(({ title, body }) => (
              <div key={title} className="space-y-2">
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Try it ── */}
      <section className="mx-auto max-w-4xl px-6 py-20 text-center md:px-12">
        <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
          Ready to direct?
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Pick a brief below or write your own. The agent does the rest.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          {[
            {
              label: "Sci-fi opener",
              brief:
                "Direct a 30-second sci-fi opening: a lone astronaut steps onto a glass-domed alien city at golden hour. 4 shots.",
            },
            {
              label: "Product reveal",
              brief:
                "Direct a 20-second cinematic product reveal for a wireless ceramic coffee mug, premium minimalist style. 4 shots.",
            },
            {
              label: "Travel reel",
              brief:
                "Direct a 25-second travel reel for Lisbon at blue hour — trams, azulejo tiles, the river. 5 shots.",
            },
            {
              label: "Vertical TikTok",
              brief:
                "Direct a 15-second vertical TikTok teaser for an indie band's new track 'Static Garden'. 3 shots, 720:1280.",
            },
          ].map(({ label, brief }) => (
            <Link
              key={label}
              href={`/director?brief=${encodeURIComponent(brief)}`}
              className="rounded-xl border border-border bg-card p-4 text-left text-xs hover:border-foreground/30 hover:bg-card/80 transition-colors"
            >
              <p className="font-medium text-foreground">{label}</p>
              <p className="mt-1 line-clamp-2 text-muted-foreground">{brief}</p>
            </Link>
          ))}
        </div>
        <Link
          href="/director"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-foreground px-8 py-3 text-sm font-medium text-background hover:opacity-90"
        >
          Open the canvas
          <ArrowRight size={14} />
        </Link>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border px-6 py-8 text-center text-[11px] text-muted-foreground md:px-12">
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <span>Director&apos;s Canvas · Runway API Hackathon 2026</span>
          <div className="flex gap-4">
            <a
              href="https://github.com/thisyearnofear/gen-ui"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground"
            >
              GitHub
            </a>
            <a href="/about" className="hover:text-foreground">
              About
            </a>
            <a
              href="https://docs.dev.runwayml.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground"
            >
              Runway API
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
