"use client";

import { useState } from "react";
import type { ExportStatus } from "@/lib/storyboard/types";
import { publicAppOrigin } from "@/lib/public-url";

interface ExportPanelProps {
  exportStatus: ExportStatus;
  exportError: string | null;
  finalVideoUrl: string | null;
  durableUrl: string | null;
  manifestUri: string | null;
  storyboardTitle: string;
  onExport: () => void;
  onDownload: (url: string, filename: string) => void;
}

/**
 * Shows the stitched-export state: idle → stitching spinner → ready player
 * (or error). Rendered below the timeline when at least one shot is ready.
 */
export function ExportPanel({
  exportStatus,
  exportError,
  finalVideoUrl,
  durableUrl,
  manifestUri,
  storyboardTitle,
  onExport,
  onDownload,
}: ExportPanelProps) {
  const filename = `${slugify(storyboardTitle || "final-cut")}.mp4`;
  const shareUrl = durableUrl || finalVideoUrl;

  if (exportStatus === "idle") {
    return null; // caller decides when to show the Export button
  }

  if (exportStatus === "stitching") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card/60 p-4 shadow-sm">
        {/* Spinner */}
        <span className="inline-block size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            Stitching final cut…
          </p>
          <p className="text-xs text-muted-foreground">
            Downloading clips and running FFmpeg concat — this may take a
            minute.
          </p>
        </div>
      </div>
    );
  }

  if (exportStatus === "error") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
        <span className="mt-0.5 text-rose-500">✕</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-rose-800">Export failed</p>
          {exportError && (
            <p className="mt-0.5 break-words text-xs text-rose-600">
              {exportError}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onExport}
          className="shrink-0 rounded-full border border-rose-300 bg-white px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
        >
          Retry
        </button>
      </div>
    );
  }

  // exportStatus === "ready"
  if (!finalVideoUrl) return null;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-emerald-200/40 bg-card/60 p-4 shadow-sm">
      {/* Hero video */}
      <video
        key={finalVideoUrl}
        src={finalVideoUrl}
        controls
        playsInline
        autoPlay
        className="w-full rounded-lg bg-black"
        style={{ maxHeight: "55vh" }}
      />

      {/* Title + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
          <p className="text-sm font-semibold text-foreground">Final cut ready</p>
          <span className="text-xs text-muted-foreground">{filename}</span>
          {durableUrl && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 ring-1 ring-amber-500/20">
              Stored on B2
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <ShareButton title={storyboardTitle} shareUrl={shareUrl} />
          <button
            type="button"
            onClick={() => onDownload(finalVideoUrl, filename)}
            className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
          >
            ↓ Download MP4
          </button>
          <button
            type="button"
            onClick={onExport}
            className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            Re-stitch
          </button>
        </div>
      </div>

      {/* Durable B2 link */}
      {durableUrl && (
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
          <span className="shrink-0 text-[11px] font-mono uppercase tracking-wider text-white/45">
            Durable
          </span>
          <a
            href={durableUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 truncate font-mono text-[11px] text-amber-400 hover:text-amber-300"
          >
            {durableUrl}
          </a>
          <CopyButton text={durableUrl} />
        </div>
      )}

      {/* Genblaze provenance manifest */}
      {manifestUri && (
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
          <span className="shrink-0 text-[11px] font-mono uppercase tracking-wider text-white/45">
            Manifest
          </span>
          <a
            href={manifestUri}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 truncate font-mono text-[11px] text-sky-400 hover:text-sky-300"
          >
            {manifestUri}
          </a>
          <CopyButton text={manifestUri} />
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
      title="Copy link"
    >
      {copied ? "✓" : "Copy"}
    </button>
  );
}

function ShareButton({ title, shareUrl }: { title: string; shareUrl: string | null }) {
  const resolved = shareUrl || publicAppOrigin();

  const shareText = title
    ? `I just shipped "${title}" with DevCut — Runway stills → clips → stitch for developers. Try it:`
    : "I just shipped a cut with DevCut — Challenge Cut / Submit Ready on Runway for HyperFrames builders. Try it:";

  const handleShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "DevCut", text: shareText, url: resolved });
        return;
      } catch { /* user cancelled or not supported */ }
    }
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText + " " + resolved)}`;
    window.open(tweetUrl, "_blank", "noopener,noreferrer,width=550,height=420");
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100"
      title="Share on X / Twitter"
    >
      𝕏 Share
    </button>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "final-cut";
}
