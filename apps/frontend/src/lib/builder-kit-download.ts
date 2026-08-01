/** Client-side HyperFrames builder kit files + minimal ZIP (store). */

import type { BuilderKit } from "@/lib/storyboard/types";

export function kitReadme(kit: BuilderKit): string {
  const modeLabel =
    kit.mode === "challenge" ? "Challenge Cut builder kit" : "Submit Ready handoff";
  return `# DevCut → HyperFrames kit

${modeLabel}: **${kit.title}**

DevCut generated generative heroes + packaging. **HyperFrames** owns HTML composition and final render.

## Quick start

1. \`npx hyperframes@latest init\` (or open your existing project).
2. Copy \`BRIEF.md\` to the project root (merge Intent/Assets if one exists).
3. Download each URL in \`assets.json\` into the listed \`path\` under your project.
4. Wire \`<video>\` / \`<img>\` sources to those paths.
5. \`npx hyperframes check\` → preview → render.

## Unpack on disk (CLI)

From the repo root, after downloading kit.zip:

\`\`\`bash
uv run python scripts/materialize_hf_kit.py --zip ~/Downloads/<kit>.zip --out ./devcut-kit
\`\`\`

Golden MOCK fixture (no keys):

\`\`\`bash
bash scripts/smoke-golden-mock.sh
\`\`\`

## Split of ownership

| Layer | Owner |
| --- | --- |
| Generative stills / clips / stitch | DevCut (Runway) |
| BRIEF / storyboard / HTML composition | HyperFrames |

See: https://github.com/thisyearnofear/gen-ui/blob/main/docs/hyperframes.md

## Drop steps

${kit.drop_instructions}
`;
}

export function kitAssetsJson(kit: BuilderKit): string {
  return `${JSON.stringify(
    {
      product: "DevCut",
      title: kit.title,
      mode: kit.mode,
      workflow: kit.workflow,
      summary: kit.summary,
      assets: kit.assets,
    },
    null,
    2,
  )}\n`;
}

export function slugifyKitTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "devcut-kit"
  );
}

/** Build kit file map for ZIP download. */
export function buildKitFiles(kit: BuilderKit): Record<string, string> {
  const root = `${slugifyKitTitle(kit.title)}-hyperframes-kit`;
  return {
    [`${root}/BRIEF.md`]: kit.brief_md,
    [`${root}/assets.json`]: kitAssetsJson(kit),
    [`${root}/README.md`]: kitReadme(kit),
  };
}

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Minimal ZIP (store / no compression) — no dependency. */
export function zipStore(files: Record<string, string>): Blob {
  const enc = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const [name, text] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const data = enc.encode(text);
    const crc = crc32(data);
    const localHeader = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]);
    localParts.push(localHeader, data);
    const central = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    centralParts.push(central);
    offset += localHeader.length + data.length;
  }

  const centralDir = concat(centralParts);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(Object.keys(files).length),
    u16(Object.keys(files).length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);

  return new Blob([concat([...localParts, centralDir, end])], {
    type: "application/zip",
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadBuilderKitZip(kit: BuilderKit): void {
  const files = buildKitFiles(kit);
  const blob = zipStore(files);
  downloadBlob(blob, `${slugifyKitTitle(kit.title)}-hyperframes-kit.zip`);
}
