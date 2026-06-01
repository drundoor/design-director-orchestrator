#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, stdio: "inherit", env: process.env });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const nodeModulesReady = await exists(path.join(repoRoot, "node_modules", "playwright", "package.json"));
  if (!nodeModulesReady) {
    await run(npmCommand, ["install"]);
  } else {
    console.log("setup: node_modules already contains Playwright; skipping npm install");
  }
  await run(npxCommand, ["playwright", "install", "chromium"]);
  await run(process.execPath, ["--check", "scripts/qa-report.mjs"]);
  await run(process.execPath, ["--check", "scripts/native-qa-report.mjs"]);
  console.log("setup: ready. Next run `npm run verify`, scaffold with `npm run brief:new`, or start draft QA with `npm run qa:web:draft -- --url <local-or-deployed-url>`.");
}

main().catch((error) => {
  console.error(`setup failed: ${error.message}`);
  process.exit(1);
});
