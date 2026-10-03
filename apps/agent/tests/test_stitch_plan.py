"""LIVE stitch_plan tests (ADR-0005 Phase 1).

Generates fixture clips with ffmpeg lavfi (no Runway, no network) and
asserts real output geometry/duration via ffprobe. Caption burn-in tests
degrade with the local ffmpeg build: this machine's Homebrew build lacks
libass/drawtext, so the SRT-sidecar path is the one actually exercised —
that IS the degradation contract from the ADR.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from src import stitcher
from src.variant_plan import build_default_pack


def _which(*tools: str) -> bool:
    return all(shutil.which(t) for t in tools)


def _run(cmd: list[str]) -> None:
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if res.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed: {res.stderr[-800:]}")


def _make_clip(path: Path, w: int = 1280, h: int = 720, dur: int = 3) -> None:
    _run([
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", f"testsrc2=size={w}x{h}:rate=30:duration={dur}",
        "-f", "lavfi", "-i", f"sine=frequency=440:duration={dur}",
        "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-shortest", str(path),
    ])


def _make_logo(path: Path) -> None:
    _run([
        "ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=red:s=128x64",
        "-frames:v", "1", str(path),
    ])


def _probe_dims(path: Path) -> tuple[int, int]:
    res = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, timeout=60,
    )
    w, h = res.stdout.strip().split(",")[:2]
    return int(w), int(h)


def _probe_duration(path: Path) -> float:
    res = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, timeout=60,
    )
    return float(res.stdout.strip())


@unittest.skipUnless(_which("ffmpeg", "ffprobe"), "ffmpeg/ffprobe not on PATH")
class StitchPlanLiveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory(prefix="stitchplan-test-")
        cls.root = Path(cls.tmp.name)
        cls.exports = cls.root / "exports"
        cls.exports.mkdir()
        cls.clip_a = cls.root / "clip_a.mp4"
        cls.clip_b = cls.root / "clip_b.mp4"
        cls.logo = cls.root / "logo.png"
        _make_clip(cls.clip_a)
        _make_clip(cls.clip_b)
        _make_logo(cls.logo)

        def fake_download(url: str, dest: Path) -> None:
            assert url.startswith("local://"), url
            shutil.copyfile(url[len("local://") :], dest)

        cls.dl = mock.patch.object(stitcher, "_download", fake_download)
        cls.dl.start()
        cls.env = mock.patch.dict(
            os.environ,
            {"EXPORT_DIR": str(cls.exports), "EXPORT_BASE_URL": "http://x/exports",
             "STITCH_MODE": "live", "B2_ENABLED": "", "GENBLAZE_ENABLED": ""},
            clear=False,
        )
        cls.env.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.env.stop()
        cls.dl.stop()
        cls.tmp.cleanup()

    def _shots(self):
        return [
            {"id": "s0", "beat": "Proof", "video_url": f"local://{self.clip_a}",
             "duration": 3, "voiceover_line": "It ships."},
            {"id": "s1", "beat": "Problem", "video_url": f"local://{self.clip_b}",
             "duration": 3, "voiceover_line": "Decks get ignored."},
        ]

    def _assets(self):
        return {
            "s0": {"video_url": f"local://{self.clip_a}", "voiceover_url": None,
                   "sfx_url": None, "duration": 3.0},
            "s1": {"video_url": f"local://{self.clip_b}", "voiceover_url": None,
                   "sfx_url": None, "duration": 3.0},
        }

    def _result_local(self, res) -> Path:
        self.assertTrue(
            res.local_path or res.url, f"no output for {res.mode}"
        )
        if res.local_path:
            return Path(res.local_path)
        # B2-backed environments shouldn't exist in this test suite.
        self.fail("expected dev-fallback local_path in test env")

    def test_customer_square_fill_and_sidecar(self) -> None:
        plans = build_default_pack(self._shots(), cuts=["customer"],
                                   logo_url=f"local://{self.logo}")
        res = stitcher.stitch_plan(plans[0], self._assets(), "t-customer")
        self.assertEqual(res.mode, "LIVE")
        out = self._result_local(res)
        self.assertEqual(_probe_dims(out), (1080, 1080))
        self.assertAlmostEqual(_probe_duration(out), 6.0, delta=1.0)
        # caption sidecar must exist even when burn-in degrades
        self.assertTrue(res.srt_url and res.srt_url.endswith(".srt"))
        sidecar = self.exports / Path(res.srt_url).name
        self.assertTrue(sidecar.exists())
        self.assertIn("-->", sidecar.read_text())

    def test_teaser_vertical_silent_cap(self) -> None:
        plans = build_default_pack(self._shots(), cuts=["teaser"])
        res = stitcher.stitch_plan(plans[0], self._assets(), "t-teaser")
        out = self._result_local(res)
        self.assertEqual(_probe_dims(out), (1080, 1920))
        self.assertLessEqual(_probe_duration(out), 6.5)

    def test_judge_pad_16x9(self) -> None:
        plans = build_default_pack(self._shots(), cuts=["judge"])
        res = stitcher.stitch_plan(plans[0], self._assets(), "t-judge")
        out = self._result_local(res)
        self.assertEqual(_probe_dims(out), (1280, 720))

    def test_missing_asset_ref_raises(self) -> None:
        plans = build_default_pack(self._shots(), cuts=["judge"])
        with self.assertRaises(RuntimeError):
            stitcher.stitch_plan(plans[0], {}, "t-bad")

    def test_caption_method_resolution_degrades(self) -> None:
        plans = build_default_pack(self._shots(), cuts=["customer"])
        method = stitcher.resolve_caption_method(plans[0])
        if not stitcher.ffmpeg_has_filter("subtitles") and not stitcher.ffmpeg_has_filter("drawtext"):
            self.assertEqual(method, "sidecar")
        else:
            self.assertIn(method, ("ass", "drawtext"))


class SrtGlobalTests(unittest.TestCase):
    """Pure-python: sidecar times must live on the concatenated timeline."""

    def test_lines_shifted_by_clip_position(self) -> None:
        plan = {
            "clips": [
                {"shot_ref": "a", "in": 0.0, "out": 5.0, "order": 0, "max_dur": None},
                {"shot_ref": "b", "in": 2.0, "out": 6.0, "order": 1, "max_dur": None},
            ],
            "captions": {"lines": [
                {"clip_order": 0, "text": "one", "start": 0.0, "end": 3.0},
                {"clip_order": 1, "text": "two", "start": 3.0, "end": 5.0},
            ]},
        }
        assets = {"a": {"duration": 5.0}, "b": {"duration": 6.0}}
        srt = stitcher._srt_global(plan, assets)
        self.assertIn("00:00:00,000 --> 00:00:03,000\none", srt)
        # clip b starts at cum=5, line at source 3 → in=2 → global 6..8
        self.assertIn("00:00:06,000 --> 00:00:08,000\ntwo", srt)

    def test_windows_outside_clip_dropped(self) -> None:
        plan = {
            "clips": [
                {"shot_ref": "a", "in": 0.0, "out": 2.0, "order": 0, "max_dur": None},
            ],
            "captions": {"lines": [
                {"clip_order": 0, "text": "late", "start": 5.0, "end": 9.0},
            ]},
        }
        self.assertEqual(stitcher._srt_global(plan, {"a": {"duration": 2.0}}), "")


if __name__ == "__main__":
    unittest.main()
