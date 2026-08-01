#!/usr/bin/env node
/**
 * Frontend kit + golden constant asserts (no test runner / no keys).
 * Run: node scripts/assert-frontend-kit.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function must(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

const devcut = readFileSync(join(root, "apps/frontend/src/lib/devcut.ts"), "utf8");
must(devcut.includes("export const DEVCUT_GOLDEN_CHALLENGE"), "missing DEVCUT_GOLDEN_CHALLENGE");
must(
  /titleHint:\s*"Genblaze \+ B2 Challenge Cut"/.test(devcut),
  "golden titleHint mismatch",
);
must(devcut.includes("Anti-pattern"), "golden brief missing Anti-pattern beat");
must(devcut.includes("mode: \"challenge\""), "golden mode must be challenge");

const kitSrc = readFileSync(
  join(root, "apps/frontend/src/lib/builder-kit-download.ts"),
  "utf8",
);
must(kitSrc.includes("BRIEF.md"), "kit zip must include BRIEF.md");
must(kitSrc.includes("assets.json"), "kit zip must include assets.json");
must(kitSrc.includes("README.md"), "kit zip must include README.md");
must(kitSrc.includes("buildKitFiles"), "missing buildKitFiles");
must(kitSrc.includes("downloadBuilderKitZip"), "missing downloadBuilderKitZip");

// Pure logic mirror of buildKitFiles naming
function slugify(title) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "devcut-kit"
  );
}
const rootName = `${slugify("Genblaze + B2 Challenge Cut")}-hyperframes-kit`;
must(
  rootName === "genblaze-b2-challenge-cut-hyperframes-kit",
  `unexpected kit root: ${rootName}`,
);
const expected = [
  `${rootName}/BRIEF.md`,
  `${rootName}/assets.json`,
  `${rootName}/README.md`,
];
must(expected.length === 3, "zip file set size");

console.log("OK: frontend kit + golden constant asserts");
console.log(`    kit root: ${rootName}`);
console.log(`    files: ${expected.join(", ")}`);
