"""Runway audio generation — voiceover (TTS) and ambient sound (SFX).

Both endpoints ship with the same `RUNWAY_API_KEY` you already use for
image and video, no separate ElevenLabs account required:

- `client.text_to_speech` → `eleven_multilingual_v2` (49 preset voices)
- `client.sound_effect`   → `eleven_text_to_sound_v2` (0.5–30 s clips)

Same MOCK / LIVE / BYOK / budget mechanics as `runway_client.py`. Calls
return URLs the stitcher mux's into the per-shot video before concat,
so the final export is a single MP4 with synchronized speech + ambience.

Voice picking is deterministic per-storyboard (hashed by title) so the
same brief replayed yields the same narrator.
"""

from __future__ import annotations

import hashlib
import os
import time
import urllib.request
from dataclasses import dataclass
from typing import Optional

from .runway_client import (
    BudgetExceededError,  # re-exported for callers
    _check_budget,
    _client,
    _current_thread_id,
    _billing_thread_id,
    _notify_bff_call_used,
    runway_is_live,
    runway_mode_label,
)


__all__ = [
    "BudgetExceededError",
    "RunwayAudioResult",
    "VOICE_PRESETS",
    "audio_mode_label",
    "audio_is_live",
    "generate_voiceover",
    "generate_sound_effect",
    "boot_status",
    "pick_voice_for",
]


# All the voice preset IDs Runway accepts for eleven_multilingual_v2.
# Source: runwayml SDK types.text_to_speech_create_params.Voice.preset_id.
VOICE_PRESETS: list[str] = [
    "Maya", "Arjun", "Serene", "Bernard", "Billy", "Mark", "Clint",
    "Mabel", "Chad", "Leslie", "Eleanor", "Elias", "Elliot", "Grungle",
    "Brodie", "Sandra", "Kirk", "Kylie", "Lara", "Lisa", "Malachi",
    "Marlene", "Martin", "Miriam", "Monster", "Paula", "Pip", "Rusty",
    "Ragnar", "Xylar", "Maggie", "Jack", "Katie", "Noah", "James",
    "Rina", "Ella", "Mariah", "Frank", "Claudia", "Niki", "Vincent",
    "Kendrick", "Myrna", "Tom", "Wanda", "Benjamin", "Kiana", "Rachel",
]


# --------------------------------------------------------------------- mode


def audio_is_live() -> bool:
    """Audio uses the same Runway client as image/video — always in sync."""
    return runway_is_live()


def audio_mode_label() -> str:
    return runway_mode_label()


# --------------------------------------------------------------------- types


@dataclass
class RunwayAudioResult:
    url: str
    prompt: str
    duration: float
    mode: str  # "LIVE" | "MOCK"
    kind: str  # "voiceover" | "sfx"
    voice: Optional[str] = None
    sha256: Optional[str] = None


# --------------------------------------------------------------------- helpers


def pick_voice_for(seed: str) -> str:
    """Deterministic voice selection from the storyboard title / id."""
    digest = hashlib.sha1((seed or "default").encode("utf-8")).digest()
    idx = int.from_bytes(digest[:4], "big") % len(VOICE_PRESETS)
    return VOICE_PRESETS[idx]


def _mock_audio(prompt: str, duration: float, kind: str, voice: Optional[str]) -> RunwayAudioResult:
    # Public-domain short audio clips — same CDN style as the video mock,
    # but we don't actually need the URL to be playable for the agent's
    # state mutations to work; the stitcher's MOCK path skips audio mux.
    seed = hashlib.sha1(prompt.encode("utf-8")).hexdigest()[:10]
    url = f"https://example.com/mock-audio/{kind}/{seed}.mp3"
    return RunwayAudioResult(
        url=url, prompt=prompt, duration=duration, mode="MOCK", kind=kind, voice=voice
    )


# --------------------------------------------------------------------- LIVE


def _wait_for_task(task_id: str, kind: str, timeout: float = 180.0) -> str:
    """Poll the tasks endpoint until SUCCEEDED, return the first output URL.

    The TTS / SFX endpoints return only `{ id }` — there's no
    `wait_for_task_output()` helper like there is on text_to_image, so we
    poll `client.tasks.retrieve(id)` ourselves at 2 s intervals.
    """
    client = _client()
    deadline = time.time() + timeout
    while time.time() < deadline:
        task = client.tasks.retrieve(task_id)
        status = getattr(task, "status", None)
        if status == "SUCCEEDED":
            urls = getattr(task, "output", None) or []
            if not urls:
                raise RuntimeError(f"Runway {kind} returned empty output")
            return urls[0]
        if status in {"FAILED", "CANCELLED"}:
            details = getattr(task, "failure", None) or status
            raise RuntimeError(f"Runway {kind} task {status}: {details}")
        time.sleep(2.0)
    raise RuntimeError(f"Runway {kind} task timed out after {timeout:.0f}s")


def _live_voiceover(line: str, voice: str) -> RunwayAudioResult:
    client = _client()
    created = client.text_to_speech.create(
        model="eleven_multilingual_v2",
        prompt_text=line,
        voice={"type": "runway-preset", "preset_id": voice},
    )
    url = _wait_for_task(created.id, kind="voiceover")
    return RunwayAudioResult(
        url=url, prompt=line, duration=0.0, mode="LIVE",
        kind="voiceover", voice=voice,
    )


def _live_sound_effect(prompt: str, duration: float, loop: bool) -> RunwayAudioResult:
    client = _client()
    kwargs: dict = {
        "model": "eleven_text_to_sound_v2",
        "prompt_text": prompt,
    }
    if duration:
        kwargs["duration"] = float(max(0.5, min(30.0, duration)))
    if loop:
        kwargs["loop"] = True
    created = client.sound_effect.create(**kwargs)
    url = _wait_for_task(created.id, kind="sound_effect")
    return RunwayAudioResult(
        url=url, prompt=prompt, duration=duration, mode="LIVE", kind="sfx",
    )


# --------------------------------------------------------------------- public


def _persist_audio_to_b2(result: RunwayAudioResult) -> RunwayAudioResult:
    """Rewrite LIVE audio URL to durable B2 when storage is on."""
    from .media_storage import b2_enabled, persist_url
    from .runway_client import _current_thread_id

    if not b2_enabled() or result.mode != "LIVE":
        return result
    stored = persist_url(
        result.url,
        content_type="audio/mpeg",
        tenant_id=_current_thread_id() or "director",
    )
    if stored:
        result.url = stored.url
        result.sha256 = stored.sha256
    return result


def generate_voiceover(line: str, voice: Optional[str] = None) -> RunwayAudioResult:
    """Generate a voiceover line via Runway's eleven_multilingual_v2.

    Counts as 1 Runway call against the per-thread budget.
    `voice` defaults to a deterministic pick based on the line itself —
    pass an explicit preset (see `VOICE_PRESETS`) when you want to lock
    the narrator across an entire storyboard.
    """
    voice = voice or pick_voice_for(line)
    if voice not in VOICE_PRESETS:
        # Defensive fallback — Runway will reject unknown presets.
        voice = pick_voice_for(line)

    if audio_is_live():
        _check_budget()
        result = _live_voiceover(line, voice)
        _notify_bff_call_used()
        return _persist_audio_to_b2(result)

    return _mock_audio(line, duration=0.0, kind="voiceover", voice=voice)


def generate_sound_effect(
    prompt: str,
    duration: Optional[float] = None,
    loop: bool = False,
) -> RunwayAudioResult:
    """Generate ambient sound / SFX via Runway's eleven_text_to_sound_v2.

    `duration` is clamped to [0.5, 30.0] seconds. `loop=True` requests a
    seamlessly-looping bed (useful for ambient backgrounds).
    """
    if audio_is_live():
        _check_budget()
        result = _live_sound_effect(prompt, duration or 0.0, loop=loop)
        _notify_bff_call_used()
        return _persist_audio_to_b2(result)

    return _mock_audio(prompt, duration or 5.0, kind="sfx", voice=None)


def boot_status() -> str:
    """One-line status for the agent boot log."""
    return f"audio: {audio_mode_label()}"
