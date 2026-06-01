#!/usr/bin/env node

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { stableHash, stableStringify } from "./lib/browser-utils.mjs";

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
  for (const [index, name] of ["home-light", "home-dark", "home-large", "home-keyboard"].entries()) {
    const image = pngBytes();
    image[30] = index + 1;
    await fs.writeFile(path.join(out, `${name}.png`), image);
    await fs.writeFile(path.join(out, `${name}-hierarchy.json`), JSON.stringify({ windows: [], state: name }));
  }
  await fs.writeFile(path.join(out, "runtime.log"), "No runtime errors captured.\n");
  const reportPath = path.join(out, "native-ios-qa.json");
  const tooling = { commandsOrToolCalls: ["smoke fixture"] };
  await writeJson(reportPath, {
    platform: "native-ios",
    qaRunId: "smoke-native-ios",
    appBuildId: "smoke-native-build",
    startedAt: new Date(Date.now() - 1000).toISOString(),
    finishedAt: new Date(Date.now() + 1000).toISOString(),
    toolingHash: stableHash(stableStringify(tooling), 16),
    target: {
      workspace: "Smoke.xcworkspace",
      scheme: "Smoke",
      simulator: "iPhone 16",
      osVersion: "latest"
    },
    tooling,
    matrix: [
      {
        state: "home-light",
        appearance: "light",
        contentSize: "default",
        orientation: "portrait",
        screenshot: "home-light.png",
        uiHierarchy: "home-light-hierarchy.json",
        result: "pass"
      },
      {
        state: "home-dark",
        appearance: "dark",
        contentSize: "default",
        orientation: "portrait",
        screenshot: "home-dark.png",
        uiHierarchy: "home-dark-hierarchy.json",
        result: "pass"
      },
      {
        state: "home-large",
        appearance: "light",
        contentSize: "accessibilityLarge",
        orientation: "portrait",
        screenshot: "home-large.png",
        uiHierarchy: "home-large-hierarchy.json",
        result: "pass"
      },
      {
        state: "home-keyboard",
        appearance: "light",
        contentSize: "default",
        orientation: "portrait",
        keyboard: true,
        screenshot: "home-keyboard.png",
        uiHierarchy: "home-keyboard-hierarchy.json",
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
