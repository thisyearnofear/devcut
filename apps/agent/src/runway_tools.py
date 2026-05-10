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
"""

from __future__ import annotations

import concurrent.futures as _cf
from datetime import datetime, timezone
from typing import Annotated, Any, List, Optional
from uuid import uuid4

from langchain_core.messages import ToolMessage
from langchain_core.tools import InjectedToolCallId, tool
from langgraph.prebuilt import InjectedState
from langgraph.types import Command

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

    storyboard = {
        "title": title,
        "logline": logline,
        "aspect_ratio": aspect_ratio,
        "runway_mode": runway_mode_label(),
    }

    msg = (
        f"Planned {len(out_shots)} shots for '{title}'. "
        f"Runway mode: {runway_mode_label()}. "
        "Ready to generate references."
    )

    return Command(
        update={
            "storyboard": storyboard,
            "shots": out_shots,
            "header": {
                "title": title or "Director's Canvas",
                "subtitle": logline or f"Runway {runway_mode_label()}",
            },
            "messages": [ToolMessage(content=msg, tool_call_id=tool_call_id)],
        }
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


@tool
def generate_shot_reference(
    shot_id: Annotated[str, "ID of the shot (from `shots[].id`) to generate a still for."],
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId] = "",
) -> Command:
    """Generate the reference still image for one shot via Runway text→image.

    Updates that shot's `ref_image_url` and bumps status to 'image'.
    Status flow: pending → image → (call generate_shot_video) → ready.
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

    prompt = shot.get("prompt") or ""
    ratio = shot.get("aspect_ratio") or "1280:720"
    try:
        result = generate_reference_image(prompt, ratio=ratio)
    except Exception as e:  # noqa: BLE001 - surface to the agent
        new_shots = _patch_shot(
            shots, shot_id, {"status": "error", "error": str(e)}
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

    new_shots = _patch_shot(
        shots,
        shot_id,
        {"ref_image_url": result.url, "status": "image", "error": None},
    )
    msg = (
        f"Reference ready for shot {shot.get('beat') or shot_id} "
        f"({result.mode}). URL: {result.url}"
    )
    return Command(
        update={
            "shots": new_shots,
            "messages": [ToolMessage(content=msg, tool_call_id=tool_call_id)],
        }
    )


@tool
def generate_shot_video(
    shot_id: Annotated[str, "ID of the shot to animate. Must already have ref_image_url."],
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId] = "",
) -> Command:
    """Animate one shot's reference image via Runway image→video.

    Sets `video_url` and bumps status to 'ready'. If the shot has no
    reference image yet, returns an error ToolMessage so the agent
    knows to call `generate_shot_reference` first.
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

    image_url = shot.get("ref_image_url")
    if not image_url:
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

    try:
        result = _runway_video(image_url, prompt, duration=duration, ratio=ratio)
    except Exception as e:  # noqa: BLE001
        new_shots = _patch_shot(
            shots, shot_id, {"status": "error", "error": str(e)}
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

    new_shots = _patch_shot(
        shots,
        shot_id,
        {"video_url": result.url, "status": "ready", "error": None},
    )
    msg = (
        f"Video ready for shot {shot.get('beat') or shot_id} "
        f"({result.mode}, {duration}s). URL: {result.url}"
    )
    return Command(
        update={
            "shots": new_shots,
            "messages": [ToolMessage(content=msg, tool_call_id=tool_call_id)],
        }
    )


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

    Bounded by `_RUNWAY_MAX_CONCURRENCY` so we don't blow per-account
    concurrency limits. Per-shot failures don't abort the batch — they
    surface in each shot's `error` field, and the summary ToolMessage
    reports counts.
    """
    shots: list[dict] = list((state or {}).get("shots") or [])
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

    def _one(shot: dict) -> tuple[str, dict]:
        try:
            res = generate_reference_image(
                shot.get("prompt") or "",
                ratio=shot.get("aspect_ratio") or "1280:720",
            )
            return shot["id"], {
                "ref_image_url": res.url,
                "status": "image",
                "error": None,
            }
        except Exception as e:  # noqa: BLE001
            return shot["id"], {"status": "error", "error": str(e)}

    patches: dict[str, dict] = {}
    with _cf.ThreadPoolExecutor(
        max_workers=min(len(targets), _RUNWAY_MAX_CONCURRENCY)
    ) as ex:
        for shot_id, patch in ex.map(_one, targets):
            patches[shot_id] = patch

    new_shots = [
        ({**s, **patches[s["id"]]} if s["id"] in patches else s) for s in shots
    ]
    ok = sum(1 for p in patches.values() if "ref_image_url" in p)
    failed = len(patches) - ok
    msg = (
        f"References: {ok} ready"
        + (f", {failed} failed" if failed else "")
        + f" ({runway_mode_label()}). Call generate_all_videos next."
    )
    return Command(
        update={
            "shots": new_shots,
            "messages": [ToolMessage(content=msg, tool_call_id=tool_call_id)],
        }
    )


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

    def _one(shot: dict) -> tuple[str, dict]:
        try:
            res = _runway_video(
                shot["ref_image_url"],
                shot.get("prompt") or "",
                duration=int(shot.get("duration") or 5),
                ratio=shot.get("aspect_ratio") or "1280:720",
            )
            return shot["id"], {
                "video_url": res.url,
                "status": "ready",
                "error": None,
            }
        except Exception as e:  # noqa: BLE001
            return shot["id"], {"status": "error", "error": str(e)}

    patches: dict[str, dict] = {}
    with _cf.ThreadPoolExecutor(
        max_workers=min(len(targets), _RUNWAY_MAX_CONCURRENCY)
    ) as ex:
        for shot_id, patch in ex.map(_one, targets):
            patches[shot_id] = patch

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
    return Command(
        update={
            "shots": new_shots,
            "messages": [ToolMessage(content=msg, tool_call_id=tool_call_id)],
        }
    )


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
    return Command(
        update={
            "final_video_url": result.url,
            "export_status": "ready",
            "export_error": None,
            "storyboard": {**storyboard, "stitch_mode": result.mode},
            "messages": [ToolMessage(content=msg, tool_call_id=tool_call_id)],
        }
    )


def load_runway_tools() -> list:
    """All director-side backend tools the agent should have wired in."""
    return [
        generate_storyboard_plan,
        generate_shot_reference,
        generate_shot_video,
        regenerate_shot,
        generate_all_references,
        generate_all_videos,
        stitch_final_cut,
    ]
