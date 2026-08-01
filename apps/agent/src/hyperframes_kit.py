"""HyperFrames handoff kit — BRIEF.md seed + asset drop map.

DevCut does not author HyperFrames compositions. After a run we emit a
builder kit that HF workflows can resume from (BRIEF.md is the intent
token). See docs/hyperframes.md.
"""

from __future__ import annotations

from typing import Any, Literal


DevCutMode = Literal["challenge", "submit"]


def infer_mode(storyboard: dict[str, Any], shots: list[dict[str, Any]]) -> DevCutMode:
    title = str(storyboard.get("title") or "").lower()
    logline = str(storyboard.get("logline") or "").lower()
    beats = " ".join(str(s.get("beat") or "") for s in shots).lower()
    if (
        "challenge" in title
        or "challenge cut" in logline
        or "anti-pattern" in beats
        or "constraint" in beats
        or "winning" in beats
    ):
        return "challenge"
    return "submit"


def _aspect_label(aspect: str) -> str:
    if aspect in ("720:1280", "9:16"):
        return "1080x1920"
    return "1920x1080"


def _slug(text: str) -> str:
    out = []
    for ch in (text or "shot").lower():
        if ch.isalnum():
            out.append(ch)
        elif ch in (" ", "-", "_") and (not out or out[-1] != "-"):
            out.append("-")
    s = "".join(out).strip("-")
    return (s[:48] or "shot")


def build_assets_lines(
    shots: list[dict[str, Any]],
    *,
    final_video_url: str | None = None,
    durable_url: str | None = None,
) -> list[dict[str, str]]:
    """Structured asset rows for UI + BRIEF Assets section."""
    rows: list[dict[str, str]] = []
    for s in shots:
        idx = int(s.get("index") or 0) + 1
        beat = str(s.get("beat") or f"Shot {idx}")
        base = f"assets/devcut/{idx:02d}-{_slug(beat)}"
        still = s.get("ref_image_url")
        clip = s.get("video_url")
        if still:
            rows.append(
                {
                    "kind": "still",
                    "beat": beat,
                    "path": f"{base}-still.png",
                    "url": str(still),
                    "note": "Hero still — drop into HyperFrames assets/, reference from a clip or sub-comp.",
                }
            )
        if clip:
            rows.append(
                {
                    "kind": "clip",
                    "beat": beat,
                    "path": f"{base}-clip.mp4",
                    "url": str(clip),
                    "note": "Generative motion — use as <video> source or plate under HF HTML.",
                }
            )
    deliverable = durable_url or final_video_url
    if deliverable:
        rows.append(
            {
                "kind": "final",
                "beat": "Final cut",
                "path": "assets/devcut/final-cut.mp4",
                "url": str(deliverable),
                "note": "Stitched DevCut export — reference / Devpost upload; composition stays in HyperFrames.",
            }
        )
    return rows


def build_brief_md(
    *,
    mode: DevCutMode,
    storyboard: dict[str, Any],
    shots: list[dict[str, Any]],
    assets: list[dict[str, str]],
) -> str:
    title = str(storyboard.get("title") or "DevCut handoff").strip()
    logline = str(storyboard.get("logline") or "").strip()
    aspect = str(storyboard.get("aspect_ratio") or "1280:720")
    length_s = sum(int(s.get("duration") or 5) for s in shots) or 30

    if mode == "challenge":
        workflow = "product-launch-video"
        message = logline or f"Show what winning looks like: {title}"
        audience = "hackathon builders"
        intent = (
            f"Challenge Cut reference for **{title}**. Organizers use this film as the "
            f"visual judging spec. Builders should fork a HyperFrames project from this "
            f"BRIEF, stage the listed assets, and finish layout/motion in HyperFrames — "
            f"not in DevCut."
        )
        notes = (
            "- DevCut supplied generative heroes + stitch; HyperFrames owns composition HTML.\n"
            "- Keep shot grammar: Problem → Constraint → Winning artifact → Anti-pattern → CTA.\n"
            "- Do not turn this into a sci-fi playground reel."
        )
    else:
        workflow = "product-launch-video"
        message = logline or f"Devpost-ready product story: {title}"
        audience = "hackathon judges / Devpost reviewers"
        intent = (
            f"Submit Ready polish for **{title}**. Drop generative heroes into an existing "
            f"(or newly init'd) HyperFrames project, then render the composition there. "
            f"DevCut is the footage + packaging desk — HyperFrames remains the authoring OS."
        )
        notes = (
            "- Prefer problem → product → proof beats.\n"
            "- Replace placeholder plates with product UI captures inside HyperFrames when available.\n"
            "- Final Devpost MP4 can be the HF render *or* the DevCut stitch — prefer HF when the "
            "composition is the artifact."
        )

    asset_lines = "\n".join(
        f"- `{a['path']}` — {a['beat']} ({a['kind']}); source: {a['url']}"
        for a in assets
        if a["kind"] != "final"
    ) or "- (no per-shot media yet — re-run stills/clips before dropping into HF)"

    if any(a["kind"] == "final" for a in assets):
        fin = next(a for a in assets if a["kind"] == "final")
        asset_lines += f"\n- `{fin['path']}` — stitched export; {fin['url']}"

    shot_lines = "\n".join(
        f"- **{s.get('beat') or f'Shot {i+1}'}** ({int(s.get('duration') or 5)}s) — {s.get('prompt') or ''}"
        for i, s in enumerate(shots)
    )

    return (
        "---\n"
        f"workflow: {workflow}\n"
        "flow: companion\n"
        "storyboard: yes\n"
        f'message: "{message.replace(chr(34), chr(39))}"\n'
        "destination: hackathon-devpost\n"
        f"aspect: {_aspect_label(aspect)}\n"
        "language: en\n"
        f"audience: {audience}\n"
        f"length: {length_s}s\n"
        "angle: product\n"
        "---\n"
        "\n"
        "## Intent\n"
        "\n"
        f"{intent}\n"
        "\n"
        "## Assets\n"
        "\n"
        f"{asset_lines}\n"
        "\n"
        "## Customizations\n"
        "\n"
        "- Stage DevCut media under `assets/devcut/` before `hyperframes check`.\n"
        "- Keep typography / UI chrome in HyperFrames HTML; use DevCut clips as hero plates.\n"
        "\n"
        "## Notes\n"
        "\n"
        f"{notes}\n"
        "\n"
        "### Shot list (from DevCut)\n"
        "\n"
        f"{shot_lines}\n"
    )


def build_drop_instructions(mode: DevCutMode) -> str:
    if mode == "challenge":
        lead = (
            "You received a Challenge Cut builder kit. HyperFrames is where builders "
            "finish the composition."
        )
    else:
        lead = (
            "You received Submit Ready heroes. Drop them into your HyperFrames project "
            "and keep authoring there."
        )
    return (
        f"{lead}\n"
        "\n"
        "1. `npx hyperframes@latest init` (or open your existing project).\n"
        "2. Paste `BRIEF.md` at the project root (merge Intent/Assets if one already exists).\n"
        "3. Download each asset into the listed `assets/devcut/…` path.\n"
        "4. Wire `<video>` / `<img>` sources to those paths in your composition HTML.\n"
        "5. `npx hyperframes check` → preview → render in HyperFrames.\n"
        "\n"
        "DevCut stops at generative footage + packaging. Do not re-author the film inside DevCut."
    )


def build_builder_kit(
    state: dict[str, Any] | None,
    *,
    final_video_url: str | None = None,
    durable_url: str | None = None,
) -> dict[str, Any]:
    """Return a JSON-serializable builder_kit for agent state / UI."""
    state = state or {}
    storyboard = dict(state.get("storyboard") or {})
    shots = list(state.get("shots") or [])
    mode = infer_mode(storyboard, shots)
    assets = build_assets_lines(
        shots,
        final_video_url=final_video_url or state.get("final_video_url"),
        durable_url=durable_url or state.get("durable_url"),
    )
    brief_md = build_brief_md(mode=mode, storyboard=storyboard, shots=shots, assets=assets)
    return {
        "mode": mode,
        "workflow": "product-launch-video",
        "title": storyboard.get("title") or "DevCut handoff",
        "brief_md": brief_md,
        "assets": assets,
        "drop_instructions": build_drop_instructions(mode),
        "summary": (
            "HyperFrames handoff ready — copy BRIEF.md, stage assets/devcut/, finish in HF."
            if assets
            else "HyperFrames BRIEF seed ready — generate stills/clips to fill Assets."
        ),
    }
