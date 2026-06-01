#!/usr/bin/env node

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const node = process.execPath;

function pngBytes(width = 390, height = 844) {
  const data = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(data, 0);
  data.writeUInt32BE(13, 8);
  data.write("IHDR", 12, "ascii");
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  data[24] = 8;
  data[25] = 6;
  return data;
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "design-director-native-smoke-"));
  await fs.writeFile(path.join(out, "screen.png"), pngBytes());
  await fs.writeFile(path.join(out, "hierarchy.json"), JSON.stringify({ windows: [] }));
  await fs.writeFile(path.join(out, "runtime.log"), "No runtime errors captured.\n");
  const reportPath = path.join(out, "native-ios-qa.json");
  await writeJson(reportPath, {
    platform: "native-ios",
    target: {
      workspace: "Smoke.xcworkspace",
      scheme: "Smoke",
      simulator: "iPhone 16",
      osVersion: "latest"
    },
    tooling: { commandsOrToolCalls: ["smoke fixture"] },
    matrix: [
      {
        state: "home-light",
        appearance: "light",
        contentSize: "default",
        orientation: "portrait",
        screenshot: "screen.png",
        uiHierarchy: "hierarchy.json",
        result: "pass"
      },
      {
        state: "home-dark",
        appearance: "dark",
        contentSize: "default",
        orientation: "portrait",
        screenshot: "screen.png",
        uiHierarchy: "hierarchy.json",
        result: "pass"
      },
      {
        state: "home-large",
        appearance: "light",
        contentSize: "accessibilityLarge",
        orientation: "portrait",
        screenshot: "screen.png",
        uiHierarchy: "hierarchy.json",
        result: "pass"
      },
      {
        state: "home-keyboard",
        appearance: "light",
        contentSize: "default",
        orientation: "portrait",
        keyboard: true,
        screenshot: "screen.png",
        uiHierarchy: "hierarchy.json",
        result: "pass"
      }
    ],
    checks: { logsReviewed: "checked" },
    logs: "runtime.log"
  });

  await execFileAsync(node, ["scripts/native-qa-report.mjs", "--report", reportPath, "--out", out], { cwd: repoRoot });
  console.log(`smoke:native passed; artifacts are in ${out}`);
}

main().catch((error) => {
  console.error(`smoke:native failed: ${error.message}`);
  process.exit(1);
});
