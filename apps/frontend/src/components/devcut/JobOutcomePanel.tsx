"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { BuilderKit, ExportStatus } from "@/lib/storyboard/types";
import { downloadBuilderKitZip } from "@/lib/builder-kit-download";
import { HyperFramesHandoffPanel } from "@/components/devcut/HyperFramesHandoffPanel";
import { ProvenanceVaultPanel } from "@/components/devcut/ProvenanceVaultPanel";
import type { StoryboardState } from "@/lib/storyboard/types";
import { cutWatchUrl, type CutShareCard } from "@/lib/cut-share";
import { lastJobRemixHref, saveLastJob } from "@/lib/last-job";
import { publicAppOrigin } from "@/lib/public-url";

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
  /** Brief seed for remix / last-job loop */
  jobBrief?: string | null;
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
  /** Clear canvas / start a new commission */
  onShipAnother?: () => void;
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
  jobBrief,
  stillUrls = [],
  vaultState,
  onExport,
  onDownload,
  onShipAnother,
}: JobOutcomePanelProps) {
  const mode = jobMode || builderKit?.mode || "submit";
  const [tab, setTab] = useState<OutcomeTab>("watch");
  const [watchUrl, setWatchUrl] = useState<string | null>(null);
  const [remixHref, setRemixHref] = useState("/director");

  // Land on Watch — viral share is one click from the film.
  useEffect(() => {
    if (exportStatus !== "ready" || !finalVideoUrl) return;
    setTab("watch");
  }, [exportStatus, finalVideoUrl]);

  // Persist last job + build viral /cut URL
  useEffect(() => {
    if (exportStatus !== "ready" || !finalVideoUrl) return;
    const video = durableUrl || finalVideoUrl;
    const brief =
      jobBrief?.trim() ||
      builderKit?.brief_md?.trim() ||
      `Remix of "${storyboardTitle || "DevCut"}"`;
    const card: CutShareCard = {
      v: video,
      t: storyboardTitle || "DevCut cut",
      m: mode,
      s: stillUrls[0],
      b: brief,
    };
    const url = cutWatchUrl(card);
    setWatchUrl(url);
    const saved = saveLastJob({
      title: card.t,
      video,
      mode,
      brief,
      still: stillUrls[0],
    });
    setRemixHref(lastJobRemixHref(saved));
  }, [
    builderKit?.brief_md,
    durableUrl,
    exportStatus,
    finalVideoUrl,
    jobBrief,
    mode,
    stillUrls,
    storyboardTitle,
  ]);

  const filename = `${slugify(storyboardTitle || "final-cut")}.mp4`;
  const shareUrl = watchUrl || durableUrl || finalVideoUrl;

  if (exportStatus === "idle") return null;

  if (exportStatus === "stitching") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4">
        <span className="inline-block size-4 animate-spin rounded-full border-2 border-[var(--dc-signal,#ff9f1c)] border-t-transparent" />
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
      hint: mode === "challenge" ? "Visual spec for builders" : "Launch-ready cut",
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
    <div className="flex flex-col gap-0 overflow-hidden rounded-xl border border-[var(--dc-signal,#ff9f1c)]/35 bg-[var(--dc-ink,#050607)]">
      <div className="border-b border-white/10 px-4 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--dc-cyan,#2de2c5)]">
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
          <div className="flex flex-wrap gap-2">
            {watchUrl && (
              <CopyChip text={watchUrl} label="Copy watch link" large />
            )}
            <Link
              href={remixHref}
              className="rounded-full border border-[var(--dc-cyan,#2de2c5)]/45 bg-[var(--dc-cyan,#2de2c5)]/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--dc-cyan,#2de2c5)] hover:bg-[var(--dc-cyan,#2de2c5)]/20"
            >
              Remix this brief
            </Link>
            {onShipAnother && (
              <button
                type="button"
                onClick={onShipAnother}
                className="rounded-full bg-[var(--dc-signal,#ff9f1c)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--dc-ink,#050607)] hover:bg-white"
              >
                Ship another
              </button>
            )}
            <button
              type="button"
              onClick={onExport}
              className="rounded-full border border-white/15 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/45 hover:text-white/75"
            >
              Re-stitch
            </button>
          </div>
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
                    ? "border-[var(--dc-signal,#ff9f1c)]/40 bg-[var(--dc-signal,#ff9f1c)]/10"
                    : "border-transparent bg-transparent hover:bg-white/[0.03]"
                }`}
              >
                <p
                  className={`font-mono text-[10px] uppercase tracking-[0.12em] ${
                    active ? "text-[var(--dc-signal,#ff9f1c)]" : "text-white/40"
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
                className="rounded-full bg-[var(--dc-signal,#ff9f1c)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dc-ink,#050607)] hover:bg-white"
              >
                Download MP4
              </button>
              {builderKit && (
                <button
                  type="button"
                  onClick={() => setTab("handoff")}
                  className="rounded-full border border-[var(--dc-signal,#ff9f1c)]/45 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dc-signal,#ff9f1c)] hover:bg-[var(--dc-signal,#ff9f1c)]/15"
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
                className="rounded-full bg-[var(--dc-signal,#ff9f1c)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dc-ink,#050607)] hover:bg-white"
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
            watchUrl={watchUrl}
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
  watchUrl,
  stillUrls,
  hasKit,
  onDownloadKit,
  onDownloadMp4,
}: {
  title: string;
  mode: string;
  shareUrl: string | null;
  watchUrl: string | null;
  stillUrls: string[];
  hasKit: boolean;
  onDownloadKit?: () => void;
  onDownloadMp4: () => void;
}) {
  const watch = watchUrl || shareUrl || `${publicAppOrigin()}/director`;

  const inviteBlurb = useMemo(() => {
    if (mode === "challenge") {
      return [
        `Challenge Cut: ${title || "DevCut"}`,
        "",
        "Watch the reference film, then remix in DevCut or finish in HyperFrames.",
        "",
        `Watch + remix: ${watch}`,
        hasKit ? "Kit: download from the HyperFrames tab on the canvas." : "",
        "",
        "Made with DevCut + Runway. HyperFrames owns composition HTML.",
      ]
        .filter(Boolean)
        .join("\n");
    }
    return [
      `Submit Ready cut: ${title || "DevCut"}`,
      "",
      "Generative heroes + packaging from DevCut. Finish / render in HyperFrames.",
      "",
      `Watch + remix: ${watch}`,
      hasKit ? "Handoff: download the HyperFrames kit ZIP from the canvas." : "",
    ]
      .filter(Boolean)
      .join("\n");
  }, [hasKit, mode, title, watch]);

  return (
    <div className="space-y-4">
      <p className="text-xs leading-5 text-white/55">
        Share the watch link — friends play the cut and hit Remix in DevCut. That&apos;s the loop.
      </p>

      {watchUrl && <DurableRow label="Watch" url={watchUrl} tone="amber" />}

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

      <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-4 text-white/65">
        {inviteBlurb}
      </pre>

      <div className="flex flex-wrap gap-2">
        <CopyChip text={inviteBlurb} label="Copy invite" large />
        <CopyChip text={watch} label="Copy watch link" large />
        <NativeShareButton title={title} url={watch} mode={mode} />
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
            className="rounded-full border border-[var(--dc-signal,#ff9f1c)]/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--dc-signal,#ff9f1c)] hover:bg-[var(--dc-signal,#ff9f1c)]/15"
          >
            Download HF kit
          </button>
        )}
        <TweetButton title={title} url={watch} mode={mode} />
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

function NativeShareButton({
  title,
  url,
  mode,
}: {
  title: string;
  url: string;
  mode: string;
}) {
  const [label, setLabel] = useState("Share…");
  const text =
    mode === "challenge"
      ? `Challenge Cut “${title}” — watch + remix on DevCut.`
      : `Submit Ready “${title}” via DevCut + Runway → HyperFrames.`;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          if (navigator.share) {
            await navigator.share({ title, text, url });
            return;
          }
          await navigator.clipboard.writeText(url);
          setLabel("Copied");
          setTimeout(() => setLabel("Share…"), 2000);
        } catch {
          /* dismissed */
        }
      }}
      className="rounded-full border border-[var(--dc-cyan,#2de2c5)]/40 bg-[var(--dc-cyan,#2de2c5)]/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--dc-cyan,#2de2c5)] hover:bg-[var(--dc-cyan,#2de2c5)]/20"
    >
      {label}
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
      ? `Challenge Cut “${title}” — watch + remix on DevCut (Runway desk for developers). ${url}`
      : `Submit Ready “${title}” via DevCut + Runway → HyperFrames. Watch + remix: ${url}`;
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
