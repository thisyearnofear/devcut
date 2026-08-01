"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import {
  DEVCUT_DOORS,
  type DevCutDoorId,
} from "@/lib/devcut";
import { LANDING_DOOR_CLIPS } from "@/lib/landing-story";

const CLIP_CLOSED = "inset(100% 0% 0% 0%)";
const CLIP_OPEN = "inset(0% 0% 0% 0%)";

interface ClipDoorsProps {
  door: DevCutDoorId;
  onSelect: (id: DevCutDoorId) => void;
}

/**
 * EaseReverse-inspired clip rail — each door is its own reel still.
 */
export function ClipDoors({ door, onSelect }: ClipDoorsProps) {
  const panelsRef = useRef<Map<DevCutDoorId, HTMLDivElement>>(new Map());
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    DEVCUT_DOORS.forEach((d) => {
      const el = panelsRef.current.get(d.id);
      if (!el) return;
      const open = d.id === door;
      if (reduced.current) {
        gsap.set(el, {
          clipPath: open ? CLIP_OPEN : CLIP_CLOSED,
          opacity: open ? 1 : 0.4,
        });
        return;
      }
      gsap.to(el, {
        clipPath: open ? CLIP_OPEN : CLIP_CLOSED,
        opacity: open ? 1 : 0.35,
        duration: open ? 0.28 : 0.22,
        ease: open ? "power3.out" : "power2.in",
        overwrite: true,
      });
    });
  }, [door]);

  return (
    <div
      role="tablist"
      aria-label="DevCut doors"
      className="relative grid border-y border-[var(--dc-line)] md:grid-cols-3"
    >
      {DEVCUT_DOORS.map((d) => {
        const selected = door === d.id;
        const clip = LANDING_DOOR_CLIPS[d.id];
        return (
          <button
            key={d.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(d.id)}
            className="dc-btn group relative min-h-[220px] overflow-hidden px-4 py-6 text-left sm:min-h-[260px] sm:px-5"
          >
            <div
              ref={(node) => {
                if (node) panelsRef.current.set(d.id, node);
                else panelsRef.current.delete(d.id);
              }}
              className="pointer-events-none absolute inset-0"
              style={{ clipPath: selected ? CLIP_OPEN : CLIP_CLOSED }}
              aria-hidden
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={clip.image}
                alt=""
                className="h-full w-full scale-105 object-cover"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,6,7,0.35)_0%,rgba(5,6,7,0.82)_70%,rgba(5,6,7,0.94)_100%)]" />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,159,28,0.18),rgba(45,226,197,0.05))]" />
            </div>

            {/* Dim still when not selected — always visible at low opacity */}
            {!selected && (
              <div className="pointer-events-none absolute inset-0 opacity-25" aria-hidden>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={clip.image}
                  alt=""
                  className="h-full w-full object-cover grayscale"
                />
                <div className="absolute inset-0 bg-[var(--dc-ink)]/70" />
              </div>
            )}

            <div className="relative z-[1]">
              <p
                className={`dc-mono text-[10px] uppercase tracking-[0.16em] ${
                  selected ? "text-[var(--dc-cyan)]" : "text-[var(--dc-dim)]"
                }`}
              >
                {d.label}
              </p>
              <p
                className={`dc-display mt-2 text-xl font-semibold tracking-tight ${
                  selected ? "text-[var(--dc-paper)]" : "text-[var(--dc-mute)]"
                }`}
              >
                {clip.clipLabel}
              </p>
              <p className="mt-1.5 max-w-xs text-sm leading-5 text-[var(--dc-dim)]">
                {clip.panelLine}
              </p>
              <p className="mt-2 text-xs leading-5 text-[var(--dc-dim)] opacity-80 md:opacity-100">
                {d.body}
              </p>
            </div>
            <span
              className={`absolute inset-x-0 bottom-0 h-[2px] transition-[background-color,transform] duration-200 ${
                selected
                  ? "scale-x-100 bg-[var(--dc-signal)]"
                  : "scale-x-0 bg-transparent group-hover:scale-x-100 group-hover:bg-[var(--dc-line)]"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
