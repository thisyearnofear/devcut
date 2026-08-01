#!/usr/bin/env python3
"""Smoke-check Genblaze + B2 wiring without burning Runway credits.

Usage:
  # Offline (default) — asserts soft-disable path
  uv run python scripts/smoke_genblaze_b2.py

  # With B2 configured — uploads a tiny fixture and prints the durable URL
  GENBLAZE_ENABLED=1 B2_KEY_ID=... B2_APP_KEY=... B2_BUCKET=... \\
    uv run python scripts/smoke_genblaze_b2.py --upload
"""

from __future__ import annotations

import argparse
import os
import sys
import tempfile
from pathlib import Path

# Allow `uv run python scripts/...` from apps/agent
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--upload",
        action="store_true",
        help="Upload a tiny text fixture to B2 via media_storage",
    )
    args = parser.parse_args()

    from src.media_storage import b2_enabled, boot_status, persist_file
    from src.genblaze_bridge import boot_status as genblaze_boot, _cap_duration

    print("media_storage:", boot_status())
    print("genblaze:     ", genblaze_boot())
    print("cap gen4_turbo 7 →", _cap_duration(7, "gen4_turbo"))

    if not args.upload:
        if b2_enabled():
            print("NOTE: B2 is enabled but --upload not passed; skipping write.")
        else:
            print("OK: soft-disable path (set GENBLAZE_ENABLED=1 + B2_* and --upload to test)")
        return 0

    if not b2_enabled():
        print("ERROR: B2 not enabled. Set GENBLAZE_ENABLED=1 and B2_KEY_ID/APP_KEY/BUCKET.")
        return 1

    with tempfile.NamedTemporaryFile(suffix=".txt", delete=False, mode="w") as tmp:
        tmp.write("director-canvas genblaze+b2 smoke\n")
        path = Path(tmp.name)

    try:
        result = persist_file(
            path,
            content_type="text/plain",
            tenant_id="smoke-test",
        )
    finally:
        path.unlink(missing_ok=True)

    if not result:
        print("ERROR: persist_file returned None")
        return 1

    print("OK: uploaded", result.url)
    if result.sha256:
        print("sha256:", result.sha256)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
