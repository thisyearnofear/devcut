"""Unit tests for media_provider router (no API keys, no network).

Run: cd apps/agent && python3 -m unittest tests.test_media_provider -v
"""

from __future__ import annotations

import os
import unittest
from unittest import mock

from src import media_provider as mp
from src.runway_client import RunwayImageResult


class _RealPatch:
    def __init__(self, runway: str, fal: str):
        self.runway = runway
        self.fal = fal

    def __enter__(self) -> "_RealPatch":
        self.p1 = mock.patch("src.media_provider._runway_label", return_value=self.runway.upper())
        self.p2 = mock.patch("src.media_provider.fal_client.fal_mode_label", return_value=self.fal.upper())
        self.p1.start()
        self.p2.start()
        return self

    def __exit__(self, *exc: object) -> None:
        self.p1.stop()
        self.p2.stop()


class ResolutionTests(unittest.TestCase):
    def test_auto_prefers_runway_then_fal_then_mock(self) -> None:
        with mock.patch.dict(os.environ, {"DEVCUT_MEDIA_PROVIDER": "auto", "DEVCUT_MEDIA_FALLBACK": "1"}):
            with _RealPatch("live", "live"):
                self.assertEqual(mp.active_media_provider(), "runway")
            with _RealPatch("mock", "live"):
                self.assertEqual(mp.active_media_provider(), "fal")
            with _RealPatch("mock", "mock"):
                self.assertEqual(mp.active_media_provider(), "mock")
                self.assertEqual(mp.media_mode_label(), "MOCK")

    def test_pinned_runway_uses_fal_only_with_fallback(self) -> None:
        with mock.patch.dict(os.environ, {"DEVCUT_MEDIA_PROVIDER": "runway", "DEVCUT_MEDIA_FALLBACK": "1"}):
            with _RealPatch("mock", "live"):
                self.assertEqual(mp.active_media_provider(), "fal")
        with mock.patch.dict(os.environ, {"DEVCUT_MEDIA_PROVIDER": "runway", "DEVCUT_MEDIA_FALLBACK": "0"}):
            with _RealPatch("mock", "live"):
                self.assertEqual(mp.active_media_provider(), "mock")

    def test_pinned_fal(self) -> None:
        with mock.patch.dict(
            os.environ, {"DEVCUT_MEDIA_PROVIDER": "fal", "DEVCUT_MEDIA_FALLBACK": "1"}
        ):
            with _RealPatch("live", "mock"):
                self.assertEqual(mp.active_media_provider(), "runway")


class FallbackTests(unittest.TestCase):
    def test_image_falls_back_to_fal_on_runway_error(self) -> None:
        with mock.patch.dict(
            os.environ, {"DEVCUT_MEDIA_PROVIDER": "runway", "DEVCUT_MEDIA_FALLBACK": "1"}
        ):
            with _RealPatch("live", "live"):
                with mock.patch(
                    "src.media_provider._runway_image",
                    side_effect=RuntimeError("runway down"),
                ):
                    with mock.patch(
                        "src.media_provider.fal_client.generate_reference_image",
                        return_value=RunwayImageResult(url="http://fal", prompt="p", mode="LIVE", provider="fal"),
                    ) as fal_called:
                        res = mp.generate_reference_image("p", "1280:720")
        self.assertEqual(res.provider, "fal")
        fal_called.assert_called_once()

    def test_no_fallback_re_surfaces_error(self) -> None:
        with mock.patch.dict(
            os.environ, {"DEVCUT_MEDIA_PROVIDER": "runway", "DEVCUT_MEDIA_FALLBACK": "0"}
        ):
            with _RealPatch("live", "live"):
                with mock.patch(
                    "src.media_provider._runway_image",
                    side_effect=RuntimeError("boom"),
                ):
                    with self.assertRaises(RuntimeError):
                        mp.generate_reference_image("p", "1280:720")


if __name__ == "__main__":
    unittest.main()
