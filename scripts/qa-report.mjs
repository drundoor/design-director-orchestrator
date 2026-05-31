#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = { out: ".design-director" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--notes") {
      args.notes = argv[++i];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function usage() {
  return `Usage: qa-report.mjs [--out .design-director] [--notes .design-director/screenshot-notes.md]

Merges render-results.json, dom-audit.json, and visual-consistency-audit.json
into design-qa.json and design-qa.md.`;
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function readText(file, fallback = "") {
  if (!file) return fallback;
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function bullet(items) {
  if (!items.length) return "- None recorded.";
  return items.map((item) => `- ${item}`).join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const outDir = path.resolve(args.out);
  await fs.mkdir(outDir, { recursive: true });
  const render = await readJson(path.join(outDir, "render-results.json"), { states: [], screenshots: [] });
  const dom = await readJson(path.join(outDir, "dom-audit.json"), { states: [] });
  const visual = await readJson(path.join(outDir, "visual-consistency-audit.json"), { states: [] });
  const notesPath = args.notes || path.join(outDir, "screenshot-notes.md");
  const notes = await readText(notesPath, "");

  const blockers = [];
  const warnings = [];

  for (const state of render.states || []) {
    if (state.error) blockers.push(`${state.state} ${state.viewport?.width || "?"}: render failed: ${state.error}`);
    if (state.pageErrors?.length) blockers.push(`${state.state} ${state.viewport?.width || "?"}: ${state.pageErrors.length} page error(s)`);
    if (state.consoleMessages?.length) warnings.push(`${state.state} ${state.viewport?.width || "?"}: ${state.consoleMessages.length} console warning/error candidate(s)`);
  }

  for (const state of dom.states || []) {
    const label = `${state.state} ${state.viewport?.width || "?"}`;
    if (state.error) blockers.push(`${label}: DOM audit failed: ${state.error}`);
    if (state.audit?.overflow?.hasHorizontalOverflow) blockers.push(`${label}: horizontal overflow candidate`);
    if (state.audit?.clipped?.length) warnings.push(`${label}: ${state.audit.clipped.length} clipped text/control candidate(s)`);
    if (state.audit?.tinyText?.length) warnings.push(`${label}: ${state.audit.tinyText.length} tiny text candidate(s)`);
    if (state.audit?.smallTargets?.length) warnings.push(`${label}: ${state.audit.smallTargets.length} small tap target candidate(s)`);
    if (state.audit?.unlabeledFocusable?.length) warnings.push(`${label}: ${state.audit.unlabeledFocusable.length} unlabeled focusable candidate(s)`);
    if (state.audit?.hoverOnlyCandidates?.length) warnings.push(`${label}: ${state.audit.hoverOnlyCandidates.length} hover-only candidate(s)`);
  }

  for (const state of visual.states || []) {
    const label = `${state.state} ${state.viewport?.width || "?"}`;
    if (state.error) blockers.push(`${label}: visual consistency audit failed: ${state.error}`);
    for (const finding of state.audit?.blockers || []) {
      blockers.push(`${label}: ${finding.type}: ${finding.message}`);
    }
    if (state.audit?.warnings?.length) warnings.push(`${label}: ${state.audit.warnings.length} visual consistency warning candidate(s)`);
  }

  if ((render.screenshots || []).length && !notes.trim()) {
    blockers.push("screenshots were generated but no screenshot inspection notes were found");
  }

  const qa = {
    generatedAt: new Date().toISOString(),
    blockers,
    warnings,
    screenshotCount: (render.screenshots || []).length,
    screenshotNotesPath: notes.trim() ? notesPath : null,
    renderResultsPath: path.join(outDir, "render-results.json"),
    domAuditPath: path.join(outDir, "dom-audit.json"),
    visualConsistencyAuditPath: path.join(outDir, "visual-consistency-audit.json"),
  };

  const md = `# Design QA

Generated: ${qa.generatedAt}

## Status

- Blockers: ${blockers.length}
- Warnings: ${warnings.length}
- Screenshots: ${qa.screenshotCount}
- Screenshot notes: ${qa.screenshotNotesPath || "missing"}

## Blockers

${bullet(blockers)}

## Warnings

${bullet(warnings)}

## Screenshot Manifest

${bullet((render.screenshots || []).map((screenshot) => screenshot))}

## Screenshot Inspection Notes

${notes.trim() || "_Missing. Add inspected screenshot notes or waive this blocker with evidence._"}

## Evidence Files

- Render results: ${qa.renderResultsPath}
- DOM audit: ${qa.domAuditPath}
- Visual consistency audit: ${qa.visualConsistencyAuditPath}
`;

  await fs.writeFile(path.join(outDir, "design-qa.json"), `${JSON.stringify(qa, null, 2)}\n`);
  await fs.writeFile(path.join(outDir, "design-qa.md"), md);
  console.log(`qa-report: wrote ${path.join(outDir, "design-qa.md")} (${blockers.length} blockers)`);
  if (blockers.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`qa-report: ${error.message}`);
  process.exit(1);
});
