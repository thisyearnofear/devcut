"use client";

import { useEffect, useMemo, useState } from "react";
import type { BuilderKit, ExportStatus } from "@/lib/storyboard/types";
import { downloadBuilderKitZip } from "@/lib/builder-kit-download";
import { HyperFramesHandoffPanel } from "@/components/devcut/HyperFramesHandoffPanel";
import { ProvenanceVaultPanel } from "@/components/devcut/ProvenanceVaultPanel";
import type { StoryboardState } from "@/lib/storyboard/types";

type OutcomeTab = "watch" | "handoff" | "vault" | "share";

interface JobOutcomePanelProps {
  exportStatus: ExportStatus;
  exportError: string | null;
  finalVideoUrl: string | null;
  durableUrl: string | null;
  manifestUri: string | null;
  storyboardTitle: string;
  builderKit: BuilderKit | null;
  /** Challenge Cut vs Submit Ready — drives share copy. */
  jobMode?: "challenge" | "submit" | string | null;
  stillUrls?: string[];
  /** Full canvas slice for the Provenance Vault tab. */
  vaultState?: Pick<
    StoryboardState,
    | "storyboard"
    | "shots"
    | "final_video_url"
    | "durable_url"
    | "manifest_uri"
    | "job_manifest_uri"
    | "final_sha256"
    | "canonical_hash"
    | "agent_loop"
  >;
  onExport: () => void;
  onDownload: (url: string, filename: string) => void;
}

/**
 * Outcome-first success surface: Watch cut · Handoff to HyperFrames · Share.
 * MP4 and HF kit are co-primary — proves DevCut supplements HyperFrames.
 */
export function JobOutcomePanel({
  exportStatus,
  exportError,
  finalVideoUrl,
  durableUrl,
  manifestUri,
  storyboardTitle,
  builderKit,
  jobMode,
  stillUrls = [],
  vaultState,
  onExport,
  onDownload,
}: JobOutcomePanelProps) {
  const mode = jobMode || builderKit?.mode || "submit";
  const [tab, setTab] = useState<OutcomeTab>("watch");

  // Prefer HyperFrames tab once kit lands (builder-first success).
  // Prefer Vault when durable B2 artifacts are present (hackathon judging).
  useEffect(() => {
    if (exportStatus !== "ready") return;
    if (durableUrl || vaultState?.job_manifest_uri) {
      setTab("vault");
    } else if (builderKit) {
      setTab("handoff");
    }
  }, [builderKit, durableUrl, exportStatus, vaultState?.job_manifest_uri]);

  const filename = `${slugify(storyboardTitle || "final-cut")}.mp4`;
  const shareUrl = durableUrl || finalVideoUrl;

  if (exportStatus === "idle") return null;

  if (exportStatus === "stitching") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4">
        <span className="inline-block size-4 animate-spin rounded-full border-2 border-[#c5d4c8] border-t-transparent" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-white/88">Stitching final cut…</p>
          <p className="text-xs text-white/45">
            Then we attach the HyperFrames handoff (BRIEF.md + asset drop).
          </p>
        </div>
      </div>
    );
  }

  if (exportStatus === "error") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-rose-200">Export failed</p>
          {exportError && (
            <p className="mt-0.5 break-words text-xs text-rose-200/80">{exportError}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onExport}
          className="shrink-0 rounded-full border border-rose-300/40 px-3 py-1 text-xs text-rose-100 hover:bg-rose-500/20"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!finalVideoUrl) return null;

  const tabs: { id: OutcomeTab; label: string; hint: string }[] = [
    {
      id: "watch",
      label: "Watch cut",
      hint: mode === "challenge" ? "Organizer reference film" : "Devpost-shaped cut",
    },
    {
      id: "vault",
      label: "Vault",
      hint: durableUrl ? "B2 + Genblaze provenance" : "Durable after B2 upload",
    },
    {
      id: "handoff",
      label: "HyperFrames",
      hint: builderKit ? "BRIEF + assets kit" : "Kit after stitch",
    },
    {
      id: "share",
      label: "Share",
      hint: mode === "challenge" ? "Pin / invite pack" : "Submission link",
    },
  ];

  return (
    <div className="flex flex-col gap-0 overflow-hidden rounded-xl border border-[#7a9e88]/35 bg-[#0c0f0e]">
      <div className="border-b border-white/10 px-4 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#a8c4b4]">
              Job complete
            </p>
            <p className="mt-1 text-sm font-medium text-white/90">
              {mode === "challenge"
                ? "Challenge Cut ready — share the film, hand builders the kit"
                : "Submit Ready ready — finish composition in HyperFrames"}
            </p>
            <p className="mt-1 text-xs leading-5 text-white/50">
              DevCut owned generative footage. HyperFrames still owns HTML → render.
            </p>
          </div>
          <button
            type="button"
            onClick={onExport}
            className="rounded-full border border-white/15 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/45 hover:text-white/75"
          >
            Re-stitch
          </button>
        </div>

        <div className="mt-4 flex gap-1" role="tablist" aria-label="Job outcome">
          {tabs.map((t) => {
            const active = tab === t.id;
            const disabled = t.id === "handoff" && !builderKit;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={disabled}
                onClick={() => setTab(t.id)}
                className={`min-w-0 flex-1 rounded-t-lg border border-b-0 px-3 py-2.5 text-left transition-colors disabled:opacity-35 ${
                  active
                    ? "border-[#7a9e88]/40 bg-[#7a9e88]/10"
                    : "border-transparent bg-transparent hover:bg-white/[0.03]"
                }`}
              >
                <p
                  className={`font-mono text-[10px] uppercase tracking-[0.12em] ${
                    active ? "text-[#c5d4c8]" : "text-white/40"
                  }`}
                >
                  {t.label}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-white/50">{t.hint}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4" role="tabpanel">
        {tab === "watch" && (
          <div className="space-y-4">
            <video
              key={finalVideoUrl}
              src={finalVideoUrl}
              controls
              playsInline
              autoPlay
              className="w-full rounded-lg bg-black"
              style={{ maxHeight: "50vh" }}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onDownload(finalVideoUrl, filename)}
                className="rounded-full bg-[#c5d4c8] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#0c0f0e] hover:bg-white"
              >
                Download MP4
              </button>
              {builderKit && (
                <button
                  type="button"
                  onClick={() => setTab("handoff")}
                  className="rounded-full border border-[#7a9e88]/45 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#c5d4c8] hover:bg-[#7a9e88]/15"
                >
                  Open HyperFrames kit
                </button>
              )}
              <button
                type="button"
                onClick={() => setTab("share")}
                className="rounded-full border border-white/15 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-white/60 hover:border-white/30"
              >
                Share pack
              </button>
            </div>
            {durableUrl && (
              <DurableRow label="Durable" url={durableUrl} tone="amber" />
            )}
            {manifestUri && (
              <DurableRow label="Manifest" url={manifestUri} tone="sky" />
            )}
          </div>
        )}

        {tab === "vault" && (
          <ProvenanceVaultPanel
            state={
              vaultState ?? {
                storyboard: { title: storyboardTitle, logline: "", aspect_ratio: "1280:720", runway_mode: "LIVE" },
                shots: [],
                final_video_url: finalVideoUrl,
                durable_url: durableUrl,
                manifest_uri: manifestUri,
                job_manifest_uri: null,
                final_sha256: null,
                canonical_hash: null,
                agent_loop: null,
              }
            }
          />
        )}

        {tab === "handoff" && builderKit && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => downloadBuilderKitZip(builderKit)}
                className="rounded-full bg-[#c5d4c8] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#0c0f0e] hover:bg-white"
              >
                Download HF kit (.zip)
              </button>
              <p className="self-center text-[11px] text-white/45">
                BRIEF.md · assets.json · README — paste into{" "}
                <code className="text-white/65">hyperframes init</code>
              </p>
            </div>
            <HyperFramesHandoffPanel kit={builderKit} compact />
          </div>
        )}

        {tab === "share" && (
          <SharePack
            title={storyboardTitle}
            mode={mode}
            shareUrl={shareUrl}
            stillUrls={stillUrls}
            hasKit={Boolean(builderKit)}
            onDownloadKit={
              builderKit ? () => downloadBuilderKitZip(builderKit) : undefined
            }
            onDownloadMp4={() => onDownload(finalVideoUrl, filename)}
          />
        )}
      </div>
    </div>
  );
}

function DurableRow({
  label,
  url,
  tone,
}: {
  label: string;
  url: string;
  tone: "amber" | "sky";
}) {
  const color = tone === "amber" ? "text-amber-400" : "text-sky-400";
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`min-w-0 flex-1 truncate font-mono text-[11px] hover:underline ${color}`}
      >
        {url}
      </a>
      <CopyChip text={url} />
    </div>
  );
}

function SharePack({
  title,
  mode,
  shareUrl,
  stillUrls,
  hasKit,
  onDownloadKit,
  onDownloadMp4,
}: {
  title: string;
  mode: string;
  shareUrl: string | null;
  stillUrls: string[];
  hasKit: boolean;
  onDownloadKit?: () => void;
  onDownloadMp4: () => void;
}) {
  const resolved =
    shareUrl ||
    (typeof window !== "undefined"
      ? window.location.href
      : "https://director.thisyearnofear.com");

  const inviteBlurb = useMemo(() => {
    if (mode === "challenge") {
      return [
        `Challenge Cut: ${title || "DevCut"}`,
        "",
        "Watch the reference film (what winning looks like), then fork the HyperFrames builder kit (BRIEF.md + assets/devcut/).",
        "",
        `Film: ${resolved}`,
        hasKit
          ? "Kit: download from the HyperFrames tab on the canvas (or ask organizers for the ZIP)."
          : "",
        "",
        "HyperFrames owns composition HTML. DevCut supplied generative heroes.",
      ]
        .filter(Boolean)
        .join("\n");
    }
    return [
      `Submit Ready cut: ${title || "DevCut"}`,
      "",
      "Generative heroes + packaging from DevCut. Finish / render in HyperFrames.",
      "",
      `MP4: ${resolved}`,
      hasKit ? "Handoff: download the HyperFrames kit ZIP from the canvas." : "",
    ]
      .filter(Boolean)
      .join("\n");
  }, [hasKit, mode, resolved, title]);

  return (
    <div className="space-y-4">
      <p className="text-xs leading-5 text-white/55">
        {mode === "challenge"
          ? "Pin this in Discord / email — film link + kit. Builders should not need a walkthrough."
          : "Attach the MP4 and HF kit to your Devpost / PR — composition stays in HyperFrames."}
      </p>

      {stillUrls.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">
            Still strip
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {stillUrls.slice(0, 6).map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt=""
                className="size-16 shrink-0 rounded-md border border-white/10 object-cover"
              />
            ))}
          </div>
        </div>
      )}

      <pre className="max-h-40 overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-4 text-white/65">
        {inviteBlurb}
      </pre>

      <div className="flex flex-wrap gap-2">
        <CopyChip text={inviteBlurb} label="Copy invite" large />
        <CopyChip text={resolved} label="Copy film URL" large />
        <button
          type="button"
          onClick={onDownloadMp4}
          className="rounded-full border border-white/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/70 hover:border-white/30"
        >
          Download MP4
        </button>
        {onDownloadKit && (
          <button
            type="button"
            onClick={onDownloadKit}
            className="rounded-full border border-[#7a9e88]/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#c5d4c8] hover:bg-[#7a9e88]/15"
          >
            Download HF kit
          </button>
        )}
        <TweetButton title={title} url={resolved} mode={mode} />
      </div>
    </div>
  );
}

function CopyChip({
  text,
  label = "Copy",
  large = false,
}: {
  text: string;
  label?: string;
  large?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* ignore */
        }
      }}
      className={
        large
          ? "rounded-full border border-white/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/70 hover:border-white/30"
          : "shrink-0 rounded-full border border-white/15 px-2 py-0.5 font-mono text-[10px] text-white/50 hover:text-white/80"
      }
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function TweetButton({
  title,
  url,
  mode,
}: {
  title: string;
  url: string;
  mode: string;
}) {
  const text =
    mode === "challenge"
      ? `Challenge Cut for "${title}" — visual spec for builders, HyperFrames kit included. ${url}`
      : `Submit Ready via DevCut → HyperFrames handoff: "${title}". ${url}`;
  return (
    <a
      href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-full border border-white/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/70 hover:border-white/30"
    >
      Share on X
    </a>
  );
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "final-cut"
  );
}
