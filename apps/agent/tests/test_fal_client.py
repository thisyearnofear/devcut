"""Unit tests for fal_client.py (no API keys, no network).

Run: cd apps/agent && python3 -m unittest tests.test_fal_client -v
"""

from __future__ import annotations

import os
import unittest
from unittest import mock

from src.fal_client import (
    fal_image_model,
    fal_is_live,
    fal_mode_label,
    fal_video_aspect,
    fal_video_model,
    generate_reference_image,
    generate_shot_video,
    image_request_body,
    map_duration,
    video_request_body,
)


class ModeTests(unittest.TestCase):
    def test_mock_when_no_key(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("FAL_KEY", None)
            os.environ.pop("FAL_API_KEY", None)
        # clear=False keeps PATH etc; explicitly drop keys to be safe:
        with mock.patch.dict(os.environ, {"FAL_KEY": ""}):
            self.assertFalse(fal_is_live())
            self.assertEqual(fal_mode_label(), "MOCK")

    def test_live_when_key_set(self) -> None:
        with mock.patch.dict(os.environ, {"FAL_KEY": "k-test"}):
            self.assertTrue(fal_is_live())
            self.assertEqual(fal_mode_label(), "LIVE")

    def test_fal_api_key_alt(self) -> None:
        with mock.patch.dict(os.environ, {"FAL_API_KEY": "k"}):
            self.assertTrue(fal_is_live())

    def test_fal_mode_mock_override(self) -> None:
        with mock.patch.dict(os.environ, {"FAL_KEY": "k", "FAL_MODE": "mock"}):
            self.assertFalse(fal_is_live())


class MappingTests(unittest.TestCase):
    def test_image_size(self) -> None:
        self.assertEqual(fal_video_aspect("1280:720"), "16:9")
        self.assertEqual(fal_video_aspect("720:1280"), "9:16")
        self.assertEqual(fal_video_aspect("1:1"), "1:1")

    def test_kling_duration(self) -> None:
        model = fal_video_model()  # kling by default
        self.assertEqual(map_duration(model, 5), "5")
        self.assertEqual(map_duration(model, 8), "10")
        self.assertEqual(map_duration(model, 20), "10")

    def test_non_kling_duration_passes_through(self) -> None:
        self.assertEqual(map_duration("fal-ai/minimax/hailuo-02/standard/image-to-video", 4), "4")


class RequestBodyTests(unittest.TestCase):
    def test_image_body_landscape(self) -> None:
        body = image_request_body("hero", "1280:720")
        self.assertEqual(body["image_size"], "landscape_16_9")
        self.assertEqual(body["num_images"], 1)
        self.assertNotIn("image_url", body)  # flux/schnell ignores refs by default

    def test_image_body_portrait_and_refs_on_kontext(self) -> None:
        body = image_request_body("hero", "720:1280", prior_ref_urls=["http://a"], model="fal-ai/flux-pro/kontext")
        self.assertEqual(body["image_size"], "portrait_16_9")
        self.assertEqual(body["image_url"], "http://a")

    def test_video_body(self) -> None:
        body = video_request_body("http://img", "move", 5, "1280:720")
        self.assertEqual(body["image_url"], "http://img")
        self.assertEqual(body["duration"], "5")
        self.assertEqual(body["aspect_ratio"], "16:9")


class MockGenerationTests(unittest.TestCase):
    def test_mock_image_is_deterministic_and_tagged(self) -> None:
        with mock.patch.dict(os.environ, {"FAL_KEY": ""}):
            self.assertEqual(fal_is_live(), False)
        with mock.patch("src.fal_client.fal_is_live", return_value=False):
            r = generate_reference_image("still", "1280:720")
        self.assertEqual(r.mode, "MOCK")
        self.assertEqual(r.provider, "fal")
        self.assertIn("picsum", r.url)
        # deterministic for same prompt
        with mock.patch("src.fal_client.fal_is_live", return_value=False):
            r2 = generate_reference_image("still", "1280:720")
        self.assertEqual(r.url, r2.url)

    def test_mock_video_is_tagged(self) -> None:
        with mock.patch("src.fal_client.fal_is_live", return_value=False):
            r = generate_shot_video("http://i", "clip", 5, "1280:720")
        self.assertEqual(r.mode, "MOCK")
        self.assertEqual(r.provider, "fal")


if __name__ == "__main__":
    unittest.main()
