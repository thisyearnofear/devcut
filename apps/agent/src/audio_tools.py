"""Director audio + restyle tools — Runway TTS, SFX, gen4_aleph.

These slot in next to the image / video tools in `runway_tools.py` and
follow the same `Command(update=...)` pattern so the canvas re-renders
on every successful call.

Tools shipped here:
- `generate_shot_voiceover(shot_id, line, voice?)` — TTS one shot
- `generate_shot_sfx(shot_id, prompt, duration?, loop?)` — ambience/SFX
- `generate_all_voiceovers(lines)` — PARALLEL TTS for the full storyboard
- `generate_all_sfx(prompt?, per_shot?)` — PARALLEL SFX (one bed for the
   whole piece, or per-shot beds when `per_shot=true`)
- `restyle_shot(shot_id, style_prompt)` — gen4_aleph one shot
- `restyle_storyboard(style_prompt)` — gen4_aleph every ready shot

All audio + restyle calls count against the same per-thread Runway budget
as image/video, and respect BYOK keys via the same configurable injection.
"""

from __future__ import annotations

import concurrent.futures as _cf
from typing import Annotated, List, Optional

from langchain_core.messages import ToolMessage
from langchain_core.tools import InjectedToolCallId, tool
from langgraph.prebuilt import InjectedState
from langgraph.types import Command

from .audio_client import (
    audio_mode_label,
    generate_sound_effect,
    generate_voiceover,
    pick_voice_for,
    VOICE_PRESETS,
)
from .runway_client import (
    restyle_shot_video,
    runway_mode_label,
)


# Mirror runway_tools' concurrency cap so a single agent run never trips
# Runway's per-account in-flight limits.
_AUDIO_MAX_CONCURRENCY = 4


def _find_shot(shots: list[dict], shot_id: str) -> Optional[dict]:
    for s in shots:
        if s.get("id") == shot_id:
            return s
    return None


def _patch_shot(shots: list[dict], shot_id: str, patch: dict) -> list[dict]:
    return [
        ({**s, **patch} if s.get("id") == shot_id else s) for s in shots
    ]


# --------------------------------------------------------------------- TTS


@tool
def generate_shot_voiceover(
    shot_id: Annotated[str, "ID of the shot to voice."],
    line: Annotated[str, "The exact line to be spoken — short, max 1000 chars."],
    state: Annotated[dict, InjectedState],
    voice: Annotated[
        Optional[str],
        "Optional voice preset id (Maya, Arjun, Serene, Bernard, ...). "
        "Defaults to the storyboard-locked narrator voice.",
    ] = None,
    tool_call_id: Annotated[str, InjectedToolCallId] = "",
) -> Command:
    """Voice one shot via Runway eleven_multilingual_v2.

    Updates the shot's `voiceover_url`, `voiceover_line`, and
    `voiceover_voice` fields. The next stitch call will mux the voice
    over the shot's video before concat. Picks the storyboard's locked
    narrator voice unless the caller overrides it.
    """
    shots: list[dict] = list((state or {}).get("shots") or [])
    storyboard: dict = dict((state or {}).get("storyboard") or {})
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

    chosen_voice = (
        voice
        or storyboard.get("narrator_voice")
        or pick_voice_for(storyboard.get("title") or shot_id)
    )

    try:
        result = generate_voiceover(line, voice=chosen_voice)
    except Exception as e:  # noqa: BLE001
        new_shots = _patch_shot(shots, shot_id, {"error": str(e)})
        return Command(
            update={
                "shots": new_shots,
                "messages": [
                    ToolMessage(
                        content=f"Voiceover failed for {shot_id}: {e}",
                        tool_call_id=tool_call_id,
                    )
                ],
            }
        )

    new_shots = _patch_shot(
        shots,
        shot_id,
        {
            "voiceover_url": result.url,
            "voiceover_line": line,
            "voiceover_voice": result.voice,
        },
    )
    update: dict = {
        "shots": new_shots,
        "messages": [
            ToolMessage(
                content=(
                    f"Voiceover ready for {shot_id} ({result.mode}, "
                    f"voice: {result.voice})."
                ),
                tool_call_id=tool_call_id,
            )
        ],
    }
    if not storyboard.get("narrator_voice"):
        update["storyboard"] = {**storyboard, "narrator_voice": result.voice}
    return Command(update=update)


@tool
def generate_all_voiceovers(
    lines: Annotated[
        List[dict],
        (
            "Ordered list of {shot_id, line} dicts — one per shot you want "
            "voiced. Lines are spoken verbatim."
        ),
    ],
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId] = "",
) -> Command:
    """PARALLEL Runway TTS for many shots at once.

    Reuses the storyboard's locked narrator voice for every line so the
    final cut sounds like one consistent narrator. Lines for unknown
    shot IDs are silently skipped (the agent's planning step might
    occasionally over-supply).
    """
    shots: list[dict] = list((state or {}).get("shots") or [])
    storyboard: dict = dict((state or {}).get("storyboard") or {})
    if not shots or not lines:
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content="Nothing to voice (no shots or no lines).",
                        tool_call_id=tool_call_id,
                    )
                ]
            }
        )

    chosen_voice = (
        storyboard.get("narrator_voice")
        or pick_voice_for(storyboard.get("title") or "default")
    )

    valid_shot_ids = {s["id"] for s in shots if s.get("id")}
    work = [
        (str(item.get("shot_id")), str(item.get("line") or "").strip())
        for item in lines
        if item.get("shot_id") in valid_shot_ids and (item.get("line") or "").strip()
    ]
    if not work:
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content="No valid shot/line pairs found.",
                        tool_call_id=tool_call_id,
                    )
                ]
            }
        )

    def _one(item: tuple[str, str]) -> tuple[str, dict]:
        sid, line = item
        try:
            res = generate_voiceover(line, voice=chosen_voice)
            return sid, {
                "voiceover_url": res.url,
                "voiceover_line": line,
                "voiceover_voice": res.voice,
            }
        except Exception as e:  # noqa: BLE001
            return sid, {"error": str(e)}

    patches: dict[str, dict] = {}
    with _cf.ThreadPoolExecutor(
        max_workers=min(len(work), _AUDIO_MAX_CONCURRENCY)
    ) as ex:
        for sid, patch in ex.map(_one, work):
            patches[sid] = patch

    new_shots = [
        ({**s, **patches[s["id"]]} if s["id"] in patches else s) for s in shots
    ]
    ok = sum(1 for p in patches.values() if "voiceover_url" in p)
    failed = len(patches) - ok
    update: dict = {
        "shots": new_shots,
        "messages": [
            ToolMessage(
                content=(
                    f"Voiceovers: {ok} ready"
                    + (f", {failed} failed" if failed else "")
                    + f" ({audio_mode_label()}, narrator: {chosen_voice})."
                ),
                tool_call_id=tool_call_id,
            )
        ],
    }
    if not storyboard.get("narrator_voice"):
        update["storyboard"] = {**storyboard, "narrator_voice": chosen_voice}
    return Command(update=update)


# --------------------------------------------------------------------- SFX


@tool
def generate_shot_sfx(
    shot_id: Annotated[str, "ID of the shot to add ambient sound / SFX to."],
    prompt: Annotated[
        str, "Sound description ('crackling fire, distant wind, low hum')."
    ],
    state: Annotated[dict, InjectedState],
    duration: Annotated[
        Optional[float],
        "Duration in seconds (0.5 to 30). Defaults to the shot duration.",
    ] = None,
    loop: Annotated[
        bool, "Generate a seamlessly-loopable bed (good for ambience)."
    ] = False,
    tool_call_id: Annotated[str, InjectedToolCallId] = "",
) -> Command:
    """Generate per-shot ambient sound / SFX via Runway eleven_text_to_sound_v2."""
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

    desired_duration = duration if duration else float(shot.get("duration") or 5)

    try:
        result = generate_sound_effect(
            prompt, duration=desired_duration, loop=loop
        )
    except Exception as e:  # noqa: BLE001
        new_shots = _patch_shot(shots, shot_id, {"error": str(e)})
        return Command(
            update={
                "shots": new_shots,
                "messages": [
                    ToolMessage(
                        content=f"SFX failed for {shot_id}: {e}",
                        tool_call_id=tool_call_id,
                    )
                ],
            }
        )

    new_shots = _patch_shot(
        shots,
        shot_id,
        {"sfx_url": result.url, "sfx_prompt": prompt},
    )
    return Command(
        update={
            "shots": new_shots,
            "messages": [
                ToolMessage(
                    content=f"SFX ready for {shot_id} ({result.mode}).",
                    tool_call_id=tool_call_id,
                )
            ],
        }
    )


@tool
def generate_all_sfx(
    state: Annotated[dict, InjectedState],
    prompt: Annotated[
        Optional[str],
        "One ambient bed for the whole storyboard. Ignored when per_shot=true.",
    ] = None,
    per_shot: Annotated[
        bool,
        "When true, generate a different bed for each shot using its own prompt.",
    ] = False,
    tool_call_id: Annotated[str, InjectedToolCallId] = "",
) -> Command:
    """PARALLEL SFX generation for the whole storyboard.

    Two modes:
    - default (`per_shot=false`): one ambient bed (using `prompt` or the
      storyboard logline) is generated once and copied across every shot.
      Costs 1 Runway call total. Best for short pieces with a unifying mood.
    - `per_shot=true`: one SFX clip per shot, prompted from each shot's
      own `prompt` field. Costs N calls. Best for varied scenes.
    """
    shots: list[dict] = list((state or {}).get("shots") or [])
    storyboard: dict = dict((state or {}).get("storyboard") or {})
    if not shots:
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content="No shots to add SFX to.",
                        tool_call_id=tool_call_id,
                    )
                ]
            }
        )

    if not per_shot:
        bed_prompt = (prompt or storyboard.get("logline") or "ambient cinematic bed").strip()
        # Use the longest shot's duration so the bed covers everything;
        # the stitcher trims per-shot when muxing.
        bed_duration = max(int(s.get("duration") or 5) for s in shots)
        try:
            res = generate_sound_effect(
                bed_prompt, duration=float(bed_duration), loop=True
            )
        except Exception as e:  # noqa: BLE001
            return Command(
                update={
                    "messages": [
                        ToolMessage(
                            content=f"SFX bed failed: {e}",
                            tool_call_id=tool_call_id,
                        )
                    ]
                }
            )
        new_shots = [{**s, "sfx_url": res.url, "sfx_prompt": bed_prompt} for s in shots]
        return Command(
            update={
                "shots": new_shots,
                "messages": [
                    ToolMessage(
                        content=(
                            f"Ambient bed applied to {len(new_shots)} shots "
                            f"({audio_mode_label()})."
                        ),
                        tool_call_id=tool_call_id,
                    )
                ],
            }
        )

    # per_shot mode
    def _one(shot: dict) -> tuple[str, dict]:
        prompt_text = (shot.get("prompt") or "").strip()
        if not prompt_text:
            return shot["id"], {}
        try:
            res = generate_sound_effect(
                prompt_text,
                duration=float(shot.get("duration") or 5),
                loop=False,
            )
            return shot["id"], {"sfx_url": res.url, "sfx_prompt": prompt_text}
        except Exception as e:  # noqa: BLE001
            return shot["id"], {"error": str(e)}

    patches: dict[str, dict] = {}
    with _cf.ThreadPoolExecutor(
        max_workers=min(len(shots), _AUDIO_MAX_CONCURRENCY)
    ) as ex:
        for sid, patch in ex.map(_one, shots):
            if patch:
                patches[sid] = patch

    new_shots = [
        ({**s, **patches[s["id"]]} if s["id"] in patches else s) for s in shots
    ]
    ok = sum(1 for p in patches.values() if "sfx_url" in p)
    return Command(
        update={
            "shots": new_shots,
            "messages": [
                ToolMessage(
                    content=f"Per-shot SFX: {ok} ready ({audio_mode_label()}).",
                    tool_call_id=tool_call_id,
                )
            ],
        }
    )


# --------------------------------------------------------------------- restyle


@tool
def restyle_shot(
    shot_id: Annotated[str, "ID of the shot whose video should be restyled."],
    style_prompt: Annotated[
        str,
        "How to restyle ('claymation stop-motion', 'noir film grain', "
        "'vivid anime cel'). Motion + framing are preserved.",
    ],
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId] = "",
) -> Command:
    """Restyle one shot's existing video via Runway gen4_aleph (video→video).

    Requires the shot to already have a `video_url`. Preserves motion +
    timing, replaces the look. The shot's reference still is passed as
    the single `references[]` image so character likeness carries through
    the restyle.
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
    if not shot.get("video_url"):
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content=(
                            f"Shot {shot_id} has no video to restyle. "
                            "Generate the video first."
                        ),
                        tool_call_id=tool_call_id,
                    )
                ]
            }
        )

    try:
        result = restyle_shot_video(
            shot["video_url"],
            style_prompt,
            style_ref_url=shot.get("ref_image_url"),
            duration=int(shot.get("duration") or 5),
        )
    except Exception as e:  # noqa: BLE001
        new_shots = _patch_shot(shots, shot_id, {"error": str(e)})
        return Command(
            update={
                "shots": new_shots,
                "messages": [
                    ToolMessage(
                        content=f"Restyle failed for {shot_id}: {e}",
                        tool_call_id=tool_call_id,
                    )
                ],
            }
        )

    new_shots = _patch_shot(
        shots,
        shot_id,
        {
            "video_url": result.url,
            "restyle_prompt": style_prompt,
            "status": "ready",
            "error": None,
        },
    )
    return Command(
        update={
            "shots": new_shots,
            "messages": [
                ToolMessage(
                    content=f"Restyled {shot_id} ({result.mode}): {style_prompt}",
                    tool_call_id=tool_call_id,
                )
            ],
        }
    )


@tool
def restyle_storyboard(
    style_prompt: Annotated[
        str,
        "How to restyle every shot ('paper diorama', '8-bit pixel art'). "
        "Motion + framing are preserved.",
    ],
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId] = "",
) -> Command:
    """PARALLEL gen4_aleph restyle for every ready shot in the storyboard.

    Bounded to 4 concurrent calls. Skips shots that don't yet have a
    video_url. Costs 1 Runway call per restyled shot.
    """
    shots: list[dict] = list((state or {}).get("shots") or [])
    targets = [s for s in shots if s.get("video_url")]
    if not targets:
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content="No shots ready to restyle. Generate videos first.",
                        tool_call_id=tool_call_id,
                    )
                ]
            }
        )

    def _one(shot: dict) -> tuple[str, dict]:
        try:
            res = restyle_shot_video(
                shot["video_url"],
                style_prompt,
                style_ref_url=shot.get("ref_image_url"),
                duration=int(shot.get("duration") or 5),
            )
            return shot["id"], {
                "video_url": res.url,
                "restyle_prompt": style_prompt,
                "status": "ready",
                "error": None,
            }
        except Exception as e:  # noqa: BLE001
            return shot["id"], {"error": str(e)}

    patches: dict[str, dict] = {}
    with _cf.ThreadPoolExecutor(
        max_workers=min(len(targets), _AUDIO_MAX_CONCURRENCY)
    ) as ex:
        for sid, patch in ex.map(_one, targets):
            patches[sid] = patch

    new_shots = [
        ({**s, **patches[s["id"]]} if s["id"] in patches else s) for s in shots
    ]
    ok = sum(1 for p in patches.values() if "video_url" in p)
    failed = len(patches) - ok
    return Command(
        update={
            "shots": new_shots,
            "messages": [
                ToolMessage(
                    content=(
                        f"Restyled {ok}/{len(targets)} shots"
                        + (f", {failed} failed" if failed else "")
                        + f" with '{style_prompt}' ({runway_mode_label()})."
                    ),
                    tool_call_id=tool_call_id,
                )
            ],
        }
    )


def load_audio_tools() -> list:
    """All audio + restyle tools the director should have wired in."""
    return [
        generate_shot_voiceover,
        generate_all_voiceovers,
        generate_shot_sfx,
        generate_all_sfx,
        restyle_shot,
        restyle_storyboard,
    ]
