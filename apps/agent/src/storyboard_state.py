"""StoryboardStateMiddleware — declares the director-canvas fields on the
agent's TypedDict state schema so STATE_SNAPSHOT round-trips preserve
storyboards, shots, and run status.

Mirrors the LeadStateMiddleware pattern. Field shapes mirror the
TypeScript `StoryboardState` in `src/lib/storyboard/types.ts`.

A fresh thread starts with an empty storyboard and a default header so
the canvas paints "give me a brief" instead of being blank.
"""

from __future__ import annotations

from typing import Annotated, Any, Optional

from langchain.agents.middleware.types import AgentMiddleware, AgentState
from typing_extensions import NotRequired, TypedDict


class _Header(TypedDict, total=False):
    title: str
    subtitle: str


class _Shot(TypedDict, total=False):
    id: str
    index: int
    beat: str          # short label e.g. "Establishing", "Reveal"
    prompt: str        # the shot description used for image+video gen
    ref_image_url: Optional[str]
    video_url: Optional[str]
    status: str        # "pending" | "image" | "ready" | "error"
    progress_label: Optional[str]  # short human-readable progress e.g. "Generating still… 12s"
    error: Optional[str]
    duration: int      # seconds
    aspect_ratio: str  # "1280:720" | "720:1280" | etc.
    # --- audio (Runway eleven_multilingual_v2 + eleven_text_to_sound_v2) ---
    voiceover_url: Optional[str]    # set by generate_shot_voiceover
    voiceover_line: Optional[str]   # the spoken line (kept for re-voicing)
    voiceover_voice: Optional[str]  # which preset narrator was used
    sfx_url: Optional[str]          # set by generate_shot_sfx
    sfx_prompt: Optional[str]       # the ambient/SFX description
    # --- restyle (Runway gen4_aleph) ---
    restyle_prompt: Optional[str]   # most recent restyle instruction


class _Storyboard(TypedDict, total=False):
    title: str
    logline: str
    aspect_ratio: str
    runway_mode: str   # "LIVE" | "MOCK"
    stitch_mode: str   # "LIVE" | "MOCK" — set after first stitch
    audio_mode: str    # "LIVE" | "MOCK" — set on plan creation
    style_ref_url: Optional[str]  # ref_image_url of shot 0; consistency anchor
    narrator_voice: Optional[str]  # locked voice preset for the whole piece


def _replace(_left: Any, right: Any) -> Any:
    """Always take the most recent value (no merge)."""
    return right


class StoryboardCanvasState(AgentState):
    """Director canvas state — extends the agent's base state schema."""

    storyboard: NotRequired[Annotated[_Storyboard, _replace]]
    shots: NotRequired[Annotated[list[_Shot], _replace]]
    selectedShotId: NotRequired[Annotated[Optional[str], _replace]]
    header: NotRequired[Annotated[_Header, _replace]]
    # Final stitched MP4. Populated by `stitch_final_cut`.
    final_video_url: NotRequired[Annotated[Optional[str], _replace]]
    # Durable B2 URL for the final cut (set when Genblaze/B2 upload succeeds).
    durable_url: NotRequired[Annotated[Optional[str], _replace]]
    # Genblaze provenance manifest URI (JSON in B2) for the final / last video run.
    manifest_uri: NotRequired[Annotated[Optional[str], _replace]]
    # "idle" | "stitching" | "ready" | "error"
    export_status: NotRequired[Annotated[str, _replace]]
    export_error: NotRequired[Annotated[Optional[str], _replace]]


class StoryboardStateMiddleware(AgentMiddleware[StoryboardCanvasState, Any]):  # type: ignore[type-arg]
    """Contributes the director-canvas state schema and seeds defaults."""

    state_schema = StoryboardCanvasState

    def before_agent(self, state: Any, runtime: Any) -> dict[str, Any] | None:
        """Seed the header on a fresh thread so the canvas shows guidance."""
        existing_header = (
            (state or {}).get("header") if isinstance(state, dict) else None
        )
        existing_shots = (
            (state or {}).get("shots") if isinstance(state, dict) else None
        )
        if existing_header or existing_shots:
            return None

        from .runway_client import runway_mode_label

        from .stitcher import stitcher_mode_label

        return {
            "header": {
                "title": "DevCut",
                "subtitle": (
                    f"Hackathon video desk · Runway {runway_mode_label()}"
                ),
            },
            "shots": [],
            "storyboard": {
                "title": "",
                "logline": "",
                "aspect_ratio": "1280:720",
                "runway_mode": runway_mode_label(),
                "stitch_mode": stitcher_mode_label(),
            },
            "final_video_url": None,
            "export_status": "idle",
            "export_error": None,
        }
