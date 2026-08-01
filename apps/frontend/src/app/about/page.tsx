import Link from "next/link";
import { DEVCUT, DEVCUT_DOORS } from "@/lib/devcut";
import { AboutToc, type TocItem } from "./toc";
import "@/components/landing/landing.css";

export const metadata = {
  title: `About — ${DEVCUT.name}`,
  description: DEVCUT.description,
};

const tocItems: TocItem[] = [
  { id: "overview", label: "Overview" },
  { id: "pipeline", label: "Pipeline" },
  { id: "runway", label: "Runway" },
  { id: "access", label: "Access" },
  { id: "stack", label: "Stack" },
  { id: "run", label: "Run locally" },
];

const pipeline = [
  { step: "01", title: "Brief", body: "Agent breaks one line into 3–6 cinematic shots." },
  { step: "02", title: "Stills", body: "Shot 0 → gen4_image; 1+ → gen4_image_turbo with character anchor." },
  { step: "03", title: "Motion", body: "Each still → gen4.5 image→video; first frame = that shot’s ref." },
  { step: "04", title: "Stitch", body: "FFmpeg concat → MP4 + HyperFrames handoff kit." },
];

const stack = [
  ["Agent", "LangGraph + CopilotKit / AG-UI"],
  ["Planner", "NVIDIA NIM → Venice → Gemini"],
  ["Video", "Runway Gen-4 / Turbo / Gen-4.5"],
  ["UI", "Next.js storyboard canvas"],
  ["BFF", "Hono · x402 · BYOK"],
  ["Export", "FFmpeg · optional B2 / Genblaze"],
  ["MCP", "mcp-use → Claude / ChatGPT"],
];

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="border border-[var(--dc-line)] bg-black/50 px-1.5 py-0.5 dc-mono text-[0.85em] text-[var(--dc-cyan)]">
      {children}
    </code>
  );
}

export default function AboutPage() {
  return (
    <div data-devcut-landing className="min-h-svh">
      <header className="border-b border-[var(--dc-line)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/" className="dc-display dc-brand text-sm font-semibold tracking-tight">
            {DEVCUT.name}
          </Link>
          <nav className="dc-mono flex items-center gap-4 text-[10px] uppercase tracking-[0.14em] text-[var(--dc-mute)]">
            <Link href="/#desk" className="hover:text-[var(--dc-paper)]">
              Desk
            </Link>
            <Link href="/director" className="hover:text-[var(--dc-paper)]">
              Canvas
            </Link>
            <Link
              href="/#desk"
              className="dc-btn bg-[var(--dc-signal)] px-3 py-1.5 text-[var(--dc-ink)] hover:bg-[var(--dc-paper)]"
            >
              Commission
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-10 sm:px-8 sm:py-14 lg:flex-row lg:gap-14">
        <main className="min-w-0 flex-1">
          <header id="overview" className="scroll-mt-16 border-b border-[var(--dc-line)] pb-10">
            <p className="dc-mono text-[11px] uppercase tracking-[0.18em] text-[var(--dc-signal)]">
              Product
            </p>
            <h1 className="dc-display mt-2 text-4xl font-semibold tracking-tight text-[var(--dc-paper)] sm:text-5xl">
              {DEVCUT.name}
            </h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-[var(--dc-mute)]">
              {DEVCUT.tagline}. Spec a Challenge Cut, run Submit Ready into HyperFrames, or meter
              agent jobs via x402 — same Runway storyboard, developer-shaped doors.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-3">
              {DEVCUT_DOORS.map((d) => (
                <li
                  key={d.id}
                  className="border border-[var(--dc-line)] bg-[var(--dc-panel)] px-3 py-3"
                >
                  <p className="dc-mono text-[10px] uppercase tracking-[0.14em] text-[var(--dc-cyan)]">
                    {d.title}
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-[var(--dc-mute)]">{d.body}</p>
                </li>
              ))}
            </ul>
          </header>

          <section id="pipeline" className="scroll-mt-16 border-b border-[var(--dc-line)] py-10">
            <p className="dc-mono text-[11px] uppercase tracking-[0.18em] text-[var(--dc-cyan)]">
              Pipeline
            </p>
            <h2 className="dc-display mt-2 text-2xl font-semibold text-[var(--dc-paper)]">
              Brief → stills → motion → stitch
            </h2>
            <ol className="mt-6 grid gap-0 sm:grid-cols-2 lg:grid-cols-4">
              {pipeline.map((row) => (
                <li
                  key={row.step}
                  className="border border-[var(--dc-line)] bg-[var(--dc-panel)] p-4 sm:-ml-px sm:first:ml-0"
                >
                  <p className="dc-mono text-[10px] text-[var(--dc-signal)]">{row.step}</p>
                  <p className="dc-display mt-1 text-sm font-semibold text-[var(--dc-paper)]">
                    {row.title}
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-[var(--dc-mute)]">{row.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section id="runway" className="scroll-mt-16 border-b border-[var(--dc-line)] py-10">
            <p className="dc-mono text-[11px] uppercase tracking-[0.18em] text-[var(--dc-cyan)]">
              Runway
            </p>
            <h2 className="dc-display mt-2 text-2xl font-semibold text-[var(--dc-paper)]">
              Not a one-shot URL wrapper
            </h2>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-[var(--dc-mute)]">
              <li>
                <span className="text-[var(--dc-paper)]">Model pick</span> —{" "}
                <Code>gen4_image</Code> for shot 0; <Code>gen4_image_turbo</Code> for the rest
                (cheaper, &lt;10s); <Code>gen4.5</Code> for animation.
              </li>
              <li>
                <span className="text-[var(--dc-paper)]">Character lock</span> — shot 0 becomes{" "}
                <Code>character1</Code>; prior stills feed <Code>style1</Code> /{" "}
                <Code>style2</Code>. Prompt can address <Code>@character1</Code>.
              </li>
              <li>
                <span className="text-[var(--dc-paper)]">Live canvas</span> — every Runway call
                mutates AG-UI state; regenerate one shot without redoing the board.
              </li>
              <li>
                <span className="text-[var(--dc-paper)]">Deliverable</span> — stitch to MP4, share
                a <Code>/cut</Code> watch link, hand off BRIEF + assets to HyperFrames.
              </li>
            </ul>
          </section>

          <section id="access" className="scroll-mt-16 border-b border-[var(--dc-line)] py-10">
            <p className="dc-mono text-[11px] uppercase tracking-[0.18em] text-[var(--dc-cyan)]">
              Access
            </p>
            <h2 className="dc-display mt-2 text-2xl font-semibold text-[var(--dc-paper)]">
              BYOK, budget, MOCK
            </h2>
            <dl className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className="border border-[var(--dc-line)] bg-[var(--dc-panel)] p-4">
                <dt className="dc-mono text-[10px] uppercase tracking-[0.12em] text-[var(--dc-signal)]">
                  BYOK
                </dt>
                <dd className="mt-2 text-xs leading-5 text-[var(--dc-mute)]">
                  Paste a Runway key on the canvas. Stored locally, sent as{" "}
                  <Code>X-Runway-Api-Key</Code>, never logged.
                </dd>
              </div>
              <div className="border border-[var(--dc-line)] bg-[var(--dc-panel)] p-4">
                <dt className="dc-mono text-[10px] uppercase tracking-[0.12em] text-[var(--dc-signal)]">
                  Budget
                </dt>
                <dd className="mt-2 text-xs leading-5 text-[var(--dc-mute)]">
                  Shared key: ~20 Runway calls / thread. Hits zero → clear error + add your key.
                </dd>
              </div>
              <div className="border border-[var(--dc-line)] bg-[var(--dc-panel)] p-4">
                <dt className="dc-mono text-[10px] uppercase tracking-[0.12em] text-[var(--dc-signal)]">
                  MOCK
                </dt>
                <dd className="mt-2 text-xs leading-5 text-[var(--dc-mute)]">
                  No key? Full pipeline with placeholder media — same desk, zero credits.
                </dd>
              </div>
            </dl>
          </section>

          <section id="stack" className="scroll-mt-16 border-b border-[var(--dc-line)] py-10">
            <p className="dc-mono text-[11px] uppercase tracking-[0.18em] text-[var(--dc-cyan)]">
              Stack
            </p>
            <h2 className="dc-display mt-2 text-2xl font-semibold text-[var(--dc-paper)]">
              What’s under the desk
            </h2>
            <div className="mt-5 overflow-hidden border border-[var(--dc-line)]">
              <table className="w-full text-left text-sm">
                <tbody>
                  {stack.map(([layer, tech], i) => (
                    <tr
                      key={layer}
                      className={i % 2 === 0 ? "bg-[var(--dc-panel)]" : "bg-black/30"}
                    >
                      <td className="w-28 px-4 py-2.5 dc-mono text-[11px] uppercase tracking-[0.1em] text-[var(--dc-cyan)]">
                        {layer}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--dc-mute)]">{tech}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="run" className="scroll-mt-16 py-10">
            <p className="dc-mono text-[11px] uppercase tracking-[0.18em] text-[var(--dc-cyan)]">
              Local
            </p>
            <h2 className="dc-display mt-2 text-2xl font-semibold text-[var(--dc-paper)]">
              Three commands
            </h2>
            <ol className="mt-5 space-y-3">
              {[
                {
                  n: "1",
                  cmd: "npx @copilotkit/cli@latest init",
                  note: "Intelligence + Postgres thread store",
                },
                {
                  n: "2",
                  cmd: "cp .env.example .env && cp .env apps/agent/.env",
                  note: "GEMINI_API_KEY required · RUNWAY_API_KEY optional (MOCK without it)",
                },
                {
                  n: "3",
                  cmd: "npm install && npm run dev",
                  note: "Open /director — or commission from /#desk",
                },
              ].map((row) => (
                <li
                  key={row.n}
                  className="flex flex-col gap-1 border border-[var(--dc-line)] bg-[var(--dc-panel)] px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4"
                >
                  <span className="dc-mono shrink-0 text-[10px] text-[var(--dc-signal)]">
                    {row.n}
                  </span>
                  <pre className="min-w-0 flex-1 overflow-x-auto dc-mono text-xs text-[var(--dc-paper)]">
                    {row.cmd}
                  </pre>
                  <span className="shrink-0 text-[11px] text-[var(--dc-dim)]">{row.note}</span>
                </li>
              ))}
            </ol>

            <p className="mt-8 dc-mono text-[11px] text-[var(--dc-dim)]">
              Docs ·{" "}
              <a
                href="https://github.com/thisyearnofear/gen-ui/blob/main/docs/devcut-thesis.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--dc-mute)] hover:text-[var(--dc-paper)]"
              >
                Thesis
              </a>
              {" · "}
              <a
                href="https://github.com/thisyearnofear/gen-ui/blob/main/docs/architecture.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--dc-mute)] hover:text-[var(--dc-paper)]"
              >
                Architecture
              </a>
              {" · "}
              <a
                href="https://github.com/thisyearnofear/gen-ui/blob/main/docs/hyperframes.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--dc-mute)] hover:text-[var(--dc-paper)]"
              >
                HyperFrames
              </a>
              {" · "}
              <a
                href="https://docs.dev.runwayml.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--dc-mute)] hover:text-[var(--dc-paper)]"
              >
                Runway API
              </a>
            </p>
          </section>
        </main>

        <AboutToc items={tocItems} />
      </div>
    </div>
  );
}
