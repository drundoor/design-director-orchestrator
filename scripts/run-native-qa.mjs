#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `Usage: run-native-qa.mjs --platform native-ios|native-android [--report .design-director/native-ios-qa.json] [--out .design-director] [--profile minimal|standard|deep]

Validates a native QA evidence report with the Design Director native contract.`;
}

function defaultReport(platform) {
  if (platform === "native-ios") return ".design-director/native-ios-qa.json";
  if (platform === "native-android") return ".design-director/native-android-qa.json";
  return null;
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
  const childArgs = ["scripts/native-qa-report.mjs", "--report", report, "--out", args.out, "--profile", args.profile];
  if (args.partial) childArgs.push("--partial");
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
