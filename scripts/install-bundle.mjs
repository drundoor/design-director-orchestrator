#!/usr/bin/env node

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifestPath = path.join(repoRoot, "references", "peer-skills.bundle.json");
const COPY_EXCLUDES = new Set([".git", "node_modules", ".DS_Store", "dist", "build", "coverage", "tmp", "temp", "logs"]);

function parseArgs(argv) {
  const args = { mode: "symlink", peers: null, designDirector: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--copy") args.mode = "copy";
    else if (arg === "--symlink") args.mode = "symlink";
    else if (arg === "--target-root") args.targetRoot = argv[++i];
    else if (arg === "--peers") args.peers = argv[++i].split(",").map((item) => item.trim()).filter(Boolean);
    else if (arg === "--peer") {
      if (!args.peers) args.peers = [];
      args.peers.push(argv[++i]);
    } else if (arg === "--all-peers") args.allPeers = true;
    else if (arg === "--no-design-director") args.designDirector = false;
    else if (arg === "--force") args.force = true;
    else if (arg === "--force-peers") args.forcePeers = true;
    else if (arg === "--keep-temp") args.keepTemp = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `Usage: install-bundle.mjs [--dry-run] [--symlink|--copy] [--target-root ~/.codex/skills] [--peers impeccable,hallmark|--all-peers] [--force] [--force-peers] [--no-design-director]

Installs Design Director plus optional peer skills as a local Codex bundle.
Peer skills are fetched from their upstream GitHub repositories at install time,
their licenses are checked against references/peer-skills.bundle.json, and their
source is recorded in BUNDLE-INSTALL.json. This repository does not vendor those
third-party skill files.`;
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

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function run(command, args, options = {}) {
  const result = await execFileAsync(command, args, {
    cwd: options.cwd || repoRoot,
    timeout: options.timeout || 120000,
    maxBuffer: 1024 * 1024 * 8,
  });
  return result.stdout.trim();
}

function detectLicenseFromText(text) {
  if (/Apache License[\s\S]+Version 2\.0|Apache-2\.0/i.test(text)) return "Apache-2.0";
  if (/MIT License|Permission is hereby granted, free of charge/i.test(text)) return "MIT";
  return null;
}

async function detectLicense(cloneDir, peer) {
  const candidates = [];
  for (const file of peer.licenseFiles || []) {
    const absolute = path.join(cloneDir, file);
    if (await exists(absolute)) {
      const text = await fs.readFile(absolute, "utf8");
      candidates.push({ source: file, license: detectLicenseFromText(text) });
    }
  }
  for (const file of peer.packageLicenseFiles || []) {
    const absolute = path.join(cloneDir, file);
    if (await exists(absolute)) {
      const pkg = await readJson(absolute);
      if (pkg.license) candidates.push({ source: `${file}:license`, license: pkg.license });
    }
  }
  const accepted = candidates.find((candidate) => (peer.expectedLicenses || []).includes(candidate.license));
  return { accepted, candidates };
}

async function copySkillFolder(source, target) {
  await fs.cp(source, target, {
    recursive: true,
    filter: (sourcePath) => {
      const base = path.basename(sourcePath);
      return !COPY_EXCLUDES.has(base) && !base.endsWith(".log");
    },
  });
}

async function installDesignDirector(args, targetRoot) {
  if (!args.designDirector) return;
  const installArgs = [
    "scripts/install-local.mjs",
    args.mode === "copy" ? "--copy" : "--symlink",
    "--target",
    path.join(targetRoot, "design-director"),
  ];
  if (args.dryRun) installArgs.push("--dry-run");
  if (args.force) installArgs.push("--force");
  console.log(`install-bundle: ${process.execPath} ${installArgs.join(" ")}`);
  if (!args.dryRun) await run(process.execPath, installArgs);
}

async function installPeer(peerName, peer, args, targetRoot, tempRoot) {
  const target = path.join(targetRoot, peer.targetName || peerName);
  console.log(`install-bundle: peer ${peerName}`);
  console.log(`  source: ${peer.homepage || peer.repo}`);
  console.log(`  ref: ${peer.ref}`);
  console.log(`  target: ${target}`);
  console.log(`  expected license: ${(peer.expectedLicenses || []).join(", ")}`);
  if (args.dryRun) return;

  if (await exists(target)) {
    if (!args.forcePeers && !args.force) {
      console.log(`install-bundle: peer ${peerName} already exists at ${target}; leaving it unchanged`);
      return;
    }
    await fs.rm(target, { recursive: true, force: true });
  }

  const cloneDir = path.join(tempRoot, peerName);
  const cloneArgs = ["clone", "--depth", "1"];
  if (peer.ref) cloneArgs.push("--branch", peer.ref);
  cloneArgs.push(peer.repo, cloneDir);
  await run("git", cloneArgs, { timeout: 180000 });

  const license = await detectLicense(cloneDir, peer);
  if (!license.accepted) {
    const observed = license.candidates.map((candidate) => `${candidate.source}=${candidate.license || "unknown"}`).join(", ") || "none";
    throw new Error(`Peer skill ${peerName} license check failed. Expected ${(peer.expectedLicenses || []).join(", ")}, observed ${observed}.`);
  }

  const commit = await run("git", ["rev-parse", "HEAD"], { cwd: cloneDir });
  const sourceSkill = path.join(cloneDir, peer.skillPath);
  if (!(await exists(path.join(sourceSkill, "SKILL.md")))) {
    throw new Error(`Peer skill ${peerName} is missing SKILL.md at ${peer.skillPath}`);
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await copySkillFolder(sourceSkill, target);

  for (const file of peer.licenseFiles || []) {
    const source = path.join(cloneDir, file);
    if (await exists(source)) {
      const licenseTarget = path.join(target, path.basename(file));
      if (!(await exists(licenseTarget))) await fs.copyFile(source, licenseTarget);
    }
  }
  await fs.writeFile(path.join(target, "BUNDLE-INSTALL.json"), `${JSON.stringify({
    installedAt: new Date().toISOString(),
    peer: peerName,
    repo: peer.repo,
    homepage: peer.homepage,
    ref: peer.ref,
    commit,
    skillPath: peer.skillPath,
    license: license.accepted.license,
    licenseSource: license.accepted.source,
    role: peer.role,
  }, null, 2)}\n`);
  console.log(`install-bundle: installed peer ${peerName} (${license.accepted.license}) at ${target}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const manifest = await readJson(manifestPath);
  const targetRoot = path.resolve(expandHome(args.targetRoot || (process.env.CODEX_HOME ? path.join(process.env.CODEX_HOME, "skills") : path.join(os.homedir(), ".codex", "skills"))));
  const peerNames = args.allPeers
    ? Object.keys(manifest.peers || {})
    : (args.peers || manifest.defaultPeers || []);
  for (const peerName of peerNames) {
    if (!manifest.peers?.[peerName]) throw new Error(`Unknown peer skill in bundle manifest: ${peerName}`);
  }

  console.log(`install-bundle: target root ${targetRoot}${args.dryRun ? " (dry run)" : ""}`);
  await installDesignDirector(args, targetRoot);

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "design-director-bundle-"));
  try {
    for (const peerName of peerNames) {
      await installPeer(peerName, manifest.peers[peerName], args, targetRoot, tempRoot);
    }
  } finally {
    if (args.keepTemp) console.log(`install-bundle: kept temp root ${tempRoot}`);
    else await fs.rm(tempRoot, { recursive: true, force: true });
  }
  console.log("install-bundle: done. Restart Codex so newly installed skills are discovered.");
}

main().catch((error) => {
  console.error(`install-bundle: ${error.message}`);
  process.exit(1);
});
