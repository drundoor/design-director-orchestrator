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

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "design-director-native-fail-smoke-"));
  const reportPath = path.join(out, "native-ios-qa.json");
  await writeJson(reportPath, {
    platform: "native-ios",
    target: {
      workspace: "Smoke.xcworkspace",
      scheme: "Smoke",
      simulator: "iPhone 16",
      osVersion: "latest"
    },
    tooling: { commandsOrToolCalls: ["intentional missing-evidence fixture"] },
    matrix: [{
      state: "home",
      profiles: ["default-light"],
      screenshot: "missing-screen.png",
      uiHierarchy: "missing-hierarchy.json",
      result: "pass"
    }],
    logs: "missing-runtime.log"
  });

  let failedAsExpected = false;
  try {
    await execFileAsync(node, ["scripts/native-qa-report.mjs", "--report", reportPath, "--out", out], { cwd: repoRoot });
  } catch {
    failedAsExpected = true;
  }

  if (!failedAsExpected) {
    throw new Error("native QA report unexpectedly passed with missing evidence");
  }

  const qa = JSON.parse(await fs.readFile(path.join(out, "native-design-qa.json"), "utf8"));
  if (qa.acceptanceReady || qa.status === "pass") {
    throw new Error("native QA failure smoke did not produce a non-acceptance report");
  }
  console.log(`smoke:native:fail passed; missing evidence was rejected in ${out}`);
}

main().catch((error) => {
  console.error(`smoke:native:fail failed: ${error.message}`);
  process.exit(1);
});
