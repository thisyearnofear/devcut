"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "director_runway_api_key";

export function useRunwayApiKey() {
  const [key, setKeyState] = useState<string>("");

  useEffect(() => {
    setKeyState(localStorage.getItem(STORAGE_KEY) ?? "");
  }, []);

  const setKey = (k: string) => {
    const trimmed = k.trim();
    if (trimmed) {
      localStorage.setItem(STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    setKeyState(trimmed);
  };

  return { key, setKey };
}

interface ApiKeyPanelProps {
  onClose: () => void;
  isLive: boolean;
}

/**
 * Inline key panel — edit-bay chrome.
 */
export function ApiKeyPanel({ onClose, isLive }: ApiKeyPanelProps) {
  const { key, setKey } = useRunwayApiKey();
  const [draft, setDraft] = useState(key);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(key);
  }, [key]);
  useEffect(() => {
    if (!key) inputRef.current?.focus();
  }, [key]);

  const handleSave = () => {
    setKey(draft);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1200);
  };

  const handleClear = () => {
    setKey("");
    setDraft("");
  };

  const usingByok = Boolean(key);

  return (
    <div className="border border-[var(--dc-line)] bg-[var(--dc-panel)] p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleClear}
            className={`flex items-center gap-1.5 border px-3 py-1 dc-mono text-[11px] uppercase tracking-[0.12em] transition-colors ${
              !usingByok
                ? "border-[var(--dc-cyan)]/40 bg-[var(--dc-cyan-soft)] text-[var(--dc-cyan)]"
                : "border-[var(--dc-line)] text-[var(--dc-dim)] hover:text-[var(--dc-mute)]"
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${!usingByok ? "bg-[var(--dc-cyan)]" : "bg-[var(--dc-dim)]"}`}
            />
            {isLive ? "Server key (live)" : "Server key (mock)"}
          </button>

          <button
            type="button"
            onClick={() => inputRef.current?.focus()}
            className={`flex items-center gap-1.5 border px-3 py-1 dc-mono text-[11px] uppercase tracking-[0.12em] transition-colors ${
              usingByok
                ? "border-[var(--dc-signal)]/40 bg-[var(--dc-signal-soft)] text-[var(--dc-signal)]"
                : "border-[var(--dc-line)] text-[var(--dc-dim)] hover:text-[var(--dc-mute)]"
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${usingByok ? "bg-[var(--dc-signal)]" : "bg-[var(--dc-dim)]"}`}
            />
            Your key
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="self-start dc-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dc-dim)] hover:text-[var(--dc-mute)] sm:self-auto"
        >
          Close
        </button>
      </div>

      <p className="mb-3 dc-mono text-[11px] leading-relaxed text-[var(--dc-mute)]">
        {usingByok
          ? `Using your key ···${key.slice(-6)} — charges go to your Runway account. No budget limit.`
          : isLive
            ? "Shared server key — ~20 calls / thread. Add your key for unlimited."
            : "No Runway key — MOCK mode with placeholder media."}
      </p>

      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && draft.trim() && handleSave()}
          placeholder="key_xxxxxxxxxxxxxxxx"
          className="min-w-0 flex-1 border border-[var(--dc-line)] bg-black/50 px-3 py-2 dc-mono text-xs text-[var(--dc-paper)] placeholder:text-[var(--dc-dim)] focus:border-[var(--dc-cyan)]/50 focus:outline-none"
          autoComplete="off"
          spellCheck={false}
        />
        {draft.trim() && (
          <button
            type="button"
            onClick={handleSave}
            className="border border-transparent bg-[var(--dc-signal)] px-4 py-2 dc-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dc-ink)] hover:bg-[var(--dc-paper)]"
          >
            {saved ? "Saved" : "Use"}
          </button>
        )}
        {usingByok && (
          <button
            type="button"
            onClick={handleClear}
            className="border border-[var(--dc-line)] px-3 py-2 dc-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dc-mute)] hover:text-[var(--dc-paper)]"
          >
            Remove
          </button>
        )}
      </div>

      <p className="mt-2 dc-mono text-[10px] text-[var(--dc-dim)]">
        Key from{" "}
        <a
          href="https://dev.runwayml.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--dc-mute)] underline hover:text-[var(--dc-paper)]"
        >
          dev.runwayml.com
        </a>
        {" · "}browser only
      </p>
    </div>
  );
}
