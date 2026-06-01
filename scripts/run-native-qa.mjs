#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stableHash, stableStringify } from "./lib/browser-utils.mjs";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function parseArgs(argv) {
  const args = { out: ".design-director", profile: "standard" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--platform") args.platform = argv[++i];
    else if (arg === "--report") args.report = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--profile") args.profile = argv[++i];
    else if (arg === "--partial") args.partial = true;
    else if (arg === "--init") args.init = true;
    else if (arg === "--template") {
      args.init = true;
      const maybePlatform = argv[i + 1];
      if (maybePlatform && !maybePlatform.startsWith("--")) args.platform = argv[++i];
    }
    else if (arg === "--force") args.force = true;
    else if (arg === "--print-tooling-hash") args.printToolingHash = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `Usage: run-native-qa.mjs --platform native-ios|native-android [--report .design-director/native-ios-qa.json] [--out .design-director] [--profile minimal|standard|deep] [--init] [--print-tooling-hash]

Validates a native QA evidence report with the Design Director native contract.
Use --init to scaffold the report before capturing evidence.`;
}

function defaultReport(platform) {
  if (platform === "native-ios") return ".design-director/native-ios-qa.json";
  if (platform === "native-android") return ".design-director/native-android-qa.json";
  return null;
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function nativeTemplate(platform) {
  const now = new Date().toISOString();
  const tooling = {
    commandsOrToolCalls: [
      platform === "native-ios"
        ? "xcodebuildmcp simulator screenshot + accessibility hierarchy capture"
        : "Android emulator screenshot + UI Automator tree capture",
    ],
  };
  const base = {
    platform,
    qaRunId: "TODO-native-qa-run-id",
    appBuildId: "TODO-app-build-id",
    startedAt: now,
    finishedAt: now,
    tooling,
    toolingHash: stableHash(stableStringify(tooling), 16),
    checks: {
      logsReviewed: "TODO - set to checked after logs are reviewed",
    },
    logs: ["runtime.log"],
    blockers: [],
    warnings: [],
  };
  if (platform === "native-ios") {
    return {
      ...base,
      target: {
        project: "TODO.xcodeproj",
        scheme: "TODO",
        simulator: "TODO iPhone simulator",
      },
      matrix: [
        {
          state: "default-light",
          appearance: "light",
          contentSize: "default",
          orientation: "portrait",
          screenshot: "default-light.png",
          uiHierarchy: "default-light-hierarchy.json",
          result: "needs-review",
        },
      ],
    };
  }
  return {
    ...base,
    target: {
      module: ":app",
      variant: "debug",
      device: "TODO emulator",
      apiLevel: "TODO",
    },
    matrix: [
      {
        state: "default-light",
        theme: "light",
        fontScale: 1,
        displaySize: "default",
        screenshot: "default-light.png",
        uiTree: "default-light-tree.xml",
        result: "needs-review",
      },
    ],
  };
}

async function writeTemplate(report, platform, force) {
  const file = path.resolve(report);
  if (!force && await exists(file)) {
    throw new Error(`${file} already exists; use --force to overwrite`);
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(nativeTemplate(platform), null, 2)}\n`);
  console.log(`qa:native: wrote ${file}`);
  console.log("qa:native: capture screenshots, hierarchy/tree files, and logs next; then set checks.logsReviewed to checked and rerun validation.");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!["native-ios", "native-android"].includes(args.platform)) {
    throw new Error("Provide --platform native-ios or --platform native-android");
  }
  const report = args.report || defaultReport(args.platform);
  if (args.init) {
    await writeTemplate(report, args.platform, args.force);
    return;
  }
  const childArgs = ["scripts/native-qa-report.mjs", "--report", report, "--out", args.out, "--profile", args.profile];
  if (args.partial) childArgs.push("--partial");
  if (args.printToolingHash) childArgs.push("--print-tooling-hash");
  const child = spawn(process.execPath, childArgs, { cwd: repoRoot, stdio: "inherit", env: process.env });
  child.on("exit", (code) => {
    process.exitCode = code || 0;
  });
  child.on("error", (error) => {
    console.error(`qa:native failed: ${error.message}`);
    process.exitCode = 1;
  });
}

main().catch((error) => {
  console.error(`qa:native failed: ${error.message}`);
  process.exit(1);
});
