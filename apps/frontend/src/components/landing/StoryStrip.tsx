"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { LANDING_BEATS, LANDING_DURABLE, LANDING_STRIP } from "@/lib/landing-story";

gsap.registerPlugin(ScrollTrigger);

interface StoryStripProps {
  goldenHref: string;
  hfDemoHref: string;
  onCut?: (href: string, mode: "golden" | "hf") => void;
  onCollapse?: () => void;
}

/**
 * Finite Lenis + ScrollTrigger parallax strip — Challenge Cut shot grammar.
 * Ends with durable B2 flash + Golden/HF cut CTAs.
 */
export function StoryStrip({ goldenHref, hfDemoHref, onCut, onCollapse }: StoryStripProps) {
  const rootRef = useRef<HTMLElement>(null);
  const durableRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) return;

    const lenis = new Lenis({
      duration: 1.05,
      smoothWheel: true,
    });

    lenis.on("scroll", ScrollTrigger.update);
    const ticker = (time: number) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(ticker);
    gsap.ticker.lagSmoothing(0);

    const panels = root.querySelectorAll<HTMLElement>("[data-beat-panel]");
    const triggers: ScrollTrigger[] = [];

    panels.forEach((panel) => {
      const media = panel.querySelector<HTMLElement>("[data-beat-media]");
      const copy = panel.querySelector<HTMLElement>("[data-beat-copy]");
      if (media) {
        triggers.push(
          ScrollTrigger.create({
            trigger: panel,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
            onUpdate: (self) => {
              const y = (self.progress - 0.5) * 48;
              gsap.set(media, { y });
            },
          }),
        );
      }
      if (copy) {
        gsap.fromTo(
          copy,
          { opacity: 0.35, y: 24 },
          {
            opacity: 1,
            y: 0,
            ease: "power3.out",
            scrollTrigger: {
              trigger: panel,
              start: "top 78%",
              end: "top 42%",
              scrub: true,
            },
          },
        );
      }
    });

    const durable = durableRef.current;
    if (durable) {
      const flash = durable.querySelector<HTMLElement>("[data-durable-flash]");
      const url = durable.querySelector<HTMLElement>("[data-durable-url]");
      if (flash) {
        gsap.fromTo(
          flash,
          { opacity: 0.4, scale: 1.06 },
          {
            opacity: 1,
            scale: 1,
            ease: "power3.out",
            scrollTrigger: {
              trigger: durable,
              start: "top 75%",
              end: "top 40%",
              scrub: true,
            },
          },
        );
      }
      if (url) {
        gsap.fromTo(
          url,
          { clipPath: "inset(0 100% 0 0)" },
          {
            clipPath: "inset(0 0% 0 0)",
            ease: "power3.out",
            scrollTrigger: {
              trigger: durable,
              start: "top 60%",
              end: "top 35%",
              scrub: true,
            },
          },
        );
      }
    }

    return () => {
      triggers.forEach((t) => t.kill());
      ScrollTrigger.getAll().forEach((t) => {
        if (root.contains(t.trigger as Node)) t.kill();
      });
      gsap.ticker.remove(ticker);
      lenis.destroy();
    };
  }, []);

  return (
    <section
      ref={rootRef}
      id="grammar"
      className="border-t border-[var(--dc-line)] bg-[var(--dc-ink)]"
    >
      <div className="mx-auto max-w-6xl px-5 pt-16 sm:px-8 sm:pt-20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="dc-mono text-[11px] uppercase tracking-[0.18em] text-[var(--dc-cyan)]">
              {LANDING_STRIP.eyebrow}
            </p>
            <h2 className="dc-display mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-[var(--dc-paper)] sm:text-4xl">
              {LANDING_STRIP.headline}
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-[var(--dc-mute)]">
              The developer path, made scannable — same beats DevCut films into a Challenge Cut on
              Runway.
            </p>
          </div>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="dc-btn shrink-0 border border-[var(--dc-line)] px-4 py-2 dc-mono text-[10px] uppercase tracking-[0.14em] text-[var(--dc-dim)] hover:text-[var(--dc-mute)]"
            >
              Collapse grammar
            </button>
          )}
        </div>
      </div>

      <div className="mx-auto mt-12 max-w-6xl space-y-0 px-5 sm:px-8">
        {LANDING_BEATS.map((beat, i) => {
          const flip = i % 2 === 1;
          return (
            <article
              key={beat.id}
              data-beat-panel
              className={`grid items-center gap-8 border-t border-[var(--dc-line)] py-14 md:grid-cols-2 md:gap-12 ${
                flip ? "md:[&>*:first-child]:order-2" : ""
              }`}
            >
              <div className="overflow-hidden border border-[var(--dc-line)] bg-[var(--dc-panel)]">
                <div data-beat-media className="will-change-transform">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={beat.image}
                    alt=""
                    className="aspect-[16/10] w-full scale-110 object-cover"
                    loading={i === 0 ? "eager" : "lazy"}
                  />
                </div>
              </div>
              <div data-beat-copy>
                <p className="dc-mono text-[11px] uppercase tracking-[0.18em] text-[var(--dc-signal)]">
                  Beat {beat.step}
                </p>
                <h3 className="dc-display mt-3 text-2xl font-semibold tracking-tight text-[var(--dc-paper)] sm:text-3xl">
                  {beat.title}
                </h3>
                <p className="mt-3 max-w-md text-base leading-7 text-[var(--dc-mute)]">
                  {beat.body}
                </p>
              </div>
            </article>
          );
        })}
      </div>

      {/* Durable export flash — Genblaze + B2 made visceral */}
      <article
        ref={durableRef}
        className="mx-auto mt-4 max-w-6xl border-t border-[var(--dc-line)] px-5 py-16 sm:px-8 sm:py-20"
      >
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div className="overflow-hidden border border-[var(--dc-signal)]/35 bg-[var(--dc-panel)] shadow-[0_0_40px_rgba(255,159,28,0.12)]">
            <div data-durable-flash className="will-change-transform">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={LANDING_DURABLE.image}
                alt=""
                className="aspect-[16/10] w-full object-cover"
                loading="lazy"
              />
            </div>
          </div>
          <div>
            <p className="dc-mono text-[11px] uppercase tracking-[0.18em] text-[var(--dc-signal)]">
              {LANDING_DURABLE.eyebrow}
            </p>
            <h3 className="dc-display mt-3 text-2xl font-semibold tracking-tight text-[var(--dc-paper)] sm:text-3xl">
              {LANDING_DURABLE.title}
            </h3>
            <p className="mt-3 max-w-md text-base leading-7 text-[var(--dc-mute)]">
              {LANDING_DURABLE.body}
            </p>
            <p
              data-durable-url
              className="dc-mono mt-6 inline-block border border-[var(--dc-cyan)]/40 bg-[var(--dc-cyan-soft)] px-3 py-2 text-[11px] text-[var(--dc-cyan)]"
            >
              {LANDING_DURABLE.urlHint}
            </p>
          </div>
        </div>
      </article>

      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 border-t border-[var(--dc-line)] px-5 py-12 sm:px-8">
        <button
          type="button"
          onClick={() =>
            onCut ? onCut(goldenHref, "golden") : (window.location.href = goldenHref)
          }
          className="dc-btn inline-flex items-center bg-[var(--dc-signal)] px-5 py-3 dc-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--dc-ink)] hover:bg-[var(--dc-paper)]"
        >
          Run golden cut
        </button>
        <button
          type="button"
          onClick={() =>
            onCut ? onCut(hfDemoHref, "hf") : (window.location.href = hfDemoHref)
          }
          className="dc-btn inline-flex items-center border border-[var(--dc-cyan)]/45 bg-[var(--dc-cyan-soft)] px-5 py-3 dc-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--dc-cyan)] hover:border-[var(--dc-cyan)]"
        >
          HyperFrames demo
        </button>
        <p className="dc-mono text-[11px] text-[var(--dc-dim)]">
          Grammar → canvas · MOCK without a Runway key
        </p>
      </div>
    </section>
  );
}
