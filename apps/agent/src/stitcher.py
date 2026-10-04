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
  static server. When Genblaze/B2 is enabled, the final MP4 is also
  uploaded to Backblaze B2 and `durable_url` / `manifest_uri` are set
  for permanent playback and provenance.

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
    durable_url: Optional[str] = None   # B2 durable URL when upload succeeds
    manifest_uri: Optional[str] = None  # Genblaze clip provenance (last shot)
    job_manifest_uri: Optional[str] = None  # DevCut job-level provenance JSON
    final_sha256: Optional[str] = None
    local_path: Optional[str] = None
    srt_url: Optional[str] = None       # caption sidecar when burned-in unavailable


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
    out_name = f"{slug}-{int(time.time())}.mp4"

    # The working file lives in a temp dir: genblaze's path-containment
    # policy only allows file:// roots under temp dirs, so persisting a
    # file from public/exports/ is refused. We stitch in temp, upload to
    # B2 from there, and only copy into exports/ as a dev fallback when
    # B2 is disabled.
    with tempfile.TemporaryDirectory(prefix="stitch-") as tmp:
        tmp_dir = Path(tmp)
        out_path = tmp_dir / out_name
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

        return _persist_output(out_path, out_name, duration, len(shots))


def _persist_output(
    out_path: Path, out_name: str, duration: int, shot_count: int
) -> StitchResult:
    """Hash + upload (B2) or dev-fallback-copy a rendered MP4.

    Shared by the concat path (`_live_stitch`) and the plan path
    (`stitch_plan`). Must be called while `out_path` still exists.
    """
    from .media_storage import b2_enabled, persist_file, require_durable, sha256_file
    from .media_storage import DurableStorageError
    from .runway_client import _billing_thread_id

    final_sha256 = sha256_file(out_path)
    tenant = _billing_thread_id() or "director"

    stored = None
    if b2_enabled():
        stored = persist_file(
            out_path,
            content_type="video/mp4",
            tenant_id=tenant,
            strategy="hierarchical",
        )
        if not stored and require_durable():
            raise DurableStorageError(
                "B2_REQUIRE_DURABLE=1 but final cut upload returned None"
            )
    elif require_durable():
        raise DurableStorageError(
            "B2_REQUIRE_DURABLE=1 but Genblaze/B2 is not enabled — "
            "set GENBLAZE_ENABLED=1 and B2_* for golden/demo runs."
        )

    if stored:
        return StitchResult(
            url=stored.url,  # canvas plays the durable B2 URL in prod
            mode="LIVE",
            duration=duration,
            shot_count=shot_count,
            durable_url=stored.url,
            final_sha256=final_sha256,
        )
    # Dev fallback: serve the MP4 from the frontend's public/exports.
    export_dir = _export_dir()
    export_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(out_path, export_dir / out_name)
    local_path = export_dir / out_name
    return StitchResult(
        url=f"{_export_base_url()}/{out_name}",
        mode="LIVE",
        duration=duration,
        shot_count=shot_count,
        local_path=str(local_path),
        final_sha256=final_sha256,
    )


# --------------------------------------------------------------------- plan-driven (variants / recap)


_FILTER_NAMES: Optional[set] = None


def _ffmpeg_filter_names() -> set:
    """Cached set of filter names supported by the local ffmpeg build."""
    global _FILTER_NAMES
    if _FILTER_NAMES is None:
        names: set = set()
        try:
            res = subprocess.run(
                ["ffmpeg", "-hide_banner", "-filters"],
                capture_output=True, text=True, timeout=30,
            )
            for line in res.stdout.splitlines():
                parts = line.split()
                if len(parts) >= 3 and "->" in parts[2]:
                    names.add(parts[1])
        except Exception:  # noqa: BLE001 — probe failure just means "no filters"
            pass
        _FILTER_NAMES = names
    return _FILTER_NAMES


def ffmpeg_has_filter(name: str) -> bool:
    return name in _ffmpeg_filter_names()


def resolve_caption_method(plan: dict) -> str:
    """Map the plan's requested caption method onto this ffmpeg build.

    Degrade chain per ADR-0005: libass subtitles filter → drawtext →
    SRT sidecar. A missing filter never fails a paid job.
    """
    wanted = (plan.get("captions") or {}).get("method", "auto")
    if wanted == "sidecar_only":
        return "sidecar"
    if wanted in ("auto", "ass") and ffmpeg_has_filter("subtitles"):
        return "ass"
    if wanted in ("auto", "drawtext") and ffmpeg_has_filter("drawtext"):
        return "drawtext"
    if wanted == "drawtext" and ffmpeg_has_filter("subtitles"):
        return "ass"
    return "sidecar"


def _reframe_chain(plan: dict, clip: dict) -> str:
    w, h = plan["target"]
    if plan.get("reframe") == "pad":
        return (
            f"scale={w}:{h}:force_original_aspect_ratio=decrease,"
            f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=0x050607"
        )
    fx = float(clip.get("focus_x") or 0.5)
    fy = float(clip.get("focus_y") or 0.5)
    return (
        f"scale={w}:{h}:force_original_aspect_ratio=increase,"
        f"crop={w}:{h}:'(iw-{w})*{fx}':'(ih-{h})*{fy}'"
    )


def _escape_drawtext(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "’")
    )


def _drawtext_for(text: str, plan: dict, t0: Optional[float], t1: Optional[float]) -> str:
    h = plan["target"][1]
    pct = float(plan["captions"].get("font_size_pct", 8) or 8)
    margin = int(h * float(plan["captions"].get("safe_margin_pct", 6) or 6) / 100)
    enable = ""
    if t0 is not None or t1 is not None:
        enable = (
            f":enable='between(t,{max(0.0, t0 or 0.0)},"
            f"{t1 if t1 is not None else 1e9})'"
        )
    return (
        f"drawtext=text='{_escape_drawtext(text)}'"
        f":fontsize={int(h * pct / 100)}:fontcolor=white"
        f":borderw=3:bordercolor=black@0.6"
        f":x=(w-text_w)/2:y=h-text_h-{margin}{enable}"
    )


def _clip_ass(header: str, lines: list[dict]) -> str:
    """One clip's ASS: the plan's style header plus locally-timed events.

    The Format line must be the one ``ass_event``'s Dialogues are written for —
    libass dumps everything past the last declared field into the rendered
    text, which is how a paid rendition once captioned itself ",0,0,0,,Problem".
    """
    from .variant_plan import ASS_EVENT_FORMAT, ass_event

    events = "".join(
        ass_event(ln["text"], ln["start"], ln["end"]) + "\n" for ln in lines
    )
    return f"{header}[Events]\n{ASS_EVENT_FORMAT}{events}"


def _clip_audio_plan(clip: dict, asset: dict, plan: dict) -> dict:
    """Effective in/out seconds for one clip, clamped to the asset."""
    src_dur = float(asset.get("duration") or 0.0)
    start = float(clip.get("in") or 0.0)
    end = clip.get("out")
    end = float(end) if end is not None else start + src_dur
    if src_dur:
        end = min(end, start + src_dur)
    if clip.get("max_dur") is not None:
        end = min(end, start + float(clip["max_dur"]))
    dur = max(0.5, end - start)
    return {"in": start, "dur": round(dur, 3)}


def _mock_url_for_plan(plan: dict, assets: dict) -> str:
    seed_input = plan.get("id", "") + "|" + "|".join(
        c.get("shot_ref", "") for c in plan.get("clips", [])
    )
    seed = hashlib.sha1(seed_input.encode("utf-8")).hexdigest()[:8]
    _ = seed, assets
    return _mock_url([{"id": "plan", "video_url": plan.get("id", "")}])


def _srt_global(plan: dict, assets: dict) -> str:
    """SRT on the concatenated output timeline: each line shifted from
    clip-local source time to global (cum + start − clip in)."""
    def _t(v: float) -> str:
        ms = int(round(max(0.0, v) * 1000))
        h, rem = divmod(ms, 3_600_000)
        m, rem = divmod(rem, 60_000)
        s, ms = divmod(rem, 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

    blocks: list[str] = []
    cum = 0.0
    for ci, c in enumerate(plan["clips"]):
        timing = _clip_audio_plan(c, assets.get(c["shot_ref"]) or {}, plan)
        for ln in (plan.get("captions") or {}).get("lines") or []:
            if int(ln.get("clip_order", -1)) != ci:
                continue
            s = max(0.0, float(ln["start"]) - timing["in"])
            e = min(timing["dur"], float(ln["end"]) - timing["in"])
            if e <= s:
                continue
            blocks.append(
                f"{len(blocks) + 1}\n{_t(cum + s)} --> {_t(cum + e)}\n{ln['text']}\n"
            )
        cum += timing["dur"]
    return "\n".join(blocks)


def stitch_plan(plan: dict, assets: dict[str, dict], title: str) -> StitchResult:
    """Execute a variant plan: per-clip reframe/caption/overlay normalize,
    then concat. Re-stitch only — consumes zero generation budget."""
    from .variant_plan import plan_total_duration, validate_plan_trims, write_ass

    clips = plan.get("clips") or []
    if not clips:
        raise RuntimeError("variant plan has no clips")
    try:
        validate_plan_trims(plan, assets)
    except ValueError as e:
        raise RuntimeError(f"variant plan references outside its captures: {e}") from e

    if not stitcher_is_live():
        time.sleep(0.4)
        return StitchResult(
            url=_mock_url_for_plan(plan, assets),
            mode="MOCK",
            duration=int(round(plan_total_duration(plan, assets))),
            shot_count=len(clips),
        )

    cap_lines = (plan.get("captions") or {}).get("lines") or []
    ctas = [o for o in plan.get("overlays") or [] if o.get("kind") == "text_cta"]
    logos = [o for o in plan.get("overlays") or [] if o.get("kind") == "logo"]
    audio_mode = (plan.get("audio") or {}).get("mode", "reuse_master")
    sfx_vol = float((plan.get("audio") or {}).get("sfx_volume", 0.35) or 0.35)

    caption_method = resolve_caption_method(plan) if (cap_lines or ctas) else "none"

    out_name = f"{_slugify(title)}-{plan['id']}-{int(time.time())}.mp4"
    with tempfile.TemporaryDirectory(prefix=f"stitch-{plan['id']}-") as tmp:
        tmp_dir = Path(tmp)
        norm_files: list[Path] = []
        cum = 0.0  # global timeline position of the current clip start

        for ci, clip in enumerate(clips):
            ref = clip["shot_ref"]
            asset = assets.get(ref) or {}
            url = asset.get("video_url")
            if not url:
                raise RuntimeError(f"variant plan references unknown clip '{ref}'")
            timing = _clip_audio_plan(clip, asset, plan)
            dur = timing["dur"]

            local_video = tmp_dir / f"src_{ci:03d}.mp4"
            _download(url, local_video)

            inputs: list[str] = []
            if timing["in"] > 0:
                inputs += ["-ss", f"{timing['in']}"]
            inputs += ["-t", f"{dur}", "-i", str(local_video)]
            next_in = 1

            # audio inputs (reuse_master only)
            vo_idx = sfx_idx = None
            if audio_mode == "reuse_master":
                if asset.get("voiceover_url"):
                    p = tmp_dir / f"vo_{ci:03d}.mp3"
                    try:
                        _download(asset["voiceover_url"], p)
                        inputs += ["-i", str(p)]
                        vo_idx = next_in
                        next_in += 1
                    except Exception:  # noqa: BLE001
                        pass
                if asset.get("sfx_url"):
                    p = tmp_dir / f"sfx_{ci:03d}.mp3"
                    try:
                        _download(asset["sfx_url"], p)
                        inputs += ["-i", str(p)]
                        sfx_idx = next_in
                        next_in += 1
                    except Exception:  # noqa: BLE001
                        pass

            # logo inputs
            logo_chains: list[tuple[int, dict]] = []
            w, h = plan["target"]
            for lv in logos:
                p = tmp_dir / f"logo_{len(logo_chains):02d}.png"
                try:
                    _download(lv["url"], p)
                    inputs += ["-i", str(p)]
                    logo_chains.append((next_in, lv))
                    next_in += 1
                except Exception:  # noqa: BLE001
                    pass

            # ---- video filter chain
            vparts: list[str] = []
            chain = f"[0:v]{_reframe_chain(plan, clip)},setsar=1,fps=30,format=yuv420p"

            my_lines = [
                ln for ln in cap_lines if int(ln.get("clip_order", -1)) == ci
            ]
            local_lines = [
                {
                    "text": ln["text"],
                    "start": max(0.0, float(ln["start"]) - timing["in"]),
                    "end": max(0.0, float(ln["end"]) - timing["in"]),
                }
                for ln in my_lines
            ]
            local_ctas = []
            for ov_cta in ctas:
                g0 = float(ov_cta.get("t0") or cum)
                g1 = float(ov_cta["t1"]) if ov_cta.get("t1") is not None else cum + dur
                l0 = max(0.0, g0 - cum)
                l1 = min(dur, max(0.0, g1 - cum))
                if l1 > l0:
                    local_ctas.append({"text": ov_cta["text"], "start": l0, "end": l1})

            if caption_method == "ass" and (local_lines or local_ctas):
                header = write_ass(plan).split("[Events]\n")[0]
                ass_path = tmp_dir / f"caps_{ci:03d}.ass"
                ass_path.write_text(_clip_ass(header, local_lines + local_ctas))
                chain += f",subtitles=caps_{ci:03d}.ass"
            elif caption_method == "drawtext":
                for ln in local_lines + local_ctas:
                    chain += "," + _drawtext_for(ln["text"], plan, ln["start"], ln["end"])

            vparts.append(f"{chain}[vbase]")
            label = "vbase"
            for li, (input_idx, lv) in enumerate(logo_chains):
                logo_h = max(8, int(h * float(lv.get("size_pct", 12) or 12) / 100))
                vparts.append(f"[{input_idx}:v]scale=-2:{logo_h}[lg{li}]")
                g0 = lv.get("t0")
                g1 = lv.get("t1")
                enable = ""
                if g0 is not None or g1 is not None:
                    l0 = max(0.0, float(g0 or cum) - cum)
                    l1 = dur if g1 is None else min(dur, float(g1) - cum)
                    if l1 > l0:
                        enable = f":enable='between(t,{round(l0, 3)},{round(l1, 3)})'"
                    else:
                        continue  # window outside this clip
                pos = lv.get("position", "top-right")
                m = int(w * 0.04)
                xy = {
                    "top-right": f"main_w-overlay_w-{m}:{m}",
                    "top-left": f"{m}:{m}",
                    "bottom-right": f"main_w-overlay_w-{m}:main_h-overlay_h-{m}",
                    "bottom-left": f"{m}:main_h-overlay_h-{m}",
                }.get(pos, f"main_w-overlay_w-{m}:{m}")
                vparts.append(f"[{label}][lg{li}]overlay={xy}{enable}[v{li}]")
                label = f"v{li}"
            # relabel the video chain's final output as [vout]
            suffix = f"[{label}]"
            vparts[-1] = vparts[-1][: -len(suffix)] + "[vout]"

            # ---- audio filter chain
            if vo_idx is not None or sfx_idx is not None:
                parts = []
                labels = []
                for idx, vol in ((vo_idx, 1.0), (sfx_idx, sfx_vol)):
                    if idx is None:
                        continue
                    lab = f"a{len(labels)}"
                    parts.append(f"[{idx}:a]volume={vol}[{lab}]")
                    labels.append(lab)
                if len(labels) == 1:
                    parts.append(
                        f"[{labels[0]}]apad=whole_dur={dur}[aout]"
                    )
                else:
                    joined = "".join(f"[{l}]" for l in labels)
                    parts.append(
                        f"{joined}amix=inputs={len(labels)}:duration=longest:"
                        f"dropout_transition=0,apad=whole_dur={dur}[aout]"
                    )
                vparts.extend(parts)
                fc = ";".join(vparts)
                audio_map = "[aout]"
            else:
                # silent bed so every intermediate carries an audio stream
                inputs += ["-f", "lavfi", "-t", f"{dur}", "-i",
                           "anullsrc=r=44100:cl=stereo"]
                fc = ";".join(vparts)
                audio_map = f"{next_in}:a"

            norm = tmp_dir / f"norm_{ci:03d}.mp4"
            cmd = [
                "ffmpeg", "-y", *inputs,
                "-filter_complex", fc,
                "-map", "[vout]", "-map", audio_map,
                "-t", f"{dur}",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                "-c:a", "aac", "-b:a", "192k",
                "-shortest", "-movflags", "+faststart",
                str(norm),
            ]
            res = subprocess.run(
                cmd, capture_output=True, text=True, timeout=600, cwd=str(tmp_dir)
            )
            if res.returncode != 0:
                raise RuntimeError(
                    f"ffmpeg variant clip {ci} ({ref}) failed:\n{res.stderr[-2000:]}"
                )
            norm_files.append(norm)
            cum += dur

        out_path = tmp_dir / out_name
        _ffmpeg_concat(norm_files, out_path, force_reencode=False)

        duration = int(round(sum(
            _clip_audio_plan(c, assets.get(c["shot_ref"]) or {}, plan)["dur"]
            for c in clips
        )))
        result = _persist_output(out_path, out_name, duration, len(clips))

        # caption sidecar: always produced when the plan has lines (and is
        # the only caption delivery when the build lacks both filters).
        if cap_lines:
            srt_name = f"{_slugify(title)}-{plan['id']}-{int(time.time())}.srt"
            stored_srt = None
            try:
                from .media_storage import b2_enabled, persist_bytes
                from .runway_client import _billing_thread_id

                if b2_enabled():
                    stored_srt = persist_bytes(
                        _srt_global(plan, assets).encode(),
                        content_type="text/plain",
                        suffix=".srt",
                        tenant_id=_billing_thread_id() or "director",
                        strategy="hierarchical",
                    )
            except Exception:  # noqa: BLE001 — sidecar is advisory
                stored_srt = None
            if stored_srt:
                result.srt_url = stored_srt.url
            else:
                export_dir = _export_dir()
                export_dir.mkdir(parents=True, exist_ok=True)
                (export_dir / srt_name).write_text(_srt_global(plan, assets))
                result.srt_url = f"{_export_base_url()}/{srt_name}"

        result.mode = "LIVE"
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
