"""Thin wrapper around the official `runwayml` Python SDK.

Two modes:
- LIVE: when `RUNWAY_API_KEY` is set (or a per-request key is injected via
  LangGraph configurable), real calls to the Runway API.
  Uses Gen-4 Image Turbo (text→image for shot references) and Gen-4.5
  (image→video). Both models accept reference images for cross-shot
  visual consistency — characters and style anchors are threaded through
  every call so shot 4's astronaut looks like shot 1's astronaut.
- MOCK: when no key, deterministic placeholder URLs so the rest of the
  pipeline (storyboard state, frontend rendering, agent prompts) works
  end-to-end without burning credits or blocking dev.

Per-request key (BYOK):
  The BFF injects `runway_api_key` into LangGraph's configurable dict when
  the user supplies their own key via the frontend settings panel. This
  function reads it via `_get_configurable()` and uses it in preference to
  the server-level env var. The user's key is never logged.

Budget guard:
  The BFF also injects `runway_calls_remaining` and `runway_budget` into
  configurable. `_check_budget()` raises `BudgetExceededError` before any
  Runway call when the remaining count hits 0. The BFF increments the
  counter via POST /api/runway-call-used after each successful call.

Model choices vs. the original:
- gen4_image → gen4_image_turbo  : 2-4x cheaper, <10s, 93% quality parity.
  Accepts up to 3 reference images with optional tags for prompt-addressable
  character/style anchoring.
- gen4_turbo → gen4.5            : newer model, better quality + control,
  same pricing tier, 2-10s flexible duration, text-to-video also supported.

This module is sync-only; LangChain `@tool` functions are sync and the
LangGraph runtime can dispatch them in worker threads if needed.
"""

from __future__ import annotations

import hashlib
import os
import time
import urllib.request
from dataclasses import dataclass
from typing import Optional


# --------------------------------------------------------------------- budget


class BudgetExceededError(RuntimeError):
    """Raised when the per-thread Runway call budget is exhausted."""


def _get_configurable() -> dict:
    """Return the current LangGraph configurable dict, or {} if not in a run."""
    try:
        from langgraph.config import get_config
        cfg = get_config()
        return cfg.get("configurable", {}) if cfg else {}
    except Exception:  # noqa: BLE001
        return {}


def _check_budget() -> None:
    """Raise BudgetExceededError if the per-thread call budget is exhausted.

    Only enforced when the BFF injects runway_calls_remaining into
    configurable (i.e. when a shared server key is in use). When the user
    supplies their own key (runway_api_key in configurable), the budget
    check is skipped — they're paying from their own account.
    """
    cfg = _get_configurable()
    # If the user supplied their own key, skip the budget check entirely.
    if cfg.get("runway_api_key"):
        return
    remaining = cfg.get("runway_calls_remaining")
    if remaining is None:
        return  # BFF not injecting budget — no limit
    if int(remaining) <= 0:
        budget = cfg.get("runway_budget", 20)
        raise BudgetExceededError(
            f"Runway call budget exhausted ({budget} calls per conversation). "
            "Add your own Runway API key in the canvas settings to continue, "
            "or start a new conversation."
        )


def _notify_bff_call_used(thread_id: str) -> None:
    """Tell the BFF to increment the per-thread call counter.

    Fire-and-forget — failures are silently swallowed so a counter glitch
    never blocks generation.
    """
    bff_url = os.getenv("BFF_URL", "http://localhost:4000")
    try:
        data = f'{{"thread_id": "{thread_id}"}}'.encode()
        req = urllib.request.Request(
            f"{bff_url}/api/runway-call-used",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=3)
    except Exception:  # noqa: BLE001
        pass


def _current_thread_id() -> str:
    """Return the current LangGraph thread ID, or empty string."""
    try:
        cfg = _get_configurable()
        return str(cfg.get("thread_id", ""))
    except Exception:  # noqa: BLE001
        return ""


def _billing_thread_id() -> str:
    """Thread id used for the per-conversation budget counter.

    In intelligence mode the run executes on an internal "twin" thread while
    the UI owns a different thread id. The BFF injects ``ui_thread_id`` into
    configurable so billing stays keyed to the conversation the user sees
    (and matches the id the BFF budget-checks against). Falls back to the
    LangGraph thread id when no UI id was injected.
    """
    cfg = _get_configurable()
    return str(cfg.get("ui_thread_id") or cfg.get("thread_id") or "")

# --------------------------------------------------------------------- modes


def _effective_api_key() -> str:
    """Return the Runway API key to use for this request.

    Priority:
    1. Per-request key from LangGraph configurable (user's own BYOK key)
    2. Server-level RUNWAY_API_KEY / RUNWAYML_API_SECRET env var
    """
    cfg = _get_configurable()
    byok = cfg.get("runway_api_key", "")
    if byok and not str(byok).startswith("stub"):
        return str(byok)
    return os.getenv("RUNWAY_API_KEY") or os.getenv("RUNWAYML_API_SECRET") or ""


def runway_is_live() -> bool:
    """True when a real Runway API key is available (BYOK or server env)."""
    key = _effective_api_key()
    return bool(key) and not key.startswith("stub")


def runway_mode_label() -> str:
    return "LIVE" if runway_is_live() else "MOCK"


# --------------------------------------------------------------------- types


@dataclass
class RunwayImageResult:
    url: str
    prompt: str
    mode: str  # "LIVE" | "MOCK"
    sha256: Optional[str] = None


@dataclass
class RunwayVideoResult:
    url: str
    prompt: str
    duration: int
    mode: str
    image_url: Optional[str] = None
    manifest_uri: Optional[str] = None
    sha256: Optional[str] = None
    canonical_hash: Optional[str] = None


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


# Default timeout (seconds) for waiting on Runway task completion.
_RUNWAY_TASK_TIMEOUT = float(os.getenv("RUNWAY_TASK_TIMEOUT", "120"))


def _client():
    """Lazy-import the SDK and initialise with the effective API key."""
    from runwayml import RunwayML
    key = _effective_api_key()
    return RunwayML(api_key=key if key else None)


def _wait_for_task(task, kind: str, timeout: float = _RUNWAY_TASK_TIMEOUT):
    """Poll a Runway task until completion, with a hard deadline.

    Similar to the pattern in audio_client.py. The SDK's built-in
    `wait_for_task_output()` has no timeout and can block forever.
    """
    client = _client()
    deadline = time.time() + timeout
    while time.time() < deadline:
        task = client.tasks.retrieve(task.id)
        status = getattr(task, "status", None)
        if status == "SUCCEEDED":
            return task
        if status in ("FAILED", "CANCELLED"):
            from runwayml import TaskFailedError
            details = getattr(task, "failure", None) or status
            raise RuntimeError(f"Runway {kind} task {status}: {details}")
        time.sleep(2.0)
    raise RuntimeError(f"Runway {kind} task timed out after {timeout:.0f}s")


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
    """Text→image via Runway.

    - Shot 0 (no prior refs): uses gen4_image (standard) — reference_images
      is Required for gen4_image_turbo so we can't use it without refs.
    - Shots 1+ (with prior refs): uses gen4_image_turbo — 2-4x cheaper,
      <10s, 93% quality parity, and accepts referenceImages for cross-shot
      character/style consistency.
    """
    from runwayml import TaskFailedError

    client = _client()
    refs = _build_ref_images(prior_ref_urls or [])

    if refs:
        # gen4_image_turbo: faster + cheaper, requires at least one ref image
        kwargs: dict = {
            "model": "gen4_image_turbo",
            "prompt_text": prompt,
            "ratio": ratio,
            "reference_images": refs,
        }
    else:
        # gen4_image: standard model, no reference_images required
        kwargs = {
            "model": "gen4_image",
            "prompt_text": prompt,
            "ratio": ratio,
        }

    try:
        task = client.text_to_image.create(**kwargs)
        task = _wait_for_task(task, "text_to_image")
    except TaskFailedError as e:
        raise RuntimeError(f"Runway text_to_image failed: {e.task_details}") from e

    url = (task.output or [None])[0]
    if not url:
        raise RuntimeError("Runway text_to_image returned no output URL")
    return RunwayImageResult(url=url, prompt=prompt, mode="LIVE")


# Default video model — override with RUNWAY_VIDEO_MODEL=seedance2 for product shots.
# seedance2: up to 15s, better for product/e-commerce, 36 credits/sec (vs 12 for gen4.5).
_RUNWAY_VIDEO_MODEL = os.getenv("RUNWAY_VIDEO_MODEL", "gen4.5")


def _upload_to_runway_ephemeral(image_url: str) -> str:
    """Upload an image to Runway's ephemeral storage and return a runway:// URI.

    Runway output CDN URLs are signed and expire within hours. Uploading to
    ephemeral storage gives a stable runway:// URI that is valid for the
    duration of the session and avoids URL-expiry failures on slow/retried runs.

    Falls back to the original URL on any error so the pipeline is not blocked.
    """
    try:
        import io
        import urllib.request as _req
        with _req.urlopen(image_url, timeout=30) as resp:
            image_bytes = resp.read()
        # FileTypes accepts (filename, file-like, content-type) tuples.
        file_tuple = ("image.jpg", io.BytesIO(image_bytes), "image/jpeg")
        client = _client()
        upload = client.uploads.create_ephemeral(file=file_tuple)
        if upload.uri:
            return str(upload.uri)
    except Exception as exc:  # noqa: BLE001
        import logging
        logging.getLogger(__name__).warning(
            "runway_ephemeral_upload_failed url=%s err=%s — using original URL",
            image_url, exc,
        )
    return image_url


def _live_video(
    image_url: str,
    prompt: str,
    duration: int = 5,
    ratio: str = "1280:720",
) -> RunwayVideoResult:
    """Image→video via Runway.

    Model selection (RUNWAY_VIDEO_MODEL env var):
    - gen4.5 (default): best quality/control, 2-10s, 12 credits/sec.
    - seedance2: up to 15s, optimised for product/e-commerce shots, 36 credits/sec.

    The shot's reference image is uploaded to Runway ephemeral storage first
    so the runway:// URI is stable even if the original CDN URL expires during
    a slow or retried run.
    """
    from runwayml import TaskFailedError

    model = _RUNWAY_VIDEO_MODEL
    # Cap duration to model limits: seedance2 supports up to 15s, gen4.5 up to 10s.
    max_duration = 15 if model == "seedance2" else 10
    capped_duration = min(duration, max_duration)

    # Upload image to Runway ephemeral storage for a stable runway:// URI.
    stable_image_uri = _upload_to_runway_ephemeral(image_url)

    client = _client()
    try:
        task = client.image_to_video.create(
            model=model,
            prompt_image=stable_image_uri,
            prompt_text=prompt,
            ratio=ratio,
            duration=capped_duration,
        )
        task = _wait_for_task(task, "image_to_video")
    except TaskFailedError as e:
        raise RuntimeError(f"Runway image_to_video failed: {e.task_details}") from e

    url = (task.output or [None])[0]
    if not url:
        raise RuntimeError("Runway image_to_video returned no output URL")
    return RunwayVideoResult(
        url=url, prompt=prompt, duration=capped_duration, mode="LIVE", image_url=image_url
    )


def _live_restyle(
    video_url: str,
    prompt: str,
    style_ref_url: Optional[str] = None,
) -> RunwayVideoResult:
    """Video→video restyle via gen4_aleph.

    Takes an existing clip and re-renders it in a new style described by
    `prompt` ("anime", "claymation", "noir film grain", etc.). When
    `style_ref_url` is provided, it's passed as the single supported
    `references[]` image so the model emulates that look on top of the
    text instruction. The output preserves motion and timing from the
    source video — only the look changes.
    """
    from runwayml import TaskFailedError

    client = _client()
    kwargs: dict = {
        "model": "gen4_aleph",
        "prompt_text": prompt,
        "video_uri": video_url,
    }
    if style_ref_url:
        kwargs["references"] = [{"type": "image", "uri": style_ref_url}]

    try:
        task = client.video_to_video.create(**kwargs)
        task = _wait_for_task(task, "video_to_video")
    except TaskFailedError as e:
        raise RuntimeError(f"Runway video_to_video failed: {e.task_details}") from e

    url = (task.output or [None])[0]
    if not url:
        raise RuntimeError("Runway video_to_video returned no output URL")
    return RunwayVideoResult(
        url=url, prompt=prompt, duration=0, mode="LIVE", image_url=style_ref_url
    )


# --------------------------------------------------------------------- public


def _persist_image_to_b2(result: RunwayImageResult) -> RunwayImageResult:
    """Rewrite a LIVE image URL to a durable B2 URL when storage is on."""
    from .media_storage import b2_enabled, persist_url

    if not b2_enabled() or result.mode != "LIVE":
        return result
    stored = persist_url(
        result.url,
        content_type="image/jpeg",
        tenant_id=_current_thread_id() or "director",
    )
    if stored:
        result.url = stored.url
        result.sha256 = stored.sha256
    return result


def generate_reference_image(
    prompt: str,
    ratio: str = "1280:720",
    prior_ref_urls: Optional[list[str]] = None,
) -> RunwayImageResult:
    """Make a still reference frame for a shot (text→image).

    Checks the per-thread budget before calling Runway, then notifies the
    BFF to increment the counter on success.

    `prior_ref_urls` — URLs of reference stills from earlier shots in the
    storyboard. When provided, they are passed to gen4_image_turbo as
    referenceImages so characters and visual style stay consistent across
    shots.

    When Genblaze/B2 is enabled, the CDN URL is rewritten to a durable
    B2 object URL so storyboard stills do not expire.
    """
    if runway_is_live():
        _check_budget()
        result = _live_image(prompt, ratio=ratio, prior_ref_urls=prior_ref_urls)
        _notify_bff_call_used(_billing_thread_id())
        return _persist_image_to_b2(result)
    return _mock_image(prompt)


def generate_shot_video(
    image_url: str,
    prompt: str,
    duration: int = 5,
    ratio: str = "1280:720",
    *,
    beat: Optional[str] = None,
    shot_id: Optional[str] = None,
) -> RunwayVideoResult:
    """Animate a reference image into a clip via Gen-4.5 (image→video).

    Checks the per-thread budget before calling Runway, then notifies the
    BFF to increment the counter on success.

    When ``GENBLAZE_ENABLED=1``, generation runs through Genblaze's
    Pipeline + RunwayProvider (with optional B2 ObjectStorageSink).
    Winning-artifact beats use Genblaze ``AgentLoop`` until the manifest
    verifies. Otherwise the direct Runway SDK path is used; if B2 is
    configured, the CDN clip is persisted afterward.
    """
    if runway_is_live():
        _check_budget()
        from .genblaze_agent_loop import is_winning_beat, refine_winning_clip
        from .genblaze_bridge import genblaze_video_enabled, run_shot_video

        if genblaze_video_enabled() and is_winning_beat(beat):
            loop = refine_winning_clip(
                image_url,
                prompt,
                duration=duration,
                ratio=ratio,
                shot_id=shot_id,
            )
            result = RunwayVideoResult(
                url=loop.url or image_url,
                prompt=prompt,
                duration=duration,
                mode="LIVE",
                image_url=image_url,
                manifest_uri=loop.manifest_uri,
                sha256=loop.sha256,
                canonical_hash=loop.canonical_hash,
            )
            # Stash loop summary on a thread-local-ish attribute for tools.
            result._agent_loop = loop.as_dict()  # type: ignore[attr-defined]
        elif genblaze_video_enabled():
            bridge = run_shot_video(
                image_url,
                prompt,
                duration=duration,
                ratio=ratio,
                shot_id=shot_id,
            )
            result = RunwayVideoResult(
                url=bridge.url,
                prompt=bridge.prompt,
                duration=bridge.duration,
                mode=bridge.mode,
                image_url=bridge.image_url,
                manifest_uri=bridge.manifest_uri,
                sha256=bridge.sha256,
                canonical_hash=bridge.canonical_hash,
            )
        else:
            result = _live_video(image_url, prompt, duration=duration, ratio=ratio)
            from .media_storage import b2_enabled, persist_url

            if b2_enabled():
                stored = persist_url(
                    result.url,
                    content_type="video/mp4",
                    tenant_id=_current_thread_id() or "director",
                )
                if stored:
                    result.url = stored.url
                    result.sha256 = stored.sha256
        _notify_bff_call_used(_billing_thread_id())
        return result
    time.sleep(0.6)
    return _mock_video(prompt, duration=duration, image_url=image_url)


def restyle_shot_video(
    video_url: str,
    prompt: str,
    style_ref_url: Optional[str] = None,
    duration: int = 5,
) -> RunwayVideoResult:
    """Restyle an existing clip via gen4_aleph (video→video).

    Same budget + BYOK contract as the other generators. In MOCK mode
    this returns the original `video_url` unchanged with a "(restyled:
    <prompt>)" appended to the prompt — enough for the canvas state to
    update without any external dependency.
    """
    if runway_is_live():
        _check_budget()
        result = _live_restyle(video_url, prompt, style_ref_url=style_ref_url)
        _notify_bff_call_used(_billing_thread_id())
        # Aleph preserves source duration — pass through whatever the
        # caller knows so downstream timing stays correct.
        result.duration = duration
        from .media_storage import b2_enabled, persist_url

        if b2_enabled():
            stored = persist_url(
                result.url,
                content_type="video/mp4",
                tenant_id=_current_thread_id() or "director",
            )
            if stored:
                result.url = stored.url
                result.sha256 = stored.sha256
        return result
    time.sleep(0.4)
    return RunwayVideoResult(
        url=video_url,
        prompt=f"{prompt} (mock restyle)",
        duration=duration,
        mode="MOCK",
        image_url=style_ref_url,
    )


def boot_status() -> str:
    """One-line status for the agent boot log."""
    from .genblaze_bridge import boot_status as genblaze_boot
    from .media_storage import boot_status as storage_boot

    return f"runway: {runway_mode_label()} | {genblaze_boot()} | {storage_boot()}"
