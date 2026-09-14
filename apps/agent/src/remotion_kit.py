"""Remotion composition kit — code-native sibling to the HyperFrames kit.

DevCut does not author Remotion compositions either. For developers who
already work in React/Remotion (or who want a more code-native canvas than
HyperFrames), we emit a drop-in Remotion project scaffold that plays the
generative clips back linearly with a beat caption per shot. The builder
owns the timeline, typography, and motion — DevCut supplies the media and
a working first render.

Emitted files (same union of product state + packaging as the HF kit):
- package.json / remotion.config.ts / tsconfig.json / src/index.ts
- src/Root.tsx + src/DevCutComposition.tsx (static template)
- src/shots.ts (generated shot manifest — floats safe via JSON)
- BRIEF.md / assets.json / README.md (packaging)

Run: `npm i` → `npx remotion studio` → `npx remotion render DevCut out/final.mp4`.
"""

from __future__ import annotations

import json
from typing import Any

from .hyperframes_kit import build_assets_lines, infer_mode

FPS = 30


def dimensions(aspect: str) -> tuple[int, int]:
    """Composition dimensions from a DevCut ratio string."""
    if aspect in ("720:1280", "9:16"):
        return 1080, 1920
    return 1920, 1080


def remotion_paths(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    """Remap HF `assets/devcut/…` drop paths to Remotion's `public/…`."""
    out = []
    for row in rows:
        r = dict(row)
        if r.get("path", "").startswith("assets/devcut/"):
            r["path"] = "public/" + r["path"]
            r["note"] = (r.get("note") or "").replace("assets/devcut/", "public/assets/devcut/")
        out.append(r)
    return out

# --------------------------------------------------------------------- static scaffold files


PACKAGE_JSON = {
    "name": "devcut-remotion-kit",
    "version": "1.0.0",
    "private": True,
    "description": "DevCut → Remotion composition scaffold",
    "scripts": {
        "studio": "remotion studio",
        "render": "remotion render DevCut out/final.mp4",
        "upgrade": "remotion upgrade",
    },
    "dependencies": {
        "@remotion/cli": "^4.0.0",
        "react": "^19.0.0",
        "react-dom": "^19.0.0",
        "remotion": "^4.0.0",
    },
    "devDependencies": {
        "@types/react": "^19.0.0",
        "typescript": "^5.5.0",
    },
}


REMOTION_CONFIG_TS = """\
import {Config} from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setEntryPoint("src/index.ts");
"""


TSCONFIG_JSON = {
    "compilerOptions": {
        "target": "ES2022",
        "module": "ESNext",
        "moduleResolution": "Bundler",
        "jsx": "react-jsx",
        "strict": True,
        "esModuleInterop": True,
        "resolveJsonModule": True,
        "skipLibCheck": True,
        "noEmit": True,
        "lib": ["ES2022"],
    },
    "include": ["src"],
}


SRC_INDEX_TS = """\
import {registerRoot} from "remotion";
import {RemotionRoot} from "./Root";

registerRoot(RemotionRoot);
"""


SRC_ROOT_TSX = """\
import React from "react";
import {Composition} from "remotion";
import {DevCutComposition} from "./DevCutComposition";
import {FPS, HEIGHT, TOTAL_DURATION_IN_FRAMES, WIDTH} from "./shots";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="DevCut"
      component={DevCutComposition}
      durationInFrames={TOTAL_DURATION_IN_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};
"""


SRC_DEV_CUT_COMPOSITION_TSX = """\
import React from "react";
import {AbsoluteFill, Img, OffthreadVideo, Sequence, useCurrentFrame, interpolate, useVideoConfig} from "remotion";
import {SHOTS} from "./shots";

const accent = "#2DE2C5";
const ink = "#050607";
const paper = "#F4F0E8";

const Caption: React.FC<{beat: string}> = ({beat}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 48,
        right: 48,
        bottom: 48,
        display: "flex",
        justifyContent: "center",
        opacity,
      }}
    >
      <div
        style={{
          background: "rgba(5,6,7,0.74)",
          borderLeft: `4px solid ${accent}`,
          padding: "16px 26px",
          borderRadius: 8,
          maxWidth: "80%",
        }}
      >
        <span
          style={{
            color: paper,
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: "0.01em",
            lineHeight: 1.15,
          }}
        >
          {beat}
        </span>
      </div>
    </div>
  );
};

const ShotLayer: React.FC<{shot: (typeof SHOTS)[number]}> = ({shot}) => {
  const {width, height} = useVideoConfig();
  const style: React.CSSProperties = {width, height, objectFit: "cover"};
  if (shot.kind === "video") {
    return (
      <AbsoluteFill>
        <OffthreadVideo src={shot.src} style={style} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill>
      <Img src={shot.src} style={style} />
    </AbsoluteFill>
  );
};

export const DevCutComposition: React.FC = () => {
  let cursor = 0;
  return (
    <AbsoluteFill style={{backgroundColor: ink}}>
      {SHOTS.map((shot, i) => {
        const from = cursor;
        cursor += shot.durationInFrames;
        return (
          <Sequence key={i} from={from} durationInFrames={shot.durationInFrames}>
            <ShotLayer shot={shot} />
            <Caption beat={shot.beat} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
"""

# --------------------------------------------------------------------- generated files


def _escape(value: Any) -> str:
    """JSON-encode a Python value for safe embedding in TypeScript."""
    return json.dumps(value, ensure_ascii=False)


def build_shots_ts(storyboard: dict[str, Any], shots: list[dict[str, Any]]) -> str:
    """Generate `src/shots.ts` — media manifest + composition math."""
    aspect = str(storyboard.get("aspect_ratio") or "1280:720")
    width, height = dimensions(aspect)
    entries = []
    total = 0
    for s in shots:
        beat = str(s.get("beat") or f"Shot {int(s.get('index') or 0) + 1}")
        video_url = s.get("video_url")
        src = str(video_url or s.get("ref_image_url") or "")
        if not src:
            continue
        frame_count = max(1, round(int(s.get("duration") or 5) * FPS))
        total += frame_count
        entries.append(
            {
                "beat": beat,
                "src": src,
                "kind": "video" if video_url else "image",
                "durationInFrames": frame_count,
                "prompt": str(s.get("prompt") or ""),
            }
        )
    if not entries:
        # Keep the scaffold renderable even if a kit is emitted pre-media.
        entries.append({"beat": "Reaction", "src": "", "kind": "image", "durationInFrames": FPS * 5, "prompt": ""})
        total = FPS * 5
        width, height = 1920, 1080
    return (
        "// Generated by DevCut — edit src/DevCutComposition.tsx to compose.\n\n"
        f"export const FPS = {FPS};\n"
        f"export const WIDTH = {width};\n"
        f"export const HEIGHT = {height};\n\n"
        "export type Shot = {\n"
        '  beat: string;\n'
        '  src: string;\n'
        '  kind: "video" | "image";\n'
        "  durationInFrames: number;\n"
        "  prompt: string;\n"
        "};\n\n"
        f"export const SHOTS: Shot[] = {_escape(entries)};\n\n"
        "export const TOTAL_DURATION_IN_FRAMES = SHOTS.reduce(\n"
        "  (acc, s) => acc + s.durationInFrames,\n"
        "  0,\n"
        ");\n"
    )


def build_assets_json_ts(rows: list[dict[str, str]], title: str, mode: str, workflow: str, summary: str) -> str:
    doc = {
        "product": "DevCut",
        "title": title,
        "mode": mode,
        "workflow": workflow,
        "summary": summary,
        "assets": rows,
    }
    return json.dumps(doc, indent=2) + "\n"


def build_remotion_readme(kit: dict[str, Any]) -> str:
    title = kit.get("title") or "DevCut cut"
    mode_label = "Challenge Cut" if kit.get("mode") == "challenge" else "Submit Ready"
    return (
        f"# DevCut → Remotion kit — {title}\n\n"
        f"{mode_label}. DevCut generated the heroes + scaffold; **Remotion** owns composition.\n\n"
        "## Quick start\n\n"
        "```bash\n"
        "npm install\n"
        "npx remotion studio     # iterate the timeline / captions\n"
        "npx remotion render DevCut out/final.mp4\n"
        "```\n\n"
        "## What's here\n\n"
        "- `src/shots.ts` — generated shot manifest (beat, src, frames).\n"
        "- `src/DevCutComposition.tsx` — sequences each clip with a beat caption.\n"
        "- `assets.json` — every URL this run produced (stills + clips + final).\n"
        "- `BRIEF.md` — seed intent; merge into your working notes.\n\n"
        "Tips:\n"
        "1. Remote MP4s play via `<OffthreadVideo>`. For big renders, download to\n"
        "   `public/assets/devcut/` and swap `src` to a `staticFile()`.\n"
        "2. Split each `Sequence` into its own composition, or add transitions\n"
        "   between them to level up the cut.\n"
        "3. Keep typography / UI chrome in React — not in the generated stills.\n"
    )

# --------------------------------------------------------------------- brief + kit assembly


def build_remotion_brief(
    mode: str,
    storyboard: dict[str, Any],
    shots: list[dict[str, Any]],
    assets: list[dict[str, str]],
) -> str:
    title = str(storyboard.get("title") or "DevCut handoff").strip()
    logline = str(storyboard.get("logline") or "").strip()
    aspect = str(storyboard.get("aspect_ratio") or "1280:720")
    length_s = sum(int(s.get("duration") or 5) for s in shots) or 30
    asset_lines = "\n".join(f"- `{a['path']}` ({a['kind']}) — {a['url']}" for a in assets)
    if not asset_lines:
        asset_lines = "- _none yet_ — generate stills/clips to fill Assets."
    shot_lines = "\n".join(
        f"- **{s.get('beat') or f'Shot {i+1}'}** ({int(s.get('duration') or 5)}s) — {s.get('prompt') or ''}"
        for i, s in enumerate(shots)
    )
    return (
        "---\n"
        f"title: {title}\n"
        f"logline: {logline}\n"
        f"workflow: remotion-composition\n"
        f"aspect: {'1080x1920' if aspect in ('720:1280', '9:16') else '1920x1080'}\n"
        f"fps: {FPS}\n"
        f"length: {length_s}s\n"
        "---\n\n"
        "## Intent\n\n"
        f"{logline}\n\n"
        "## Assets\n\n"
        f"{asset_lines}\n\n"
        "## Customizations\n\n"
        "- Stage clips/stills under `public/assets/devcut/` before rendering.\n"
        "- Own the timeline and typography in `src/DevCutComposition.tsx`.\n"
        "- Prefer `staticFile()/OffthreadVideo` for production renders.\n\n"
        "## Notes\n\n"
        "- This is a starter scaffold, not a finished film — Remotion is the composition OS.\n\n"
        "### Shot list (from DevCut)\n\n"
        f"{shot_lines}\n"
    )


def build_remotion_kit(
    state: dict[str, Any] | None,
    *,
    final_video_url: str | None = None,
    durable_url: str | None = None,
) -> dict[str, Any]:
    """Return a JSON-serializable remotion_kit for agent state / UI / a zip."""
    state = state or {}
    storyboard = dict(state.get("storyboard") or {})
    shots = list(state.get("shots") or [])
    mode = infer_mode(storyboard, shots)
    rows = build_assets_lines(
        shots,
        final_video_url=final_video_url or state.get("final_video_url"),
        durable_url=durable_url or state.get("durable_url"),
    )
    assets = remotion_paths(rows)
    brief = build_remotion_brief(mode=mode, storyboard=storyboard, shots=shots, assets=assets)
    workflow = "remotion-composition"
    summary = (
        "Remotion scaffold ready — `src/shots.ts` is wired; `npm i && npx remotion render`."
        if assets
        else "Remotion scaffold ready — generate stills/clips to fill shots.ts."
    )
    readme = build_remotion_readme(
        {"mode": mode, "workflow": workflow, "title": storyboard.get("title") or "DevCut cut"}
    )
    files = {
        "package.json": json.dumps(PACKAGE_JSON, indent=2) + "\n",
        "remotion.config.ts": REMOTION_CONFIG_TS,
        "tsconfig.json": json.dumps(TSCONFIG_JSON, indent=2) + "\n",
        "src/index.ts": SRC_INDEX_TS,
        "src/Root.tsx": SRC_ROOT_TSX,
        "src/DevCutComposition.tsx": SRC_DEV_CUT_COMPOSITION_TSX,
        "src/shots.ts": build_shots_ts(storyboard, shots),
        "BRIEF.md": brief,
        "assets.json": build_assets_json_ts(assets, storyboard.get("title") or "DevCut cut", mode, workflow, summary),
        "README.md": readme,
    }
    return {
        "mode": mode,
        "workflow": workflow,
        "title": storyboard.get("title") or "DevCut cut",
        "brief_md": brief,
        "assets": assets,
        "files": files,
        "drop_instructions": (
            "1. `npm install`\n"
            "2. `npx remotion studio` — see src/DevCutComposition.tsx + src/shots.ts\n"
            "3. `npx remotion render DevCut out/final.mp4`\n"
            "Remote clip URLs play out of the box; download to public/assets/devcut/ for big renders."
        ),
        "summary": summary,
    }

