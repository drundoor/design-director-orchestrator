#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  entryPathForContext,
  fileUrlFor,
  loadRunContext,
  parseKeyValueArgs,
  qaOutPathForContext,
  renderConfigPathForContext,
  toArray,
} from "./lib/mockup-context.mjs";
import { applyQaRecipes, inferRecipesForSurface, MOCKUP_VIEWPORTS } from "./lib/recipes.mjs";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function parseArgs(argv) {
  const args = parseKeyValueArgs(argv, {
    out: ".design-director",
    depth: "2",
    timeout: "15000",
    final: false,
    draft: false,
    ci: false,
    static: false,
  });
  args.recipe = toArray(args.recipe);
  args.focus = toArray(args.focus);
  args.outProvided = argv.includes("--out");
  return args;
}

function usage() {
  return `Usage: run-web-qa.mjs (--url <url>|--file <page.html>|--config .design-director/render.config.json|--context <run-context.json>) [--out .design-director] [--static] [--draft|--final|--ci] [--viewports 375x700,1440x900] [--viewport-preset mockup] [--recipe dashboard-basic] [--focus "main:decision-area"] [--depth 2]

Runs discovery, render capture, DOM audit, visual audit, and qa-report with one
shared qaRunId. Draft mode initializes screenshot notes, writes
ACCEPTANCE_READY=false when inspection is incomplete, and is not final
acceptance. Use --final after screenshot notes and state coverage are inspected.
Use --ci when the command must exit nonzero unless design-qa.json has
acceptanceReady: true.`;
}

function runStep(label, args, env, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`qa:web: ${label}`);
    const child = spawn(process.execPath, args, { cwd: repoRoot, stdio: "inherit", env });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || options.allowFailure) resolve(code || 0);
      else reject(new Error(`${label} exited ${code}`));
    });
  });
}

function parseViewports(args) {
  if (args.viewports) {
    return String(args.viewports).split(",").map((item) => {
      const [width, height = "900"] = item.split("x");
      return { width: Number(width), height: Number(height) };
    });
  }
  if (args.viewportPreset === "mockup" || args.viewportPreset === "mobile-tablet-desktop") {
    return MOCKUP_VIEWPORTS;
  }
  return [{ width: 375, height: 700 }, { width: 1440, height: 1000 }];
}

function dataCaveatFromPolicy(policy, existing = {}) {
  if (!policy) return existing;
  const key = String(policy).trim().toLowerCase();
  if (key === "simulated" || key === "demo" || key === "sample") {
    return {
      ...existing,
      truthStatus: "simulated",
      sourceLabel: existing.sourceLabel || "Simulated data",
      requiredInBrief: true,
      requiredInQa: true,
      uiPolicy: "source-row-caption-or-footnote",
      prominentUiBannerAllowed: false,
      stakeholderFacing: false,
    };
  }
  if (key === "live" || key === "real" || key === "production") {
    return {
      ...existing,
      truthStatus: "live",
      sourceLabel: existing.sourceLabel || "Live data",
      requiredInBrief: true,
      requiredInQa: true,
      uiPolicy: "local-source-label",
      prominentUiBannerAllowed: false,
      stakeholderFacing: existing.stakeholderFacing === true,
    };
  }
  return {
    ...existing,
    truthStatus: key,
    requiredInBrief: true,
    requiredInQa: true,
  };
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJsonIfExists(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeConfigFromUrl(configPath, args, qaRunId, appBuildId) {
  const config = {
    url: args.url,
    qaProfile: args.qaProfile || (args.profile === "static-mockup" ? "draft-static-mockup" : args.profile) || (args.static ? "static" : (args.final || args.ci) ? "final-qa" : "audit"),
    profile: args.profile,
    surface: args.surface,
    qaRunId,
    appBuildId,
    viewports: parseViewports(args),
    states: [{ name: "default" }],
    dataCaveat: dataCaveatFromPolicy(args.caveatPolicy),
  };
  await writeJson(configPath, config);
}

async function writeEffectiveConfig(configPath, outDir, args, qaRunId, appBuildId) {
  const original = await readJsonIfExists(configPath, null);
  if (!original) throw new Error(`Could not read render config: ${configPath}`);
  const surface = args.surface || original.surface || "";
  const profile = args.profile || original.profile || "";
  const qaProfile = args.qaProfile || original.qaProfile || (profile === "static-mockup" ? "draft-static-mockup" : profile);
  const explicitRecipes = toArray(args.recipe).filter(Boolean);
  const recipes = explicitRecipes.length ? explicitRecipes : inferRecipesForSurface(surface, `${profile} ${qaProfile}`);
  const next = applyQaRecipes({
    ...original,
    qaRunId: original.qaRunId || qaRunId,
    appBuildId: original.appBuildId || appBuildId,
    surface: surface || original.surface,
    profile: profile || original.profile,
    qaProfile: qaProfile || original.qaProfile,
    dataCaveat: dataCaveatFromPolicy(args.caveatPolicy, original.dataCaveat || {}),
    viewports: args.viewports || args.viewportPreset ? parseViewports(args) : original.viewports,
    viewportPreset: args.viewportPreset || original.viewportPreset,
    singlePassDraftRequested: Boolean(args.singlePassDraft || original.singlePassDraftRequested),
  }, {
    recipes,
    focus: toArray(args.focus),
  });
  const effectivePath = path.join(outDir, "render.config.effective.json");
  await writeJson(effectivePath, next);
  return effectivePath;
}

async function writeDraftDesignQuality(outDir, options) {
  const config = await readJsonIfExists(options.configPath, {});
  const artifact = {
    version: 1,
    mode: "draft",
    finalArtifact: false,
    acceptanceReady: false,
    generatedAt: new Date().toISOString(),
    qaRunId: options.qaRunId,
    appBuildId: options.appBuildId,
    surface: config.surface || options.args.surface || null,
    profile: config.profile || options.args.profile || null,
    qaProfile: config.qaProfile || options.args.qaProfile || null,
    recipes: config.recipes || [],
    focus: config.focus || [],
    dataCaveat: config.dataCaveat || null,
    singlePassDraftRequested: Boolean(config.singlePassDraftRequested),
    caveat: "Draft design-quality evidence is not final acceptance. Final acceptance uses design-quality.json and qa:web:final.",
    qaSummary: options.qaSummary,
    evidence: {
      designQa: "design-qa.json",
      renderResults: "render-results.json",
      domAudit: "dom-audit.json",
      visualAudit: "visual-consistency-audit.json",
      screenshotNotes: "screenshot-notes.md",
    },
  };
  await writeJson(path.join(outDir, "design-quality.draft.json"), artifact);
}

async function readQaSummary(outDir) {
  try {
    const qa = JSON.parse(await fs.readFile(path.join(outDir, "design-qa.json"), "utf8"));
    return {
      status: qa.status || "unknown",
      qaMode: qa.qaMode || "unknown",
      acceptanceReady: Boolean(qa.acceptanceReady),
      nonFinalBecause: Array.isArray(qa.nonFinalBecause) ? qa.nonFinalBecause : [],
      nextActions: Array.isArray(qa.nextActions) ? qa.nextActions : [],
    };
  } catch {
    return {
      status: "missing",
      qaMode: "missing",
      acceptanceReady: false,
      nonFinalBecause: ["design-qa.json was not written"],
      nextActions: ["Fix the failed QA step and rerun the wrapper."],
    };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  let runContext = null;
  if (args.file) args.url = fileUrlFor(path.resolve(args.file));
  if (args.context) {
    runContext = await loadRunContext(args.context);
    if (!args.outProvided) args.out = qaOutPathForContext(runContext);
    if (!args.config) args.config = renderConfigPathForContext(runContext);
    if (!args.url) args.url = fileUrlFor(entryPathForContext(runContext));
    if (!args.surface) args.surface = runContext.surface;
    if (!args.profile) args.profile = runContext.profile;
    if (!args.qaRunId) args.qaRunId = runContext.qaRunId;
    if (!args.static && runContext.mode?.includes("static")) args.static = true;
  }
  if (!args.url && !args.config) throw new Error("Provide --url, --file, --config, or --context");
  if (args.draft && (args.final || args.ci)) throw new Error("--draft cannot be combined with --final or --ci");
  if (args.final && args.ci) throw new Error("--final and --ci are separate modes; use one");
  const finalLike = args.final || args.ci;

  const outDir = path.resolve(args.out);
  const projectRoot = path.resolve(process.cwd());
  await fs.mkdir(outDir, { recursive: true });
  const qaRunId = args.qaRunId || process.env.DESIGN_DIRECTOR_QA_RUN_ID || `qa-${Date.now().toString(36)}`;
  const appBuildId = args.appBuildId || process.env.DESIGN_DIRECTOR_APP_BUILD_ID || `build-${Date.now().toString(36)}`;
  const env = {
    ...process.env,
    DESIGN_DIRECTOR_PROJECT_ROOT: projectRoot,
    DESIGN_DIRECTOR_QA_RUN_ID: qaRunId,
    DESIGN_DIRECTOR_APP_BUILD_ID: appBuildId,
  };
  let configPath = args.config ? path.resolve(args.config) : path.join(outDir, "render.config.json");
  if (!args.config) await writeConfigFromUrl(configPath, args, qaRunId, appBuildId);
  configPath = await writeEffectiveConfig(configPath, outDir, args, qaRunId, appBuildId);
  if (args.singlePassDraft && !finalLike) {
    console.log("qa:web: single-pass draft requested; using proven multi-script path until recipe parity is acceptance-tested");
  }

  if (!args.static) {
    const discoverArgs = ["scripts/discover-states.mjs", "--config", configPath, "--out", outDir, "--depth", args.depth, "--timeout", args.timeout];
    if (args.viewports) discoverArgs.push("--viewports", args.viewports, "--viewport-mode", "all");
    await runStep("discover active states", discoverArgs, env, { allowFailure: !finalLike });
    const discoveredConfig = path.join(outDir, "render.config.discovered.json");
    try {
      await fs.access(discoveredConfig);
      configPath = discoveredConfig;
    } catch {
      // Keep the supplied config when discovery did not produce a draft.
    }
  }

  await runStep("render screenshots", ["scripts/render-check.mjs", "--config", configPath, "--out", outDir, "--timeout", args.timeout], env, { allowFailure: true });
  await runStep("DOM audit", ["scripts/dom-audit.mjs", "--config", configPath, "--out", outDir, "--timeout", args.timeout], env, { allowFailure: true });
  await runStep("visual audit", ["scripts/visual-consistency-audit.mjs", "--config", configPath, "--out", outDir, "--timeout", args.timeout], env, { allowFailure: true });

  const reportArgs = ["scripts/qa-report.mjs", "--out", outDir, "--repo-root", projectRoot, "--init-notes"];
  if (args.static) reportArgs.push("--static");
  if (!finalLike) reportArgs.push("--partial", "--allow-partial-exit-zero");
  const reportCode = await runStep("merge QA report", reportArgs, env, { allowFailure: !args.final });
  const qaSummary = await readQaSummary(outDir);
  if (!finalLike) {
    await writeDraftDesignQuality(outDir, { args, configPath, qaRunId, appBuildId, qaSummary });
  }
  console.log(`qa:web: qaRunId=${qaRunId}`);
  console.log(`qa:web: status=${qaSummary.status}`);
  console.log(`qa:web: qaMode=${qaSummary.qaMode}`);
  console.log(`qa:web: ACCEPTANCE_READY=${qaSummary.acceptanceReady ? "true" : "false"}`);
  if (!qaSummary.acceptanceReady) {
    console.log(`qa:web: NON_FINAL_BECAUSE=${qaSummary.nonFinalBecause.join(" | ") || "acceptanceReady is false"}`);
  }
  if (!finalLike) {
    console.log("qa:web: DRAFT_NOT_ACCEPTANCE=true");
    console.log(`qa:web: draft complete. Inspect ${path.join(outDir, "screenshot-notes.md")}, resolve state coverage, then run npm run qa:web:final -- --config ${configPath} --out ${outDir}${args.static ? " --static" : ""}`);
  }
  if (args.ci && !qaSummary.acceptanceReady) {
    process.exitCode = reportCode || 1;
  } else if (args.final && reportCode !== 0) {
    process.exitCode = reportCode;
  }
}

main().catch((error) => {
  console.error(`qa:web failed: ${error.message}`);
  process.exit(1);
});
