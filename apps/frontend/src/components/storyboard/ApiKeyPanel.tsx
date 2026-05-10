"use client";

import { useEffect, useState } from "react";

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
}

/**
 * Slide-in panel for entering a personal Runway API key.
 * The key is stored in localStorage and sent as X-Runway-Api-Key on
 * every BFF request — it overrides the server's shared key so the user
 * pays from their own Runway account.
 */
export function ApiKeyPanel({ onClose }: ApiKeyPanelProps) {
  const { key, setKey } = useRunwayApiKey();
  const [draft, setDraft] = useState(key);
  const [saved, setSaved] = useState(false);

  // Sync draft when key loads from localStorage
  useEffect(() => {
    setDraft(key);
  }, [key]);

  const handleSave = () => {
    setKey(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    setKey("");
    setDraft("");
  };

  const isActive = Boolean(key);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card/80 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-foreground">
            Runway API Key
          </p>
          <p className="text-[10px] text-muted-foreground">
            Use your own key — charges go to your Runway account, not ours.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] uppercase text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>

      {isActive && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          <p className="text-[10px] text-emerald-700">
            Using your key ···{key.slice(-6)}
          </p>
          <button
            type="button"
            onClick={handleClear}
            className="ml-auto text-[10px] text-emerald-600 underline hover:text-emerald-800"
          >
            Remove
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          placeholder="key_xxxxxxxxxxxxxxxx"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!draft.trim()}
          className="rounded-lg border border-border bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          {saved ? "Saved ✓" : "Save"}
        </button>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Get a key at{" "}
        <a
          href="https://dev.runwayml.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          dev.runwayml.com
        </a>
        . Stored in your browser only — never sent to our servers in logs.
      </p>
    </div>
  );
}
