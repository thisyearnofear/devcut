"""Genblaze Pipeline bridge for Runway image→video.

Keeps Genblaze types out of LangGraph tools. Returns a small result
dataclass that ``runway_client.generate_shot_video`` maps onto
``RunwayVideoResult``.

Auth: maps our existing ``RUNWAY_API_KEY`` / BYOK configurable key onto
``RunwayProvider(api_secret=...)`` (Genblaze's ``RUNWAYML_API_SECRET``).

Image→video: passes the reference still via ``external_inputs=[Asset(...)]``
so Genblaze routes to Runway's image_to_video endpoint (gen4.5 / gen4_turbo).
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from typing import Optional

from .media_storage import b2_enabled, new_sink


def _log(level: str, msg: str, **fields) -> None:
    record = {"ts": time.time(), "level": level, "logger": "genblaze_bridge", "msg": msg}
    record.update(fields)
    print(json.dumps(record), flush=True)


@dataclass
class BridgeVideoResult:
    """Genblaze video output — mapped to RunwayVideoResult by runway_client."""

    url: str
    prompt: str
    duration: int
    mode: str
    image_url: Optional[str] = None
    manifest_uri: Optional[str] = None
    sha256: Optional[str] = None
    canonical_hash: Optional[str] = None


def genblaze_video_enabled() -> bool:
    """True when Genblaze video orchestration should run.

    Requires GENBLAZE_ENABLED + a live Runway key. B2 sink is preferred
    but not mandatory — Pipeline still produces a verified manifest
    without storage (assets stay on provider CDN until persisted).
    """
    if os.getenv("GENBLAZE_ENABLED", "").strip().lower() not in ("1", "true", "yes"):
        return False
    # Lazy import to avoid circular dependency with runway_client.
    from .runway_client import _effective_api_key

    key = _effective_api_key()
    return bool(key) and not key.startswith("stub")


def _video_model() -> str:
    # Prefer gen4.5 (supports i2v + flexible duration) — matches runway_client default.
    return os.getenv("RUNWAY_VIDEO_MODEL", "gen4.5")


def _cap_duration(duration: int, model: str) -> int:
    """Clamp duration to Genblaze/Runway family rules.

    gen4_turbo / gen3a_turbo require 5 or 10; gen4.5 accepts 2–10.
    """
    d = max(1, int(duration))
    if model in ("gen4_turbo", "gen3a_turbo"):
        return 10 if d > 5 else 5
    return min(d, 10)


def _reference_asset(image_url: str) -> "Asset":
    """Build an Asset for the reference still, hashing bytes when fetchable.

    Genblaze warns that external_inputs without sha256 make cache keys /
    manifests unstable when CDN URLs rotate — so we fetch + hash when we can.
    """
    import hashlib
    import tempfile
    import urllib.request
    from pathlib import Path

    from genblaze_core import Asset

    try:
        req = urllib.request.Request(
            image_url, headers={"User-Agent": "directors-canvas/1.0"}
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
            content_type = resp.headers.get_content_type() or "image/jpeg"
        digest = hashlib.sha256(data).hexdigest()
        suffix = ".jpg" if "jpeg" in content_type or "jpg" in content_type else ".png"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(data)
            path = Path(tmp.name)
        # Keep the temp file for the duration of the pipeline transfer;
        # OS will clean /tmp eventually. Prefer file:// so sink/provider
        # read stable local bytes rather than a possibly-expiring CDN URL.
        return Asset(
            url=path.as_uri(),
            media_type=content_type if content_type.startswith("image/") else "image/jpeg",
            sha256=digest,
            size_bytes=len(data),
        )
    except Exception as exc:  # noqa: BLE001 — fall back to URL-only Asset
        _log("WARN", "reference_hash_failed", err=str(exc), url=image_url[:120])
        return Asset(url=image_url, media_type="image/jpeg")


def run_shot_video(
    image_url: str,
    prompt: str,
    duration: int = 5,
    ratio: str = "1280:720",
    *,
    shot_id: Optional[str] = None,
) -> BridgeVideoResult:
    """Generate a shot clip via Genblaze Pipeline + RunwayProvider.

    When B2 is configured, ``sink=new_sink()`` uploads the asset + manifest
    and rewrites the asset URL to a durable B2 URL.
    """
    from genblaze_core import Modality, Pipeline
    from genblaze_core.providers import RetryPolicy
    from genblaze_runway import RunwayProvider

    from .runway_client import _current_thread_id, _effective_api_key

    api_secret = _effective_api_key()
    model = _video_model()
    capped = _cap_duration(duration, model)
    thread_id = _current_thread_id() or "director"
    name = f"shot-video-{shot_id or 'anon'}"

    reference = _reference_asset(image_url)
    # Conservative retries for expensive video (Genblaze production checklist).
    provider = RunwayProvider(
        api_secret=api_secret,
        retry_policy=RetryPolicy.conservative(),
    )

    pipeline = (
        Pipeline(name, tenant_id=thread_id)
        .step(
            provider,
            model=model,
            prompt=prompt,
            modality=Modality.VIDEO,
            duration=capped,
            ratio=ratio,
            external_inputs=[reference],
        )
    )

    # Hierarchical keys for browseable runs/{tenant}/… in the Vault UI.
    sink = new_sink(strategy="hierarchical") if b2_enabled() else None
    result = pipeline.run(sink=sink, timeout=600)

    run, manifest = result.run, result.manifest
    if not run.steps or not run.steps[0].assets:
        raise RuntimeError(
            f"Genblaze Runway step produced no assets: {result.error_summary()}"
        )

    asset = run.steps[0].assets[0]
    verified = False
    try:
        verified = bool(asset.sha256) and bool(manifest.verify())
    except Exception:  # noqa: BLE001
        verified = False

    _log(
        "INFO",
        "shot_video_ok",
        model=model,
        url=(asset.url or "")[:120],
        sha256=(asset.sha256 or "")[:16],
        manifest_uri=manifest.manifest_uri or "",
        verified=verified,
    )

    return BridgeVideoResult(
        url=asset.url,
        prompt=prompt,
        duration=capped,
        mode="LIVE",
        image_url=image_url,
        manifest_uri=manifest.manifest_uri,
        sha256=asset.sha256,
        canonical_hash=manifest.canonical_hash,
    )


def boot_status() -> str:
    if genblaze_video_enabled():
        sink = "B2" if b2_enabled() else "no-sink"
        return f"genblaze: video/{_video_model()} ({sink})"
    return "genblaze: off"
