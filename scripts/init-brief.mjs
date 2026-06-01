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
  const surfaceHint = {
    "marketing-web": "TODO - first-viewport brand/product signal, meaningful media, narrative posture, and non-generic conversion path.",
    "web-app": "TODO - primary workflow, task hierarchy, control model, states, and why the layout is better than a generic app shell.",
    "dashboard": "TODO - operating model, metric roles, chart/table hierarchy, integrated data caveats, and why this is more than metric cards plus a chart.",
    "data-viz": "TODO - analytical question, scale/encoding truth, integrated source/caveat labels, responsive labels, and chart interaction states.",
    "game-canvas": "TODO - gameplay promise, UI fantasy, HUD/menu relationship to canvas, motion/input expectations, and mobile framing.",
    "native-ios": "TODO - platform-native thesis, navigation, Dynamic Type behavior, appearance states, and why custom styling remains native.",
    "native-android": "TODO - platform-native thesis, Material/Compose component choices, font-scale behavior, IME states, and dark theme behavior.",
    "cross-platform": "TODO - shared product thesis plus platform-specific bars for each runtime.",
    "other": "TODO - surface-specific quality bar and how success will be judged visually.",
  }[surface] || "TODO - surface-specific quality bar.";
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

TODO - named style, mood, density, motion level, and visual references. If the user did not provide a style, infer and state one before implementation.

## Design Quality Bar

- Design thesis: TODO - one or two sentences naming the product-specific point of view.
- Primary workflow: TODO - what the first screen helps the user decide or do.
- Style posture: TODO - named visual stance, not "clean and modern"; infer one if the user did not provide one.
- Why this posture fits: TODO - one sentence tying the posture to audience, workflow, content, and usage context.
- Surface quality bar: ${surfaceHint}
- Design exploration depth: TODO - lean by default; use standard/deep only when the user asks for broader design-element exploration, multiple directions, or lawful source curation.
- Visual signature: TODO - concrete typography, composition, color, spacing, imagery, motion, or interaction choices that make the interface distinct.
- Signature move: TODO - one visible decision that makes the result recognizable, such as composition, type, evidence treatment, media, motion, or domain metaphor.
- Domain-specific artifact: TODO - visible object, spatial model, timeline, map, instrument, cutaway, workbench, or content structure that could only belong to this domain.
- Interaction or dynamism plan: TODO - interactive state, motion, reveal, comparison, live control, or static-dynamic substitute to verify.
- Conventionality risk: TODO - the boring default this could fall into and how the design will avoid it.
- Style commitment: TODO - 5-8 lines max; lock the visible art-direction choice before implementation.
- First-viewport consequence: TODO - what visibly changes above the fold because of the style commitment.
- Layout consequence: TODO - what structure rejects the generic header/cards/chart/table scaffold.
- Typography consequence: TODO - what type scale, density, pairing, or rhythm does.
- Color/material consequence: TODO - what color, contrast, texture, or surface language does beyond decoration.
- Generic pattern rejected: TODO - the specific default pattern this design refuses.
- Distinctiveness floor: TODO - at least two non-generic commitments that must be visible in screenshots.
- Composition proof: TODO - first viewport hierarchy, mobile/desktop layout, and why the structure serves the primary workflow.
- Impeccable route: TODO - primary and secondary Impeccable command(s), such as craft, polish, bolder, layout, typeset, adapt, harden, clarify, colorize, or animate; include every command triggered by the request or record a waiver.
- Impeccable execution: TODO - actual Impeccable skill and command reference(s) loaded/run, checks applied, or explicit user waiver.
- Reference discovery plan: TODO - standards, design systems, domain/visualization references, high-reputation inspiration, fonts/assets, or motion sources to check before implementation; record rejected buckets too.
- Anti-generic checks: TODO - defaults to avoid, such as generic pills/chips/capsules, generic card grids, fake dashboard chrome, stock heroes, web-card native screens, or decorative styling that does not serve the task.
- Hallmark / anti-slop review: TODO - Hallmark audit/pre-emit critique, or equivalent anti-slop checklist if Hallmark is unavailable.
- Hallmark execution: TODO - actual Hallmark skill/review loaded/run, or unavailable/waived fallback with reason.

## Inspirations

- TODO - URL, screenshot, product, design system, library, or "agent may research"; broad design work should run a reference discovery pass unless the user forbids browsing.
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
