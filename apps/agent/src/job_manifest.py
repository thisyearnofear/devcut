"""Job-level provenance manifest for a Challenge Cut / Submit Ready run.

After stitch we write a JSON job record to B2 listing brief, shot assets,
final SHA-256, kit summary, and per-clip Genblaze manifest URIs. Judges can
open one URL and verify the whole desk run — not only the last shot.
"""

from __future__ import annotations

import json
import time
from typing import Any, Optional

from .media_storage import (
    DurableAsset,
    b2_enabled,
    persist_bytes,
    require_durable,
    sha256_file,
)


def build_job_manifest(
    *,
    thread_id: str,
    storyboard: dict[str, Any],
    shots: list[dict[str, Any]],
    final_video_url: Optional[str],
    durable_url: Optional[str],
    final_sha256: Optional[str],
    clip_manifest_uris: list[str],
    canonical_hashes: list[str],
    builder_kit: dict[str, Any] | None,
    agent_loop: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Pure builder — no I/O."""
    assets = []
    for s in shots:
        assets.append(
            {
                "index": s.get("index"),
                "beat": s.get("beat"),
                "prompt": s.get("prompt"),
                "still_url": s.get("ref_image_url"),
                "clip_url": s.get("video_url"),
                "duration": s.get("duration"),
            }
        )
    return {
        "product": "DevCut",
        "schema": "devcut.job_manifest.v1",
        "ts": time.time(),
        "thread_id": thread_id,
        "title": storyboard.get("title"),
        "logline": storyboard.get("logline"),
        "aspect_ratio": storyboard.get("aspect_ratio"),
        "mode_hint": (builder_kit or {}).get("mode"),
        "final": {
            "url": durable_url or final_video_url,
            "local_or_cdn_url": final_video_url,
            "durable_url": durable_url,
            "sha256": final_sha256,
        },
        "shots": assets,
        "genblaze": {
            "clip_manifest_uris": [u for u in clip_manifest_uris if u],
            "canonical_hashes": [h for h in canonical_hashes if h],
        },
        "hyperframes_kit": {
            "attached": bool(builder_kit),
            "workflow": (builder_kit or {}).get("workflow"),
            "summary": (builder_kit or {}).get("summary"),
            "asset_count": len((builder_kit or {}).get("assets") or []),
        },
        "agent_loop": agent_loop,
        "monday_test": {
            "expires": "never (Backblaze B2 durable object)",
            "open": durable_url or final_video_url,
        },
    }


def persist_job_manifest(
    manifest: dict[str, Any],
    *,
    tenant_id: str,
) -> Optional[DurableAsset]:
    """Upload job-manifest.json to B2. Soft-fails unless B2_REQUIRE_DURABLE."""
    if not b2_enabled():
        if require_durable():
            from .media_storage import DurableStorageError

            raise DurableStorageError("Cannot persist job manifest — B2 disabled")
        return None
    body = (json.dumps(manifest, indent=2) + "\n").encode("utf-8")
    return persist_bytes(
        body,
        content_type="application/json",
        suffix=".json",
        tenant_id=tenant_id,
        strategy="hierarchical",
    )


def final_sha_from_path(path: str) -> str:
    return sha256_file(path)
