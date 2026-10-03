"""Variant-cut plans (ADR-0005) — pure data, no ffmpeg, fully unit-testable.

A variant plan is a deterministic re-stitch instruction over clips that
already exist (per-shot Runway videos + VO/SFX from the same thread, or
cross-thread snapshots for recap reels in Phase 3). No generation happens
here; `stitcher.stitch_plan` executes the plan.

Plan shape (validated/normalized by `normalize_plan`):

    {
      "id": "customer_1x1",
      "label": "Customer cut 1:1",
      "aspect": "1:1",
      "target": [1080, 1080], "fps": 30,
      "reframe": "fill",                    # fill = scale+crop, pad = letterbox
      "clips": [
        {"shot_ref": "shot_12ab",           # assets key; or "source_ref" later
         "in": 0.0, "out": 5.0,             # seconds within the source clip
         "order": 0,
         "focus_x": 0.5, "focus_y": 0.5,    # crop anchor for fill
         "max_dur": null},                  # optional per-clip clamp
      ],
      "audio": {"mode": "reuse_master",     # reuse_master | silent
                "voice": null, "sfx_volume": 0.35},
      "captions": {"method": "auto",        # auto | ass | drawtext | sidecar_only
                   "font_size_pct": 8, "safe_margin_pct": 6,
                   "lines": [{"clip_order": 0, "text": "…",
                              "start": 0.0, "end": 2.1}]},
      "overlays": [{"kind": "logo", "url": "…", "position": "top-right",
                    "size_pct": 12, "t0": null, "t1": null}],
      "duration_cap": 15.0
    }
"""

from __future__ import annotations

from typing import Any, Optional

ASPECT_TARGETS: dict[str, tuple[int, int]] = {
    "16:9": (1280, 720),
    "9:16": (1080, 1920),
    "1:1": (1080, 1080),
    "4:5": (1080, 1350),
}

TEASER_TOTAL_CAP = 15.0
TEASER_PER_CLIP_CAP = 4.0
HOOK_BEAT_KEYWORDS = (
    "proof", "reveal", "winning", "hero", "demo", "product", "cta", "result",
)

# Max characters per on-screen caption line (drawtext/ASS both wrap poorly
# beyond this at small-target widths).
CAPTION_MAX_CHARS = 90


# ----------------------------------------------------------------- helpers


def _split_sentences(text: str) -> list[str]:
    parts: list[str] = []
    buf = ""
    for ch in text or "":
        buf += ch
        if ch in ".!?":
            parts.append(buf.strip())
            buf = ""
    if buf.strip():
        parts.append(buf.strip())
    return [p for p in parts if p]


def caption_windows(
    text: str, start: float, end: float, max_lines: int = 3
) -> list[dict]:
    """Split `text` into timed caption lines across [start, end].

    Sentence boundaries first; if more sentences than `max_lines`, the
    tail sentences merge into the last window. Weights follow character
    length so long lines linger longer.
    """
    dur = max(0.1, end - start)
    sentences = _split_sentences(text) or [text.strip()[:CAPTION_MAX_CHARS]]
    if len(sentences) > max_lines:
        head, tail = sentences[: max_lines - 1], sentences[max_lines - 1 :]
        sentences = head + [" ".join(tail)]
    sentences = [s[:CAPTION_MAX_CHARS] for s in sentences]

    weights = [max(1, len(s)) for s in sentences]
    total_w = sum(weights)
    lines: list[dict] = []
    t = start
    for s, w in zip(sentences, weights):
        span = dur * w / total_w
        lines.append(
            {"text": s, "start": round(t, 2), "end": round(min(t + span, end), 2)}
        )
        t += span
    return lines


def _hook_score(shot: dict) -> int:
    beat = (shot.get("beat") or "").lower()
    return sum(1 for kw in HOOK_BEAT_KEYWORDS if kw in beat)


# ----------------------------------------------------------------- plans


def _clips_from_shots(
    ready: list[dict],
    *,
    ordered: bool = False,
    max_dur_per_clip: Optional[float] = None,
    total_cap: Optional[float] = None,
) -> list[dict]:
    shots = ready
    if ordered:
        ranked = sorted(
            enumerate(ready), key=lambda p: (-_hook_score(p[1]), p[0])
        )
        shots = [s for _, s in ranked]
    clips: list[dict] = []
    used = 0.0
    for i, s in enumerate(shots):
        d = float(s.get("duration") or 5)
        if max_dur_per_clip is not None:
            d = min(d, max_dur_per_clip)
        if total_cap is not None:
            d = min(d, max(0.0, total_cap - used))
        if d <= 0:
            break
        used += d
        clips.append(
            {
                "shot_ref": s.get("id") or f"shot_{i}",
                "in": 0.0,
                "out": round(d, 2),
                "order": i,
                "focus_x": 0.5,
                "focus_y": 0.5,
                "max_dur": None,
            }
        )
    return clips


def _caption_lines_for(
    clips: list[dict], shots_by_ref: dict[str, dict]
) -> list[dict]:
    lines: list[dict] = []
    for clip in clips:
        src = shots_by_ref.get(clip["shot_ref"]) or {}
        text = (src.get("voiceover_line") or "").strip() or (
            src.get("beat") or ""
        ).strip()
        if not text:
            continue
        for win in caption_windows(
            text, clip["in"], clip["out"]
        ):
            lines.append({"clip_order": clip["order"], **win})
    return lines


def _base(vid: str, label: str, aspect: str) -> dict:
    w, h = ASPECT_TARGETS[aspect]
    return {
        "id": vid,
        "label": label,
        "aspect": aspect,
        "target": [w, h],
        "fps": 30,
        "reframe": "fill",
        "clips": [],
        "audio": {"mode": "reuse_master", "voice": None, "sfx_volume": 0.35},
        "captions": {
            "method": "auto",
            "font_size_pct": 8,
            "safe_margin_pct": 6,
            "lines": [],
        },
        "overlays": [],
        "duration_cap": None,
    }


def build_default_pack(
    shots: list[dict],
    *,
    cuts: Optional[list[str]] = None,
    customer_aspect: str = "1:1",
    caption_lines: Optional[list[dict]] = None,
    logo_url: Optional[str] = None,
) -> list[dict]:
    """Derive the three ADR-0005 renditions from a thread's ready shots.

    `cuts` ⊆ {"judge","customer","teaser"} — default all three.
    `caption_lines`: planner re-scope, [{cut_id, clip_order, text, start?,
    end?}]; when absent, captions reuse each shot's voiceover_line.
    """
    ready = [s for s in shots if s.get("video_url")]
    if not ready:
        raise ValueError("No shots with video_url — generate videos first.")
    wanted = [c.lower() for c in (cuts or ["judge", "customer", "teaser"])]
    for c in wanted:
        if c not in ("judge", "customer", "teaser"):
            raise ValueError(f"Unknown cut '{c}' — use judge/customer/teaser.")
    if customer_aspect not in ("1:1", "4:5"):
        raise ValueError("customer_aspect must be '1:1' or '4:5'.")

    shots_by_ref = {
        (s.get("id") or f"shot_{i}"): s for i, s in enumerate(ready)
    }
    plans: list[dict] = []

    if "judge" in wanted:
        p = _base("judge_16x9", "Judge cut 16:9 (master)", "16:9")
        p["reframe"] = "pad"
        p["clips"] = _clips_from_shots(ready)
        plans.append(p)

    if "customer" in wanted:
        p = _base(
            f"customer_{customer_aspect.replace(':', 'x')}",
            f"Customer cut {customer_aspect}, captioned",
            customer_aspect,
        )
        p["clips"] = _clips_from_shots(ready)
        overrides = [c for c in (caption_lines or []) if c.get("cut_id") == p["id"]]
        if overrides:
            p["captions"]["lines"] = [
                {
                    "clip_order": c.get("clip_order", 0),
                    "text": str(c.get("text", ""))[:CAPTION_MAX_CHARS],
                    "start": float(c.get("start", 0.0)),
                    "end": float(c.get("end", 0.0)),
                }
                for c in overrides
                if c.get("text")
            ]
        else:
            p["captions"]["lines"] = _caption_lines_for(p["clips"], shots_by_ref)
        if logo_url:
            p["overlays"].append(
                {"kind": "logo", "url": logo_url, "position": "top-right",
                 "size_pct": 12, "t0": None, "t1": None}
            )
        plans.append(p)

    if "teaser" in wanted:
        p = _base("teaser_9x16", "Builder teaser 9:16 ≤15s", "9:16")
        p["clips"] = _clips_from_shots(
            ready, ordered=True,
            max_dur_per_clip=TEASER_PER_CLIP_CAP, total_cap=TEASER_TOTAL_CAP,
        )
        p["duration_cap"] = TEASER_TOTAL_CAP
        p["audio"] = {"mode": "silent", "voice": None, "sfx_volume": 0.35}
        p["captions"]["lines"] = _caption_lines_for(p["clips"], shots_by_ref)
        if logo_url:
            p["overlays"].append(
                {"kind": "logo", "url": logo_url, "position": "top-right",
                 "size_pct": 12, "t0": None, "t1": None}
            )
        plans.append(p)

    return [normalize_plan(p) for p in plans]


# ----------------------------------------------------------------- recap

RECAP_TOTAL_CAP = 90.0
RECAP_PER_CLIP_CAP = 8.0
RECAP_CLIPS_PER_THREAD = 2


def build_recap_plan(
    thread_metas: list[dict],
    *,
    title: str,
    cta_text: Optional[str] = None,
    logo_url: Optional[str] = None,
    aspect: str = "16:9",
) -> dict:
    """One recap plan (60–90s budget) over winner threads' final cuts.

    `thread_metas`: [{thread_id, label, duration}] — duration is the source
    final-cut length (fallback 30s). ≤2 clips per thread, ≤8s each, logo
    overlay first/last, CTA on the final stretch, caption line per clip
    naming the project.
    """
    if not thread_metas:
        raise ValueError("recap needs at least one thread")
    p = _base("recap_16x9" if aspect == "16:9" else f"recap_{aspect.replace(':', 'x')}",
              title or "Recap reel", aspect)
    p["label"] = title or "Recap reel"
    p["reframe"] = "pad"
    p["audio"] = {"mode": "silent", "voice": None, "sfx_volume": 0.35}
    p["duration_cap"] = RECAP_TOTAL_CAP

    clips: list[dict] = []
    lines: list[dict] = []
    used = 0.0
    for meta in thread_metas:
        tid = meta.get("thread_id")
        if not tid:
            raise ValueError("recap thread meta missing thread_id")
        dur = float(meta.get("duration") or 30.0)
        seg = min(RECAP_PER_CLIP_CAP, max(1.0, dur / 2))
        spans = [(0.0, min(seg, dur))]
        if dur >= 12.0 and RECAP_CLIPS_PER_THREAD > 1:
            mid = dur * 0.45
            spans.append((mid, min(mid + seg, dur)))
        label = str(meta.get("label") or tid)[:CAPTION_MAX_CHARS]
        for (a, b) in spans:
            remaining = RECAP_TOTAL_CAP - used
            if remaining <= 0:
                break
            b = min(b, a + remaining)
            if b - a < 0.5:
                continue
            order = len(clips)
            used += b - a
            clips.append(
                {
                    "shot_ref": f"{tid}/final",
                    "in": round(a, 2),
                    "out": round(b, 2),
                    "order": order,
                    "focus_x": 0.5,
                    "focus_y": 0.5,
                    "max_dur": None,
                }
            )
            # Caption times are in source time (stitcher shifts by clip `in`).
            lines.append(
                {
                    "clip_order": order,
                    "text": label,
                    "start": round(a, 2),
                    "end": round(min(a + 3.0, b), 2),
                }
            )
    if not clips:
        raise ValueError("recap plan resolved to zero clips — check thread durations")
    p["clips"] = clips
    p["captions"]["lines"] = lines

    if logo_url:
        p["overlays"].append(
            {"kind": "logo", "url": logo_url, "position": "top-right",
             "size_pct": 12, "t0": 0.0, "t1": round(min(10.0, used), 2)}
        )
        p["overlays"].append(
            {"kind": "logo", "url": logo_url, "position": "top-right",
             "size_pct": 12, "t0": round(max(0.0, used - 10.0), 2), "t1": None}
        )
    if cta_text:
        p["overlays"].append(
            {"kind": "text_cta", "text": cta_text[:CAPTION_MAX_CHARS],
             "position": "bottom-center",
             "t0": round(max(0.0, used - 6.0), 2), "t1": None}
        )
    return normalize_plan(p)


# ----------------------------------------------------------------- validate


def normalize_plan(plan: dict) -> dict:
    """Fill defaults + validate. Raises ValueError on unusable plans."""
    if not plan.get("id"):
        raise ValueError("variant plan needs an id")
    aspect = plan.get("aspect") or "16:9"
    if aspect not in ASPECT_TARGETS:
        raise ValueError(f"unsupported aspect '{aspect}'")
    out = {**_base(str(plan["id"]), str(plan.get("label") or plan["id"]), aspect), **plan}
    out["aspect"] = aspect
    out["target"] = list(ASPECT_TARGETS[aspect]) if not plan.get("target") else list(plan["target"])

    clips = out.get("clips") or []
    if not clips:
        raise ValueError("variant plan has no clips")
    norm_clips = []
    seen_orders: set[int] = set()
    for i, c in enumerate(clips):
        ref = c.get("shot_ref") or c.get("source_ref")
        if not ref:
            raise ValueError(f"clip {i} has no shot_ref/source_ref")
        cin = float(c.get("in") or 0.0)
        cout = c.get("out")
        cout = float(cout) if cout is not None else None
        if cin < 0 or (cout is not None and cout <= cin):
            raise ValueError(f"clip {i}: bad in/out ({cin}, {cout})")
        order = int(c.get("order", i))
        if order in seen_orders:
            raise ValueError(f"clip {i}: duplicate order {order}")
        seen_orders.add(order)
        norm_clips.append(
            {
                "shot_ref": ref,
                "in": round(cin, 3),
                "out": round(cout, 3) if cout is not None else None,
                "order": order,
                "focus_x": float(c.get("focus_x", 0.5) or 0.5),
                "focus_y": float(c.get("focus_y", 0.5) or 0.5),
                "max_dur": c.get("max_dur"),
            }
        )
    norm_clips.sort(key=lambda c: c["order"])
    out["clips"] = norm_clips

    audio = dict(out.get("audio") or {})
    if audio.get("mode") not in ("reuse_master", "silent", "regenerate_vo"):
        audio["mode"] = "reuse_master"
    out["audio"] = {"mode": audio["mode"], "voice": audio.get("voice"),
                    "sfx_volume": float(audio.get("sfx_volume", 0.35) or 0.35)}

    caps = dict(out.get("captions") or {})
    if caps.get("method") not in ("auto", "ass", "drawtext", "sidecar_only"):
        caps["method"] = "auto"
    lines = []
    for ln in caps.get("lines") or []:
        text = str(ln.get("text") or "").strip()
        if not text:
            continue
        lines.append(
            {
                "clip_order": int(ln.get("clip_order", 0)),
                "text": text[:CAPTION_MAX_CHARS],
                "start": float(ln.get("start", 0.0)),
                "end": float(ln.get("end", 0.0)),
            }
        )
    out["captions"] = {
        "method": caps["method"],
        "font_size_pct": float(caps.get("font_size_pct", 8) or 8),
        "safe_margin_pct": float(caps.get("safe_margin_pct", 6) or 6),
        "lines": lines,
    }

    overlays = []
    for ov in out.get("overlays") or []:
        kind = ov.get("kind")
        if kind == "logo" and ov.get("url"):
            overlays.append(
                {"kind": "logo", "url": str(ov["url"]),
                 "position": str(ov.get("position") or "top-right"),
                 "size_pct": float(ov.get("size_pct", 12) or 12),
                 "t0": ov.get("t0"), "t1": ov.get("t1")}
            )
        elif kind == "text_cta" and ov.get("text"):
            overlays.append(
                {"kind": "text_cta", "text": str(ov["text"])[:CAPTION_MAX_CHARS],
                 "position": str(ov.get("position") or "bottom-center"),
                 "t0": ov.get("t0"), "t1": ov.get("t1")}
            )
    out["overlays"] = overlays

    cap_total = out.get("duration_cap")
    out["duration_cap"] = float(cap_total) if cap_total else None
    if out["duration_cap"]:
        total = sum(
            (c["out"] - c["in"]) if c["out"] is not None else 0.0
            for c in out["clips"]
        )
        if total > out["duration_cap"] + 0.01:
            raise ValueError(
                f"clip durations total {total:.1f}s over duration_cap "
                f"{out['duration_cap']:.1f}s — trim the plan"
            )
    return out


def plan_total_duration(plan: dict, assets: dict[str, dict]) -> float:
    """Sum of effective clip durations, resolving open-ended `out` against
    asset durations (or the full asset duration when unknown → cap-less)."""
    total = 0.0
    for c in plan["clips"]:
        asset = assets.get(c["shot_ref"]) or {}
        src_dur = float(asset.get("duration") or 0.0)
        start = c["in"]
        end = c["out"] if c["out"] is not None else src_dur
        if c.get("max_dur") is not None:
            end = min(end, start + float(c["max_dur"]))
        total += max(0.0, end - start)
    cap = plan.get("duration_cap")
    return min(total, float(cap)) if cap else total


# ----------------------------------------------------------------- writers


def _ass_time(t: float) -> str:
    t = max(0.0, t)
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def write_ass(plan: dict) -> str:
    """ASS subtitles for the plan's caption lines, sized to its target."""
    w, h = plan["target"]
    pct = float(plan["captions"].get("font_size_pct", 8) or 8)
    margin = int(h * float(plan["captions"].get("safe_margin_pct", 6) or 6) / 100)
    events = []
    for ln in plan["captions"]["lines"]:
        text = (
            ln["text"]
            .replace("{", "(")
            .replace("}", ")")
            .replace("\n", " ")
        )
        events.append(
            f"Dialogue: 0,{_ass_time(ln['start'])},{_ass_time(ln['end'])},"
            f"Default,,0,0,0,,{text}"
        )
    return (
        "[Script Info]\n"
        "ScriptType: v4.00+\n"
        f"PlayResX: {w}\n"
        f"PlayResY: {h}\n"
        "WrapStyle: 0\n"
        "ScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, "
        "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV\n"
        "Style: Default,DejaVu Sans,"
        f"{int(h * pct / 100)},&H00FFFFFF,&H00101010,1,3,1,2,"
        f"{margin},{margin},{margin}\n\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Text\n"
        + "\n".join(events)
        + "\n"
    )


def _srt_time(t: float) -> str:
    ms = int(round(max(0.0, t) * 1000))
    h, rem = divmod(ms, 3600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def write_srt(plan: dict) -> str:
    blocks = []
    for i, ln in enumerate(plan["captions"]["lines"], 1):
        blocks.append(
            f"{i}\n{_srt_time(ln['start'])} --> {_srt_time(ln['end'])}\n{ln['text']}\n"
        )
    return "\n".join(blocks)


# ----------------------------------------------------------------- records


def new_variant_record(plan: dict) -> dict:
    """Empty (queued) VariantRecord for canvas state, per plan id."""
    rec: dict[str, Any] = {
        "id": plan["id"],
        "label": plan.get("label") or plan["id"],
        "aspect": plan["aspect"],
        "status": "queued",
        "video_url": None,
        "durable_url": None,
        "srt_url": None,
        "final_sha256": None,
        "duration": None,
        "note": None,
        "error": None,
        "plan": plan,
    }
    return rec
