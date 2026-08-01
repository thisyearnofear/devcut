"""Unit tests for job_manifest + media_storage helpers (no B2 credentials)."""

from __future__ import annotations

import os
import unittest
from unittest import mock

from src.genblaze_agent_loop import is_winning_beat
from src.job_manifest import build_job_manifest
from src.media_storage import is_durable_url, require_durable


class WinningBeatTests(unittest.TestCase):
    def test_winning_detection(self) -> None:
        self.assertTrue(is_winning_beat("Winning artifact"))
        self.assertTrue(is_winning_beat("winning"))
        self.assertFalse(is_winning_beat("Problem"))


class JobManifestTests(unittest.TestCase):
    def test_shape(self) -> None:
        doc = build_job_manifest(
            thread_id="t1",
            storyboard={"title": "Genblaze + B2 Challenge Cut", "logline": "x"},
            shots=[
                {
                    "index": 0,
                    "beat": "Problem",
                    "prompt": "p",
                    "ref_image_url": "https://example/s.png",
                    "video_url": "https://example/s.mp4",
                    "duration": 5,
                }
            ],
            final_video_url="https://example/final.mp4",
            durable_url="https://f004.backblazeb2.com/file/bucket/final.mp4",
            final_sha256="abc123",
            clip_manifest_uris=["https://b2/manifest.json"],
            canonical_hashes=["deadbeef"],
            builder_kit={
                "mode": "challenge",
                "workflow": "product-launch-video",
                "summary": "kit",
                "assets": [1, 2],
            },
            agent_loop={"passed": True, "iterations": 1},
        )
        self.assertEqual(doc["schema"], "devcut.job_manifest.v1")
        self.assertEqual(doc["final"]["sha256"], "abc123")
        self.assertEqual(doc["monday_test"]["expires"][:5], "never")
        self.assertEqual(doc["hyperframes_kit"]["asset_count"], 2)
        self.assertTrue(doc["agent_loop"]["passed"])


class MediaStorageHelpersTests(unittest.TestCase):
    def test_is_durable_url(self) -> None:
        self.assertTrue(is_durable_url("https://f004.backblazeb2.com/file/x/y.mp4"))
        self.assertFalse(is_durable_url("https://cdn.runwayml.com/x.mp4"))

    def test_require_durable_raises_when_disabled(self) -> None:
        with mock.patch.dict(os.environ, {"B2_REQUIRE_DURABLE": "1"}, clear=False):
            self.assertTrue(require_durable())
        with mock.patch.dict(os.environ, {"B2_REQUIRE_DURABLE": "0"}, clear=False):
            self.assertFalse(require_durable())


if __name__ == "__main__":
    unittest.main()
