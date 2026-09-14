"""Unit tests for the Remotion composition kit builder (no API keys).

Run: cd apps/agent && python3 -m unittest tests.test_remotion_kit -v
"""

from __future__ import annotations

import json
import unittest

from src.remotion_kit import (
    FPS,
    build_remotion_kit,
    build_shots_ts,
    dimensions,
    remotion_paths,
)


GOLDEN_SHOTS = [
    {
        "index": i,
        "beat": b,
        "prompt": f"hero {b}",
        "duration": 5,
        "ref_image_url": f"https://mock.example/s{i}.png",
        "video_url": f"https://mock.example/s{i}.mp4",
    }
    for i, b in enumerate(["Problem", "Product", "Proof", "CTA"])
]


def _state(**over) -> dict:
    st = {
        "storyboard": {
            "title": "Ship It",
            "logline": "Launch demo",
            "aspect_ratio": "1280:720",
        },
        "shots": GOLDEN_SHOTS,
        "final_video_url": "https://mock.example/final.mp4",
        "durable_url": "https://mock.example/final.mp4",
    }
    st.update(over)
    return st


class DimensionsTests(unittest.TestCase):
    def test_aspect_to_resolution(self) -> None:
        self.assertEqual(dimensions("1280:720"), (1920, 1080))
        self.assertEqual(dimensions("720:1280"), (1080, 1920))


class KitShapeTests(unittest.TestCase):
    def test_kit_shape_and_mode(self) -> None:
        kit = build_remotion_kit(_state())
        self.assertEqual(kit["mode"], "submit")
        self.assertEqual(kit["workflow"], "remotion-composition")
        self.assertEqual(kit["title"], "Ship It")
        self.assertEqual(len(kit["assets"]), 9)  # 4 stills + 4 clips + 1 final

    def test_files_map_contains_scaffold(self) -> None:
        kit = build_remotion_kit(_state())
        files = kit["files"]
        for needed in [
            "package.json",
            "remotion.config.ts",
            "tsconfig.json",
            "src/index.ts",
            "src/Root.tsx",
            "src/DevCutComposition.tsx",
            "src/shots.ts",
            "BRIEF.md",
            "assets.json",
            "README.md",
        ]:
            self.assertIn(needed, files, needed)
        json.loads(files["package.json"])  # valid JSON
        json.loads(files["assets.json"])

    def test_assets_paths_remapped_to_public(self) -> None:
        kit = build_remotion_kit(_state())
        for a in kit["assets"]:
            if a["kind"] in ("still", "clip"):
                self.assertTrue(a["path"].startswith("public/assets/devcut/"), a["path"])


class ShotsTsTests(unittest.TestCase):
    def test_frame_math_and_kinds(self) -> None:
        ts = build_shots_ts({"aspect_ratio": "1280:720"}, GOLDEN_SHOTS)
        self.assertIn(f"export const FPS = {FPS};", ts)
        self.assertIn("export const WIDTH = 1920;", ts)
        # 4 shots * 5s * 30fps = 600 frames
        self.assertIn("150", ts)
        shots_json = ts.split("export const SHOTS: Shot[] = ")[1].split(";\n")[0]
        entries = json.loads(shots_json)
        self.assertEqual(len(entries), 4)
        self.assertTrue(all(e["kind"] == "video" for e in entries))
        self.assertTrue(all(e["durationInFrames"] == 150 for e in entries))

    def test_escapes_quotes_in_beats(self) -> None:
        shots = [dict(GOLDEN_SHOTS[0], beat='Say "hi" today', prompt="p")]
        ts = build_shots_ts({"aspect_ratio": "1280:720"}, shots)
        self.assertIn("\\\"hi\\\"", ts)  # JSON-escaped double quote


if __name__ == "__main__":
    unittest.main()
