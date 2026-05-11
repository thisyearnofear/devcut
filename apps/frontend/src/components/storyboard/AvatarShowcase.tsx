"use client";

/**
 * AvatarShowcase — a prominent avatar call widget for the Director page
 * empty state. Uses @runwayml/avatars-react to render a live WebRTC video
 * call with the Director character.
 *
 * When NEXT_PUBLIC_RUNWAY_AVATAR_ID is not set, falls back to a branded
 * placeholder with a link to the Runway dev portal.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AvatarCall,
  AvatarVideo,
  ControlBar,
} from "@runwayml/avatars-react";
import "@runwayml/avatars-react/styles.css";
import type { SessionCredentials } from "@runwayml/avatars-react";

const AVATAR_ID = process.env.NEXT_PUBLIC_RUNWAY_AVATAR_ID ?? "";

type ShowcaseState = "idle" | "connecting" | "active" | "ending" | "error";

export function AvatarShowcase() {
  const [state, setState] = useState<ShowcaseState>("idle");
  const [credentials, setCredentials] = useState<SessionCredentials | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const connect = useCallback(async () => {
    if (!AVATAR_ID) return;

    setState("connecting");
    setErrorMsg("");

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/avatar/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avatarId: AVATAR_ID,
          personality:
            "You are the Director — a cinematic AI agent. Greet the user warmly " +
            "and invite them to describe a scene in the chat panel. Keep it brief " +
            "and enthusiastic, under 30 words.",
          startScript:
            "Hey! I'm the Director. Describe any scene in the chat and I'll turn it into a storyboard. Ready when you are!",
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Session failed (${res.status})`);
      }

      const creds = (await res.json()) as SessionCredentials;
      setCredentials(creds);
      setState("active");
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setState("error");
    }
  }, []);

  const disconnect = useCallback(() => {
    abortRef.current?.abort();
    setCredentials(null);
    setState("idle");
    setErrorMsg("");
  }, []);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // No avatar configured — show branded placeholder
  if (!AVATAR_ID) {
    return (
      <div className="flex w-full max-w-sm items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] p-8">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/30 text-5xl">
            🎬
          </div>
          <p className="text-center text-sm leading-6 text-white/52">
            Powered by{" "}
            <a
              href="https://dev.runwayml.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/72 underline decoration-white/25 underline-offset-2 transition-colors hover:text-white"
            >
              Runway Characters
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3">
      {/* Idle — call-to-action */}
      {state === "idle" && (
        <button
          type="button"
          onClick={connect}
          className="group flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-8 transition-colors hover:border-white/20 hover:bg-white/[0.07]"
        >
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/30 transition-transform group-hover:scale-105">
            <span className="text-5xl">🎬</span>
            <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/90 text-xs text-white shadow-lg">
              ▶
            </span>
          </div>
          <div className="space-y-1 text-center">
            <p className="text-sm font-medium text-white/82">
              Talk to the Director
            </p>
            <p className="text-xs text-white/45">
              Live video call · powered by Runway Characters
            </p>
          </div>
        </button>
      )}

      {/* Connecting */}
      {state === "connecting" && (
        <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-8">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/30">
            <span className="inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-white/30 border-t-white/80" />
          </div>
          <div className="space-y-1 text-center">
            <p className="text-sm font-medium text-white/82">
              Starting session…
            </p>
            <p className="text-xs text-white/45">
              This usually takes ~10 seconds
            </p>
          </div>
          <button
            type="button"
            onClick={disconnect}
            className="text-xs text-white/40 underline underline-offset-2 hover:text-white/60"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Active — live avatar call */}
      {state === "active" && credentials && (
        <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/15 bg-black/40 shadow-2xl">
          <AvatarCall
            avatarId={AVATAR_ID}
            credentials={credentials}
            onEnd={disconnect}
            onError={() => {
              disconnect();
              setState("error");
              setErrorMsg("Session ended unexpectedly.");
            }}
            className="w-full"
          >
            <AvatarVideo className="aspect-video w-full" />
            <ControlBar
              showMicrophone
              showEndCall
              className="border-t border-white/10 bg-black/30 px-3 py-2"
            />
          </AvatarCall>
        </div>
      )}

      {/* Error */}
      {state === "error" && (
        <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/[0.06] p-6">
          <p className="text-center text-xs text-rose-300/80">{errorMsg}</p>
          <button
            type="button"
            onClick={connect}
            className="rounded-full border border-rose-400/30 px-4 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/10"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
