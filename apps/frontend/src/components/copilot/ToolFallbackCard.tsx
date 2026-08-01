"use client";

import { useMemo, useState } from "react";
import { humanizeToolCall } from "@/lib/devcut-ledger";

export interface ToolFallbackCardProps {
  name: string;
  status: string;
  result?: string | undefined;
  parameters?: unknown;
  /** Cinema / DevCut dark chrome (director chat). Default: light leads demo. */
  variant?: "light" | "devcut";
}

export function ToolFallbackCard({
  name,
  status,
  result,
  parameters,
  variant = "light",
}: ToolFallbackCardProps) {
  const [open, setOpen] = useState(false);
  const human = useMemo(
    () => humanizeToolCall(name, status, parameters),
    [name, parameters, status],
  );
  const payload = useMemo(() => {
    const value = status === "complete" ? result ?? parameters : parameters;
    if (value === undefined || value === null) return "";
    if (typeof value === "string") {
      try {
        return JSON.stringify(JSON.parse(value), null, 2);
      } catch {
        return value;
      }
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [parameters, result, status]);

  const isDevcut = variant === "devcut";
  const done = status === "complete";
  const failed = status === "error" || status === "failed";

  return (
    <div
      className={
        isDevcut
          ? "my-2 max-w-[420px] rounded-xl border border-white/12 bg-white/[0.04] p-3 text-sm"
          : "my-2 max-w-[420px] rounded-xl border border-[#DBDBE5] bg-white p-3 text-sm shadow-sm"
      }
    >
      <div className="flex items-start gap-2">
        <span
          className={`mt-1.5 size-2 shrink-0 rounded-full ${
            done
              ? isDevcut
                ? "bg-emerald-400"
                : "bg-[#BEC2FF]"
              : failed
                ? "bg-rose-400"
                : isDevcut
                  ? "bg-[#ffbe70] animate-pulse"
                  : "bg-[#F4D35E]"
          }`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={
                isDevcut
                  ? "text-xs font-medium text-white/88"
                  : "font-mono text-[12px] text-foreground"
              }
            >
              {human.title}
            </span>
            <span
              className={
                isDevcut
                  ? "ml-auto font-mono text-[10px] uppercase tracking-wide text-white/40"
                  : "ml-auto font-mono text-[10px] uppercase tracking-wide text-muted-foreground"
              }
            >
              {status}
            </span>
          </div>
          <p
            className={
              isDevcut
                ? "mt-0.5 text-[11px] leading-4 text-white/55"
                : "mt-0.5 text-[11px] leading-4 text-muted-foreground"
            }
          >
            {human.summary}
          </p>
        </div>
      </div>
      {payload ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={
            isDevcut
              ? "mt-2 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-white/40 hover:text-white/70"
              : "mt-2 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
          }
        >
          {open ? "hide" : "details"}
        </button>
      ) : null}
      {open && payload ? (
        <pre
          className={
            isDevcut
              ? "mt-2 max-h-48 overflow-auto rounded-md border border-white/8 bg-black/30 p-2 font-mono text-[11px] leading-snug text-white/65"
              : "mt-2 max-h-48 overflow-auto rounded-md bg-[#F7F7F9] p-2 font-mono text-[11px] leading-snug text-foreground"
          }
        >
          {payload}
        </pre>
      ) : null}
    </div>
  );
}
