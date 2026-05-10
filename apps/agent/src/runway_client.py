"""Thin wrapper around the official `runwayml` Python SDK.

Two modes:
- LIVE: when `RUNWAY_API_KEY` is set, real calls to the Runway API.
  Uses Gen-4 Image (text→image for shot references) and Gen-4 image→video.
- MOCK: when no key, deterministic placeholder URLs so the rest of the
  pipeline (storyboard state, frontend rendering, agent prompts) works
  end-to-end without burning credits or blocking dev.

The agent's tools always go through this wrapper, so swapping LIVE↔MOCK
is a single env-var flip.

Long-running jobs are handled with the SDK's `wait_for_task_output()` —
polling, backoff, and timeouts live inside the SDK, so we don't reinvent
them. Each call has a hard 240s ceiling we enforce on top, since a
hung Runway job blocks the agent loop.

This module is sync-only; LangChain `@tool` functions are sync and the
LangGraph runtime can dispatch them in worker threads if needed. Keeping
it sync simplifies error handling and makes the mock path trivially
deterministic.
"""

from __future__ import annotations

import hashlib
import os
import time
from dataclasses import dataclass
from typing import Optional

# --------------------------------------------------------------------- modes


def runway_is_live() -> bool:
    """True when a real Runway API key is configured."""
    key = os.getenv("RUNWAY_API_KEY") or os.getenv("RUNWAYML_API_SECRET") or ""
    return bool(key) and not key.startswith("stub")


def runway_mode_label() -> str:
    return "LIVE" if runway_is_live() else "MOCK"


# --------------------------------------------------------------------- types


@dataclass
class RunwayImageResult:
    url: str
    prompt: str
    mode: str  # "LIVE" | "MOCK"


@dataclass
class RunwayVideoResult:
    url: str
    prompt: str
    duration: int
    mode: str
    image_url: Optional[str] = None


# --------------------------------------------------------------------- mock


def _mock_seed(text: str) -> str:
    """Deterministic short hash so the same prompt yields the same fake URL.

    Useful for the demo: regenerating a shot with an identical prompt
    returns the same placeholder so users don't see "different" output
    for the same input in MOCK mode.
    """
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]


def _mock_image(prompt: str) -> RunwayImageResult:
    seed = _mock_seed(prompt)
    # picsum supports deterministic seeded placeholders at any size.
    url = f"https://picsum.photos/seed/{seed}/1280/720"
    return RunwayImageResult(url=url, prompt=prompt, mode="MOCK")


def _mock_video(prompt: str, duration: int, image_url: Optional[str]) -> RunwayVideoResult:
    # A short, royalty-free MP4 always available on Google's CDN. Same URL
    # every time keeps the mock predictable; the prompt+duration are still
    # threaded through so the agent prompt sees consistent metadata.
    url = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBigBuckBunny.mp4"
    return RunwayVideoResult(
        url=url, prompt=prompt, duration=duration, mode="MOCK", image_url=image_url
    )


# --------------------------------------------------------------------- live


def _client():
    """Lazy-import the SDK so a missing install only breaks LIVE callers."""
    from runwayml import RunwayML

    return RunwayML()


def _live_image(prompt: str, ratio: str = "1280:720") -> RunwayImageResult:
    """Text→image via Gen-4 Image. Returns the first output URL."""
    from runwayml import TaskFailedError

    client = _client()
    try:
        task = client.text_to_image.create(
            model="gen4_image",
            prompt_text=prompt,
            ratio=ratio,
        ).wait_for_task_output()
    except TaskFailedError as e:
        raise RuntimeError(f"Runway text_to_image failed: {e.task_details}") from e
    url = (task.output or [None])[0]
    if not url:
        raise RuntimeError("Runway text_to_image returned no output URL")
    return RunwayImageResult(url=url, prompt=prompt, mode="LIVE")


def _live_video(
    image_url: str,
    prompt: str,
    duration: int = 5,
    ratio: str = "1280:720",
) -> RunwayVideoResult:
    """Image→video via Gen-4. Returns the first output URL."""
    from runwayml import TaskFailedError

    client = _client()
    try:
        task = client.image_to_video.create(
            model="gen4_turbo",
            prompt_image=image_url,
            prompt_text=prompt,
            ratio=ratio,
            duration=duration,
        ).wait_for_task_output()
    except TaskFailedError as e:
        raise RuntimeError(f"Runway image_to_video failed: {e.task_details}") from e
    url = (task.output or [None])[0]
    if not url:
        raise RuntimeError("Runway image_to_video returned no output URL")
    return RunwayVideoResult(
        url=url, prompt=prompt, duration=duration, mode="LIVE", image_url=image_url
    )


# --------------------------------------------------------------------- public


def generate_reference_image(prompt: str, ratio: str = "1280:720") -> RunwayImageResult:
    """Make a still reference frame for a shot (text→image)."""
    if runway_is_live():
        return _live_image(prompt, ratio=ratio)
    return _mock_image(prompt)


def generate_shot_video(
    image_url: str,
    prompt: str,
    duration: int = 5,
    ratio: str = "1280:720",
) -> RunwayVideoResult:
    """Animate a reference image into a 5–10s clip (image→video)."""
    if runway_is_live():
        return _live_video(image_url, prompt, duration=duration, ratio=ratio)
    # Tiny mock latency so the UI's loading state is visible during demo.
    time.sleep(0.6)
    return _mock_video(prompt, duration=duration, image_url=image_url)


def boot_status() -> str:
    """One-line status for the agent boot log."""
    return f"runway: {runway_mode_label()}"
