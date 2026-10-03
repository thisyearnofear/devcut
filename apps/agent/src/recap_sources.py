"""Cross-thread asset resolution for recap reels (ADR-0005 Phase 3).

Recap sources are other threads' B2 state snapshots — the same public
`snapshots/<tid>.json` objects the organizer dashboard and the BFF
thread-state fallback already read. The agent has no DB access; HTTP GET
against the public bucket base is the whole plumbing (mirrors
`apps/bff/src/organizer.ts`).

Source refs in a recap plan look like `"<thread_id>/<shot_id>"`, or
`"<thread_id>/final"` for the thread's stitched master.
"""

from __future__ import annotations

import json
import urllib.request
from typing import Any, Optional


def _snapshot_url(thread_id: str) -> Optional[str]:
    from .media_storage import _public_url_base

    base = _public_url_base()
    if not base:
        return None
    from .state_snapshots import snapshot_key

    return f"{base}/{snapshot_key(thread_id)}"


def fetch_thread_snapshot(thread_id: str) -> Optional[dict]:
    """Best-effort GET of another thread's snapshot; None if unavailable."""
    url = _snapshot_url(thread_id)
    if not url:
        return None
    req = urllib.request.Request(url, headers={"User-Agent": "devcut-agent/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except Exception:  # noqa: BLE001 — cross-thread reads are advisory
        return None


def collect_assets(
    thread_ids: list[str], *, fetch=fetch_thread_snapshot
) -> tuple[dict[str, dict], dict[str, dict]]:
    """Resolve thread ids → (assets, thread_meta).

    assets: source_ref → {video_url, voiceover_url, sfx_url, duration, beat}
            (only shots that have a video_url) plus "<tid>/final".
    thread_meta: thread_id → {title, final_video_url, durable_url,
                              brand_kit, shots_total}
    Threads whose snapshot can't be fetched are skipped silently; the
    caller reports how many resolved.
    """
    assets: dict[str, dict] = {}
    meta: dict[str, dict] = {}
    for tid in thread_ids:
        snap = fetch(tid)
        if not snap:
            continue
        storyboard = snap.get("storyboard") or {}
        meta[tid] = {
            "title": storyboard.get("title") or tid,
            "final_video_url": snap.get("final_video_url"),
            "durable_url": snap.get("durable_url"),
            "brand_kit": snap.get("brand_kit"),
            "shots_total": len(snap.get("shots") or []),
        }
        final_url = snap.get("durable_url") or snap.get("final_video_url")
        if final_url:
            assets[f"{tid}/final"] = {
                "video_url": final_url,
                "voiceover_url": None,
                "sfx_url": None,
                "duration": sum(
                    int(s.get("duration") or 5)
                    for s in (snap.get("shots") or [])
                    if s.get("video_url")
                ),
                "beat": "master",
            }
        for i, s in enumerate(snap.get("shots") or []):
            if not s.get("video_url"):
                continue
            sid = s.get("id") or f"shot_{i}"
            assets[f"{tid}/{sid}"] = {
                "video_url": s["video_url"],
                "voiceover_url": s.get("voiceover_url"),
                "sfx_url": s.get("sfx_url"),
                "duration": float(s.get("duration") or 5),
                "beat": s.get("beat") or "",
            }
    return assets, meta


def brand_logo_url(brand_kit: Optional[dict]) -> Optional[str]:
    """Sponsor logo URL from a challenge thread's brand kit, if present."""
    if not isinstance(brand_kit, dict):
        return None
    for key in ("logo_url", "sponsor_logo_url"):
        val = brand_kit.get(key)
        if isinstance(val, str) and val.startswith("http"):
            return val
    sponsors = brand_kit.get("sponsors")
    if isinstance(sponsors, list):
        for sp in sponsors:
            if isinstance(sp, dict):
                for key in ("logo_url", "logo"):
                    val = sp.get(key)
                    if isinstance(val, str) and val.startswith("http"):
                        return val
    return None
