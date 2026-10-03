"""Cross-restart storyboard snapshots → B2.

The in-memory LangGraph runtime wipes all checkpoints on restart, which
makes previously-opened canvases unrestorable. The durable assets already
live in B2 — the missing piece is the small JSON describing them. After
each state-mutating tool completes, we snapshot the restore-relevant
subset of state to ``snapshots/<thread_id>.json`` in the media bucket;
the BFF's /api/thread-state falls back to it when LangGraph 404s.

Snapshots are keyed by the UI-visible thread id (``ui_thread_id`` via
``_billing_thread_id``), never the internal execution-twin id — the BFF
and browser only ever know the UI id.

Snapshots are best-effort telemetry/durability sugar: every failure mode
is swallowed so a storage hiccup can never fail a generation run.
"""

from __future__ import annotations

import json
import threading
import time
from typing import Any, Optional

from .media_storage import b2_enabled, new_backend

# State keys needed to re-render the canvas (mirror of mergeStoryboardState
# on the frontend — everything media/provenance, nothing conversational).
SNAPSHOT_KEYS = (
    "storyboard",
    "shots",
    "selectedShotId",
    "header",
    "final_video_url",
    "durable_url",
    "manifest_uri",
    "job_manifest_uri",
    "job_manifest",
    "final_sha256",
    "canonical_hash",
    "export_status",
    "export_error",
    "builder_kit",
    "variants",
    "brand_kit",
)


def snapshot_key(thread_id: str) -> str:
    return f"snapshots/{thread_id}.json"


def _snapshot_thread_id() -> str:
    from .runway_client import _billing_thread_id, _current_thread_id

    return _billing_thread_id() or _current_thread_id() or ""


def _put_snapshot(thread_id: str, values: dict) -> str:
    backend = new_backend()
    payload = dict(values)
    payload["_thread_id"] = thread_id
    payload["_updated_at"] = time.time()
    key = snapshot_key(thread_id)
    backend.put(key, json.dumps(payload, default=str).encode(), content_type="application/json")
    return backend.get_durable_url(key)


def _inherit_prior(thread_id: str, values: dict) -> dict:
    """Fill restore keys the live state can't provide.

    A restart wipes the LangGraph checkpoint, so a run on a reopened thread
    sees shots=[] and holds nothing else either — publishing that verbatim
    would erase the record the canvas restore and the organizer dashboard
    read, which is the snapshot's whole purpose. Absent keys (not
    explicitly-written-empty ones) come back from the prior object. Only
    reached on healed publishes, so healthy runs never pay for the GET.
    """
    from .recap_sources import fetch_thread_snapshot

    prior = fetch_thread_snapshot(thread_id) or {}
    for key in SNAPSHOT_KEYS:
        if not values.get(key) and prior.get(key):
            values[key] = prior[key]
    return values


def _safe_put(thread_id: str, values: dict, partial: bool = False) -> None:
    try:
        if partial or not values.get("shots"):
            values = _inherit_prior(thread_id, values)
        url = _put_snapshot(thread_id, values)
        from .media_storage import _log

        _log("INFO", "state_snapshot_saved", thread_id=thread_id, url=url[:120])
    except Exception as exc:  # noqa: BLE001 — never break a run for this
        try:
            from .media_storage import _log

            _log("WARN", "state_snapshot_failed", thread_id=thread_id, err=str(exc)[:200])
        except Exception:
            pass


def save_snapshot_async(
    update: dict, state: Optional[dict] = None, partial: bool = False
) -> None:
    """Fire-and-forget snapshot of the restore-relevant state subset.

    ``update`` is the tool's outgoing Command(update=…) payload; ``state``
    (when the tool injected it) provides keys the update didn't touch.
    ``partial`` marks a run that started from a wiped checkpoint and healed
    itself, so the keys it never saw must be inherited from the prior object.
    """
    try:
        if not b2_enabled():
            return
        base = state if isinstance(state, dict) else {}
        merged: dict[str, Any] = {}
        for key in SNAPSHOT_KEYS:
            if key in update:
                merged[key] = update[key]
            elif base.get(key):
                # Truthy, not `is not None`: after a restart wipes the
                # checkpoint, state carries shots=[] — writing that over a
                # good snapshot would destroy the thread record.
                merged[key] = base.get(key)
        if not merged:
            return
        tid = _snapshot_thread_id()
        if not tid:
            return
        threading.Thread(
            target=_safe_put, args=(tid, merged, partial), daemon=True
        ).start()
    except Exception:  # noqa: BLE001
        pass
