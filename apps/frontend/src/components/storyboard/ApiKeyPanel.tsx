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
 * Inline key panel — dark cinema theme.
 * Shows clearly whether we're in LIVE (server key) or BYOK mode,
 * and makes it easy to switch between them.
 */
export function ApiKeyPanel({ onClose, isLive }: ApiKeyPanelProps) {
  const { key, setKey } = useRunwayApiKey();
  const [draft, setDraft] = useState(key);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(key); }, [key]);
  useEffect(() => { if (!key) inputRef.current?.focus(); }, [key]);

  const handleSave = () => {
    setKey(draft);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 1200);
  };

  const handleClear = () => {
    setKey("");
    setDraft("");
  };

  const usingByok = Boolean(key);

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      {/* Mode status */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Server key mode */}
          <button
            type="button"
            onClick={handleClear}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.15em] transition-all ${
              !usingByok
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-white/10 text-white/30 hover:border-white/20 hover:text-white/50"
            }`}
          >
            <span className={`size-1.5 rounded-full ${!usingByok ? "bg-emerald-500" : "bg-white/20"}`} />
            {isLive ? "Server key (live)" : "Server key (mock)"}
          </button>

          {/* BYOK mode */}
          <button
            type="button"
            onClick={() => inputRef.current?.focus()}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.15em] transition-all ${
              usingByok
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-white/10 text-white/30 hover:border-white/20 hover:text-white/50"
            }`}
          >
            <span className={`size-1.5 rounded-full ${usingByok ? "bg-emerald-500" : "bg-white/20"}`} />
            Your key
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[10px] uppercase tracking-[0.15em] text-white/25 hover:text-white/60"
        >
          ✕
        </button>
      </div>

      {/* Context */}
      <p className="mb-3 font-mono text-[10px] leading-relaxed text-white/30">
        {usingByok
          ? `Using your key ···${key.slice(-6)} — charges go to your Runway account. No budget limit.`
          : isLive
          ? "Using the shared server key — limited to 20 calls per conversation. Add your own key for unlimited use."
          : "No Runway key configured — running in MOCK mode with placeholder media."}
      </p>

      {/* Input */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && draft.trim() && handleSave()}
          placeholder="key_xxxxxxxxxxxxxxxx"
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-[11px] text-white/70 placeholder:text-white/20 focus:border-white/25 focus:outline-none"
          autoComplete="off"
          spellCheck={false}
        />
        {draft.trim() && (
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-white/60 hover:bg-white/20 hover:text-white"
          >
            {saved ? "Saved ✓" : "Use"}
          </button>
        )}
        {usingByok && (
          <button
            type="button"
            onClick={handleClear}
            className="rounded-lg border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-white/30 hover:text-white/60"
          >
            Remove
          </button>
        )}
      </div>

      <p className="mt-2 font-mono text-[9px] text-white/20">
        Get a key at{" "}
        <a href="https://dev.runwayml.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-white/50">
          dev.runwayml.com
        </a>
        {" "}· Stored in your browser only
      </p>
    </div>
  );
}
