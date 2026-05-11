"use client";

import { useState } from "react";
import type { ExportStatus } from "@/lib/storyboard/types";

interface ExportPanelProps {
  exportStatus: ExportStatus;
  exportError: string | null;
  finalVideoUrl: string | null;
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
  storyboardTitle,
  onExport,
  onDownload,
}: ExportPanelProps) {
  const filename = `${slugify(storyboardTitle || "final-cut")}.mp4`;

  if (exportStatus === "idle") {
    return null; // caller decides when to show the Export button
  }

  if (exportStatus === "stitching") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card/60 p-4 shadow-sm">
        {/* Spinner */}
        <span className="inline-block size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">
            Stitching final cut…
          </p>
          <p className="text-[10px] text-muted-foreground">
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
          <p className="text-xs font-medium text-rose-800">Export failed</p>
          {exportError && (
            <p className="mt-0.5 break-words text-[10px] text-rose-600">
              {exportError}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onExport}
          className="shrink-0 rounded-full border border-rose-300 bg-white px-3 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50"
        >
          Retry
        </button>
      </div>
    );
  }

  // exportStatus === "ready"
  if (!finalVideoUrl) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-card/60 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-500" />
          <p className="text-xs font-semibold text-foreground">Final cut ready</p>
        </div>
        <div className="flex gap-2">
          <ShareButton title={storyboardTitle} />
          <button
            type="button"
            onClick={() => onDownload(finalVideoUrl, filename)}
            className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
          >
            ↓ Download MP4
          </button>
          <button
            type="button"
            onClick={onExport}
            className="rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground hover:bg-muted"
          >
            Re-stitch
          </button>
        </div>
      </div>
      <video
        key={finalVideoUrl}
        src={finalVideoUrl}
        controls
        playsInline
        autoPlay={false}
        className="w-full rounded-lg bg-black"
        style={{ maxHeight: "40vh" }}
      />
      <p className="text-[10px] text-muted-foreground">
        {filename}
      </p>
    </div>
  );
}

function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  const shareText = title
    ? `I just directed "${title}" with Director's Canvas — an AI agent that turns a one-line brief into a stitched video storyboard using Runway. Try it:`
    : "I just directed a storyboard with Director's Canvas — an AI agent that turns a one-line brief into a stitched video using Runway. Try it:";

  const shareUrl = typeof window !== "undefined" ? window.location.origin : "https://director.thisyearnofear.com";

  const handleShare = async () => {
    // Try native share first (mobile)
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Director's Canvas", text: shareText, url: shareUrl });
        return;
      } catch { /* user cancelled or not supported */ }
    }
    // Fall back to X/Twitter
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText + " " + shareUrl)}`;
    window.open(tweetUrl, "_blank", "noopener,noreferrer,width=550,height=420");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        onClick={handleShare}
        className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-100"
        title="Share on X / Twitter"
      >
        𝕏 Share
      </button>
      <button
        type="button"
        onClick={handleCopy}
        className="rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground hover:bg-muted"
        title="Copy link"
      >
        {copied ? "Copied ✓" : "Copy link"}
      </button>
    </div>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "final-cut";
}
