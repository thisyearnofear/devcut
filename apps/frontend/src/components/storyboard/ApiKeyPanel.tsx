"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "director_runway_api_key";
const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === "1";

/**
 * Runway API key hook.
 *
 * When auth is enabled and the user is signed in, the key lives in the
 * server-side encrypted vault (POST /api/credentials/runway). When auth
 * is disabled or the user is anonymous, it falls back to localStorage
 * (legacy browser-only path).
 */
export function useRunwayApiKey() {
  const [key, setKeyState] = useState<string>("");
  const [masked, setMasked] = useState<string | null>(null);
  const [vaulted, setVaulted] = useState(false);

  const refresh = useCallback(async () => {
    if (AUTH_ENABLED) {
      try {
        const r = await fetch("/api/credentials/runway");
        if (r.ok) {
          const d = await r.json();
          setMasked(d.masked);
          setVaulted(Boolean(d.set));
          // The actual key is never sent to the client — the BFF injects it
          // from the vault at run time. We only track whether one is set.
          setKeyState(d.set ? "__vaulted__" : "");
          return;
        }
      } catch { /* fall through to localStorage */ }
    }
    // Legacy / anonymous: localStorage
    setKeyState(localStorage.getItem(STORAGE_KEY) ?? "");
    setVaulted(false);
    setMasked(null);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const setKey = useCallback(async (k: string) => {
    const trimmed = k.trim();
    if (AUTH_ENABLED) {
      if (trimmed) {
        const r = await fetch("/api/credentials/runway", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: trimmed }),
        });
        if (r.ok) {
          const d = await r.json();
          setMasked(d.masked);
          setVaulted(true);
          setKeyState("__vaulted__");
        }
      } else {
        await fetch("/api/credentials/runway", { method: "DELETE" });
        setMasked(null);
        setVaulted(false);
        setKeyState("");
      }
    } else {
      if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
      else localStorage.removeItem(STORAGE_KEY);
      setKeyState(trimmed);
    }
  }, []);

  return { key, setKey, masked, vaulted, refresh };
}

interface ApiKeyPanelProps {
  onClose: () => void;
  isLive: boolean;
}

/**
 * Inline key panel — edit-bay chrome.
 */
export function ApiKeyPanel({ onClose, isLive }: ApiKeyPanelProps) {
  const { key, setKey, masked, vaulted } = useRunwayApiKey();
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(""); }, []);
  useEffect(() => { if (!key) inputRef.current?.focus(); }, [key]);

  const handleSave = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    await setKey(draft);
    setBusy(false);
    setDraft("");
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 1200);
  };

  const handleClear = async () => {
    setBusy(true);
    await setKey("");
    setBusy(false);
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
            disabled={busy}
            className={`flex items-center gap-1.5 border px-3 py-1 dc-mono text-[11px] uppercase tracking-[0.12em] transition-colors disabled:opacity-50 ${
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
            Your key{vaulted && masked ? ` · ${masked}` : ""}
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
          ? vaulted
            ? `Using your vaulted key (${masked}) — charges go to your Runway account. No budget limit. Stored encrypted server-side.`
            : `Using your key ···${key.slice(-6)} — charges go to your Runway account. No budget limit.`
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
          placeholder={vaulted ? "Enter a new key to replace" : "key_xxxxxxxxxxxxxxxx"}
          className="min-w-0 flex-1 border border-[var(--dc-line)] bg-black/50 px-3 py-2 dc-mono text-xs text-[var(--dc-paper)] placeholder:text-[var(--dc-dim)] focus:border-[var(--dc-cyan)]/50 focus:outline-none"
          autoComplete="off"
          spellCheck={false}
        />
        {draft.trim() && (
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="border border-transparent bg-[var(--dc-signal)] px-4 py-2 dc-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dc-ink)] hover:bg-[var(--dc-paper)] disabled:opacity-50"
          >
            {saved ? "Saved" : busy ? "…" : "Use"}
          </button>
        )}
        {usingByok && (
          <button
            type="button"
            onClick={handleClear}
            disabled={busy}
            className="border border-[var(--dc-line)] px-3 py-2 dc-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dc-mute)] hover:text-[var(--dc-paper)] disabled:opacity-50"
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
        {vaulted ? " · encrypted server-side" : " · browser only"}
      </p>
    </div>
  );
}
