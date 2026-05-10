"""Stitch per-shot Runway clips into one final MP4 with FFmpeg.

Two modes mirror the Runway client:
- LIVE: download each shot's video URL, run `ffmpeg -f concat`, write the
  output to the frontend's `public/exports/` so Next serves it at
  `/exports/<file>.mp4`.
- MOCK: skip ffmpeg entirely, return a deterministic placeholder URL so
  the canvas state + UI can be exercised without ffmpeg or network.

Why write into `apps/frontend/public/exports/`:
  In dev, the agent runs at :8123 (LangGraph) and the frontend at :3000.
  Putting the file inside Next's `public/` is the simplest way to make
  the resulting `<video src=...>` work without standing up a separate
  static server. For production, override `EXPORT_DIR` + `EXPORT_BASE_URL`
  to point at S3 / R2 / a CDN.

The whole thing is sync — same shape as `runway_client.py` — so it slots
into the LangGraph tool worker pool without any async glue.
"""

from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
import tempfile
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


# --------------------------------------------------------------------- paths


def _agent_root() -> Path:
    # apps/agent/src/stitcher.py → apps/agent/
    return Path(__file__).resolve().parent.parent


def _default_export_dir() -> Path:
    # apps/agent/ → apps/ → apps/frontend/public/exports
    return _agent_root().parent / "frontend" / "public" / "exports"


def _export_dir() -> Path:
    override = os.getenv("EXPORT_DIR")
    return Path(override) if override else _default_export_dir()


def _export_base_url() -> str:
    return os.getenv("EXPORT_BASE_URL", "http://localhost:3000/exports").rstrip("/")


# --------------------------------------------------------------------- mode


def stitcher_is_live() -> bool:
    """LIVE iff ffmpeg is on PATH and we're not forced into MOCK."""
    if os.getenv("STITCH_MODE", "").lower() == "mock":
        return False
    return shutil.which("ffmpeg") is not None


def stitcher_mode_label() -> str:
    return "LIVE" if stitcher_is_live() else "MOCK"


# --------------------------------------------------------------------- types


@dataclass
class StitchResult:
    url: str
    mode: str         # "LIVE" | "MOCK"
    duration: int     # seconds
    shot_count: int


# --------------------------------------------------------------------- mock


def _mock_url(shots: list[dict]) -> str:
    # Deterministic placeholder so a re-stitch with the same shots returns
    # the same URL — same UX contract as runway_client._mock_seed.
    seed_input = "|".join(
        f"{s.get('id', '')}:{s.get('video_url', '')}" for s in shots
    )
    seed = hashlib.sha1(seed_input.encode("utf-8")).hexdigest()[:8]
    # Big Buck Bunny on Google's CDN — same clip the per-shot mock uses,
    # so the demo is internally consistent in MOCK mode.
    _ = seed  # kept for parity; the mock URL is fixed
    return "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBigBuckBunny.mp4"


# --------------------------------------------------------------------- live


def _download(url: str, dest: Path) -> None:
    """Download a remote file with a sane timeout. Raises on failure."""
    req = urllib.request.Request(url, headers={"User-Agent": "directors-canvas/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp, open(dest, "wb") as fh:
        shutil.copyfileobj(resp, fh)


def _ffmpeg_concat(inputs: list[Path], output: Path) -> None:
    """Concat a list of MP4s into one MP4 via ffmpeg's concat demuxer.

    Uses `-c copy` (stream copy, no re-encode) when all inputs share
    codecs — fast and lossless. Runway Gen-4 outputs are uniform H.264,
    so this works in practice. If a future shot has a mismatched codec,
    we fall back to a re-encode pass automatically.
    """
    # Build the ffmpeg concat manifest. Paths must be quoted ffmpeg-style.
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".txt", delete=False
    ) as manifest:
        manifest_path = Path(manifest.name)
        for p in inputs:
            # Escape single quotes per ffmpeg concat-demuxer rules.
            escaped = str(p).replace("'", r"'\''")
            manifest.write(f"file '{escaped}'\n")

    try:
        # Fast path: stream copy.
        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", str(manifest_path),
                "-c", "copy",
                "-movflags", "+faststart",
                str(output),
            ],
            capture_output=True,
            text=True,
            timeout=600,
        )
        if result.returncode == 0:
            return

        # Fallback: re-encode if stream copy failed (codec/timebase mismatch).
        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", str(manifest_path),
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-crf", "20",
                "-c:a", "aac",
                "-movflags", "+faststart",
                str(output),
            ],
            capture_output=True,
            text=True,
            timeout=900,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"ffmpeg concat failed:\n{result.stderr[-2000:]}"
            )
    finally:
        try:
            manifest_path.unlink()
        except OSError:
            pass


def _live_stitch(shots: list[dict], slug: str) -> StitchResult:
    """Download every shot's video and concat them into one MP4."""
    export_dir = _export_dir()
    export_dir.mkdir(parents=True, exist_ok=True)

    out_name = f"{slug}-{int(time.time())}.mp4"
    out_path = export_dir / out_name

    with tempfile.TemporaryDirectory(prefix="stitch-") as tmp:
        tmp_dir = Path(tmp)
        local_inputs: list[Path] = []
        for i, s in enumerate(shots):
            url = s.get("video_url")
            if not url:
                continue
            local = tmp_dir / f"shot_{i:03d}.mp4"
            _download(url, local)
            local_inputs.append(local)

        if not local_inputs:
            raise RuntimeError("No shot videos available to stitch.")

        _ffmpeg_concat(local_inputs, out_path)

    duration = sum(int(s.get("duration") or 5) for s in shots if s.get("video_url"))
    url = f"{_export_base_url()}/{out_name}"
    return StitchResult(url=url, mode="LIVE", duration=duration, shot_count=len(shots))


# --------------------------------------------------------------------- public


def _slugify(title: str) -> str:
    keep = "abcdefghijklmnopqrstuvwxyz0123456789-"
    s = "".join(
        c if c in keep else "-"
        for c in (title or "storyboard").lower().strip()
    )
    s = "-".join(filter(None, s.split("-")))
    return s[:48] or "storyboard"


def stitch_storyboard(shots: list[dict], title: str) -> StitchResult:
    """Concat all shots that have a video_url into a single MP4.

    LIVE downloads + ffmpegs; MOCK returns a fixed placeholder URL after
    a tiny sleep so the loading state in the UI is visible during demos.
    """
    ready = [s for s in shots if s.get("video_url")]
    if not ready:
        raise RuntimeError("No shots are ready yet — generate videos first.")

    if stitcher_is_live():
        return _live_stitch(ready, _slugify(title))

    time.sleep(0.6)
    duration = sum(int(s.get("duration") or 5) for s in ready)
    return StitchResult(
        url=_mock_url(ready),
        mode="MOCK",
        duration=duration,
        shot_count=len(ready),
    )


def boot_status() -> str:
    """One-line status for the agent boot log."""
    return f"stitcher: {stitcher_mode_label()}"
