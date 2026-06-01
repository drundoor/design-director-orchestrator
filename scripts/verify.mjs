#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args) {
  return new Promise((resolve, reject) => {
    console.log(`verify: ${command} ${args.join(" ")}`);
    const child = spawn(command, args, { cwd: repoRoot, stdio: "inherit", env: process.env });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });
}

async function main() {
  await run(npmCommand, ["test"]);
  await run(npmCommand, ["run", "smoke:web"]);
  await run(npmCommand, ["run", "smoke:native"]);
  await run(npmCommand, ["run", "smoke:native:fail"]);
  await run(npmCommand, ["pack", "--dry-run", "--json"]);
  console.log("verify: all checks passed");
}

main().catch((error) => {
  console.error(`verify failed: ${error.message}`);
  process.exit(1);
});
