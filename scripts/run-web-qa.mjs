#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function parseArgs(argv) {
  const args = { out: ".design-director", depth: "2", timeout: "15000", final: false, static: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--url") args.url = argv[++i];
    else if (arg === "--config") args.config = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--viewports") args.viewports = argv[++i];
    else if (arg === "--depth") args.depth = argv[++i];
    else if (arg === "--timeout") args.timeout = argv[++i];
    else if (arg === "--static") args.static = true;
    else if (arg === "--final") args.final = true;
    else if (arg === "--qa-run-id") args.qaRunId = argv[++i];
    else if (arg === "--app-build-id") args.appBuildId = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `Usage: run-web-qa.mjs (--url <url>|--config .design-director/render.config.json) [--out .design-director] [--static] [--final] [--viewports 375x700,1440x900] [--depth 2]

Runs discovery, render capture, DOM audit, visual audit, and qa-report with one
shared qaRunId. Draft mode initializes screenshot notes and exits 0 even when
inspection is still incomplete. Use --final only after screenshot notes and
state coverage have been inspected.`;
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

async function writeConfigFromUrl(configPath, args, qaRunId, appBuildId) {
  const viewports = args.viewports
    ? args.viewports.split(",").map((item) => {
        const [width, height = "900"] = item.split("x");
        return { width: Number(width), height: Number(height) };
      })
    : [{ width: 375, height: 700 }, { width: 1440, height: 1000 }];
  const config = {
    url: args.url,
    qaProfile: args.static ? "static" : args.final ? "final-qa" : "audit",
    qaRunId,
    appBuildId,
    viewports,
    states: [{ name: "default" }],
  };
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.url && !args.config) throw new Error("Provide --url or --config");

  const outDir = path.resolve(args.out);
  await fs.mkdir(outDir, { recursive: true });
  const qaRunId = args.qaRunId || process.env.DESIGN_DIRECTOR_QA_RUN_ID || `qa-${Date.now().toString(36)}`;
  const appBuildId = args.appBuildId || process.env.DESIGN_DIRECTOR_APP_BUILD_ID || `build-${Date.now().toString(36)}`;
  const env = { ...process.env, DESIGN_DIRECTOR_QA_RUN_ID: qaRunId, DESIGN_DIRECTOR_APP_BUILD_ID: appBuildId };
  let configPath = args.config ? path.resolve(args.config) : path.join(outDir, "render.config.json");
  if (!args.config) await writeConfigFromUrl(configPath, args, qaRunId, appBuildId);

  if (!args.static) {
    const discoverArgs = ["scripts/discover-states.mjs", "--config", configPath, "--out", outDir, "--depth", args.depth, "--timeout", args.timeout];
    if (args.viewports) discoverArgs.push("--viewports", args.viewports, "--viewport-mode", "all");
    await runStep("discover active states", discoverArgs, env, { allowFailure: !args.final });
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

  const reportArgs = ["scripts/qa-report.mjs", "--out", outDir, "--init-notes"];
  if (args.static) reportArgs.push("--static");
  if (!args.final) reportArgs.push("--partial", "--allow-partial-exit-zero");
  const reportCode = await runStep("merge QA report", reportArgs, env, { allowFailure: !args.final });
  console.log(`qa:web: qaRunId=${qaRunId}`);
  if (!args.final) {
    console.log(`qa:web: draft complete. Inspect ${path.join(outDir, "screenshot-notes.md")}, resolve state coverage, then run npm run qa:web:final -- --config ${configPath} --out ${outDir}${args.static ? " --static" : ""}`);
  }
  if (args.final && reportCode !== 0) process.exitCode = reportCode;
}

main().catch((error) => {
  console.error(`qa:web failed: ${error.message}`);
  process.exit(1);
});
