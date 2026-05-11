"""Grove storage client — upload files to Lens Grove for permanent URLs.

Grove is Lens's onchain-controlled storage layer backed by IPFS.
Uploaded files are publicly readable and permanently accessible via the
Grove gateway at https://api.grove.storage/<uri_hash>.

Usage:
    from .grove_client import upload_to_grove, grove_gateway_url

    result = upload_to_grove(path="/tmp/final_cut.mp4", content_type="video/mp4")
    if result:
        print(result.gateway_url)   # https://api.grove.storage/<hash>
        print(result.uri)           # lens://...

Environment variables:
    GROVE_CHAIN_ID   — EVM chain ID for the immutable ACL.
                       232  = Lens mainnet (default)
                       37111 = Lens Sepolia testnet
    GROVE_ENABLED    — set to "0" to disable Grove and fall back to
                       EXPORT_BASE_URL (useful in dev / CI).
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import requests

logger = logging.getLogger(__name__)

_GROVE_API = "https://api.grove.storage"
_DEFAULT_CHAIN_ID = 232  # Lens mainnet


def _log(level: str, msg: str, **fields) -> None:
    record = {"ts": time.time(), "level": level, "logger": "grove_client", "msg": msg}
    record.update(fields)
    print(json.dumps(record), flush=True)


@dataclass
class GroveUploadResult:
    uri: str           # lens://... or grove://... URI
    gateway_url: str   # https://api.grove.storage/<hash> — directly usable in <video>
    size_bytes: int
    chain_id: int


def grove_enabled() -> bool:
    return os.getenv("GROVE_ENABLED", "1").strip() not in ("0", "false", "no")


def _chain_id() -> int:
    return int(os.getenv("GROVE_CHAIN_ID", str(_DEFAULT_CHAIN_ID)))


def upload_to_grove(
    path: str | Path,
    content_type: str = "video/mp4",
    timeout: int = 120,
) -> Optional[GroveUploadResult]:
    """Upload a local file to Grove and return a permanent gateway URL.

    Returns None if Grove is disabled or the upload fails (caller should
    fall back to EXPORT_BASE_URL).
    """
    if not grove_enabled():
        _log("INFO", "grove_disabled", reason="GROVE_ENABLED=0")
        return None

    file_path = Path(path)
    if not file_path.exists():
        _log("ERROR", "grove_upload_error", reason="file_not_found", path=str(path))
        return None

    chain_id = _chain_id()
    size = file_path.stat().st_size
    _log("INFO", "grove_upload_start", path=str(file_path.name), size_bytes=size, chain_id=chain_id)

    t0 = time.time()
    try:
        with open(file_path, "rb") as fh:
            resp = requests.post(
                f"{_GROVE_API}/",
                params={"chain_id": chain_id},
                headers={"Content-Type": content_type},
                data=fh,
                timeout=timeout,
            )

        if resp.status_code not in (200, 201, 202):
            _log(
                "ERROR",
                "grove_upload_error",
                status=resp.status_code,
                body=resp.text[:300],
                elapsed_s=round(time.time() - t0, 2),
            )
            return None

        data = resp.json()
        # Grove returns {"uri": "lens://...", ...} or {"storageKey": "..."}
        uri = data.get("uri") or data.get("storageKey") or ""
        if not uri:
            _log("ERROR", "grove_upload_error", reason="no_uri_in_response", body=str(data)[:300])
            return None

        # Derive the gateway URL from the URI hash
        # lens://Qm... → https://api.grove.storage/Qm...
        # grove://Qm... → same
        uri_hash = uri.split("://", 1)[-1].lstrip("/")
        gateway_url = f"{_GROVE_API}/{uri_hash}"

        elapsed = round(time.time() - t0, 2)
        _log(
            "INFO",
            "grove_upload_done",
            uri=uri,
            gateway_url=gateway_url,
            size_bytes=size,
            elapsed_s=elapsed,
        )
        return GroveUploadResult(
            uri=uri,
            gateway_url=gateway_url,
            size_bytes=size,
            chain_id=chain_id,
        )

    except requests.Timeout:
        _log("ERROR", "grove_upload_error", reason="timeout", elapsed_s=round(time.time() - t0, 2))
        return None
    except Exception as exc:
        _log("ERROR", "grove_upload_error", reason=str(exc), elapsed_s=round(time.time() - t0, 2))
        return None


def grove_gateway_url(uri: str) -> str:
    """Convert a grove:// or lens:// URI to a direct HTTPS gateway URL."""
    uri_hash = uri.split("://", 1)[-1].lstrip("/")
    return f"{_GROVE_API}/{uri_hash}"
