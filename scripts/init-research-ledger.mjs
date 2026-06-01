#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = { out: ".design-director", force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--file") args.file = argv[++i];
    else if (arg === "--force") args.force = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `Usage: init-research-ledger.mjs [--out .design-director] [--file .design-director/research-ledger.yaml] [--force]

Creates a lawful inspiration/research ledger scaffold. Sources must record
license, source freshness, allowed use, and do-not-copy boundaries before they
can influence implementation.`;
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function ledgerTemplate() {
  const checkedAt = todayIsoDate();
  return `# Design Director research ledger.
# Keep every source lawful and bounded. Do not copy assets, layouts, text, or
# code unless the license and attribution requirements permit that exact use.

references:
  - source: "TODO - official URL or GitHub repository"
    type: "design system | component library | inspiration site | GitHub skill | asset/template"
    reputation_signal: "TODO - why designers/builders should trust it"
    checked_at: "${checkedAt}"
    license: "TODO - MIT | Apache-2.0 | OFL | custom | not found"
    license_source: "TODO - repo LICENSE | package metadata | official docs | not found"
    package_version_or_commit: "TODO - package version, release tag, commit SHA, or n/a"
    maintenance_signal: "TODO - recent release, active issues, production use, docs freshness, or unknown"
    maintenance_signal_checked_at: "${checkedAt}"
    allowed_use: "link only | dependency | code reference | asset allowed | do not use"
    why_relevant: "TODO - brief question it answers"
    extract: "TODO - transferable principle or mechanic"
    do_not_copy: "TODO - assets, layout, copy, source code, brand skin, animation choreography, etc."
    local_mapping: "TODO - how it maps to this product"
    verification_gate: "TODO - how QA will prove the adaptation works"
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const outDir = path.resolve(args.out);
  const file = path.resolve(args.file || path.join(outDir, "research-ledger.yaml"));
  if (!args.force && await exists(file)) {
    throw new Error(`${file} already exists; use --force to overwrite`);
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, ledgerTemplate());
  console.log(`research:ledger: wrote ${file}`);
}

main().catch((error) => {
  console.error(`research:ledger failed: ${error.message}`);
  process.exit(1);
});
