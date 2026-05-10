"""Thin wrapper around the official `runwayml` Python SDK.

Two modes:
- LIVE: when `RUNWAY_API_KEY` is set, real calls to the Runway API.
  Uses Gen-4 Image Turbo (text→image for shot references) and Gen-4.5
  (image→video). Both models accept reference images for cross-shot
  visual consistency — characters and style anchors are threaded through
  every call so shot 4's astronaut looks like shot 1's astronaut.
- MOCK: when no key, deterministic placeholder URLs so the rest of the
  pipeline (storyboard state, frontend rendering, agent prompts) works
  end-to-end without burning credits or blocking dev.

Model choices vs. the original:
- gen4_image → gen4_image_turbo  : 2-4x cheaper, <10s, 93% quality parity.
  Accepts up to 3 reference images with optional tags for prompt-addressable
  character/style anchoring.
- gen4_turbo → gen4.5            : newer model, better quality + control,
  same pricing tier, 2-10s flexible duration, text-to-video also supported.

The agent's tools always go through this wrapper, so swapping LIVE↔MOCK
is a single env-var flip.

Long-running jobs are handled with the SDK's `wait_for_task_output()` —
polling, backoff, and timeouts live inside the SDK, so we don't reinvent
them.

This module is sync-only; LangChain `@tool` functions are sync and the
LangGraph runtime can dispatch them in worker threads if needed. Keeping
it sync simplifies error handling and makes the mock path trivially
deterministic.
"""

from __future__ import annotations

import hashlib
import os
import time
from dataclasses import dataclass, field
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
    """Deterministic short hash so the same prompt yields the same fake URL."""
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]


def _mock_image(prompt: str) -> RunwayImageResult:
    seed = _mock_seed(prompt)
    url = f"https://picsum.photos/seed/{seed}/1280/720"
    return RunwayImageResult(url=url, prompt=prompt, mode="MOCK")


def _mock_video(prompt: str, duration: int, image_url: Optional[str]) -> RunwayVideoResult:
    url = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBigBuckBunny.mp4"
    return RunwayVideoResult(
        url=url, prompt=prompt, duration=duration, mode="MOCK", image_url=image_url
    )


# --------------------------------------------------------------------- live


def _client():
    """Lazy-import the SDK so a missing install only breaks LIVE callers."""
    from runwayml import RunwayML
    return RunwayML()


def _build_ref_images(
    prior_ref_urls: list[str],
    max_refs: int = 3,
) -> list[dict]:
    """Build the referenceImages array for gen4_image_turbo.

    Takes up to `max_refs` prior shot reference URLs and tags them so the
    model can be addressed in the prompt (e.g. "@character1 stands on Mars").
    The first URL gets tag "character1", subsequent ones "style1", "style2".
    """
    tags = ["character1", "style1", "style2"]
    refs = []
    for i, url in enumerate(prior_ref_urls[:max_refs]):
        entry: dict = {"uri": url}
        if i < len(tags):
            entry["tag"] = tags[i]
        refs.append(entry)
    return refs


def _live_image(
    prompt: str,
    ratio: str = "1280:720",
    prior_ref_urls: Optional[list[str]] = None,
) -> RunwayImageResult:
    """Text→image via Gen-4 Image Turbo.

    When `prior_ref_urls` are supplied (URLs of reference stills from
    earlier shots), they are passed as referenceImages so the model
    maintains visual consistency across the storyboard.
    """
    from runwayml import TaskFailedError

    client = _client()
    kwargs: dict = {
        "model": "gen4_image_turbo",
        "prompt_text": prompt,
        "ratio": ratio,
    }

    refs = _build_ref_images(prior_ref_urls or [])
    if refs:
        kwargs["reference_images"] = refs

    try:
        task = client.text_to_image.create(**kwargs).wait_for_task_output()
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
    """Image→video via Gen-4.5.

    Gen-4.5 is the current best model: better quality and control than
    gen4_turbo, same pricing, 2-10s flexible duration. The shot's own
    reference image is passed as the first frame, which already encodes
    the visual style established by generate_reference_image.
    """
    from runwayml import TaskFailedError

    client = _client()
    try:
        task = client.image_to_video.create(
            model="gen4.5",
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


def generate_reference_image(
    prompt: str,
    ratio: str = "1280:720",
    prior_ref_urls: Optional[list[str]] = None,
) -> RunwayImageResult:
    """Make a still reference frame for a shot (text→image).

    `prior_ref_urls` — URLs of reference stills from earlier shots in the
    storyboard. When provided, they are passed to gen4_image_turbo as
    referenceImages so characters and visual style stay consistent across
    shots. Pass the first shot's ref as "character1" anchor; subsequent
    shots can address it in the prompt with "@character1".
    """
    if runway_is_live():
        return _live_image(prompt, ratio=ratio, prior_ref_urls=prior_ref_urls)
    return _mock_image(prompt)


def generate_shot_video(
    image_url: str,
    prompt: str,
    duration: int = 5,
    ratio: str = "1280:720",
) -> RunwayVideoResult:
    """Animate a reference image into a clip via Gen-4.5 (image→video).

    The shot's own reference image is the first frame, so visual style
    established during generate_reference_image carries through to motion.
    """
    if runway_is_live():
        return _live_video(image_url, prompt, duration=duration, ratio=ratio)
    time.sleep(0.6)
    return _mock_video(prompt, duration=duration, image_url=image_url)


def boot_status() -> str:
    """One-line status for the agent boot log."""
    return f"runway: {runway_mode_label()}"
