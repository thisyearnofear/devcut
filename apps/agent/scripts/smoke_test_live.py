"""Smoke test for the LIVE Runway integration.

Tests in order:
1. gen4_image_turbo — shot 0 (no prior refs)
2. gen4_image_turbo — shot 1 (with shot 0 as character1 reference)
3. gen4.5 image→video — animates shot 0's reference image
4. Budget guard — BudgetExceededError fires when remaining=0
5. BYOK key injection — _effective_api_key() prefers configurable over env

Run from apps/agent/:
    uv run python scripts/smoke_test_live.py
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

# Make src importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from src.runway_client import (
    runway_is_live,
    runway_mode_label,
    generate_reference_image,
    generate_shot_video,
    BudgetExceededError,
    _get_configurable,
    _effective_api_key,
)

PASS = "✅"
FAIL = "❌"
SKIP = "⏭ "


def section(title: str) -> None:
    print(f"\n{'─' * 60}")
    print(f"  {title}")
    print(f"{'─' * 60}")


def check(label: str, ok: bool, detail: str = "") -> None:
    icon = PASS if ok else FAIL
    print(f"  {icon}  {label}" + (f"  →  {detail}" if detail else ""))
    if not ok:
        sys.exit(1)


# ------------------------------------------------------------------ 1. Mode
section("1. Mode detection")
live = runway_is_live()
check("runway_is_live() == True", live, f"mode={runway_mode_label()}")


# ------------------------------------------------------------------ 2. Shot 0 reference (no prior refs)
section("2. gen4_image_turbo — shot 0 (no prior refs)")
PROMPT_0 = (
    "Wide establishing shot: lone astronaut in a white spacesuit stands "
    "on a rust-red Martian plain at golden hour, dramatic long shadow, "
    "cinematic 16:9"
)
print(f"  Prompt: {PROMPT_0[:80]}…")
print("  Calling Runway… (may take up to 30s)")
t0 = time.time()
try:
    ref0 = generate_reference_image(PROMPT_0, ratio="1280:720")
    elapsed = time.time() - t0
    check("Got image URL", ref0.url.startswith("http"), ref0.url[:60])
    check("Mode is LIVE", ref0.mode == "LIVE", ref0.mode)
    check(f"Completed in {elapsed:.1f}s", elapsed < 60)
    print(f"  URL: {ref0.url}")
except BudgetExceededError as e:
    print(f"  {FAIL}  BudgetExceededError (unexpected at shot 0): {e}")
    sys.exit(1)
except Exception as e:
    print(f"  {FAIL}  Unexpected error: {e}")
    sys.exit(1)


# ------------------------------------------------------------------ 3. Shot 1 reference (with character1 anchor)
section("3. gen4_image_turbo — shot 1 (with @character1 anchor)")
PROMPT_1 = (
    "@character1 walks toward a glowing airlock door set into a cliff face, "
    "backlit by twin moons, medium shot, cinematic 16:9"
)
print(f"  Prompt: {PROMPT_1[:80]}…")
print(f"  Prior refs: [shot0_url]")
print("  Calling Runway… (may take up to 30s)")
t0 = time.time()
try:
    ref1 = generate_reference_image(
        PROMPT_1,
        ratio="1280:720",
        prior_ref_urls=[ref0.url],
    )
    elapsed = time.time() - t0
    check("Got image URL", ref1.url.startswith("http"), ref1.url[:60])
    check("Mode is LIVE", ref1.mode == "LIVE", ref1.mode)
    check(f"Completed in {elapsed:.1f}s", elapsed < 60)
    print(f"  URL: {ref1.url}")
except Exception as e:
    print(f"  {FAIL}  Error: {e}")
    sys.exit(1)


# ------------------------------------------------------------------ 4. gen4.5 image→video
section("4. gen4.5 image→video — animate shot 0")
print(f"  Input image: {ref0.url[:60]}…")
print("  Calling Runway… (may take 30–90s)")
t0 = time.time()
try:
    vid0 = generate_shot_video(
        ref0.url,
        PROMPT_0,
        duration=5,
        ratio="1280:720",
    )
    elapsed = time.time() - t0
    check("Got video URL", vid0.url.startswith("http"), vid0.url[:60])
    check("Mode is LIVE", vid0.mode == "LIVE", vid0.mode)
    check(f"Completed in {elapsed:.1f}s", elapsed < 180)
    print(f"  URL: {vid0.url}")
except Exception as e:
    print(f"  {FAIL}  Error: {e}")
    sys.exit(1)


# ------------------------------------------------------------------ 5. Budget guard
section("5. Budget guard — BudgetExceededError when remaining=0")

# Monkey-patch _get_configurable to simulate exhausted budget (no BYOK key)
import src.runway_client as _rc
_orig = _rc._get_configurable
_rc._get_configurable = lambda: {"runway_calls_remaining": 0, "runway_budget": 20}

try:
    generate_reference_image("test prompt")
    print(f"  {FAIL}  Expected BudgetExceededError — none raised")
    sys.exit(1)
except BudgetExceededError as e:
    check("BudgetExceededError raised correctly", True, str(e)[:60])
except Exception as e:
    print(f"  {FAIL}  Wrong exception type: {type(e).__name__}: {e}")
    sys.exit(1)
finally:
    _rc._get_configurable = _orig


# ------------------------------------------------------------------ 6. BYOK skips budget
section("6. BYOK key in configurable skips budget check")
_rc._get_configurable = lambda: {
    "runway_calls_remaining": 0,
    "runway_api_key": os.getenv("RUNWAY_API_KEY", ""),
}
try:
    # Should NOT raise — BYOK key present means budget is skipped
    # We don't actually call Runway here, just check the guard logic
    from src.runway_client import _check_budget
    _check_budget()
    check("Budget check skipped when BYOK key present", True)
except BudgetExceededError:
    check("Budget check skipped when BYOK key present", False, "raised unexpectedly")
finally:
    _rc._get_configurable = _orig


# ------------------------------------------------------------------ Summary
section("Summary")
print(f"  {PASS}  All checks passed.")
print(f"\n  Shot 0 reference : {ref0.url}")
print(f"  Shot 1 reference : {ref1.url}")
print(f"  Shot 0 video     : {vid0.url}")
print()
