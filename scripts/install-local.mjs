#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const args = { mode: "symlink", name: "design-director" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--copy") {
      args.mode = "copy";
    } else if (arg === "--symlink") {
      args.mode = "symlink";
    } else if (arg === "--target") {
      args.target = argv[++i];
    } else if (arg === "--name") {
      args.name = argv[++i];
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--force" || arg === "--replace") {
      args.force = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function usage() {
  return `Usage: install-local.mjs [--symlink | --copy] [--name design-director] [--target ~/.codex/skills/design-director] [--dry-run] [--force]

Installs this repository as a local Codex skill. Symlink is the default so git
pulls update the installed skill automatically. Use --copy when symlinks are
not appropriate. Use --dry-run to print actions without changing files. Use
--force only when replacing an existing install is intended.`;
}

function expandHome(value) {
  if (!value) return value;
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

async function exists(file) {
  try {
    await fs.lstat(file);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const skillsRoot = process.env.CODEX_HOME ? path.join(process.env.CODEX_HOME, "skills") : path.join(os.homedir(), ".codex", "skills");
  const target = path.resolve(expandHome(args.target || path.join(skillsRoot, args.name)));

  console.log(`install-local: repository ${repoRoot}`);
  console.log(`install-local: target ${target}`);
  console.log(`install-local: mode ${args.mode}${args.dryRun ? " (dry run)" : ""}`);
  if (args.dryRun) return;

  await fs.mkdir(path.dirname(target), { recursive: true });

  if (await exists(target)) {
    const current = await fs.lstat(target);
    if (current.isSymbolicLink()) {
      const linkTarget = await fs.readlink(target);
      if (path.resolve(path.dirname(target), linkTarget) === repoRoot) {
        console.log(`install-local: already installed at ${target}`);
        return;
      }
    }
    if (!args.force) {
      throw new Error(`Target already exists: ${target}. Remove it, pass --target to install elsewhere, or use --force to replace it.`);
    }
    await fs.rm(target, { recursive: true, force: true });
  }

  if (args.mode === "copy") {
    await fs.cp(repoRoot, target, {
      recursive: true,
      filter: (source) => {
        const base = path.basename(source);
        return ![".git", "node_modules", ".DS_Store"].includes(base) && !base.startsWith(".codex-scratch-");
      },
    });
  } else {
    await fs.symlink(repoRoot, target, "dir");
  }

  console.log(`install-local: installed ${args.mode} at ${target}`);
  console.log("install-local: next steps: run `npm install`, `npx playwright install chromium`, and `npm test` in the repository.");
}

main().catch((error) => {
  console.error(`install-local: ${error.message}`);
  process.exit(1);
});
