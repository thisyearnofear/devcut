"""Durable media storage via Genblaze → Backblaze B2.

Single source of truth for object storage. All agent modules that need to
persist generated assets (stills, clips, VO, SFX, final cuts) go through
this module — no direct boto3 / Grove / ad-hoc S3 clients.

Uses Genblaze's ``S3StorageBackend.for_backblaze`` + ``ObjectStorageSink``
so assets land with SHA-256 hashing and hierarchical (or content-addressable)
keys plus optional Object Lock on manifests.

Environment:
    GENBLAZE_ENABLED       — "1"/"true"/"yes" to enable (default off)
    B2_KEY_ID              — Backblaze application key ID
    B2_APP_KEY             — Backblaze application key
    B2_BUCKET              — bucket name
    B2_REGION              — e.g. us-west-004 (from bucket endpoint)
    B2_PUBLIC_URL_BASE     — friendly public base, e.g.
                             https://f004.backblazeb2.com/file/my-bucket
    B2_AUTO_LIFECYCLE      — "1" to apply Genblaze lifecycle defaults
    B2_MANIFEST_LOCK_DAYS  — Object Lock retention days for manifests (0=off)
    B2_REQUIRE_DURABLE     — "1" raise on persist failure (demo/golden runs)
    B2_KEY_STRATEGY        — hierarchical (default) | content_addressable
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal, Optional
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


class DurableStorageError(RuntimeError):
    """Raised when B2_REQUIRE_DURABLE=1 and a persist fails or is disabled."""


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


def require_durable() -> bool:
    """Demo/golden runs must not silently keep CDN URLs."""
    return os.getenv("B2_REQUIRE_DURABLE", "").strip().lower() in ("1", "true", "yes")


def _auto_lifecycle() -> bool:
    return os.getenv("B2_AUTO_LIFECYCLE", "1").strip().lower() in ("1", "true", "yes")


def _public_url_base() -> Optional[str]:
    base = os.getenv("B2_PUBLIC_URL_BASE", "").strip().rstrip("/")
    return base or None


def _manifest_lock_config():
    """Optional Object Lock on Genblaze manifests (WORM window)."""
    days_raw = os.getenv("B2_MANIFEST_LOCK_DAYS", "0").strip()
    try:
        days = int(days_raw)
    except ValueError:
        days = 0
    if days <= 0:
        return None
    from genblaze_core import ObjectLockConfig

    return ObjectLockConfig(
        retain_until=datetime.now(timezone.utc) + timedelta(days=days),
        mode="GOVERNANCE",
    )


def _key_strategy(
    strategy: Literal["hierarchical", "content_addressable"] | None = None,
):
    from genblaze_core import KeyStrategy

    name = (strategy or os.getenv("B2_KEY_STRATEGY", "hierarchical").strip().lower())
    if name in ("content_addressable", "ca", "content-addressable"):
        return KeyStrategy.CONTENT_ADDRESSABLE
    return KeyStrategy.HIERARCHICAL


def new_backend():
    """Construct an S3StorageBackend preconfigured for Backblaze B2."""
    from genblaze_s3 import S3StorageBackend

    return S3StorageBackend.for_backblaze(
        public_url_base=_public_url_base(),
        auto_lifecycle=_auto_lifecycle(),
        preflight=True,
    )


def new_sink(
    *,
    strategy: Literal["hierarchical", "content_addressable"] | None = None,
    prefix: str = "genblaze",
):
    """Construct a single-use ObjectStorageSink (closed after put/run).

    Genblaze docs: treat sinks as single-use — construct fresh per operation.

    Default key strategy is hierarchical (browseable runs/). Pass
    ``strategy="content_addressable"`` for dedupe on identical stills/clips.
    """
    from genblaze_core import ObjectStorageSink

    return ObjectStorageSink(
        new_backend(),
        prefix=prefix,
        key_strategy=_key_strategy(strategy),
        manifest_lock=_manifest_lock_config(),
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


def _fail_or_none(reason: str, **fields) -> None:
    _log("ERROR", reason, **fields)
    if require_durable():
        raise DurableStorageError(f"{reason}: {fields.get('err') or fields}")


def persist_url(
    url: str,
    *,
    content_type: str,
    tenant_id: Optional[str] = None,
    strategy: Literal["hierarchical", "content_addressable"] | None = None,
) -> Optional[DurableAsset]:
    """Download (if needed) and upload a remote/local URL to B2.

    Returns None when B2 is disabled or the upload fails (caller keeps
    the original URL), unless ``B2_REQUIRE_DURABLE=1``.
    """
    if not b2_enabled():
        if require_durable():
            raise DurableStorageError(
                "B2_REQUIRE_DURABLE=1 but Genblaze/B2 is not enabled. "
                "Set GENBLAZE_ENABLED=1 and B2_KEY_ID/APP_KEY/BUCKET."
            )
        return None
    if not url:
        return None

    try:
        from genblaze_core import Asset

        # Stills/clips re-runs benefit from content-addressable dedupe by default.
        strat = strategy or "content_addressable"
        asset = Asset(url=_as_fetchable_url(url), media_type=content_type)
        with new_sink(strategy=strat) as sink:
            stored = sink.put_asset(asset, tenant_id=tenant_id or "director")
        return DurableAsset(
            url=stored.url,
            sha256=stored.sha256,
            size_bytes=stored.size_bytes,
            asset_id=stored.asset_id,
        )
    except DurableStorageError:
        raise
    except Exception as exc:  # noqa: BLE001 — soft-fail unless require_durable
        _fail_or_none("persist_url_failed", url=url[:120], err=str(exc))
        return None


def persist_file(
    path: str | Path,
    *,
    content_type: str,
    tenant_id: Optional[str] = None,
    strategy: Literal["hierarchical", "content_addressable"] | None = None,
) -> Optional[DurableAsset]:
    """Upload a local file to B2."""
    return persist_url(
        str(Path(path).resolve()),
        content_type=content_type,
        tenant_id=tenant_id,
        strategy=strategy,
    )


def persist_bytes(
    data: bytes,
    *,
    content_type: str,
    suffix: str,
    tenant_id: Optional[str] = None,
    strategy: Literal["hierarchical", "content_addressable"] | None = None,
) -> Optional[DurableAsset]:
    """Write bytes to a temp file then upload."""
    if not b2_enabled():
        if require_durable():
            raise DurableStorageError(
                "B2_REQUIRE_DURABLE=1 but Genblaze/B2 is not enabled."
            )
        return None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(data)
            tmp_path = Path(tmp.name)
        try:
            return persist_file(
                tmp_path,
                content_type=content_type,
                tenant_id=tenant_id,
                strategy=strategy,
            )
        finally:
            try:
                tmp_path.unlink(missing_ok=True)
            except OSError:
                pass
    except DurableStorageError:
        raise
    except Exception as exc:  # noqa: BLE001
        _fail_or_none("persist_bytes_failed", err=str(exc))
        return None


def sha256_file(path: str | Path) -> str:
    """Compute SHA-256 of a local file (for logging / verification)."""
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def is_durable_url(url: str | None) -> bool:
    """Heuristic: URL looks like Backblaze B2 / configured public base."""
    if not url:
        return False
    u = url.lower()
    if "backblazeb2.com" in u or "b2.cloud" in u:
        return True
    base = _public_url_base()
    if base and u.startswith(base.lower()):
        return True
    return False


def boot_status() -> str:
    """One-line status for the agent boot log."""
    if b2_enabled():
        bucket = os.getenv("B2_BUCKET", "?")
        pub = "public" if _public_url_base() else "signed?"
        lock = os.getenv("B2_MANIFEST_LOCK_DAYS", "0")
        req = "require" if require_durable() else "soft"
        return f"media_storage: B2/{bucket} ({pub}, lock={lock}d, {req})"
    if genblaze_enabled():
        return "media_storage: Genblaze on, B2 not configured"
    return "media_storage: disabled"
