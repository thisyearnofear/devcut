"""Unit tests for HyperFrames kit builder (no API keys).

Run: cd apps/agent && uv run python -m unittest tests.test_hyperframes_kit -v
"""

from __future__ import annotations

import unittest

from src.hyperframes_kit import (
    build_assets_lines,
    build_brief_md,
    build_builder_kit,
    infer_mode,
)


GOLDEN_SHOTS = [
    {
        "index": 0,
        "beat": "Problem",
        "prompt": "Broken durable links after hackathon weekend",
        "duration": 5,
        "ref_image_url": "https://mock.example/s0.png",
        "video_url": "https://mock.example/s0.mp4",
    },
    {
        "index": 1,
        "beat": "Constraint",
        "prompt": "Genblaze + B2 required",
        "duration": 5,
        "ref_image_url": "https://mock.example/s1.png",
        "video_url": "https://mock.example/s1.mp4",
    },
    {
        "index": 2,
        "beat": "Winning artifact",
        "prompt": "Durable MP4 + BRIEF kit",
        "duration": 5,
        "ref_image_url": "https://mock.example/s2.png",
        "video_url": "https://mock.example/s2.mp4",
    },
    {
        "index": 3,
        "beat": "Anti-pattern",
        "prompt": "Laptop-only /tmp demo",
        "duration": 5,
        "ref_image_url": "https://mock.example/s3.png",
        "video_url": "https://mock.example/s3.mp4",
    },
    {
        "index": 4,
        "beat": "CTA",
        "prompt": "Fork the HyperFrames kit",
        "duration": 5,
        "ref_image_url": "https://mock.example/s4.png",
        "video_url": "https://mock.example/s4.mp4",
    },
]


class InferModeTests(unittest.TestCase):
    def test_challenge_from_title(self) -> None:
        self.assertEqual(
            infer_mode({"title": "Genblaze + B2 Challenge Cut"}, []),
            "challenge",
        )

    def test_challenge_from_beats(self) -> None:
        shots = [{"beat": "Constraint"}, {"beat": "Anti-pattern"}]
        self.assertEqual(infer_mode({"title": "Hack film"}, shots), "challenge")

    def test_submit_default(self) -> None:
        self.assertEqual(
            infer_mode({"title": "Product launch"}, [{"beat": "Problem"}]),
            "submit",
        )


class BuilderKitTests(unittest.TestCase):
    def test_golden_challenge_kit_shape(self) -> None:
        state = {
            "storyboard": {
                "title": "Genblaze + B2 Challenge Cut",
                "logline": "Win with durable media + HF kit",
                "aspect_ratio": "1280:720",
            },
            "shots": GOLDEN_SHOTS,
            "final_video_url": "https://mock.example/final.mp4",
            "durable_url": "https://mock.b2.example/final.mp4",
        }
        kit = build_builder_kit(state)
        self.assertEqual(kit["mode"], "challenge")
        self.assertEqual(kit["workflow"], "product-launch-video")
        self.assertIn("workflow: product-launch-video", kit["brief_md"])
        self.assertIn("## Intent", kit["brief_md"])
        self.assertIn("## Assets", kit["brief_md"])
        self.assertIn("assets/devcut/", kit["brief_md"])
        self.assertIn("HyperFrames", kit["drop_instructions"])
        kinds = {a["kind"] for a in kit["assets"]}
        self.assertIn("still", kinds)
        self.assertIn("clip", kinds)
        self.assertIn("final", kinds)
        # 5 stills + 5 clips + 1 final
        self.assertEqual(len(kit["assets"]), 11)

    def test_assets_paths_are_stable(self) -> None:
        rows = build_assets_lines(GOLDEN_SHOTS[:1])
        self.assertTrue(rows[0]["path"].startswith("assets/devcut/01-problem"))

    def test_brief_escapes_quotes_in_message(self) -> None:
        md = build_brief_md(
            mode="submit",
            storyboard={"title": "T", "logline": 'Ship "it" today', "aspect_ratio": "1280:720"},
            shots=[{"beat": "Product", "prompt": "UI", "duration": 5}],
            assets=[],
        )
        self.assertIn("message:", md)
        self.assertNotIn('message: "Ship "it"', md)


if __name__ == "__main__":
    unittest.main()
