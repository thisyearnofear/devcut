#!/usr/bin/env python3
"""Materialize a DevCut HyperFrames kit onto disk (no API keys).

Examples:
  # Golden MOCK fixture (default) → docs/demos/fixtures/golden-challenge-cut/
  uv run python scripts/materialize_hf_kit.py --golden

  # From an existing kit.zip downloaded in the browser
  uv run python scripts/materialize_hf_kit.py --zip ~/Downloads/foo-hyperframes-kit.zip --out ./my-hf-project

  # From separate BRIEF + assets.json
  uv run python scripts/materialize_hf_kit.py --brief BRIEF.md --assets assets.json --out ./devcut-kit
"""

from __future__ import annotations

import argparse
import json
import sys
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
AGENT_SRC = ROOT / "apps" / "agent"
FIXTURE_DIR = ROOT / "docs" / "demos" / "fixtures" / "golden-challenge-cut"


def _ensure_agent_path() -> None:
    sys.path.insert(0, str(AGENT_SRC))


def build_golden_kit() -> dict:
    _ensure_agent_path()
    from src.hyperframes_kit import build_builder_kit

    shots = []
    beats = [
        ("Problem", "Broken links after the weekend; judges cannot open assets"),
        ("Constraint", "Genblaze + Backblaze B2 for durable storage and provenance"),
        ("Winning artifact", "Public durable MP4, manifest JSON, HyperFrames BRIEF drop"),
        ("Anti-pattern", "Laptop-only /tmp demo and BYOK chaos"),
        ("CTA", "Fork the builder kit and pin this Challenge Cut"),
    ]
    for i, (beat, prompt) in enumerate(beats):
        shots.append(
            {
                "index": i,
                "beat": beat,
                "prompt": prompt,
                "duration": 5,
                "ref_image_url": f"https://mock.devcut.local/golden/s{i}-still.png",
                "video_url": f"https://mock.devcut.local/golden/s{i}-clip.mp4",
            }
        )
    state = {
        "storyboard": {
            "title": "Genblaze + B2 Challenge Cut",
            "logline": "Win with durable media + a HyperFrames-ready kit",
            "aspect_ratio": "1280:720",
        },
        "shots": shots,
        "final_video_url": "https://mock.devcut.local/golden/final-cut.mp4",
        "durable_url": "https://mock.devcut.local/golden/final-cut.mp4",
    }
    return build_builder_kit(state)


def write_kit_dir(kit: dict, out: Path) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []

    brief = out / "BRIEF.md"
    brief.write_text(kit["brief_md"], encoding="utf-8")
    written.append(brief)

    assets_path = out / "assets.json"
    assets_doc = {
        "product": "DevCut",
        "title": kit.get("title"),
        "mode": kit.get("mode"),
        "workflow": kit.get("workflow"),
        "summary": kit.get("summary"),
        "assets": kit.get("assets") or [],
        "note": "MOCK URLs until a LIVE golden run fills real stills/clips.",
    }
    assets_path.write_text(json.dumps(assets_doc, indent=2) + "\n", encoding="utf-8")
    written.append(assets_path)

    readme = out / "README.md"
    readme.write_text(
        "\n".join(
            [
                f"# {kit.get('title') or 'DevCut'} → HyperFrames kit",
                "",
                str(kit.get("summary") or ""),
                "",
                "## Drop steps",
                "",
                str(kit.get("drop_instructions") or ""),
                "",
                "## Files",
                "",
                "- `BRIEF.md` — paste at HyperFrames project root",
                "- `assets.json` — download each `url` into `path`",
                "- `ASSETS.md` — human checklist",
                "",
                "Materialize again anytime:",
                "",
                "```bash",
                "uv run python scripts/materialize_hf_kit.py --golden",
                "```",
                "",
            ]
        ),
        encoding="utf-8",
    )
    written.append(readme)

    checklist = out / "ASSETS.md"
    lines = ["# Asset checklist", ""]
    for a in kit.get("assets") or []:
        lines.append(f"- [ ] `{a['path']}` — {a['kind']} · {a['beat']}")
        lines.append(f"  - source: {a['url']}")
        lines.append("")
    checklist.write_text("\n".join(lines), encoding="utf-8")
    written.append(checklist)

    # Suggested empty dirs so HF projects see the layout
    (out / "assets" / "devcut").mkdir(parents=True, exist_ok=True)
    written.append(out / "assets" / "devcut")

    meta = out / "kit.meta.json"
    meta.write_text(
        json.dumps(
            {
                "mode": kit.get("mode"),
                "workflow": kit.get("workflow"),
                "title": kit.get("title"),
                "mock": True,
                "source": "scripts/materialize_hf_kit.py --golden",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    written.append(meta)
    return written


def unpack_zip(zip_path: Path, out: Path) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    with zipfile.ZipFile(zip_path) as zf:
        for name in zf.namelist():
            # flatten single root folder if present
            target_name = name.split("/", 1)[-1] if "/" in name.rstrip("/") else name
            if not target_name or name.endswith("/"):
                continue
            dest = out / target_name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(zf.read(name))
            written.append(dest)
    return written


def from_files(brief: Path, assets: Path, out: Path) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    brief_out = out / "BRIEF.md"
    brief_out.write_text(brief.read_text(encoding="utf-8"), encoding="utf-8")
    assets_out = out / "assets.json"
    assets_out.write_text(assets.read_text(encoding="utf-8"), encoding="utf-8")
    (out / "assets" / "devcut").mkdir(parents=True, exist_ok=True)
    return [brief_out, assets_out, out / "assets" / "devcut"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--golden",
        action="store_true",
        help=f"Build MOCK golden Challenge Cut kit into {FIXTURE_DIR}",
    )
    parser.add_argument("--zip", type=Path, help="Unpack a browser-downloaded kit.zip")
    parser.add_argument("--brief", type=Path, help="BRIEF.md to copy")
    parser.add_argument("--assets", type=Path, help="assets.json to copy")
    parser.add_argument(
        "--out",
        type=Path,
        help="Output directory (default: fixture dir for --golden, else ./devcut-kit)",
    )
    args = parser.parse_args()

    if args.golden:
        out = args.out or FIXTURE_DIR
        kit = build_golden_kit()
        written = write_kit_dir(kit, out)
        print(f"OK: golden MOCK kit → {out}")
        for p in written:
            print(f"  - {p.relative_to(ROOT) if p.is_relative_to(ROOT) else p}")
        return 0

    if args.zip:
        out = args.out or Path("devcut-kit")
        written = unpack_zip(args.zip, out)
        print(f"OK: unpacked {args.zip} → {out} ({len(written)} files)")
        return 0

    if args.brief and args.assets:
        out = args.out or Path("devcut-kit")
        written = from_files(args.brief, args.assets, out)
        print(f"OK: copied BRIEF + assets → {out}")
        for p in written:
            print(f"  - {p}")
        return 0

    parser.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
