import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Clapperboard, Film, KeyRound, Sparkles, Zap } from "lucide-react";
import { AboutToc, type TocItem } from "./toc";

export const metadata = {
  title: "About — Director's Canvas",
  description:
    "How Director's Canvas turns a one-line brief into a stitched MP4 — architecture, Runway API usage, and how to run it.",
};

const tocItems: TocItem[] = [
  { id: "overview", label: "Overview" },
  { id: "how-it-works", label: "How it works" },
  { id: "runway", label: "Runway API" },
  { id: "consistency", label: "Character consistency" },
  { id: "byok", label: "BYOK + budget" },
  { id: "stack", label: "Stack" },
  { id: "quickstart", label: "Quickstart" },
  { id: "docs", label: "Docs" },
];

function Section({
  id,
  eyebrow,
  title,
  subtitle,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-16 scroll-mt-12 first:mt-0">
      {eyebrow && (
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-accent">
          {eyebrow}
        </p>
      )}
      <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
      {subtitle && (
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
      )}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[0.8em] break-all">
      {children}
    </code>
  );
}

const pipeline = [
  {
    icon: Clapperboard,
    step: "1. Brief",
    body: "You type a one-line brief. The agent decomposes it into 3–6 shots with cinematic prompts — subject, action, lighting, mood.",
  },
  {
    icon: Sparkles,
    step: "2. Reference stills",
    body: "Shot 0 calls Runway gen4_image. Shots 1+ call gen4_image_turbo with shot 0's image as a character anchor — 2–4× cheaper, <10 s each.",
  },
  {
    icon: Film,
    step: "3. Animation",
    body: "Each reference still is animated via Runway gen4.5 (image→video). The shot's own reference is the first frame, so visual style carries directly into motion.",
  },
  {
    icon: Zap,
    step: "4. Export",
    body: "FFmpeg concatenates all clips into a single MP4, served directly from the frontend. One button. No NLE required.",
  },
];

const stack = [
  { layer: "Agent", tech: "LangGraph Deep Agents + Gemini 3.1 Flash-Lite" },
  { layer: "Video", tech: "Runway Gen-4 Image / Gen-4 Image Turbo / Gen-4.5" },
  { layer: "Transport", tech: "AG-UI + CopilotKit Intelligence (durable threads)" },
  { layer: "UI", tech: "Next.js + React + useFrontendTool (A2UI pattern)" },
  { layer: "BFF", tech: "Hono — CopilotKit runtime + BYOK injection + budget guard" },
  { layer: "Export", tech: "FFmpeg concat (LIVE) / placeholder URL (MOCK)" },
  { layer: "MCP", tech: "mcp-use server — exposes the director to Claude / ChatGPT" },
];

const docs = [
  { label: "Concept", href: "https://github.com/thisyearnofear/gen-ui/blob/main/docs/concept.md" },
  { label: "Architecture", href: "https://github.com/thisyearnofear/gen-ui/blob/main/docs/architecture.md" },
  { label: "Setup", href: "https://github.com/thisyearnofear/gen-ui/blob/main/docs/setup.md" },
  { label: "Deployment", href: "https://github.com/thisyearnofear/gen-ui/blob/main/docs/deployment.md" },
  { label: "Customization", href: "https://github.com/thisyearnofear/gen-ui/blob/main/docs/customization.md" },
  { label: "Roadmap", href: "https://github.com/thisyearnofear/gen-ui/blob/main/docs/roadmap.md" },
  { label: "Hackathon submission", href: "https://github.com/thisyearnofear/gen-ui/blob/main/docs/hackathons.md" },
];

const externalDocs = [
  { label: "Runway API docs", href: "https://docs.dev.runwayml.com" },
  { label: "CopilotKit docs", href: "https://docs.copilotkit.ai" },
  { label: "LangChain Deep Agents", href: "https://github.com/langchain-ai/deepagents" },
  { label: "Gemini API", href: "https://ai.google.dev/gemini-api/docs" },
  { label: "Model Context Protocol", href: "https://modelcontextprotocol.io" },
];

export default function AboutPage() {
  return (
    <div className="mx-auto flex max-w-6xl gap-12 px-6 py-12 md:px-12 md:py-16">
      <main className="min-w-0 flex-1">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-accent"
        >
          <ArrowLeft size={14} aria-hidden />
          Back to canvas
        </Link>

        <header id="overview" className="scroll-mt-12">
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-accent">
            Runway API Hackathon
          </p>
          <h1 className="text-4xl font-semibold leading-tight text-foreground md:text-5xl">
            Director&apos;s Canvas
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Agent-directed video production as a generative interface. Type a
            one-line brief — watch a LangGraph agent decompose it into shots,
            generate Runway reference stills, animate each into a clip, and
            stitch a final MP4. The agent&apos;s output <em>is</em> the
            interface.
          </p>
          <div className="mt-6 overflow-hidden rounded-xl border bg-muted">
            <Image
              src="/banner.jpg"
              alt="Director's Canvas — storyboard timeline with shot cards"
              width={1280}
              height={420}
              priority
              className="h-auto w-full object-cover"
            />
          </div>
        </header>

        <Section
          id="how-it-works"
          eyebrow="Pipeline"
          title="How it works"
          subtitle="A single brief flows through four stages. Every Runway call returns a state mutation — that's why the canvas paints live."
        >
          <ol className="space-y-4">
            {pipeline.map(({ icon: Icon, step, body }) => (
              <li key={step} className="flex gap-4 rounded-xl border bg-card p-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
                  <Icon size={18} aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">{step}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section
          id="runway"
          eyebrow="Runway API"
          title="What makes the Runway usage non-trivial"
          subtitle="Standard integrations call image_to_video once and return a URL. Director's Canvas does something structurally different."
        >
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm font-semibold text-foreground">Context-aware model selection</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                The agent picks the right model automatically.{" "}
                <Code>gen4_image</Code> for shot 0 (no prior refs available).{" "}
                <Code>gen4_image_turbo</Code> for shots 1+ (refs available,
                2–4× cheaper, &lt;10 s). <Code>gen4.5</Code> for all
                image→video animation. No user decision required.
              </p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm font-semibold text-foreground">Chained state across N calls</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Shot 0 runs synchronously first. Its reference URL is promoted
                to <Code>storyboard.style_ref_url</Code> and passed as{" "}
                <Code>character1</Code> to every subsequent{" "}
                <Code>gen4_image_turbo</Code> call. Shots 1+ run in parallel
                (bounded to 4 concurrent) with that anchor in place.
              </p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm font-semibold text-foreground">Agent-directed iteration</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                &ldquo;Regenerate shot 3 — make it more dramatic.&rdquo; The
                agent rewrites the prompt, re-calls Runway, and patches only
                that shot&apos;s state. The rest of the storyboard is
                untouched.
              </p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <p className="text-sm font-semibold text-foreground">Full pipeline to a deliverable</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                The agent doesn&apos;t stop at a URL. It calls FFmpeg to
                concat all clips into a single MP4 and serves it directly from
                the frontend. The output is something you can actually share.
              </p>
            </div>
          </div>
        </Section>

        <Section
          id="consistency"
          eyebrow="Cross-shot consistency"
          title="How character consistency works"
          subtitle="The astronaut in shot 4 looks like the astronaut in shot 1 — not because the user re-uploaded anything."
        >
          <div className="rounded-xl border bg-card p-5 text-sm leading-relaxed text-muted-foreground space-y-3">
            <p>
              <Code>gen4_image_turbo</Code> accepts up to 3{" "}
              <Code>referenceImages</Code>. Director&apos;s Canvas exploits
              this to keep characters and visual style coherent across shots:
            </p>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <strong className="text-foreground">character1</strong> — shot
                0&apos;s reference still (the primary anchor, always first)
              </li>
              <li>
                <strong className="text-foreground">style1</strong> — the
                immediately preceding shot&apos;s reference (local continuity)
              </li>
              <li>
                <strong className="text-foreground">style2</strong> — the shot
                two positions back (extra reinforcement for longer storyboards)
              </li>
            </ul>
            <p>
              The prompt can address the anchor explicitly:{" "}
              <Code>@character1 walks through the airlock</Code>. The{" "}
              <span className="font-medium text-violet-600">Consistent</span>{" "}
              pill in the canvas header lights up once the anchor is set.
            </p>
          </div>
        </Section>

        <Section
          id="byok"
          eyebrow="Access"
          title="BYOK + budget guard"
        >
          <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
            <div className="rounded-xl border bg-card p-5">
              <p className="font-semibold text-foreground">Bring Your Own Key</p>
              <p className="mt-2">
                Click <strong>Add Key</strong> in the canvas header to enter
                your Runway API key. It&apos;s stored in localStorage, sent as{" "}
                <Code>X-Runway-Api-Key</Code> on every request, and injected
                into the agent via LangGraph configurable. It is never logged.
                When your key is active, charges go to your Runway account and
                the per-thread budget check is skipped.
              </p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <p className="font-semibold text-foreground">Per-thread budget guard</p>
              <p className="mt-2">
                When using the shared server key, the BFF injects{" "}
                <Code>runway_calls_remaining</Code> into every request. The
                agent checks this before each Runway call and raises{" "}
                <Code>BudgetExceededError</Code> when it hits 0 (default: 20
                calls ≈ 10 shots). The error surfaces in chat with a clear
                message and a prompt to add your own key.
              </p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <p className="font-semibold text-foreground">MOCK mode</p>
              <p className="mt-2">
                No <Code>RUNWAY_API_KEY</Code> set? The full pipeline runs with
                deterministic placeholder media — same canvas, same status
                pills, same export flow. Anyone can try it without burning
                credits.
              </p>
            </div>
          </div>
        </Section>

        <Section
          id="stack"
          eyebrow="Technology"
          title="Stack"
        >
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Layer</th>
                  <th className="px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Technology</th>
                </tr>
              </thead>
              <tbody>
                {stack.map(({ layer, tech }, i) => (
                  <tr key={layer} className={i % 2 === 0 ? "bg-card" : "bg-background"}>
                    <td className="px-4 py-3 font-mono text-[12px] text-foreground">{layer}</td>
                    <td className="px-4 py-3 text-muted-foreground">{tech}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          id="quickstart"
          eyebrow="Get running"
          title="Quickstart"
        >
          <ol className="space-y-3">
            {[
              {
                title: "Init CopilotKit Intelligence",
                body: "npx @copilotkit/cli@latest init",
                note: "Select Intelligence when prompted. This sets up the Postgres-backed thread store.",
              },
              {
                title: "Add your keys",
                body: "cp .env.example .env && cp .env apps/agent/.env",
                note: "Set GEMINI_API_KEY in both files. Optionally set RUNWAY_API_KEY — without it the director runs in MOCK mode (same UI, deterministic placeholder media, no credits burned).",
              },
              {
                title: "Install + run",
                body: "npm install && npm run dev",
                note: "Boots the Docker infra (Postgres + Redis + Intelligence), then UI + BFF + agent. Open localhost:3000 → /director.",
              },
            ].map((step, idx) => (
              <li key={step.title} className="rounded-xl border bg-card p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border bg-background text-xs font-semibold text-foreground">
                    {idx + 1}
                  </span>
                  <h3 className="text-base font-semibold text-foreground">{step.title}</h3>
                </div>
                <pre className="mt-3 overflow-x-auto rounded-md border bg-muted px-4 py-3 font-mono text-sm text-foreground">
                  {step.body}
                </pre>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.note}</p>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex items-start gap-3 rounded-xl border bg-card p-4">
            <KeyRound size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            <p className="text-sm text-muted-foreground">
              No Runway key? That&apos;s fine — MOCK mode runs the full pipeline
              with placeholder media. Add your key via the{" "}
              <strong className="text-foreground">Add Key</strong> button in the
              canvas header at any time.
            </p>
          </div>
        </Section>

        <Section id="docs" eyebrow="Reference" title="Documentation">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-semibold text-foreground">In this repo</h3>
              <ul className="space-y-2">
                {docs.map((d) => (
                  <li key={d.href}>
                    <a
                      href={d.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-md border bg-card px-3 py-2 text-sm text-foreground hover:border-accent/40 hover:text-accent"
                    >
                      {d.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold text-foreground">External</h3>
              <ul className="space-y-2">
                {externalDocs.map((d) => (
                  <li key={d.href}>
                    <a
                      href={d.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-md border bg-card px-3 py-2 text-sm text-foreground hover:border-accent/40 hover:text-accent"
                    >
                      {d.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        <footer className="mt-16 border-t pt-8 text-sm text-muted-foreground">
          <p>Built for the Runway API Hackathon.</p>
        </footer>
      </main>
      <AboutToc items={tocItems} />
    </div>
  );
}
