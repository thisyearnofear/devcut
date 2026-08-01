"use client";

import { useState } from "react";
import type { StoryboardState } from "@/lib/storyboard/types";
import {
  buildProvenanceVault,
  verifyManifestIntegrity,
} from "@/lib/provenance-vault";

interface ProvenanceVaultPanelProps {
  state: Pick<
    StoryboardState,
    | "storyboard"
    | "shots"
    | "final_video_url"
    | "durable_url"
    | "manifest_uri"
    | "job_manifest_uri"
    | "final_sha256"
    | "canonical_hash"
    | "agent_loop"
  >;
}

/**
 * B2 / Genblaze provenance surface — durable final, manifests, per-shot assets,
 * Monday test copy, and a one-click integrity check.
 */
export function ProvenanceVaultPanel({ state }: ProvenanceVaultPanelProps) {
  const vault = buildProvenanceVault(state as StoryboardState);
  const [verify, setVerify] = useState<{ ok: boolean; detail: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  }

  async function onVerify() {
    const url = vault.jobManifestUri || vault.clipManifestUri;
    if (!url) return;
    setBusy(true);
    const result = await verifyManifestIntegrity({
      manifestUrl: url,
      expectedSha256: vault.finalSha256 || vault.canonicalHash,
    });
    setVerify(result);
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--dc-cyan,#2de2c5)]">
          Provenance vault · Backblaze B2
        </p>
        <p className="text-sm font-medium text-white/90">{vault.title}</p>
        <p className="text-xs leading-5 text-white/50">
          Durable objects + Genblaze manifests. Open Monday — URLs do not expire
          with a provider CDN.
        </p>
      </div>

      {vault.finalUrl && (
        <video
          key={vault.finalUrl}
          src={vault.finalUrl}
          controls
          playsInline
          className="w-full rounded-lg bg-black"
          style={{ maxHeight: "36vh" }}
        />
      )}

      <div className="space-y-2">
        {vault.durableUrl && (
          <VaultRow
            label="Durable MP4"
            url={vault.durableUrl}
            onCopy={() => copy(vault.durableUrl!, "d")}
            copied={copied === "d"}
          />
        )}
        {vault.jobManifestUri && (
          <VaultRow
            label="Job manifest"
            url={vault.jobManifestUri}
            onCopy={() => copy(vault.jobManifestUri!, "j")}
            copied={copied === "j"}
          />
        )}
        {vault.clipManifestUri && (
          <VaultRow
            label="Clip manifest"
            url={vault.clipManifestUri}
            onCopy={() => copy(vault.clipManifestUri!, "c")}
            copied={copied === "c"}
          />
        )}
      </div>

      <div className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-2">
        <Meta
          label="Final SHA-256"
          value={vault.finalSha256 ? `${vault.finalSha256.slice(0, 24)}…` : "—"}
        />
        <Meta
          label="Canonical hash"
          value={
            vault.canonicalHash ? `${vault.canonicalHash.slice(0, 24)}…` : "—"
          }
        />
        <Meta label="Monday test" value={vault.mondayExpires} />
        <Meta
          label="AgentLoop"
          value={
            vault.agentLoop
              ? `${vault.agentLoop.passed ? "passed" : "stopped"} · ${vault.agentLoop.iterations} take(s)`
              : "—"
          }
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !(vault.jobManifestUri || vault.clipManifestUri)}
          onClick={onVerify}
          className="rounded-full bg-[var(--dc-signal,#ff9f1c)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--dc-ink,#050607)] hover:bg-white disabled:opacity-40"
        >
          {busy ? "Verifying…" : "Verify manifest"}
        </button>
        <button
          type="button"
          onClick={() => copy(vault.verifyHint, "v")}
          className="rounded-full border border-white/15 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-white/65 hover:border-white/30"
        >
          {copied === "v" ? "Copied curl" : "Copy verify curl"}
        </button>
      </div>
      {verify && (
        <p
          className={`text-xs ${verify.ok ? "text-emerald-300/90" : "text-rose-300/90"}`}
        >
          {verify.detail}
        </p>
      )}

      {vault.shots.length > 0 && (
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">
            Per-shot assets
          </p>
          <ul className="max-h-48 space-y-1.5 overflow-y-auto">
            {vault.shots.map((s) => (
              <li
                key={`${s.index}-${s.beat}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-white/8 bg-black/25 px-2.5 py-1.5 text-[11px]"
              >
                <span className="font-mono text-white/40">
                  {String(s.index + 1).padStart(2, "0")}
                </span>
                <span className="text-white/80">{s.beat}</span>
                {s.stillUrl && (
                  <a
                    href={s.stillUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--dc-cyan,#2de2c5)] hover:underline"
                  >
                    still
                  </a>
                )}
                {s.clipUrl && (
                  <a
                    href={s.clipUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-300/90 hover:underline"
                  >
                    clip
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function VaultRow({
  label,
  url,
  onCopy,
  copied,
}: {
  label: string;
  url: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 flex-1 truncate font-mono text-[11px] text-amber-300/90 hover:underline"
      >
        {url}
      </a>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-white/45 hover:text-white/80"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/35">
        {label}
      </p>
      <p className="mt-0.5 break-all font-mono text-[11px] text-white/70">{value}</p>
    </div>
  );
}
