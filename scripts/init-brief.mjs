#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const SURFACES = new Set([
  "marketing-web",
  "web-app",
  "dashboard",
  "data-viz",
  "game-canvas",
  "native-ios",
  "native-android",
  "cross-platform",
  "other",
]);

function parseArgs(argv) {
  const args = { out: ".design-director", surface: "marketing-web", force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--file") args.file = argv[++i];
    else if (arg === "--surface") args.surface = argv[++i];
    else if (arg === "--force") args.force = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `Usage: init-brief.mjs [--surface marketing-web|web-app|dashboard|data-viz|game-canvas|native-ios|native-android|cross-platform|other] [--out .design-director] [--file .design-director/design-brief.md] [--force]

Creates a new-build design brief scaffold. Missing local truth is kept explicit
so agents do not silently invent product facts, data, copy, or constraints.`;
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function briefTemplate(surface) {
  return `# Design Brief

## Intent

\`concept -> implement -> QA\`

## Platform Surface

\`${surface}\`

## Source Truth / Local Truth

- Existing codebase: TODO - none / path / running URL.
- Product or feature purpose: TODO.
- Source content/data: TODO.
- Brand constraints: TODO.
- Platform constraints: TODO.
- Missing local truth: TODO - list every unknown that must be asked, researched, or explicitly assumed before implementation.

## Audience

TODO - primary users, context, device mix, and success criteria.

## Desired Style

TODO - named style, mood, density, motion level, and visual references.

## Inspirations

- TODO - URL, screenshot, product, design system, library, or "agent may research".
- Each source must also appear in \`research-ledger.yaml\` with license/use boundaries.

## Design System And Libraries

- Existing system: TODO.
- Candidate libraries: TODO - do not install or vendor until license/source is recorded.
- Fonts/assets: TODO - do not import until license/source is recorded.

## Anti-Goals

- TODO - what must not change, copy, obscure, or invent.

## Accessibility And Interaction Constraints

- Keyboard/focus states: TODO.
- Reduced motion: TODO.
- Touch targets: TODO.
- Native platform conventions, if applicable: TODO.

## Acceptance Gates

- TODO - target viewports/devices.
- TODO - active states to verify.
- TODO - screenshot notes inspected.
- TODO - \`.design-director/design-qa.json\` or \`native-design-qa.json\` reaches \`acceptanceReady: true\`.
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!SURFACES.has(args.surface)) {
    throw new Error(`Unknown --surface: ${args.surface}`);
  }
  const outDir = path.resolve(args.out);
  const file = path.resolve(args.file || path.join(outDir, "design-brief.md"));
  if (!args.force && await exists(file)) {
    throw new Error(`${file} already exists; use --force to overwrite`);
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, briefTemplate(args.surface));
  console.log(`brief:new: wrote ${file}`);
}

main().catch((error) => {
  console.error(`brief:new failed: ${error.message}`);
  process.exit(1);
});
