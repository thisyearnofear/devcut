"use client";

/**
 * AvatarPanel — the Director avatar powered by Runway Characters (gwm1_avatars).
 *
 * Renders as a collapsible panel in the threads drawer footer area.
 * Collapsed by default; one click opens a video call with the Director avatar.
 *
 * Architecture:
 *   - This component calls POST /api/avatar/session (server route) to get
 *     WebRTC credentials. The Runway API key never touches the client.
 *   - AvatarCall from @runwayml/avatars-react handles the WebRTC connection,
 *     video rendering, and audio — we just pass it credentials.
 *   - The avatar's personality is seeded with the current storyboard context
 *     (title + logline) so it can speak intelligently about the project.
 *
 * The RUNWAY_AVATAR_ID env var must be set to a valid avatar ID from the
 * Runway dev portal (dev.runwayml.com → Characters → Create). When unset,
 * the panel renders a "not configured" state rather than erroring.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AvatarCall } from "@runwayml/avatars-react";
import "@runwayml/avatars-react/styles.css";
import type { SessionCredentials } from "@runwayml/avatars-react";
import type { Storyboard } from "@/lib/storyboard/types";

// Injected at build time from NEXT_PUBLIC_RUNWAY_AVATAR_ID env var.
// Set this in .env to your avatar's ID from dev.runwayml.com.
const AVATAR_ID = process.env.NEXT_PUBLIC_RUNWAY_AVATAR_ID ?? "";

type PanelState = "idle" | "connecting" | "active" | "error";

interface AvatarPanelProps {
  /** Current storyboard context — used to personalise the avatar's greeting. */
  storyboard: Storyboard;
}

export function AvatarPanel({ storyboard }: AvatarPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [panelState, setPanelState] = useState<PanelState>("idle");
  const [credentials, setCredentials] = useState<SessionCredentials | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  // Build a personality string from the current storyboard so the avatar
  // knows what project it's directing.
  const personality = buildPersonality(storyboard);

  const connect = useCallback(async () => {
    if (!AVATAR_ID) {
      setErrorMsg("NEXT_PUBLIC_RUNWAY_AVATAR_ID is not set.");
      setPanelState("error");
      return;
    }

    setPanelState("connecting");
    setErrorMsg("");

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/avatar/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarId: AVATAR_ID, personality }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Session request failed (${res.status})`);
      }

      const creds = (await res.json()) as SessionCredentials;
      setCredentials(creds);
      setPanelState("active");
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setPanelState("error");
    }
  }, [personality]);

  const disconnect = useCallback(() => {
    abortRef.current?.abort();
    setCredentials(null);
    setPanelState("idle");
    setErrorMsg("");
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Close → disconnect
  const handleToggle = useCallback(() => {
    if (isOpen) {
      disconnect();
      setIsOpen(false);
    } else {
      setIsOpen(true);
    }
  }, [isOpen, disconnect]);

  if (!AVATAR_ID) return null;

  return (
    <div className="border-t border-[color-mix(in_oklab,var(--border)_60%,transparent)]">
      {/* Toggle button */}
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--sidebar-hover)]"
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close Director avatar" : "Talk to the Director"}
      >
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
          {/* Animated dot — green when active, amber when connecting */}
          <span
            className={`absolute inline-flex h-2 w-2 rounded-full ${
              panelState === "active"
                ? "bg-emerald-500"
                : panelState === "connecting"
                  ? "bg-amber-400 animate-pulse"
                  : "bg-[var(--sidebar-muted)]"
            }`}
          />
          {panelState === "active" && (
            <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-75" />
          )}
        </span>
        <span className="flex-1 text-[0.82rem] font-medium text-[var(--sidebar-foreground)]">
          {panelState === "connecting"
            ? "Connecting…"
            : panelState === "active"
              ? "Director (live)"
              : "Talk to the Director"}
        </span>
        <span
          className="text-xs text-[var(--sidebar-muted)] transition-transform duration-200"
          style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
          aria-hidden
        >
          ▾
        </span>
      </button>

      {/* Expanded panel */}
      {isOpen && (
        <div className="px-2 pb-3">
          {panelState === "idle" && (
            <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
              <p className="text-[11px] leading-relaxed text-[var(--sidebar-muted)]">
                {storyboard.title
                  ? `Ask the Director about "${storyboard.title}".`
                  : "Give the Director a brief, then ask questions about your storyboard."}
              </p>
              <button
                type="button"
                onClick={connect}
                className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-[11px] font-medium text-[var(--primary-foreground)] hover:opacity-90"
              >
                Start session
              </button>
            </div>
          )}

          {panelState === "connecting" && (
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
              <p className="text-[11px] text-[var(--sidebar-muted)]">
                Starting session — this takes ~10 s…
              </p>
            </div>
          )}

          {panelState === "error" && (
            <div className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="text-[11px] text-rose-700">{errorMsg}</p>
              <button
                type="button"
                onClick={connect}
                className="self-start rounded-md border border-rose-300 bg-white px-3 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50"
              >
                Retry
              </button>
            </div>
          )}

          {panelState === "active" && credentials && (
            <div className="overflow-hidden rounded-lg border border-[var(--border)]">
              <AvatarCall
                avatarId={AVATAR_ID}
                credentials={credentials}
                onEnd={disconnect}
                onError={() => { disconnect(); setPanelState("error"); setErrorMsg("Session ended unexpectedly."); }}
                className="w-full"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPersonality(storyboard: Storyboard): string {
  const base =
    "You are the Director — a cinematic AI agent that helps users create " +
    "short-form video storyboards. You speak with creative authority but " +
    "stay concise. You know the user's current project and can discuss " +
    "shot choices, visual style, pacing, and Runway model selection.";

  if (!storyboard.title) return base;

  const context =
    `The current project is "${storyboard.title}"` +
    (storyboard.logline ? ` — "${storyboard.logline}"` : "") +
    ".";

  return `${base} ${context}`;
}
