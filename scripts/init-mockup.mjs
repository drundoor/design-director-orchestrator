#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureAbsoluteTarget,
  fileUrlFor,
  mockupOutputRoot,
  parseKeyValueArgs,
  qaRunIdFor,
  slugify,
  writeJson,
} from "./lib/mockup-context.mjs";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function usage() {
  return `Usage: init-mockup.mjs --target-root <absolute path> --slug <slug> --surface <surface> [--profile static-mockup]

Creates an isolated Design Director static mockup folder and run context. This
does not perform QA and does not mark the artifact acceptance-ready.`;
}

function compactBrief({ slug, surface, profile, qaRunId }) {
  return `# Design Brief

## Compact Fast-Path Brief

- Intent: concept -> implement -> draft QA
- Platform/surface: ${surface}
- Profile: ${profile}
- qaRunId: ${qaRunId}
- Local truth status: empty or standalone mockup target unless updated below
- Source-of-truth ranking: accessibility/touch/keyboard; user prompt; local reference pack; implementation result
- Anti-goals: generic functional scaffold, decorative/source/nav pills, copied vendor layout, untested active states
- Design thesis: TODO before implementation
- Primary workflow: TODO before implementation
- Style posture: TODO before implementation
- Why this posture fits: TODO before implementation
- Surface quality bar: TODO before implementation
- Design exploration depth: lean unless user requested standard/deep
- Visual signature: TODO before implementation
- Signature move: TODO before implementation
- Domain-specific artifact: TODO visible object, map, instrument, cutaway, workbench, timeline, or content structure
- Interaction or dynamism plan: TODO interactive state, motion, reveal, comparison, or static-dynamic substitute
- Conventionality risk: TODO boring default to avoid
- Style commitment: TODO 5-8 lines with first-viewport/layout/type/color consequences
- First-viewport consequence: TODO
- Layout consequence: TODO
- Typography consequence: TODO
- Color/material consequence: TODO
- Generic pattern rejected: TODO
- Distinctiveness floor: TODO at least two non-generic commitments visible in screenshots
- Composition proof: TODO
- Impeccable route: TODO compact draft route; include bolder by default for open-ended greenfield work
- Impeccable execution: TODO compact evidence of loaded/run checks or explicit user waiver
- Hallmark / anti-slop review: TODO compact plan
- Hallmark execution: TODO compact anti-slop evidence or unavailable fallback
- Reference strategy: seeded local pack first; browse only for standard/deep exploration or unfamiliar domain
- Data caveat policy: record truth status in QA; keep UI caveat subtle unless stakeholder-facing or real-data risk applies
- Draft QA gates: mobile/tablet/desktop screenshots, active-state recipe, overflow/touch/console checks, focused decision-area evidence when relevant

## Implementation Notes

- Work only inside this mockup folder.
- Replace this compact skeleton after the artifact exists with observed design and QA evidence.
- Fast path is draft evidence, not final acceptance.
`;
}

function placeholderHtml(slug) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${slug} draft mockup</title>
  </head>
  <body>
    <!-- DESIGN_DIRECTOR_PLACEHOLDER: replace this file before draft QA -->
  </body>
</html>
`;
}

async function writeIfMissing(file, contents) {
  try {
    await fs.access(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, contents);
  }
}

async function main() {
  const args = parseKeyValueArgs(process.argv.slice(2), { profile: "static-mockup", surface: "web-app" });
  if (args.help) {
    console.log(usage());
    return;
  }
  const targetRoot = ensureAbsoluteTarget(args.targetRoot);
  const slug = slugify(args.slug || args.surface || "mockup");
  const surface = String(args.surface || "web-app");
  const profile = String(args.profile || "static-mockup");
  const outputRoot = mockupOutputRoot(targetRoot, slug);
  const qaRunId = args.qaRunId || qaRunIdFor(slug, "draft");
  const startedAt = new Date().toISOString();
  const context = {
    version: 1,
    mode: "draft-fast-static-mockup",
    cwd: process.cwd(),
    repoRoot,
    targetRoot,
    outputRoot,
    entry: "index.html",
    qaOut: "qa",
    renderConfig: "render.config.json",
    surface,
    profile,
    qaRunId,
    startedAt,
    allowedWriteRoots: [outputRoot],
  };

  await fs.mkdir(path.join(outputRoot, "qa"), { recursive: true });
  await fs.mkdir(path.join(outputRoot, "screenshots"), { recursive: true });
  await writeIfMissing(path.join(outputRoot, "index.html"), placeholderHtml(slug));
  await writeIfMissing(path.join(outputRoot, "design-brief.md"), compactBrief({ slug, surface, profile, qaRunId }));
  await writeIfMissing(path.join(outputRoot, "research-ledger.md"), `# Research Ledger

Seed this ledger with \`npm run reference:seed -- --context ./run-context.json --pack ${surface.includes("dashboard") ? "dashboard" : "data-table"}\` before implementation.
`);
  await writeJson(path.join(outputRoot, "run-context.json"), context);
  await writeJson(path.join(outputRoot, "render.config.json"), {
    version: 1,
    qaProfile: "draft-static-mockup",
    surface,
    platform: "web",
    qaRunId,
    url: fileUrlFor(path.join(outputRoot, "index.html")),
    viewports: [
      { name: "mobile", width: 375, height: 900 },
      { name: "tablet", width: 768, height: 1000 },
      { name: "desktop", width: 1440, height: 1000 },
    ],
    states: [{ name: "default" }],
    dataCaveat: {
      truthStatus: "unknown",
      requiredInBrief: true,
      requiredInQa: true,
      uiPolicy: "subtle-footer-or-local-caption",
      prominentUiBannerAllowed: false,
      stakeholderFacing: false,
    },
  });

  console.log(JSON.stringify(context, null, 2));
}

main().catch((error) => {
  console.error(`init-mockup: ${error.message}`);
  process.exit(1);
});
