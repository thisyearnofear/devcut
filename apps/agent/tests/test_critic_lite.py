"""Unit tests for critic_lite — pure warnings, no ffmpeg, no spend."""

from __future__ import annotations

import unittest

from src.critic_lite import critique_plan, warnings_note
from src.variant_plan import build_default_pack


def _assets(ids=("s0", "s1")):
    return {
        i: {"video_url": f"http://x/{i}.mp4", "duration": 5.0, "beat": "Proof"}
        for i in ids
    }


class CritiquePlanTests(unittest.TestCase):
    def test_clean_plan_no_majors(self) -> None:
        shots = [
            {"id": "s0", "beat": "Proof", "video_url": "http://x/0.mp4",
             "duration": 5, "voiceover_line": "Judges watch the winning cut."},
            {"id": "s1", "beat": "CTA", "video_url": "http://x/1.mp4",
             "duration": 5, "voiceover_line": "Commission yours today."},
        ]
        plan = build_default_pack(shots, cuts=["judge"])[0]
        assets = {s["id"]: {"video_url": s["video_url"], "duration": 5,
                             "beat": s["beat"]} for s in shots}
        warns = critique_plan(plan, assets)
        self.assertFalse([w for w in warns if w["severity"] == "major"])

    def test_narration_overrun_is_major(self) -> None:
        plan = {
            "id": "customer_1x1", "aspect": "1:1",
            "clips": [{"shot_ref": "s0", "in": 0.0, "out": 2.0, "order": 0}],
            "captions": {"lines": [{
                "clip_order": 0,
                "text": " ".join(["word"] * 30),  # ~13s of speech in 2s
                "start": 0.0, "end": 2.0,
            }]},
            "overlays": [],
        }
        codes = [w["code"] for w in critique_plan(plan, _assets())]
        self.assertIn("narration_overrun", codes)

    def test_caption_outside_trim_flagged(self) -> None:
        plan = {
            "id": "customer_1x1", "aspect": "1:1",
            "clips": [{"shot_ref": "s0", "in": 0.0, "out": 2.0, "order": 0}],
            "captions": {"lines": [{
                "clip_order": 0, "text": "Late line", "start": 5.0, "end": 7.0,
            }]},
            "overlays": [],
        }
        codes = [w["code"] for w in critique_plan(plan, _assets())]
        self.assertIn("caption_drift", codes)

    def test_missing_lockup_is_info_only(self) -> None:
        plan = {
            "id": "teaser_9x16", "aspect": "9:16",
            "clips": [{"shot_ref": "s0", "in": 0.0, "out": 3.0, "order": 0}],
            "captions": {"lines": []},
            "overlays": [],
        }
        warns = critique_plan(plan, _assets())
        lockup = [w for w in warns if w["code"] == "no_lockup"]
        self.assertEqual(len(lockup), 1)
        self.assertEqual(lockup[0]["severity"], "info")

    def test_warnings_note_empty_when_clean(self) -> None:
        plan = {
            "id": "judge_16x9", "aspect": "16:9",
            "clips": [{"shot_ref": "s0", "in": 0.0, "out": 5.0, "order": 0}],
            "captions": {"lines": []},
            "overlays": [],
        }
        assets = {"s0": {"video_url": "u", "duration": 5.0, "beat": "Proof demo"}}
        self.assertEqual(warnings_note(critique_plan(plan, assets)), "")


if __name__ == "__main__":
    unittest.main()
