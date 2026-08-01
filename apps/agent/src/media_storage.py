"""Durable media storage via Genblaze → Backblaze B2.

Single source of truth for object storage. All agent modules that need to
persist generated assets (stills, clips, VO, SFX, final cuts) go through
this module — no direct boto3 / Grove / ad-hoc S3 clients.

Uses Genblaze's ``S3StorageBackend.for_backblaze`` + ``ObjectStorageSink``
so assets land with SHA-256 hashing and hierarchical keys:

    {prefix}/runs/{tenant}/{date}/{run_id}/assets/{asset_id}.ext

Environment:
    GENBLAZE_ENABLED  — "1"/"true"/"yes" to enable (default off)
    B2_KEY_ID         — Backblaze application key ID
    B2_APP_KEY        — Backblaze application key
    B2_BUCKET         — bucket name
    B2_REGION         — e.g. us-west-004 (from bucket endpoint)
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse


def _log(level: str, msg: str, **fields) -> None:
    record = {"ts": time.time(), "level": level, "logger": "media_storage", "msg": msg}
    record.update(fields)
    print(json.dumps(record), flush=True)


@dataclass(frozen=True)
class DurableAsset:
    """Result of persisting bytes to B2."""

    url: str
    sha256: Optional[str] = None
    size_bytes: Optional[int] = None
    asset_id: Optional[str] = None


def genblaze_enabled() -> bool:
    """True when Genblaze/B2 storage is opted in via env."""
    return os.getenv("GENBLAZE_ENABLED", "").strip().lower() in ("1", "true", "yes")


def b2_configured() -> bool:
    """True when the minimum B2 credentials + bucket are present."""
    return bool(
        os.getenv("B2_KEY_ID", "").strip()
        and os.getenv("B2_APP_KEY", "").strip()
        and os.getenv("B2_BUCKET", "").strip()
    )


def b2_enabled() -> bool:
    """Storage is live when Genblaze is enabled and B2 creds exist."""
    if not genblaze_enabled():
        return False
    if not b2_configured():
        if genblaze_enabled() and not os.getenv("B2_BUCKET", "").strip():
            _log("WARN", "b2_bucket_missing")
        return False
    return True


def new_sink():
    """Construct a single-use ObjectStorageSink (closed after put/run).

    Genblaze docs: treat sinks as single-use — construct fresh per operation.
    """
    from genblaze_core import KeyStrategy, ObjectStorageSink
    from genblaze_s3 import S3StorageBackend

    return ObjectStorageSink(
        S3StorageBackend.for_backblaze(),  # reads B2_* from env
        key_strategy=KeyStrategy.HIERARCHICAL,
    )


def _as_fetchable_url(path_or_url: str | Path) -> str:
    """Normalize a local path or remote URL into something AssetTransfer can fetch."""
    s = str(path_or_url)
    parsed = urlparse(s)
    if parsed.scheme in ("http", "https", "file"):
        return s
    path = Path(s).resolve()
    if not path.exists():
        raise FileNotFoundError(f"media_storage: path not found: {path}")
    return path.as_uri()


def persist_url(
    url: str,
    *,
    content_type: str,
    tenant_id: Optional[str] = None,
) -> Optional[DurableAsset]:
    """Download (if needed) and upload a remote/local URL to B2.

    Returns None when B2 is disabled or the upload fails (caller keeps
    the original URL).
    """
    if not b2_enabled():
        return None
    if not url:
        return None

    try:
        from genblaze_core import Asset

        asset = Asset(url=_as_fetchable_url(url), media_type=content_type)
        with new_sink() as sink:
            stored = sink.put_asset(asset, tenant_id=tenant_id or "director")
        return DurableAsset(
            url=stored.url,
            sha256=stored.sha256,
            size_bytes=stored.size_bytes,
            asset_id=stored.asset_id,
        )
    except Exception as exc:  # noqa: BLE001 — storage failure must not block generation
        _log("ERROR", "persist_url_failed", url=url[:120], err=str(exc))
        return None


def persist_file(
    path: str | Path,
    *,
    content_type: str,
    tenant_id: Optional[str] = None,
) -> Optional[DurableAsset]:
    """Upload a local file to B2. Soft-fails to None when disabled/error."""
    return persist_url(
        str(Path(path).resolve()),
        content_type=content_type,
        tenant_id=tenant_id,
    )


def persist_bytes(
    data: bytes,
    *,
    content_type: str,
    suffix: str,
    tenant_id: Optional[str] = None,
) -> Optional[DurableAsset]:
    """Write bytes to a temp file then upload. Soft-fails to None."""
    if not b2_enabled():
        return None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(data)
            tmp_path = Path(tmp.name)
        try:
            return persist_file(tmp_path, content_type=content_type, tenant_id=tenant_id)
        finally:
            try:
                tmp_path.unlink(missing_ok=True)
            except OSError:
                pass
    except Exception as exc:  # noqa: BLE001
        _log("ERROR", "persist_bytes_failed", err=str(exc))
        return None


def sha256_file(path: str | Path) -> str:
    """Compute SHA-256 of a local file (for logging / verification)."""
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def boot_status() -> str:
    """One-line status for the agent boot log."""
    if b2_enabled():
        bucket = os.getenv("B2_BUCKET", "?")
        return f"media_storage: B2/{bucket}"
    if genblaze_enabled():
        return "media_storage: Genblaze on, B2 not configured"
    return "media_storage: disabled"
