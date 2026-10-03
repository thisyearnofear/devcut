"""Unit tests for variant_plan — pure data, no ffmpeg (ADR-0005 Phase 1)."""

from __future__ import annotations

import unittest

from src.variant_plan import (
    ASS_EVENT_FORMAT,
    ASPECT_TARGETS,
    TEASER_TOTAL_CAP,
    ass_event,
    build_default_pack,
    build_recap_plan,
    caption_windows,
    new_variant_record,
    normalize_plan,
    plan_total_duration,
    write_ass,
    write_srt,
)


def _shots():
    return [
        {"id": "s0", "beat": "Problem", "video_url": "http://x/0.mp4",
         "duration": 5, "voiceover_line": "Hackathons drown in unread decks."},
        {"id": "s1", "beat": "Constraint", "video_url": "http://x/1.mp4",
         "duration": 5, "voiceover_line": "Sixty hours. One video."},
        {"id": "s2", "beat": "Proof", "video_url": "http://x/2.mp4",
         "duration": 5, "voiceover_line": "DevCut ships the cut. Judges watch."},
        {"id": "s3", "beat": "CTA", "video_url": "http://x/3.mp4",
         "duration": 5, "voiceover_line": "Commission yours today."},
    ]


class BuildDefaultPackTests(unittest.TestCase):
    def test_three_renditions(self) -> None:
        plans = build_default_pack(_shots())
        ids = [p["id"] for p in plans]
        self.assertEqual(ids, ["judge_16x9", "customer_1x1", "teaser_9x16"])
        self.assertEqual(plans[1]["target"], [1080, 1080])
        self.assertEqual(plans[2]["target"], [1080, 1920])

    def test_judge_keeps_master_grammar(self) -> None:
        judge = build_default_pack(_shots())[0]
        self.assertEqual(judge["reframe"], "pad")
        self.assertEqual(judge["audio"]["mode"], "reuse_master")
        self.assertEqual(
            [c["shot_ref"] for c in judge["clips"]], ["s0", "s1", "s2", "s3"]
        )
        self.assertEqual(judge["captions"]["lines"], [])

    def test_customer_captions_reuse_voiceover_lines(self) -> None:
        customer = build_default_pack(_shots())[1]
        texts = [ln["text"] for ln in customer["captions"]["lines"]]
        self.assertTrue(any("DevCut ships" in t for t in texts))

    def test_customer_4x5_variant_id(self) -> None:
        plans = build_default_pack(_shots(), customer_aspect="4:5")
        customer = [p for p in plans if p["id"].startswith("customer")][0]
        self.assertEqual(customer["target"], [1080, 1350])

    def test_teaser_hook_first_and_capped(self) -> None:
        teaser = build_default_pack(_shots())[2]
        self.assertEqual(teaser["clips"][0]["shot_ref"], "s2")  # "Proof" hook
        self.assertEqual(teaser["audio"]["mode"], "silent")
        total = sum(c["out"] - c["in"] for c in teaser["clips"])
        self.assertLessEqual(total, TEASER_TOTAL_CAP + 0.01)

    def test_caption_line_overrides(self) -> None:
        plans = build_default_pack(
            _shots(),
            caption_lines=[
                {"cut_id": "customer_1x1", "clip_order": 0,
                 "text": "Ship faster.", "start": 0.0, "end": 2.0}
            ],
        )
        customer = [p for p in plans if p["id"] == "customer_1x1"][0]
        self.assertEqual(
            customer["captions"]["lines"],
            [{"clip_order": 0, "text": "Ship faster.", "start": 0.0, "end": 2.0}],
        )

    def test_logo_overlay_attached(self) -> None:
        plans = build_default_pack(_shots(), logo_url="http://x/logo.png")
        for p in plans:
            if p["id"].startswith(("customer", "teaser")):
                self.assertEqual(p["overlays"][0]["kind"], "logo")
        judge = plans[0]
        self.assertEqual(judge["overlays"], [])

    def test_cuts_subset(self) -> None:
        plans = build_default_pack(_shots(), cuts=["teaser"])
        self.assertEqual([p["id"] for p in plans], ["teaser_9x16"])

    def test_no_ready_shots_raises(self) -> None:
        with self.assertRaises(ValueError):
            build_default_pack([{"id": "s0", "duration": 5}])

    def test_unknown_cut_raises(self) -> None:
        with self.assertRaises(ValueError):
            build_default_pack(_shots(), cuts=["boomerang"])


class NormalizePlanTests(unittest.TestCase):
    def _plan(self):
        return {
            "id": "custom_1", "label": "x", "aspect": "1:1",
            "clips": [{"shot_ref": "s0", "in": 0.0, "out": 4.0, "order": 0}],
        }

    def test_defaults_filled(self) -> None:
        p = normalize_plan(self._plan())
        self.assertEqual(p["target"], [1080, 1080])
        self.assertEqual(p["fps"], 30)
        self.assertEqual(p["audio"]["mode"], "reuse_master")
        self.assertEqual(p["captions"]["method"], "auto")

    def test_bad_aspect_rejected(self) -> None:
        plan = {**self._plan(), "aspect": "7:3"}
        with self.assertRaises(ValueError):
            normalize_plan(plan)

    def test_bad_trims_rejected(self) -> None:
        plan = {**self._plan(),
                "clips": [{"shot_ref": "s0", "in": 3.0, "out": 2.0, "order": 0}]}
        with self.assertRaises(ValueError):
            normalize_plan(plan)

    def test_duplicate_order_rejected(self) -> None:
        plan = {**self._plan(),
                "clips": [
                    {"shot_ref": "s0", "in": 0, "out": 2, "order": 0},
                    {"shot_ref": "s1", "in": 0, "out": 2, "order": 0},
                ]}
        with self.assertRaises(ValueError):
            normalize_plan(plan)

    def test_duration_cap_enforced(self) -> None:
        plan = {**self._plan(), "duration_cap": 2.0,
                "clips": [{"shot_ref": "s0", "in": 0.0, "out": 4.0, "order": 0}]}
        with self.assertRaises(ValueError):
            normalize_plan(plan)

    def test_clips_sorted_by_order(self) -> None:
        plan = {**self._plan(),
                "clips": [
                    {"shot_ref": "s1", "in": 0, "out": 2, "order": 1},
                    {"shot_ref": "s0", "in": 0, "out": 2, "order": 0},
                ]}
        p = normalize_plan(plan)
        self.assertEqual([c["shot_ref"] for c in p["clips"]], ["s0", "s1"])

    def test_text_cta_overlay_kept(self) -> None:
        plan = {**self._plan(),
                "overlays": [{"kind": "text_cta", "text": "Next: June 2027"}]}
        p = normalize_plan(plan)
        self.assertEqual(p["overlays"][0]["kind"], "text_cta")


class TimingTests(unittest.TestCase):
    def test_caption_windows_within_range(self) -> None:
        wins = caption_windows("One more. And three!", 2.0, 8.0)
        self.assertGreaterEqual(len(wins), 2)
        self.assertEqual(wins[0]["start"], 2.0)
        self.assertAlmostEqual(wins[-1]["end"], 8.0, places=1)
        for w in wins:
            self.assertLess(w["start"], w["end"])

    def test_plan_total_duration_uses_assets(self) -> None:
        p = normalize_plan({
            "id": "t", "aspect": "16:9",
            "clips": [{"shot_ref": "s0", "in": 1.0, "order": 0}],
        })
        assets = {"s0": {"duration": 5}}
        self.assertAlmostEqual(plan_total_duration(p, assets), 4.0)


class WriterTests(unittest.TestCase):
    def test_ass_and_srt(self) -> None:
        plans = build_default_pack(_shots())
        customer = plans[1]
        ass = write_ass(customer)
        self.assertIn(f"PlayResX: {ASPECT_TARGETS['1:1'][0]}", ass)
        self.assertIn("Dialogue: 0,", ass)
        srt = write_srt(customer)
        self.assertTrue(srt.startswith("1\n"))
        self.assertIn("-->", srt)

    def test_ass_format_line_matches_dialogue_arity(self) -> None:
        """libass puts everything after the last declared field into Text.

        A short Format line printed ",0,0,0,,Problem" on screen — the
        caption identity check for a paid rendition.
        """
        fields = [
            f.strip()
            for f in ASS_EVENT_FORMAT[len("Format:"):].strip().split(",")
        ]
        self.assertEqual(fields, ["Layer", "Start", "End", "Style", "Name",
                                 "MarginL", "MarginR", "MarginV", "Effect", "Text"])
        parts = ass_event("Sixty hours, one video.", 0, 9)[
            len("Dialogue:"):
        ].split(",", len(fields) - 1)
        self.assertEqual(len(parts), len(fields))
        self.assertEqual(parts[-1], "Sixty hours, one video.")
        self.assertIn(ASS_EVENT_FORMAT, write_ass(build_default_pack(_shots())[1]))

    def test_ass_braces_neutralized(self) -> None:
        plan = normalize_plan({
            "id": "c", "aspect": "1:1",
            "clips": [{"shot_ref": "s0", "in": 0, "out": 3, "order": 0}],
            "captions": {"lines": [
                {"clip_order": 0, "text": "evil {tags} here", "start": 0, "end": 1}
            ]},
        })
        self.assertNotIn("{", write_ass(plan))

    def test_new_variant_record_shape(self) -> None:
        rec = new_variant_record(build_default_pack(_shots())[0])
        self.assertEqual(rec["status"], "queued")
        self.assertIsNone(rec["video_url"])
        self.assertEqual(rec["plan"]["id"], "judge_16x9")


class BuildRecapPlanTests(unittest.TestCase):
    def _metas(self, n=6):
        return [
            {"thread_id": f"t{i}", "label": f"Project {i}", "duration": 40}
            for i in range(n)
        ]

    def test_two_clips_per_thread_capped_and_ordered(self) -> None:
        plan = build_recap_plan(self._metas(), title="Shipathon recap")
        self.assertEqual(len(plan["clips"]), 12)
        self.assertEqual([c["order"] for c in plan["clips"]], list(range(12)))
        for c in plan["clips"]:
            self.assertLessEqual(c["out"] - c["in"], 8.0 + 1e-6)
            self.assertTrue(c["shot_ref"].endswith("/final"))
        total = sum(c["out"] - c["in"] for c in plan["clips"])
        self.assertLessEqual(total, 90.0 + 1e-6)

    def test_total_cap_trims_threads(self) -> None:
        plan = build_recap_plan(self._metas(20), title="Big recap")
        total = sum(c["out"] - c["in"] for c in plan["clips"])
        self.assertLessEqual(total, 90.0 + 1e-6)

    def test_overlays_and_cta(self) -> None:
        plan = build_recap_plan(
            self._metas(2), title="R", cta_text="Apply now", logo_url="http://x/logo.png"
        )
        kinds = [o["kind"] for o in plan["overlays"]]
        self.assertEqual(kinds, ["logo", "logo", "text_cta"])
        self.assertEqual(plan["overlays"][0]["t0"], 0.0)
        self.assertEqual(plan["overlays"][2]["text"], "Apply now")

    def test_caption_labels_are_source_time(self) -> None:
        plan = build_recap_plan(self._metas(1), title="R")
        second = plan["clips"][1]
        lines = [l for l in plan["captions"]["lines"] if l["clip_order"] == 1]
        self.assertEqual(len(lines), 1)
        self.assertGreaterEqual(lines[0]["start"], second["in"])
        self.assertLessEqual(lines[0]["end"], second["out"])

    def test_audio_silent_and_empty_refused(self) -> None:
        plan = build_recap_plan(self._metas(1), title="R")
        self.assertEqual(plan["audio"]["mode"], "silent")
        with self.assertRaises(ValueError):
            build_recap_plan([], title="R")


if __name__ == "__main__":
    unittest.main()
