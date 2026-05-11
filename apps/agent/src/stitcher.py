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


# Cache the ffmpeg lookup at import time. shutil.which() calls os.access
# internally, which is a blocking syscall — calling it from an async
# context (e.g. a LangGraph middleware's before_agent hook) trips
# blockbuster's BlockingError under `langgraph dev`. The result doesn't
# change at runtime, so caching is both correct and faster.
_FFMPEG_AVAILABLE = shutil.which("ffmpeg") is not None


def stitcher_is_live() -> bool:
    """LIVE iff ffmpeg is on PATH and we're not forced into MOCK."""
    if os.getenv("STITCH_MODE", "").lower() == "mock":
        return False
    return _FFMPEG_AVAILABLE


def stitcher_mode_label() -> str:
    return "LIVE" if stitcher_is_live() else "MOCK"


# --------------------------------------------------------------------- types


@dataclass
class StitchResult:
    url: str
    mode: str         # "LIVE" | "MOCK"
    duration: int     # seconds
    shot_count: int
    grove_uri: Optional[str] = None  # set when Grove upload succeeds


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


def _ffmpeg_mux_audio(
    video_in: Path,
    voiceover_path: Optional[Path],
    sfx_path: Optional[Path],
    duration: float,
    output: Path,
) -> None:
    """Mux a voiceover and/or SFX bed onto a single shot's video.

    The video's own audio (if any — Runway Gen-4.5 outputs are typically
    silent) is replaced. The mix is:
      voiceover at 1.0 (full level)
      sfx at 0.35 (sits underneath the voice)

    When both inputs are present we use `amix=inputs=2`. When only one is
    present, that single track is mapped directly. When neither is
    present, this function should not be called — callers must check.
    The output is trimmed / padded to `duration` seconds so the concat
    later doesn't desync.
    """
    inputs: list[str] = ["-i", str(video_in)]
    audio_inputs: list[tuple[str, float]] = []  # (label, volume)
    if voiceover_path:
        inputs += ["-i", str(voiceover_path)]
        audio_inputs.append((f"{len(audio_inputs) + 1}:a", 1.0))
    if sfx_path:
        inputs += ["-i", str(sfx_path)]
        audio_inputs.append((f"{len(audio_inputs) + 1}:a", 0.35))

    if not audio_inputs:
        # Caller guard — keep the function safe to call.
        shutil.copyfile(video_in, output)
        return

    if len(audio_inputs) == 1:
        label, volume = audio_inputs[0]
        filter_complex = f"[{label}]volume={volume},apad=whole_dur={duration}[aout]"
    else:
        # Volume + amix the two tracks, then pad/trim to the shot duration.
        parts = []
        for i, (label, volume) in enumerate(audio_inputs):
            parts.append(f"[{label}]volume={volume}[a{i}]")
        amix_inputs = "".join(f"[a{i}]" for i in range(len(audio_inputs)))
        parts.append(
            f"{amix_inputs}amix=inputs={len(audio_inputs)}:duration=longest:dropout_transition=0,"
            f"apad=whole_dur={duration}[aout]"
        )
        filter_complex = ";".join(parts)

    cmd = [
        "ffmpeg",
        "-y",
        *inputs,
        "-filter_complex", filter_complex,
        "-map", "0:v:0",
        "-map", "[aout]",
        "-t", f"{duration}",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        "-movflags", "+faststart",
        str(output),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        # Fallback: re-encode video too (some Runway clips have non-standard
        # streams that copy-mux refuses).
        cmd_reencode = list(cmd)
        # Replace `-c:v copy` with a real encoder
        v_idx = cmd_reencode.index("copy", cmd_reencode.index("-c:v"))
        cmd_reencode[v_idx] = "libx264"
        cmd_reencode.insert(v_idx + 1, "-preset")
        cmd_reencode.insert(v_idx + 2, "veryfast")
        cmd_reencode.insert(v_idx + 3, "-crf")
        cmd_reencode.insert(v_idx + 4, "20")
        result2 = subprocess.run(
            cmd_reencode, capture_output=True, text=True, timeout=600
        )
        if result2.returncode != 0:
            raise RuntimeError(
                f"ffmpeg audio mux failed:\n{result2.stderr[-2000:]}"
            )


def _ffmpeg_concat(
    inputs: list[Path],
    output: Path,
    force_reencode: bool = False,
) -> None:
    """Concat a list of MP4s into one MP4 via ffmpeg's concat demuxer.

    Uses `-c copy` (stream copy, no re-encode) when all inputs share
    codecs — fast and lossless. Runway Gen-4 outputs are uniform H.264,
    so this works in practice. If a future shot has a mismatched codec,
    we fall back to a re-encode pass automatically.

    When `force_reencode=True` (set by the caller when some shots had
    audio muxed in and others didn't), we skip the stream-copy fast
    path entirely — mixing copy and encode for audio almost never works.
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
        if not force_reencode:
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
    """Download every shot's video, mux per-shot audio, then concat.

    Per-shot pipeline (only when audio is present on the shot):
      1. download video → shot_NNN.mp4
      2. download voiceover (if shot.voiceover_url) → shot_NNN_vo.mp3
      3. download SFX (if shot.sfx_url) → shot_NNN_sfx.mp3
      4. ffmpeg mux video + audio → shot_NNN_mixed.mp4
      5. use the mixed file for concat instead of the raw video.

    Shots with no audio fall through to the raw video — concat handles
    a mix of audio-bearing and silent inputs by re-encoding when needed.
    """
    export_dir = _export_dir()
    export_dir.mkdir(parents=True, exist_ok=True)

    out_name = f"{slug}-{int(time.time())}.mp4"
    out_path = export_dir / out_name

    with tempfile.TemporaryDirectory(prefix="stitch-") as tmp:
        tmp_dir = Path(tmp)
        local_inputs: list[Path] = []
        any_audio = False
        for i, s in enumerate(shots):
            url = s.get("video_url")
            if not url:
                continue
            local_video = tmp_dir / f"shot_{i:03d}.mp4"
            _download(url, local_video)

            # Audio side-channels (optional per-shot)
            vo_path: Optional[Path] = None
            sfx_path: Optional[Path] = None
            if s.get("voiceover_url"):
                vo_path = tmp_dir / f"shot_{i:03d}_vo.mp3"
                try:
                    _download(s["voiceover_url"], vo_path)
                except Exception:  # noqa: BLE001
                    vo_path = None
            if s.get("sfx_url"):
                sfx_path = tmp_dir / f"shot_{i:03d}_sfx.mp3"
                try:
                    _download(s["sfx_url"], sfx_path)
                except Exception:  # noqa: BLE001
                    sfx_path = None

            if vo_path or sfx_path:
                any_audio = True
                mixed = tmp_dir / f"shot_{i:03d}_mixed.mp4"
                _ffmpeg_mux_audio(
                    video_in=local_video,
                    voiceover_path=vo_path,
                    sfx_path=sfx_path,
                    duration=float(s.get("duration") or 5),
                    output=mixed,
                )
                local_inputs.append(mixed)
            else:
                local_inputs.append(local_video)

        if not local_inputs:
            raise RuntimeError("No shot videos available to stitch.")

        _ffmpeg_concat(local_inputs, out_path, force_reencode=any_audio)

    duration = sum(int(s.get("duration") or 5) for s in shots if s.get("video_url"))

    # Return the local export URL immediately so the frontend unblocks.
    # Grove upload runs in a daemon thread — grove_uri is set on the result
    # object once the upload completes (runway_tools reads it back).
    local_url = f"{_export_base_url()}/{out_name}"
    result = StitchResult(url=local_url, mode="LIVE", duration=duration, shot_count=len(shots))

    if os.getenv("GROVE_ENABLED", "").lower() in ("1", "true", "yes"):
        import threading
        from .grove_client import upload_to_grove

        def _grove_upload() -> None:
            try:
                grove = upload_to_grove(out_path, content_type="video/mp4")
                if grove:
                    result.url = grove.gateway_url
                    result.grove_uri = grove.uri
            except Exception:  # noqa: BLE001
                pass  # grove failure is non-fatal; local URL already set

        t = threading.Thread(target=_grove_upload, daemon=True, name="grove-upload")
        t.start()
        # Give Grove up to 30 s to finish before the caller reads the result.
        # This keeps the happy path fast while still surfacing the URI when
        # the upload is quick (typical for small MP4s on a fast VPS).
        t.join(timeout=30)

    return result


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
