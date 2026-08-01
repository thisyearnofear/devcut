"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  DEVCUT,
  DEVCUT_CHALLENGE_EXAMPLES,
  DEVCUT_DOORS,
  DEVCUT_HF_DEMO,
  DEVCUT_SUBMIT_EXAMPLES,
  type DevCutDoorId,
} from "@/lib/devcut";
import { AgentPaymentsPanel } from "@/components/devcut/AgentPaymentsPanel";

/**
 * DevCut landing — one composition, three doors.
 * Brand first; no generic cinema playground.
 */
export function LandingPage() {
  const [door, setDoor] = useState<DevCutDoorId>("challenge");
  const [brief, setBrief] = useState(DEVCUT_CHALLENGE_EXAMPLES[0].brief);

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

  const hfDemoHref = useMemo(() => {
    const submitDoor = DEVCUT_DOORS.find((d) => d.id === "submit")!;
    const payload = `${submitDoor.prompt} ${DEVCUT_HF_DEMO.brief}`.trim();
    return `/director?mode=submit&demo=hf&brief=${encodeURIComponent(payload)}`;
  }, []);

  return (
    <div className="min-h-svh bg-[#0c0f0e] text-[#e8ece9]">
      {/* Atmosphere — cool ink, not purple glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, #1a3a32 0%, transparent 55%), radial-gradient(ellipse 60% 40% at 100% 100%, #1a2218 0%, transparent 50%)",
        }}
      />

      <div className="relative mx-auto flex min-h-svh max-w-5xl flex-col px-5 pb-16 pt-6 sm:px-8">
        <header className="flex items-center justify-between gap-4">
          <p className="font-mono text-sm font-medium tracking-[0.04em] text-[#c5d4c8]">
            {DEVCUT.name}
          </p>
          <nav className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.14em] text-white/45">
            <Link href="/about" className="hover:text-white/80">
              About
            </Link>
            <Link href={hfDemoHref} className="hover:text-white/80">
              HF demo
            </Link>
          </nav>
        </header>

        {/* Hero — brand + one line + doors */}
        <section className="mt-16 flex flex-1 flex-col justify-center gap-10 sm:mt-20">
          <div className="max-w-2xl space-y-5">
            <h1 className="font-mono text-[clamp(2.5rem,8vw,4.5rem)] font-medium leading-[0.95] tracking-tight text-[#f2f6f3]">
              {DEVCUT.name}
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-white/65 sm:text-xl">
              {DEVCUT.tagline}. Challenge films for organizers. Submit-ready cuts for
              HyperFrames builders. Metered jobs for agents.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href={hfDemoHref}
                className="inline-flex items-center rounded-full border border-[#7a9e88]/50 bg-[#7a9e88]/15 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#c5d4c8] hover:bg-[#7a9e88]/25"
              >
                Run HyperFrames demo
              </Link>
              <p className="max-w-xs text-xs leading-5 text-white/40">
                Fixed brief · Runway heroes → BRIEF kit → finish in HF. Best partner walkthrough.
              </p>
            </div>
          </div>

          {/* Three doors */}
          <div className="grid gap-3 md:grid-cols-3">
            {DEVCUT_DOORS.map((d) => {
              const selected = door === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setDoor(d.id);
                    if (d.id === "challenge") setBrief(DEVCUT_CHALLENGE_EXAMPLES[0].brief);
                    if (d.id === "submit") setBrief(DEVCUT_SUBMIT_EXAMPLES[0].brief);
                  }}
                  className={`rounded-2xl border px-4 py-4 text-left transition-colors ${
                    selected
                      ? "border-[#7a9e88]/55 bg-[#7a9e88]/10"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20"
                  }`}
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">
                    {d.label}
                  </p>
                  <p className="mt-2 text-base font-medium text-white/90">{d.title}</p>
                  <p className="mt-1.5 text-sm leading-5 text-white/55">{d.body}</p>
                </button>
              );
            })}
          </div>

          {/* Active door workspace */}
          <div className="rounded-2xl border border-white/10 bg-black/25 p-5 sm:p-6">
            {door === "agent" ? (
              <AgentPaymentsPanel embedded />
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#9bb5a4]">
                      {activeDoor.title}
                    </p>
                    <p className="mt-1 text-sm text-white/55">{activeDoor.body}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {examples.map((ex) => (
                    <button
                      key={ex.label}
                      type="button"
                      onClick={() => setBrief(ex.brief)}
                      className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors ${
                        brief === ex.brief
                          ? "border-[#7a9e88]/50 bg-[#7a9e88]/15 text-[#c5d4c8]"
                          : "border-white/10 text-white/50 hover:border-white/25 hover:text-white/80"
                      }`}
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>

                <textarea
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  rows={4}
                  className="w-full resize-y rounded-xl border border-white/10 bg-black/40 px-4 py-3 font-mono text-sm leading-6 text-white/85 outline-none placeholder:text-white/30 focus:border-[#7a9e88]/45"
                  placeholder={
                    door === "challenge"
                      ? "Paste prize brief, Devpost URL, or judging criteria…"
                      : "Paste product URL, GitHub repo, or HyperFrames project notes…"
                  }
                />

                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={directorHref}
                    className="inline-flex items-center rounded-full bg-[#c5d4c8] px-5 py-2.5 font-mono text-xs uppercase tracking-[0.12em] text-[#0c0f0e] hover:bg-white"
                  >
                    {door === "challenge" ? "Commission Challenge Cut" : "Run Submit Ready"}
                  </Link>
                  <p className="font-mono text-[11px] text-white/40">
                    Opens the live canvas · MOCK without a Runway key
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* HyperFrames complement — prove the wedge */}
        <section className="mt-20 border-t border-white/10 pt-12">
          <h2 className="font-mono text-sm uppercase tracking-[0.14em] text-white/50">
            How we feed HyperFrames
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-white/70">
            HyperFrames owns code→video. DevCut fills the mid-hack gap: consistent Runway
            heroes, a Devpost-shaped stitch, and a handoff kit builders can paste into an HF
            project — not another authoring tool.
          </p>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Generate in DevCut",
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
            ].map((row) => (
              <li
                key={row.step}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4"
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#a8c4b4]">
                  {row.step}
                </p>
                <p className="mt-2 text-sm font-medium text-white/90">{row.title}</p>
                <p className="mt-1 text-xs leading-5 text-white/55">{row.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 font-mono text-[11px] text-white/40">
            <Link href="/about" className="underline-offset-2 hover:text-white/70 hover:underline">
              About
            </Link>
            {" · "}
            <a
              href="https://github.com/thisyearnofear/gen-ui/blob/main/docs/hyperframes.md"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:text-white/70 hover:underline"
            >
              DevCut × HyperFrames
            </a>
          </p>
        </section>

        {/* One supporting section — not a dashboard */}
        <section className="mt-16 grid gap-8 border-t border-white/10 pt-12 md:grid-cols-2">
          <div>
            <h2 className="font-mono text-sm uppercase tracking-[0.14em] text-white/50">
              Why this exists
            </h2>
            <p className="mt-3 text-base leading-7 text-white/70">
              Hackathon READMEs stay abstract. HyperFrames already owns code→video. DevCut owns
              the gap: generative heroes + packaging so organizers show the bar and builders ship
              a Devpost cut without a video team.
            </p>
          </div>
          <div>
            <h2 className="font-mono text-sm uppercase tracking-[0.14em] text-white/50">
              What we refuse
            </h2>
            <p className="mt-3 text-base leading-7 text-white/70">
              Generic film studios. Sci-fi playground demos. Competing with HyperFrames authoring.
              BYOK as the hero UX — x402 jobs are the default path we&apos;re building toward.
            </p>
          </div>
        </section>

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 font-mono text-[11px] uppercase tracking-[0.12em] text-white/35">
          <span>{DEVCUT.name}</span>
          <a
            href="https://github.com/thisyearnofear/gen-ui/blob/main/docs/devcut-thesis.md"
            className="hover:text-white/60"
            target="_blank"
            rel="noopener noreferrer"
          >
            Product thesis
          </a>
        </footer>
      </div>
    </div>
  );
}
