"use client";

import { useState } from "react";
import type { BuilderKit } from "@/lib/storyboard/types";
import { downloadBuilderKitZip } from "@/lib/builder-kit-download";

interface HyperFramesHandoffPanelProps {
  kit: BuilderKit;
  /** When embedded inside JobOutcomePanel — less chrome duplication. */
  compact?: boolean;
}

/**
 * Makes the HyperFrames complement tangible: copy BRIEF.md + see asset drop paths.
 * DevCut stops at generative footage; HF owns composition HTML.
 */
export function HyperFramesHandoffPanel({
  kit,
  compact = false,
}: HyperFramesHandoffPanelProps) {
  const [copied, setCopied] = useState<"brief" | "drop" | "cli" | null>(null);
  const unpackCli =
    "uv run python scripts/materialize_hf_kit.py --zip ~/Downloads/<kit>.zip --out ./devcut-kit";

  async function copy(text: string, which: "brief" | "drop" | "cli") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className={
        compact
          ? "flex flex-col gap-4"
          : "flex flex-col gap-4 rounded-xl border border-[var(--dc-signal,#ff9f1c)]/35 bg-[var(--dc-signal,#ff9f1c)]/[0.07] p-4"
      }
    >
      {!compact && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--dc-cyan,#2de2c5)]">
              HyperFrames handoff
            </p>
            <p className="text-sm font-medium text-white/90">
              {kit.mode === "challenge"
                ? "Builder kit from Challenge Cut"
                : "Submit Ready → HF assets"}
            </p>
            <p className="text-xs leading-5 text-white/55">
              {kit.summary} HyperFrames keeps HTML composition; DevCut supplied the heroes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => downloadBuilderKitZip(kit)}
            className="shrink-0 rounded-full bg-[var(--dc-signal,#ff9f1c)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--dc-ink,#050607)] hover:bg-white"
          >
            Download kit.zip
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => copy(kit.brief_md, "brief")}
          className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/80 hover:border-white/30"
        >
          {copied === "brief" ? "Copied BRIEF.md" : "Copy BRIEF.md"}
        </button>
        <button
          type="button"
          onClick={() => copy(kit.drop_instructions, "drop")}
          className="rounded-full border border-white/15 bg-transparent px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/55 hover:border-white/30 hover:text-white/80"
        >
          {copied === "drop" ? "Copied steps" : "Copy drop steps"}
        </button>
        <button
          type="button"
          onClick={() => copy(unpackCli, "cli")}
          title="Unpack kit.zip into ./devcut-kit on disk"
          className="rounded-full border border-white/15 bg-transparent px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/55 hover:border-white/30 hover:text-white/80"
        >
          {copied === "cli" ? "Copied CLI" : "Copy unpack CLI"}
        </button>
        <span className="self-center font-mono text-[10px] uppercase tracking-[0.1em] text-white/35">
          workflow · {kit.workflow}
        </span>
      </div>

      {kit.assets.length > 0 && (
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">
            Stage into project
          </p>
          <ul className="max-h-40 space-y-1.5 overflow-y-auto">
            {kit.assets.map((a) => (
              <li
                key={`${a.path}-${a.kind}`}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg border border-white/8 bg-black/20 px-2.5 py-1.5 text-[11px]"
              >
                <span className="font-mono text-white/45">{a.kind}</span>
                <code className="text-white/80">{a.path}</code>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto truncate text-[var(--dc-cyan,#2de2c5)] hover:underline"
                >
                  open
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <pre className="max-h-48 overflow-auto rounded-lg border border-white/8 bg-black/35 p-3 font-mono text-[10px] leading-4 text-white/55">
        {kit.brief_md}
      </pre>
    </div>
  );
}
