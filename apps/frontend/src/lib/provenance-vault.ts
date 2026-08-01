/** Build a provenance vault view-model from storyboard agent state. */

import type { StoryboardState } from "@/lib/storyboard/types";

export interface VaultShotAsset {
  index: number;
  beat: string;
  stillUrl: string | null;
  clipUrl: string | null;
  duration: number;
}

export interface ProvenanceVault {
  title: string;
  finalUrl: string | null;
  durableUrl: string | null;
  clipManifestUri: string | null;
  jobManifestUri: string | null;
  finalSha256: string | null;
  canonicalHash: string | null;
  mondayExpires: string;
  agentLoop: {
    passed: boolean;
    iterations: number;
    feedback: string | null;
  } | null;
  shots: VaultShotAsset[];
  verifyHint: string;
}

export function buildProvenanceVault(state: StoryboardState): ProvenanceVault {
  const finalUrl = state.durable_url || state.final_video_url;
  const jobUri = state.job_manifest_uri;
  const clipUri = state.manifest_uri;
  const hash = state.final_sha256 || state.canonical_hash;
  const verifyHint = jobUri
    ? `curl -sL "${jobUri}" | python3 -m json.tool`
    : clipUri
      ? `curl -sL "${clipUri}" | python3 -m json.tool`
      : "Run with GENBLAZE_ENABLED=1 + B2_* to attach manifests.";

  return {
    title: state.storyboard?.title || "DevCut run",
    finalUrl,
    durableUrl: state.durable_url,
    clipManifestUri: clipUri,
    jobManifestUri: jobUri,
    finalSha256: state.final_sha256,
    canonicalHash: state.canonical_hash,
    mondayExpires: "never (Backblaze B2 durable object)",
    agentLoop: state.agent_loop
      ? {
          passed: Boolean(state.agent_loop.passed),
          iterations: Number(state.agent_loop.iterations || 0),
          feedback: state.agent_loop.feedback ?? null,
        }
      : null,
    shots: (state.shots || []).map((s) => ({
      index: s.index,
      beat: s.beat,
      stillUrl: s.ref_image_url,
      clipUrl: s.video_url,
      duration: s.duration,
    })),
    verifyHint,
  };
}

/** Client-side integrity check: fetch job/clip manifest JSON and compare hashes if present. */
export async function verifyManifestIntegrity(opts: {
  manifestUrl: string;
  expectedSha256?: string | null;
}): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(opts.manifestUrl, { mode: "cors" });
    if (!res.ok) {
      return { ok: false, detail: `HTTP ${res.status} fetching manifest` };
    }
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, detail: "Manifest is not JSON" };
    }
    const obj = parsed as Record<string, unknown>;
    const final = (obj.final as Record<string, unknown> | undefined) || undefined;
    const sha =
      (final?.sha256 as string | undefined) ||
      (obj.canonical_hash as string | undefined) ||
      (obj.sha256 as string | undefined);
    if (opts.expectedSha256 && sha && opts.expectedSha256 !== sha) {
      return {
        ok: false,
        detail: `SHA mismatch: expected ${opts.expectedSha256.slice(0, 12)}… got ${String(sha).slice(0, 12)}…`,
      };
    }
    if (opts.expectedSha256 && !sha) {
      return {
        ok: true,
        detail: `Manifest fetched (${text.length} bytes). Embedded sha256 not found; canvas hash ${opts.expectedSha256.slice(0, 12)}…`,
      };
    }
    return {
      ok: true,
      detail: sha
        ? `Manifest OK · sha256 ${String(sha).slice(0, 16)}…`
        : `Manifest OK (${text.length} bytes)`,
    };
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : "verify failed (CORS?)",
    };
  }
}
