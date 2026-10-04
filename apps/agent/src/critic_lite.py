"""Critic-lite — non-blocking post-plan warnings (KaushikSiva/cutroom critic skill, wedge-scoped).

Runs on variant/recap plans BEFORE ffmpeg: story, timing, caption, and
lockup checks that never spend generation budget and never fail a paid job.
Callers attach the returned warnings to the record note; a `major` never
auto-triggers a re-render — the agent or organizer decides.

Severity: info (polish) | minor (visible) | major (likely judge-visible).
"""

from __future__ import annotations

from typing import Any

WORDS_PER_SECOND = 2.3
HOOK_BEATS = (
    "proof", "reveal", "winning", "hero", "demo", "product", "cta", "result",
)


def _words(text: str) -> int:
    return len((text or "").split())


def critique_plan(plan: dict, assets: dict[str, dict]) -> list[dict[str, Any]]:
    """Return ordered warnings for `plan` (pure, no I/O)."""
    warnings: list[dict[str, Any]] = []
    clips = list(plan.get("clips") or [])
    if not clips:
        return [{
            "code": "no_clips", "severity": "major",
            "message": "Plan has no clips — nothing to stitch.",
            "clip_order": None,
        }]
    cap = plan.get("duration_cap")

    # 1. Story: opening image should hook in the first seconds.
    first_ref = clips[0].get("shot_ref", "")
    first_asset = assets.get(first_ref) or {}
    beat = str(first_asset.get("beat") or "").lower()
    if not any(k in beat for k in HOOK_BEATS):
        warnings.append({
            "code": "weak_open", "severity": "info",
            "message": (
                f"Opening clip ({first_ref}) beat '{beat or '?'}' is not "
                "hook-first — consider a proof/hero shot first for teasers."
            ),
            "clip_order": 0,
        })

    # 2. Timing per clip + narration overrun estimate.
    cap_lines = (plan.get("captions") or {}).get("lines") or []
    text_by_clip: dict[int, str] = {}
    for ln in cap_lines:
        try:
            order = int(ln.get("clip_order", -1))
        except (TypeError, ValueError):
            continue
        text_by_clip[order] = (text_by_clip.get(order, "") + " " + str(ln.get("text") or "")).strip()
    total = 0.0
    for i, c in enumerate(clips):
        ref = c.get("shot_ref", "")
        start = float(c.get("in") or 0.0)
        end_raw = c.get("out")
        asset = assets.get(ref) or {}
        src_dur = float(asset.get("duration") or 0.0)
        end = float(end_raw) if end_raw is not None else start + src_dur
        dur = max(0.0, end - start)
        total += dur
        if dur < 0.5:
            warnings.append({
                "code": "flash_clip", "severity": "major",
                "message": f"Clip {i} ({ref}) is {dur:.2f}s — reads as a flash cut.",
                "clip_order": i,
            })
        elif dur > 10.0:
            warnings.append({
                "code": "long_hold", "severity": "minor",
                "message": f"Clip {i} ({ref}) holds {dur:.1f}s — outstays one idea.",
                "clip_order": i,
            })
        text = text_by_clip.get(i, "")
        if text:
            spoken = _words(text) / WORDS_PER_SECOND
            if spoken > dur + 0.5:
                warnings.append({
                    "code": "narration_overrun", "severity": "major",
                    "message": (
                        f"Clip {i} ({ref}): ~{spoken:.1f}s of caption text in a "
                        f"{dur:.1f}s window — speech would run into the next shot."
                    ),
                    "clip_order": i,
                })
        # Caption windows for this clip must live inside the trim.
        for ln in cap_lines:
            try:
                order = int(ln.get("clip_order", -1))
            except (TypeError, ValueError):
                continue
            if order != i:
                continue
            s = float(ln.get("start", 0.0))
            e = float(ln.get("end", 0.0))
            if e <= s or e < start or s > end:
                warnings.append({
                    "code": "caption_drift", "severity": "minor",
                    "message": (
                        f"Clip {i} ({ref}): caption '{str(ln.get('text') or '')[:40]}' "
                        f"[{s:.1f}-{e:.1f}s] sits outside the trim [{start:.1f}-{end:.1f}s]."
                    ),
                    "clip_order": i,
                })
                break

    # 3. Total vs cap.
    if cap and total > float(cap) + 0.01:
        warnings.append({
            "code": "over_cap", "severity": "major",
            "message": f"Plan totals {total:.1f}s over duration_cap {float(cap):.1f}s.",
            "clip_order": None,
        })

    # 4. Lockup: customer/teaser cuts without a sponsor overlay.
    pid = str(plan.get("id") or "")
    overlays = list(plan.get("overlays") or [])
    has_logo = any(o.get("kind") == "logo" for o in overlays)
    if pid.startswith(("customer", "teaser", "recap")) and not has_logo:
        warnings.append({
            "code": "no_lockup", "severity": "info",
            "message": "No sponsor logo overlay — variants/recaps inherit the challenge brand kit.",
            "clip_order": None,
        })

    # 5. Silent teaser carrying caption lines is expected — confirm, don't warn.
    # (Teaser audio is silent by design; captions burn in for muted playback.)

    order = {"major": 0, "minor": 1, "info": 2}
    warnings.sort(key=lambda w: (order.get(w["severity"], 3), w["code"]))
    return warnings


def warnings_note(warnings: list[dict[str, Any]], limit: int = 3) -> str:
    """Compact one-line summary for record notes. Empty when clean."""
    if not warnings:
        return ""
    majors = [w for w in warnings if w["severity"] == "major"]
    head = (majors or warnings)[:limit]
    bits = [f"{w['code']}: {w['message'][:90]}" for w in head]
    extra = f" +{len(warnings) - len(head)} more" if len(warnings) > len(head) else ""
    return "critic: " + "; ".join(bits) + extra
