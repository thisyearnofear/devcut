"""Backend tools the director agent uses to drive the storyboard canvas.

Each data-mutating tool returns a `Command(update=)` so the canvas state
updates as a side-effect of the call — same pattern as `notion_tools.py`.

Tools:
- `generate_storyboard_plan(...)`: pure planning helper — decomposes a
  brief into N shot descriptions WITHOUT calling Runway.
- `generate_shot_reference(shot_id)`: text→image for ONE shot.
- `generate_shot_video(shot_id)`: image→video for ONE shot.
- `regenerate_shot(shot_id, new_prompt?)`: reset one shot's media.
- `generate_all_references()`: PARALLEL text→image for every shot
  missing a reference. Big latency win for multi-shot storyboards.
- `generate_all_videos()`: PARALLEL image→video for every shot that
  has a reference but no video.

The single-shot tools exist for fine-grained iteration; the batch tools
exist for the "run the whole pipeline" demo path. Both write through
the same `_patch_shot` helper so the resulting canvas state is identical.

Cross-shot visual consistency
------------------------------
Gen-4 Image Turbo accepts up to 3 `referenceImages`. We exploit this to
keep characters and visual style coherent across shots:

- The storyboard carries a `style_ref_url` — the reference still from
  shot 0 (the first shot to get a reference image). This acts as the
  "character anchor" for the whole piece.
- Every subsequent `generate_shot_reference` call passes `style_ref_url`
  (tagged "character1") plus up to 2 immediately-preceding shots' refs
  as additional style anchors.
- The prompt can address the anchor with "@character1" for explicit
  character carry-through.

This is the key differentiator vs. a naive "generate each shot in
isolation" approach — the astronaut in shot 4 looks like the astronaut
in shot 1.
"""

from __future__ import annotations

import concurrent.futures as _cf
import json
import time
from datetime import datetime, timezone
from typing import Annotated, Any, List, Optional
from uuid import uuid4


def _log(level: str, msg: str, **extra: object) -> None:
    """Emit a structured JSON log line to stdout."""
    import sys
    print(
        json.dumps({"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "level": level, "logger": "runway_tools", "msg": msg, **extra}),
        flush=True,
        file=sys.stdout,
    )


from langchain_core.messages import ToolMessage
from langchain_core.tools import InjectedToolCallId, tool
from langgraph.prebuilt import InjectedState
from langgraph.types import Command

from .audio_client import audio_mode_label
from .audio_tools import load_audio_tools
from .runway_client import (
    generate_reference_image,
    generate_shot_video as _runway_video,
    runway_is_live,
    runway_mode_label,
)
from .stitcher import stitch_storyboard as _stitch, stitcher_mode_label


# Cap parallel Runway calls so we don't trip per-account concurrency limits.
# The Runway free / starter tier permits a small number of concurrent jobs;
# 4 keeps us safely under that while collapsing the demo wall-time.
_RUNWAY_MAX_CONCURRENCY = 4


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_shot_id() -> str:
    return f"shot_{uuid4().hex[:8]}"


def _finalize(update: dict, state: Optional[dict] = None) -> dict:
    """Persist a cross-restart snapshot of restore-relevant state to B2.

    Fire-and-forget: never raises, never blocks the tool's return path
    meaningfully (upload happens on a daemon thread).
    """
    from .state_snapshots import save_snapshot_async

    save_snapshot_async(update, state)
    return update


@tool
def generate_storyboard_plan(
    title: Annotated[str, "Working title for the piece. Short."],
    logline: Annotated[str, "One-sentence logline summarizing the piece."],
    shots: Annotated[
        List[dict],
        (
            "Ordered list of shot dicts. Each: "
            "{ beat: str, prompt: str, duration?: int (3-10, default 5) }. "
            "Aim for 3-6 shots unless the user asked for more."
        ),
    ],
    aspect_ratio: Annotated[
        str, "Ratio for all shots: '1280:720' (landscape) or '720:1280' (portrait)."
    ] = "1280:720",
    tool_call_id: Annotated[str, InjectedToolCallId] = "",
) -> Command:
    """Lay out a storyboard plan on the canvas WITHOUT generating media yet.

    Pure state mutation. Each shot is created with status='pending' and
    no media URLs. The agent should call this first, summarize the plan
    to the user, and then call `generate_shot_reference` /
    `generate_shot_video` per-shot — usually after a one-line confirmation.
    """
    _log("INFO", "tool_enter", tool="generate_storyboard_plan", title=title, n_shots=len(shots), aspect_ratio=aspect_ratio)
    out_shots: list[dict] = []
    for i, raw in enumerate(shots):
        beat = (raw.get("beat") or f"Shot {i + 1}").strip()
        prompt = (raw.get("prompt") or "").strip()
        duration = int(raw.get("duration") or 5)
        out_shots.append(
            {
                "id": _new_shot_id(),
                "index": i,
                "beat": beat,
                "prompt": prompt,
                "ref_image_url": None,
                "video_url": None,
                "status": "pending",
                "error": None,
                "duration": max(3, min(10, duration)),
                "aspect_ratio": aspect_ratio,
            }
        )

    from .audio_client import pick_voice_for

    storyboard = {
        "title": title,
        "logline": logline,
        "aspect_ratio": aspect_ratio,
        "runway_mode": runway_mode_label(),
        "audio_mode": audio_mode_label(),
        "style_ref_url": None,  # set to shot-0's ref_image_url once generated
        # Lock the narrator at plan time so every voiceover sounds like
        # the same person — agent can override per-call when needed.
        "narrator_voice": pick_voice_for(title or logline or "default"),
    }

    msg = (
        f"Planned {len(out_shots)} shots for '{title}'. "
        f"Runway mode: {runway_mode_label()}. "
        "Ready to generate references."
    )
    _log("INFO", "tool_exit", tool="generate_storyboard_plan", title=title, n_shots=len(out_shots), logline=logline)

    return Command(
        update=_finalize({
            "storyboard": storyboard,
            "shots": out_shots,
            "header": {
                "title": title or "DevCut",
                "subtitle": logline or f"Runway {runway_mode_label()}",
            },
            "messages": [ToolMessage(content=msg, tool_call_id=tool_call_id)],
        })
    )


def _find_shot(shots: list[dict], shot_id: str) -> Optional[dict]:
    for s in shots:
        if s.get("id") == shot_id:
            return s
    return None


def _patch_shot(shots: list[dict], shot_id: str, patch: dict) -> list[dict]:
    return [
        ({**s, **patch} if s.get("id") == shot_id else s) for s in shots
    ]


def _prior_ref_urls(shots: list[dict], current_shot: dict, storyboard: dict) -> list[str]:
    """Collect reference image URLs to pass as consistency anchors.

    Strategy (up to 3 refs, which is the gen4_image_turbo limit):
    1. style_ref_url from the storyboard (shot-0's ref) — always first so
       it gets the "character1" tag and acts as the primary anchor.
    2. The immediately preceding shot's ref_image_url (if different from
       style_ref_url) — keeps local continuity.
    3. The shot two positions back (if available and different) — extra
       style reinforcement for longer storyboards.

    Returns an empty list for shot 0 (no prior context yet).
    """
    style_ref = storyboard.get("style_ref_url")
    current_index = current_shot.get("index", 0)

    if current_index == 0:
        return []  # first shot — no prior context

    refs: list[str] = []

    # Anchor: the storyboard-level style reference (shot 0's ref)
    if style_ref:
        refs.append(style_ref)

    # Walk backwards through shots to find the nearest refs
    sorted_prior = sorted(
        [s for s in shots if s.get("index", 0) < current_index and s.get("ref_image_url")],
        key=lambda s: s.get("index", 0),
        reverse=True,
    )
    for s in sorted_prior:
        url = s["ref_image_url"]
        if url not in refs:
            refs.append(url)
        if len(refs) >= 3:
            break

    return refs[:3]


@tool
def generate_shot_reference(
    shot_id: Annotated[str, "ID of the shot (from `shots[].id`) to generate a still for."],
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId] = "",
) -> Command:
    """Generate the reference still image for one shot via Runway text→image.

    Uses Gen-4 Image Turbo (faster, cheaper than standard Gen-4 Image).
    For shots after the first, passes prior shots' reference images as
    consistency anchors so characters and visual style stay coherent
    across the storyboard. The first shot's reference becomes the
    storyboard-level `style_ref_url` anchor for all subsequent shots.

    Updates that shot's `ref_image_url` and bumps status to 'image'.
    Status flow: pending → image → (call generate_shot_video) → ready.
    """
    _log("INFO", "tool_enter", tool="generate_shot_reference", shot_id=shot_id)
    shots: list[dict] = list((state or {}).get("shots") or [])
    storyboard: dict = dict((state or {}).get("storyboard") or {})
    shot = _find_shot(shots, shot_id)
    if not shot:
        _log("WARN", "shot_not_found", tool="generate_shot_reference", shot_id=shot_id)
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content=f"Shot {shot_id} not found.",
                        tool_call_id=tool_call_id,
                    )
                ]
            }
        )

    prompt = shot.get("prompt") or ""
    ratio = shot.get("aspect_ratio") or "1280:720"
    prior_refs = _prior_ref_urls(shots, shot, storyboard)
    _log("INFO", "runway_image_start", shot_id=shot_id, prompt=prompt[:120], ratio=ratio, n_prior_refs=len(prior_refs))
    t0 = time.monotonic()

    try:
        result = generate_reference_image(prompt, ratio=ratio, prior_ref_urls=prior_refs)
    except Exception as e:  # noqa: BLE001 - surface to the agent
        _log("ERROR", "runway_image_error", shot_id=shot_id, error=str(e), elapsed_s=round(time.monotonic()-t0, 2))
        new_shots = _patch_shot(
            shots, shot_id, {"status": "error", "error": str(e), "progress_label": None}
        )
        return Command(
            update={
                "shots": new_shots,
                "messages": [
                    ToolMessage(
                        content=f"Reference failed for {shot_id}: {e}",
                        tool_call_id=tool_call_id,
                    )
                ],
            }
        )

    _log("INFO", "runway_image_done", shot_id=shot_id, url=result.url, mode=result.mode, elapsed_s=round(time.monotonic()-t0, 2))
    elapsed_img = round(time.monotonic() - t0, 1)
    new_shots = _patch_shot(
        shots,
        shot_id,
        {"ref_image_url": result.url, "status": "image", "error": None, "progress_label": f"Still ready · {elapsed_img}s — generating video…"},
    )

    # Promote shot-0's reference to the storyboard-level style anchor so
    # all subsequent shots can use it as their primary consistency ref.
    update: dict = {
        "shots": new_shots,
        "messages": [ToolMessage(
            content=(
                f"Reference ready for shot {shot.get('beat') or shot_id} "
                f"({result.mode}"
                + (f", anchored to {len(prior_refs)} prior ref(s)" if prior_refs else "")
                + f"). URL: {result.url}"
            ),
            tool_call_id=tool_call_id,
        )],
    }
    if shot.get("index", 0) == 0 and not storyboard.get("style_ref_url"):
        update["storyboard"] = {**storyboard, "style_ref_url": result.url}

    return Command(update=_finalize(update, state))


@tool
def generate_shot_video(
    shot_id: Annotated[str, "ID of the shot to animate. Must already have ref_image_url."],
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId] = "",
) -> Command:
    """Animate one shot's reference image via Runway Gen-4.5 (image→video).

    Gen-4.5 delivers better quality and control than gen4_turbo at the
    same price point. The shot's reference image is used as the first
    frame, so visual style established by generate_shot_reference carries
    directly into the motion.

    Sets `video_url` and bumps status to 'ready'. If the shot has no
    reference image yet, returns an error ToolMessage so the agent
    knows to call `generate_shot_reference` first.
    """
    _log("INFO", "tool_enter", tool="generate_shot_video", shot_id=shot_id)
    shots: list[dict] = list((state or {}).get("shots") or [])
    shot = _find_shot(shots, shot_id)
    if not shot:
        _log("WARN", "shot_not_found", tool="generate_shot_video", shot_id=shot_id)
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content=f"Shot {shot_id} not found.",
                        tool_call_id=tool_call_id,
                    )
                ]
            }
        )

    image_url = shot.get("ref_image_url")
    if not image_url:
        _log("WARN", "no_ref_image", tool="generate_shot_video", shot_id=shot_id)
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content=(
                            f"Shot {shot_id} has no reference image yet. "
                            "Call generate_shot_reference first."
                        ),
                        tool_call_id=tool_call_id,
                    )
                ]
            }
        )

    prompt = shot.get("prompt") or ""
    ratio = shot.get("aspect_ratio") or "1280:720"
    duration = int(shot.get("duration") or 5)
    _log("INFO", "runway_video_start", shot_id=shot_id, prompt=prompt[:120], ratio=ratio, duration=duration)
    t0 = time.monotonic()

    try:
        result = _runway_video(
            image_url,
            prompt,
            duration=duration,
            ratio=ratio,
            beat=shot.get("beat"),
            shot_id=shot_id,
        )
    except Exception as e:  # noqa: BLE001
        _log("ERROR", "runway_video_error", shot_id=shot_id, error=str(e), elapsed_s=round(time.monotonic()-t0, 2))
        new_shots = _patch_shot(
            shots, shot_id, {"status": "error", "error": str(e), "progress_label": None}
        )
        return Command(
            update={
                "shots": new_shots,
                "messages": [
                    ToolMessage(
                        content=f"Video failed for {shot_id}: {e}",
                        tool_call_id=tool_call_id,
                    )
                ],
            }
        )

    _log("INFO", "runway_video_done", shot_id=shot_id, url=result.url, elapsed_s=round(time.monotonic()-t0, 2))
    elapsed_vid = round(time.monotonic() - t0, 1)
    new_shots = _patch_shot(
        shots,
        shot_id,
        {"video_url": result.url, "status": "ready", "error": None, "progress_label": f"Ready ✓ · {elapsed_vid}s"},
    )
    msg = (
        f"Video ready for shot {shot.get('beat') or shot_id} "
        f"({result.mode}, {duration}s). URL: {result.url}"
    )
    loop_meta = getattr(result, "_agent_loop", None)
    if loop_meta:
        msg += (
            f" Genblaze AgentLoop: "
            f"{'passed' if loop_meta.get('passed') else 'stopped'} "
            f"after {loop_meta.get('iterations')} take(s)."
        )
    update: dict = {
        "shots": new_shots,
        "messages": [ToolMessage(content=msg, tool_call_id=tool_call_id)],
    }
    # Surface Genblaze provenance on the canvas when the bridge attached a manifest.
    if getattr(result, "manifest_uri", None):
        update["manifest_uri"] = result.manifest_uri
    if getattr(result, "canonical_hash", None):
        update["canonical_hash"] = result.canonical_hash
    if loop_meta:
        update["agent_loop"] = loop_meta
    return Command(update=_finalize(update, state))


@tool
def regenerate_shot(
    shot_id: Annotated[str, "ID of the shot to redo from scratch."],
    state: Annotated[dict, InjectedState],
    new_prompt: Annotated[
        str,
        "Optional rewritten shot prompt. Pass empty string to keep the existing prompt.",
    ] = "",
    tool_call_id: Annotated[str, InjectedToolCallId] = "",
) -> Command:
    """Reset one shot and re-run reference + video.

    Useful when the user dislikes a generated shot. Optionally rewrites
    the shot prompt before regenerating. This tool only resets state;
    the agent should follow up with generate_shot_reference and then
    generate_shot_video so the user sees progress between calls.
    """
    shots: list[dict] = list((state or {}).get("shots") or [])
    shot = _find_shot(shots, shot_id)
    if not shot:
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content=f"Shot {shot_id} not found.",
                        tool_call_id=tool_call_id,
                    )
                ]
            }
        )

    patch: dict[str, Any] = {
        "ref_image_url": None,
        "video_url": None,
        "status": "pending",
        "error": None,
    }
    if new_prompt.strip():
        patch["prompt"] = new_prompt.strip()
    new_shots = _patch_shot(shots, shot_id, patch)

    msg = (
        f"Reset shot {shot.get('beat') or shot_id}. "
        "Call generate_shot_reference next."
    )
    return Command(
        update={
            "shots": new_shots,
            "messages": [ToolMessage(content=msg, tool_call_id=tool_call_id)],
        }
    )


@tool
def generate_all_references(
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId] = "",
) -> Command:
    """PARALLEL Runway text→image for every shot missing a reference.

    Uses Gen-4 Image Turbo (faster, cheaper). Passes prior shots'
    reference images as consistency anchors so characters stay coherent
    across the storyboard.

    Processing order: shot 0 is generated first (synchronously) so its
    URL can be promoted to `style_ref_url` and used as the primary
    character anchor for all subsequent shots. Shots 1+ are then
    generated in parallel with that anchor in place.

    Bounded by `_RUNWAY_MAX_CONCURRENCY` so we don't blow per-account
    concurrency limits. Per-shot failures don't abort the batch — they
    surface in each shot's `error` field, and the summary ToolMessage
    reports counts.
    """
    shots: list[dict] = list((state or {}).get("shots") or [])
    storyboard: dict = dict((state or {}).get("storyboard") or {})
    targets = [s for s in shots if not s.get("ref_image_url")]
    if not targets:
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content="All shots already have references.",
                        tool_call_id=tool_call_id,
                    )
                ]
            }
        )

    # Sort targets so shot 0 is always processed first.
    targets_sorted = sorted(targets, key=lambda s: s.get("index", 0))

    patches: dict[str, dict] = {}

    # --- Step 1: generate shot 0 synchronously so we have a style anchor ---
    first = targets_sorted[0]
    prior_refs_first = _prior_ref_urls(shots, first, storyboard)
    try:
        res0 = generate_reference_image(
            first.get("prompt") or "",
            ratio=first.get("aspect_ratio") or "1280:720",
            prior_ref_urls=prior_refs_first,
        )
        patches[first["id"]] = {
            "ref_image_url": res0.url,
            "status": "image",
            "error": None,
        }
        # Promote to style anchor if not already set
        if first.get("index", 0) == 0 and not storyboard.get("style_ref_url"):
            storyboard = {**storyboard, "style_ref_url": res0.url}
    except Exception as e:  # noqa: BLE001
        patches[first["id"]] = {"status": "error", "error": str(e)}

    # --- Step 2: generate remaining shots in parallel with anchor in place ---
    rest = targets_sorted[1:]

    def _one(shot: dict) -> tuple[str, dict]:
        # Build prior refs using the now-updated patches so shots that
        # completed in step 1 are included as anchors.
        merged_shots = [
            ({**s, **patches[s["id"]]} if s["id"] in patches else s)
            for s in shots
        ]
        prior_refs = _prior_ref_urls(merged_shots, shot, storyboard)
        try:
            res = generate_reference_image(
                shot.get("prompt") or "",
                ratio=shot.get("aspect_ratio") or "1280:720",
                prior_ref_urls=prior_refs,
            )
            return shot["id"], {
                "ref_image_url": res.url,
                "status": "image",
                "error": None,
            }
        except Exception as e:  # noqa: BLE001
            return shot["id"], {"status": "error", "error": str(e)}

    if rest:
        with _cf.ThreadPoolExecutor(
            max_workers=min(len(rest), _RUNWAY_MAX_CONCURRENCY)
        ) as ex:
            for shot_id, patch in ex.map(_one, rest):
                patches[shot_id] = patch

    new_shots = [
        ({**s, **patches[s["id"]]} if s["id"] in patches else s) for s in shots
    ]
    ok = sum(1 for p in patches.values() if "ref_image_url" in p)
    failed = len(patches) - ok
    anchor_note = f", style anchor: {storyboard.get('style_ref_url', 'none')[:40]}…" if storyboard.get("style_ref_url") else ""
    msg = (
        f"References: {ok} ready"
        + (f", {failed} failed" if failed else "")
        + f" ({runway_mode_label()}{anchor_note}). Call generate_all_videos next."
    )

    update: dict = {
        "shots": new_shots,
        "messages": [ToolMessage(content=msg, tool_call_id=tool_call_id)],
    }
    if storyboard.get("style_ref_url"):
        update["storyboard"] = storyboard

    return Command(update=_finalize(update, state))


@tool
def generate_all_videos(
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId] = "",
) -> Command:
    """PARALLEL Runway image→video for every shot with a reference but no video.

    Same concurrency cap and error-isolation strategy as
    `generate_all_references`. Skips shots without a reference image
    (call `generate_all_references` first).
    """
    shots: list[dict] = list((state or {}).get("shots") or [])
    targets = [
        s
        for s in shots
        if s.get("ref_image_url") and not s.get("video_url")
    ]
    if not targets:
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content=(
                            "No shots ready for animation. "
                            "Call generate_all_references first."
                        ),
                        tool_call_id=tool_call_id,
                    )
                ]
            }
        )

    def _one(shot: dict) -> tuple[str, dict, object | None]:
        try:
            res = _runway_video(
                shot["ref_image_url"],
                shot.get("prompt") or "",
                duration=int(shot.get("duration") or 5),
                ratio=shot.get("aspect_ratio") or "1280:720",
                beat=shot.get("beat"),
                shot_id=shot.get("id"),
            )
            return shot["id"], {
                "video_url": res.url,
                "status": "ready",
                "error": None,
            }, res
        except Exception as e:  # noqa: BLE001
            return shot["id"], {"status": "error", "error": str(e)}, None

    patches: dict[str, dict] = {}
    last_manifest: str | None = None
    last_canonical: str | None = None
    agent_loop_meta: dict | None = None
    with _cf.ThreadPoolExecutor(
        max_workers=min(len(targets), _RUNWAY_MAX_CONCURRENCY)
    ) as ex:
        for shot_id, patch, res in ex.map(_one, targets):
            patches[shot_id] = patch
            if res is not None and getattr(res, "manifest_uri", None):
                last_manifest = res.manifest_uri
            if res is not None and getattr(res, "canonical_hash", None):
                last_canonical = res.canonical_hash
            loop_meta = getattr(res, "_agent_loop", None) if res is not None else None
            if loop_meta:
                agent_loop_meta = loop_meta

    new_shots = [
        ({**s, **patches[s["id"]]} if s["id"] in patches else s) for s in shots
    ]
    ok = sum(1 for p in patches.values() if "video_url" in p)
    failed = len(patches) - ok
    total_seconds = sum(
        int(s.get("duration") or 5) for s in shots if s.get("video_url")
    )
    msg = (
        f"Videos: {ok} ready"
        + (f", {failed} failed" if failed else "")
        + f" ({runway_mode_label()}, {total_seconds}s total runtime)."
    )
    if agent_loop_meta:
        msg += (
            f" Winning artifact AgentLoop: "
            f"{'passed' if agent_loop_meta.get('passed') else 'stopped'} "
            f"after {agent_loop_meta.get('iterations')} take(s)."
        )
    update: dict = {
        "shots": new_shots,
        "messages": [ToolMessage(content=msg, tool_call_id=tool_call_id)],
    }
    if last_manifest:
        update["manifest_uri"] = last_manifest
    if last_canonical:
        update["canonical_hash"] = last_canonical
    if agent_loop_meta:
        update["agent_loop"] = agent_loop_meta
    return Command(update=_finalize(update, state))


@tool
def stitch_final_cut(
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId] = "",
) -> Command:
    """Concatenate every ready shot into one final MP4 via FFmpeg.

    Sets `final_video_url` and bumps `export_status` to 'ready' on the
    canvas. If no shots are ready yet, returns an error ToolMessage so
    the agent knows to generate videos first.

    Mode-switched: LIVE downloads + ffmpegs the per-shot Runway clips
    into one MP4 served from the frontend's `/exports/` path; MOCK
    returns a deterministic placeholder URL so the canvas + UI can be
    exercised without ffmpeg or network. The pill in the canvas header
    shows which mode is active for stitching.
    """
    shots: list[dict] = list((state or {}).get("shots") or [])
    storyboard: dict = dict((state or {}).get("storyboard") or {})
    title = storyboard.get("title") or "storyboard"

    ready = [s for s in shots if s.get("video_url")]
    if not ready:
        return Command(
            update={
                "export_status": "error",
                "export_error": "No shots ready yet — generate videos first.",
                "messages": [
                    ToolMessage(
                        content=(
                            "No shots are ready to stitch. Call "
                            "generate_all_videos (or generate_shot_video per "
                            "shot) first, then retry stitch_final_cut."
                        ),
                        tool_call_id=tool_call_id,
                    )
                ],
            }
        )

    try:
        result = _stitch(shots, title)
    except Exception as e:  # noqa: BLE001 - surface to the agent + canvas
        return Command(
            update={
                "export_status": "error",
                "export_error": str(e),
                "messages": [
                    ToolMessage(
                        content=f"Stitch failed: {e}",
                        tool_call_id=tool_call_id,
                    )
                ],
            }
        )

    msg = (
        f"Final cut ready ({result.mode}, {result.duration}s, "
        f"{result.shot_count} shots). URL: {result.url}"
    )
    clip_manifests = []
    if (state or {}).get("manifest_uri"):
        clip_manifests.append(state["manifest_uri"])
    canonicals = []
    if (state or {}).get("canonical_hash"):
        canonicals.append(state["canonical_hash"])

    from src.hyperframes_kit import build_builder_kit
    from src.job_manifest import build_job_manifest, persist_job_manifest
    from src.runway_client import _current_thread_id

    kit_state = {
        **(state or {}),
        "shots": shots,
        "storyboard": storyboard,
        "final_video_url": result.url,
        "durable_url": result.durable_url,
        "manifest_uri": result.manifest_uri or (state or {}).get("manifest_uri"),
    }
    builder_kit = build_builder_kit(
        kit_state,
        final_video_url=result.url,
        durable_url=result.durable_url,
    )

    job_manifest_uri = None
    job_doc = build_job_manifest(
        thread_id=_current_thread_id() or "director",
        storyboard=storyboard,
        shots=shots,
        final_video_url=result.url,
        durable_url=result.durable_url,
        final_sha256=result.final_sha256,
        clip_manifest_uris=clip_manifests,
        canonical_hashes=canonicals,
        builder_kit=builder_kit,
        agent_loop=(state or {}).get("agent_loop"),
    )
    try:
        stored_job = persist_job_manifest(
            job_doc, tenant_id=_current_thread_id() or "director"
        )
        if stored_job:
            job_manifest_uri = stored_job.url
            msg += f" Job manifest: {job_manifest_uri}"
    except Exception as exc:  # noqa: BLE001
        msg += f" (job manifest upload skipped: {exc})"

    msg += (
        f" HyperFrames handoff attached ({builder_kit.get('mode')}): "
        "copy BRIEF.md + stage assets/devcut/ — composition stays in HyperFrames."
    )
    update: dict = {
        "final_video_url": result.url,
        "export_status": "ready",
        "export_error": None,
        "builder_kit": builder_kit,
        "job_manifest": job_doc,
        "storyboard": {**storyboard, "stitch_mode": result.mode},
        "messages": [ToolMessage(content=msg, tool_call_id=tool_call_id)],
    }
    if result.durable_url:
        update["durable_url"] = result.durable_url
    if result.final_sha256:
        update["final_sha256"] = result.final_sha256
    manifest = result.manifest_uri or (state or {}).get("manifest_uri")
    if manifest:
        update["manifest_uri"] = manifest
    if job_manifest_uri:
        update["job_manifest_uri"] = job_manifest_uri
    if (state or {}).get("canonical_hash"):
        update["canonical_hash"] = state["canonical_hash"]
    if (state or {}).get("agent_loop"):
        update["agent_loop"] = state["agent_loop"]
    return Command(update=_finalize(update, state))


@tool
def emit_hyperframes_kit(
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId] = "",
) -> Command:
    """Refresh the HyperFrames handoff (BRIEF.md seed + asset drop map) on the canvas.

    Call after planning or after stitch when the user asks for a builder kit
    without re-stitching. Does not replace HyperFrames authoring.
    """
    from src.hyperframes_kit import build_builder_kit

    kit = build_builder_kit(state or {})
    return Command(
        update={
            "builder_kit": kit,
            "messages": [
                ToolMessage(
                    content=(
                        f"HyperFrames kit ready ({kit.get('mode')}): "
                        f"{kit.get('summary')} Paste BRIEF.md at the HF project root."
                    ),
                    tool_call_id=tool_call_id,
                )
            ],
        }
    )


def load_runway_tools() -> list:
    """All director-side backend tools the agent should have wired in.

    Includes the image / video pipeline (planning, references, videos,
    stitching), the audio pipeline (TTS voiceovers + SFX beds), and the
    gen4_aleph restyle tools — every Runway capability the director
    needs lives in this single registration list.
    """
    return [
        generate_storyboard_plan,
        generate_shot_reference,
        generate_shot_video,
        regenerate_shot,
        generate_all_references,
        generate_all_videos,
        stitch_final_cut,
        emit_hyperframes_kit,
        *load_audio_tools(),
    ]
