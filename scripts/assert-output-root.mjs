#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import {
  entryPathForContext,
  fileUrlFor,
  loadRunContext,
  parseKeyValueArgs,
  pathInside,
  readJson,
  renderConfigPathForContext,
  toArray,
} from "./lib/mockup-context.mjs";

function usage() {
  return `Usage: assert-output-root.mjs --context <mockup/run-context.json> [--allow-placeholder] [--json]

Validates that a fast-path static mockup run is isolated to its output folder,
has a real entry file, and has render config pointing at that entry.`;
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readText(file) {
  return fs.readFile(file, "utf8");
}

function addMissing(failures, field) {
  failures.push(`${field} is required`);
}

function validateAbsoluteInside(failures, label, root, value) {
  if (!value) {
    addMissing(failures, label);
    return;
  }
  if (!path.isAbsolute(value)) {
    failures.push(`${label} must be absolute: ${value}`);
    return;
  }
  if (!pathInside(root, value)) {
    failures.push(`${label} must stay inside ${root}: ${value}`);
  }
}

async function validate(args) {
  const context = await loadRunContext(args.context);
  const failures = [];
  const warnings = [];
  const contextPath = path.resolve(args.context);
  const targetRoot = context.targetRoot;
  const outputRoot = context.outputRoot;
  const entryPath = entryPathForContext(context);
  const renderConfigPath = renderConfigPathForContext(context);

  if (context.version !== 1) failures.push("run-context.json version must be 1");
  if (!context.mode) addMissing(failures, "mode");
  if (!context.surface) addMissing(failures, "surface");
  if (!context.profile) addMissing(failures, "profile");
  if (!context.qaRunId) addMissing(failures, "qaRunId");
  if (!path.isAbsolute(targetRoot)) failures.push(`targetRoot must be absolute: ${targetRoot}`);
  validateAbsoluteInside(failures, "outputRoot", targetRoot, outputRoot);
  validateAbsoluteInside(failures, "contextPath", outputRoot, contextPath);

  const allowedWriteRoots = toArray(context.allowedWriteRoots);
  if (!allowedWriteRoots.length) failures.push("allowedWriteRoots must include the mockup output root");
  for (const [index, root] of allowedWriteRoots.entries()) {
    validateAbsoluteInside(failures, `allowedWriteRoots[${index}]`, outputRoot, path.resolve(root));
  }

  if (!(await exists(entryPath))) {
    failures.push(`entry file does not exist: ${entryPath}`);
  } else {
    const entryText = await readText(entryPath);
    if (!entryText.trim()) failures.push(`entry file is empty: ${entryPath}`);
    if (!args.allowPlaceholder && entryText.includes("DESIGN_DIRECTOR_PLACEHOLDER")) {
      failures.push("entry file still contains DESIGN_DIRECTOR_PLACEHOLDER; replace it before QA");
    }
  }

  if (!(await exists(renderConfigPath))) {
    failures.push(`render config does not exist: ${renderConfigPath}`);
  } else {
    const renderConfig = await readJson(renderConfigPath);
    const expectedUrl = fileUrlFor(entryPath);
    if (renderConfig.url !== expectedUrl) {
      failures.push(`render config url must point to entry file: expected ${expectedUrl}, got ${renderConfig.url || "(missing)"}`);
    }
    if (renderConfig.qaRunId && renderConfig.qaRunId !== context.qaRunId) {
      failures.push(`render config qaRunId ${renderConfig.qaRunId} does not match run context ${context.qaRunId}`);
    }
    if (renderConfig.surface && renderConfig.surface !== context.surface) {
      failures.push(`render config surface ${renderConfig.surface} does not match run context ${context.surface}`);
    }
    if (renderConfig.platform && renderConfig.platform !== "web") {
      failures.push(`fast-path static mockup render config platform must be web, got ${renderConfig.platform}`);
    }
    if (!Array.isArray(renderConfig.viewports) || renderConfig.viewports.length < 3) {
      warnings.push("render config has fewer than three representative viewports");
    }
    if (renderConfig.dataCaveat?.requiredInQa !== true) {
      warnings.push("render config should record dataCaveat.requiredInQa=true for draft evidence");
    }
  }

  for (const localFile of ["design-brief.md", "research-ledger.md"]) {
    const file = path.join(outputRoot, localFile);
    if (!(await exists(file))) warnings.push(`${localFile} is missing from the mockup output root`);
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    context: {
      targetRoot,
      outputRoot,
      entry: entryPath,
      renderConfig: renderConfigPath,
      qaOut: context.qaOut,
      qaRunId: context.qaRunId,
      surface: context.surface,
      profile: context.profile,
    },
  };
}

async function main() {
  const args = parseKeyValueArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.context) throw new Error("Provide --context");
  const result = await validate(args);
  if (args.json || !result.ok) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`assert-output-root: ok ${result.context.outputRoot}`);
    for (const warning of result.warnings) console.warn(`assert-output-root: warning: ${warning}`);
  }
  if (!result.ok) {
    console.error(`assert-output-root: ${result.failures.join(" | ")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`assert-output-root: ${error.message}`);
  process.exit(1);
});
