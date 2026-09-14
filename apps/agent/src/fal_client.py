"""fal.ai media provider — Runway's sibling generation backend.

Two modes mirror `runway_client.py`:
- LIVE: when `FAL_KEY` (or `FAL_API_KEY`) is set (or a per-request key is
  injected via LangGraph configurable as `fal_api_key`), real calls to
  fal.ai over their REST API.
- MOCK: when no key, deterministic placeholder URLs so the rest of the
  pipeline works end-to-end without burning credits.

Model defaults (both env-overridable):
- Image (text→image): `fal-ai/flux/schnell` — fast/cheap, ~1-2s stills.
  Accepts `image_url` for image-prompting when the model id contains
  "kontext" or "redux" (prior-shot refs pass through for consistency).
- Video (image→video): `fal-ai/kling-video/v2.1/master/image-to-video` —
  Kling V2.1 master, i2v with 5s or 10s clips at 16:9 / 9:16 / 1:1.

Transport (stdlib only — no new dependency):
- Images: synchronous `POST https://fal.run/{model}` and read
  `{"images": [{"url": ...}]}`.
- Video: async queue `POST https://queue.fal.run/{model}` → poll
  `GET .../requests/{id}/status` until COMPLETED → `GET .../requests/{id}`
  for `{"video": {"url": ...}}`.

Budget + billing reuse the Runway ledger: `_check_budget()` and
`_notify_bff_call_used()` are imported from `runway_client` so a per-thread
budget holds regardless of which backend generated the asset (the BFF
counter is media-call metering, not a Runway-specific meter).

This module is sync-only, same as runway_client — it slots into the
LangGraph tool worker pool without any async glue.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Optional

from .runway_client import (
    RunwayImageResult,
    RunwayVideoResult,
    _check_budget,
    _notify_bff_call_used,
)


# --------------------------------------------------------------------- env


def _key_from_env() -> Optional[str]:
    return os.getenv("FAL_KEY") or os.getenv("FAL_API_KEY") or None


def _key_from_configurable() -> Optional[str]:
    """BYOK-style per-request key (future vault support). Never logged."""
    try:
        from langgraph.config import get_config

        cfg = get_config()
        if cfg:
            return cfg.get("configurable", {}).get("fal_api_key")
    except Exception:  # noqa: BLE001 - not in a langgraph run
        return None
    return None


def _effective_api_key() -> Optional[str]:
    return _key_from_configurable() or _key_from_env()


def fal_is_live() -> bool:
    """LIVE iff a fal key is configured and we're not forced into MOCK."""
    if os.getenv("FAL_MODE", "").lower() == "mock":
        return False
    return bool(_effective_api_key())


def fal_mode_label() -> str:
    return "LIVE" if fal_is_live() else "MOCK"


def fal_image_model() -> str:
    return os.getenv("FAL_IMAGE_MODEL", "fal-ai/flux/schnell")


def fal_video_model() -> str:
    return os.getenv("FAL_VIDEO_MODEL", "fal-ai/kling-video/v2.1/master/image-to-video")


def fal_task_timeout() -> int:
    return int(os.getenv("FAL_TASK_TIMEOUT", "300"))


def _model_supports_refs(model: str) -> bool:
    """True when the model id signals it can take an image_url.

    flux/schnell ignores image_url; kontext/redux wording signals
    image-prompting support. Heuristic + env override for future models.
    """
    override = os.getenv("FAL_IMAGE_REF_MODE", "auto")
    if override == "on":
        return True
    if override == "off":
        return False
    lowered = model.lower()
    return "kontext" in lowered or "redux" in lowered
# --------------------------------------------------------------------- mock


def _mock_seed(text: str) -> str:
    """Deterministic short hash so the same prompt yields the same fake URL."""
    return str(abs(hash(text)) % 10_000_000)


def _mock_image_url(prompt: str, ratio: str) -> str:
    seed = _mock_seed(prompt or "shot")
    if ratio in ("720:1280", "9:16"):
        return f"https://picsum.photos/seed/fal-{seed}/720/1280"
    return f"https://picsum.photos/seed/fal-{seed}/1280/720"


def _mock_video_url(prompt: str) -> str:
    seed = _mock_seed(prompt or "clip")
    # Deterministic public placeholder — mirrors runway's MOCK clip.
    return f"https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4?seed=fal-{seed}"


# --------------------------------------------------------------------- helpers (pure, unit-testable)


def fal_image_size(ratio: str) -> str:
    """Map DevCut ratio strings to fal image_size tokens."""
    if ratio in ("720:1280", "9:16"):
        return "portrait_16_9"
    if ratio in ("1:1", "1024:1024"):
        return "square"
    return "landscape_16_9"


def fal_video_aspect(ratio: str) -> str:
    """Map DevCut ratio strings to fal video aspect_ratio tokens."""
    if ratio in ("720:1280", "9:16"):
        return "9:16"
    if ratio in ("1:1", "1024:1024"):
        return "1:1"
    return "16:9"


def map_duration(model: str, duration: int) -> str:
    """Normalize a requested shot duration to what a model actually accepts.

    Kling i2v supports 5s or 10s clips; other fal video models may accept
    arbitrary ranges. Return the closest supported value as a string.
    """
    clamped = max(1, min(60, int(duration or 5)))
    if "kling" in model.lower():
        return "10" if clamped >= 8 else "5"
    return str(clamped)


def image_request_body(
    prompt: str,
    ratio: str,
    prior_ref_urls: Optional[list[str]] = None,
    model: Optional[str] = None,
) -> dict:
    """Build the fal.run image request payload for the active model."""
    model = model or fal_image_model()
    body: dict = {
        "prompt": prompt,
        "image_size": fal_image_size(ratio),
        "num_images": 1,
        "output_format": "jpeg",
        "enable_safety_checker": True,
    }
    refs = prior_ref_urls or []
    if refs and _model_supports_refs(model):
        body["image_url"] = refs[0]
    return body


def video_request_body(
    image_url: str,
    prompt: str,
    duration: int,
    ratio: str,
    model: Optional[str] = None,
) -> dict:
    """Build the queue.fal.run video request payload for the active model."""
    model = model or fal_video_model()
    return {
        "prompt": prompt,
        "image_url": image_url,
        "duration": map_duration(model, duration),
        "aspect_ratio": fal_video_aspect(ratio),
    }

# --------------------------------------------------------------------- transport (stdlib urllib)


def _http_json(method: str, url: str, payload: Optional[dict], timeout: int) -> dict:
    """Serialize + issue one JSON HTTP request, raising on non-2xx."""
    key = _effective_api_key() or ""
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Key {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
            body = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        snippet = ""
        try:
            snippet = exc.read().decode("utf-8", errors="replace")[:300]
        except Exception:  # noqa: BLE001
            pass
        raise RuntimeError(f"fal HTTP {exc.code} on {url}: {snippet.strip()[:300]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"fal network error on {url}: {exc.reason}") from exc
    try:
        return json.loads(body)
    except (ValueError, TypeError) as exc:
        raise RuntimeError(f"fal returned non-JSON from {url}: {body[:200]}") from exc


def _submit_video(inputs: dict, model: str) -> dict:
    """POST to the fal queue; return the submit envelope with request_id/urls."""
    url = f"https://queue.fal.run/{model}"
    env = _http_json("POST", url, inputs, timeout=60)
    if "request_id" not in env:
        raise RuntimeError(f"fal queue submit missing request_id: {json.dumps(env)[:300]}")
    return env


def _poll_video(env: dict, model: str, timeout: int) -> dict:
    """Poll status_url until COMPLETED, then fetch the response body."""
    request_id = env["request_id"]
    status_url = env.get("status_url") or f"https://queue.fal.run/{model}/requests/{request_id}/status"
    response_url = env.get("response_url") or f"https://queue.fal.run/{model}/requests/{request_id}"
    deadline = time.monotonic() + timeout
    while True:
        status = _http_json("GET", status_url, None, timeout=30).get("status", "IN_QUEUE")
        if status == "COMPLETED":
            break
        if status in ("FAILED", "CANCELLED"):
            raise RuntimeError(f"fal video request {request_id} ended with status={status}")
        if time.monotonic() >= deadline:
            raise RuntimeError(f"fal video request {request_id} timed out after {timeout}s (status={status})")
        time.sleep(3)
    return _http_json("GET", response_url, None, timeout=60)


def _extract_video_url(result: dict) -> str:
    video = result.get("video") or {}
    url = video.get("url") if isinstance(video, dict) else None
    if not url:
        # Some fal video models return output.final.media_url (e.g. veo).
        output = result.get("output") or {}
        if isinstance(output, dict):
            final = output.get("final") or {}
            url = final.get("media_url") if isinstance(final, dict) else None
    if not url:
        raise RuntimeError(f"fal video result had no video.url: {json.dumps(result)[:300]}")
    return str(url)


# --------------------------------------------------------------------- public API (mirrors runway_client)


def generate_reference_image(
    prompt: str,
    ratio: str = "1280:720",
    prior_ref_urls: Optional[list[str]] = None,
) -> RunwayImageResult:
    """Text→image hero still from fal (default flux/schnell, ~1-2s)."""
    if not fal_is_live():
        time.sleep(0.15)
        return RunwayImageResult(
            url=_mock_image_url(prompt, ratio),
            prompt=prompt,
            mode="MOCK",
            provider="fal",
        )

    _check_budget()
    model = fal_image_model()
    body = image_request_body(prompt, ratio, prior_ref_urls=prior_ref_urls, model=model)
    result = _http_json("POST", f"https://fal.run/{model}", body, timeout=120)
    images = result.get("images") or []
    if not images or not isinstance(images[0], dict) or "url" not in images[0]:
        raise RuntimeError(f"fal image result had no images[].url: {json.dumps(result)[:300]}")
    url = str(images[0]["url"])
    from .media_storage import b2_enabled, persist_url

    if b2_enabled():
        stored = persist_url(url, content_type="image/jpeg", tenant_id="director")
        if stored:
            url = stored.url
    result_obj = RunwayImageResult(url=url, prompt=prompt, mode="LIVE", provider="fal")
    _notify_bff_call_used()
    return result_obj


def generate_shot_video(
    image_url: str,
    prompt: str,
    duration: int = 5,
    ratio: str = "1280:720",
    beat: Optional[str] = None,
    shot_id: Optional[str] = None,
) -> RunwayVideoResult:
    """Image→video clip on fal's queue API (default Kling V2.1 master)."""
    if not fal_is_live():
        time.sleep(0.6)
        return RunwayVideoResult(
            url=_mock_video_url(prompt),
            prompt=f"{prompt} (fal mock)",
            duration=duration,
            mode="MOCK",
            image_url=image_url,
            provider="fal",
        )

    _check_budget()
    model = fal_video_model()
    body = video_request_body(image_url, prompt, duration, ratio, model=model)
    env = _submit_video(body, model)
    result = _poll_video(env, model, fal_task_timeout())
    url = _extract_video_url(result)
    real_duration = int(map_duration(model, duration))
    from .media_storage import b2_enabled, persist_url

    if b2_enabled():
        stored = persist_url(url, content_type="video/mp4", tenant_id="director")
        if stored:
            url = stored.url
    result_obj = RunwayVideoResult(
        url=url,
        prompt=prompt,
        duration=real_duration,
        mode="LIVE",
        image_url=image_url,
        provider="fal",
    )
    _notify_bff_call_used()
    return result_obj


def boot_status() -> str:
    return f"fal: {fal_mode_label()} ({fal_image_model()} → {fal_video_model()})"
