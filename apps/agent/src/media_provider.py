"""Media provider router — Runway primary, fal.ai fallback.

DevCut keeps the "one generation backend at a time" contract (the thesis
explicitly refuses a user-facing model marketplace), but hackathon demos
badly need a resilience valve: if Runway is down or rate-limited mid-job,
a paid x402 job should retry on fal instead of dying. Selection is
server-side only — the UI just sees LIVE/MOCK.

Provider resolution:
- `DEVCUT_MEDIA_PROVIDER` — `auto` (default) | `runway` | `fal`.
    * `auto`: prefer Runway when its key is live, else fal when its key is
      live, else MOCK.
    * `runway` / `fal`: use exactly that provider (MOCK when its key is
      missing).
- `DEVCUT_MEDIA_FALLBACK` — `1` (default) | `0`. When the selected
  provider raises on a call and the other provider is live, retry the call
  once against it. Best-effort resilience, never an on-by-default UI knob.

Both providers share the same per-thread budget ledger (BFF injects
`runway_calls_remaining` / `runway_budget`), so spend is bounded no matter
which backend ultimately renders each asset.
"""

from __future__ import annotations

import os
from typing import Optional

from . import fal_client
from .runway_client import (
    RunwayImageResult,
    RunwayVideoResult,
    generate_reference_image as _runway_image,
    generate_shot_video as _runway_video,
    runway_mode_label as _runway_label,
)


def _pref() -> str:
    return (os.getenv("DEVCUT_MEDIA_PROVIDER", "auto") or "auto").lower().strip()


def _fallback_enabled() -> bool:
    return os.getenv("DEVCUT_MEDIA_FALLBACK", "1") != "0"


def active_media_provider() -> str:
    """Which backend is actually in use: 'runway' | 'fal' | 'mock'."""
    pref = _pref()
    runway_live = _runway_label() == "LIVE"
    fal_live = fal_client.fal_mode_label() == "LIVE"

    if pref == "runway":
        return "runway" if runway_live else ("fal" if fal_live and _fallback_enabled() else "mock")
    if pref == "fal":
        return "fal" if fal_live else ("runway" if runway_live and _fallback_enabled() else "mock")
    # auto — prefer runway, else fal, else mock
    if runway_live:
        return "runway"
    if fal_live:
        return "fal"
    return "mock"


def media_is_live() -> bool:
    return active_media_provider() != "mock"


def media_mode_label() -> str:
    return "LIVE" if media_is_live() else "MOCK"


def _run_by_provider(provider: str) -> Optional[str]:
    """Runway and fal use different per-provider functions; map to a token."""
    return provider


def generate_reference_image(
    prompt: str,
    ratio: str = "1280:720",
    prior_ref_urls: Optional[list[str]] = None,
) -> RunwayImageResult:
    """Route a text→image still. Fallback retries with the other provider."""
    provider = active_media_provider()
    try:
        if provider == "fal":
            return fal_client.generate_reference_image(prompt, ratio, prior_ref_urls=prior_ref_urls)
        result = _runway_image(prompt, ratio=ratio, prior_ref_urls=prior_ref_urls)
        result.provider = "runway"
        return result
    except Exception as exc:  # noqa: BLE001 - fallback resilience valve
        if not _fallback_enabled():
            raise
        other = "fal" if provider == "runway" else "runway"
        if other == "fal" and fal_client.fal_mode_label() == "LIVE":
            return fal_client.generate_reference_image(prompt, ratio, prior_ref_urls=prior_ref_urls)
        if other == "runway" and _runway_label() == "LIVE":
            result = _runway_image(prompt, ratio=ratio, prior_ref_urls=prior_ref_urls)
            result.provider = "runway"
            return result
        raise  # no other live provider — surface the original error


def generate_shot_video(
    image_url: str,
    prompt: str,
    duration: int = 5,
    ratio: str = "1280:720",
    beat: Optional[str] = None,
    shot_id: Optional[str] = None,
) -> RunwayVideoResult:
    """Route an image→video clip. Fallback retries with the other provider."""
    provider = active_media_provider()
    try:
        if provider == "fal":
            return fal_client.generate_shot_video(
                image_url, prompt, duration=duration, ratio=ratio, beat=beat, shot_id=shot_id
            )
        result = _runway_video(image_url, prompt, duration=duration, ratio=ratio, beat=beat, shot_id=shot_id)
        result.provider = "runway"
        return result
    except Exception as exc:  # noqa: BLE001 - fallback resilience valve
        if not _fallback_enabled():
            raise
        other = "fal" if provider == "runway" else "runway"
        if other == "fal" and fal_client.fal_mode_label() == "LIVE":
            return fal_client.generate_shot_video(
                image_url, prompt, duration=duration, ratio=ratio, beat=beat, shot_id=shot_id
            )
        if other == "runway" and _runway_label() == "LIVE":
            result = _runway_video(image_url, prompt, duration=duration, ratio=ratio, beat=beat, shot_id=shot_id)
            result.provider = "runway"
            return result
        raise  # no other live provider — surface the original error


def boot_status() -> str:
    return (
        f"media: {active_media_provider()} (pref={_pref()}, fallback="
        f"{'on' if _fallback_enabled() else 'off'}) "
        f"| {_runway_label() if _runway_label() == 'LIVE' else 'runway: MOCK'} "
        f"| {fal_client.boot_status()}"
    )
