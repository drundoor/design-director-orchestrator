#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadRunContext,
  parseKeyValueArgs,
  toArray,
} from "./lib/mockup-context.mjs";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packsRoot = path.join(repoRoot, "references", "packs");

function usage() {
  return `Usage: seed-reference-ledger.mjs [--context <run-context.json>] [--pack dashboard --pack mobile-card] [--ledger <research-ledger.md>] [--list]

Seeds a research ledger with compact local Design Director reference packs. This
records references to check; it does not vendor third-party assets or code.`;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function packIndex() {
  return readJson(path.join(packsRoot, "index.json"));
}

function ledgerEntry(pack) {
  const sources = pack.sources.map((source) => `- source: ${source.source}
  tier: ${source.tier}
  role: ${source.role}
  chosen_for: ${source.chosen_for}
  extract: ${source.extract}
  do_not_copy: ${source.do_not_copy}
  local_mapping: ${source.local_mapping}
  verification_gate: ${source.verification_gate}`).join("\n");
  return `\n## Reference Pack: ${pack.name}\n\n${pack.description}\n\n${sources}\n`;
}

async function appendIfMissing(file, text, marker) {
  let existing = "";
  try {
    existing = await fs.readFile(file, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  if (existing.includes(marker)) return false;
  await fs.writeFile(file, `${existing.trimEnd()}\n${text.trimEnd()}\n`);
  return true;
}

async function main() {
  const args = parseKeyValueArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const index = await packIndex();
  if (args.list) {
    console.log(index.packs.map((pack) => {
      const aliases = toArray(pack.aliases || pack.alias);
      return `${pack.name}${aliases.length ? ` (aliases: ${aliases.join(", ")})` : ""}: ${pack.description}`;
    }).join("\n"));
    return;
  }

  let outputRoot = process.cwd();
  if (args.context) {
    const context = await loadRunContext(args.context);
    outputRoot = context.outputRoot;
  }
  const ledger = args.ledger ? path.resolve(args.ledger) : path.join(outputRoot, "research-ledger.md");
  const requested = toArray(args.pack);
  const packNames = requested.length ? requested : ["dashboard"];
  const available = new Map();
  for (const pack of index.packs) {
    available.set(pack.name, pack);
    for (const alias of toArray(pack.aliases || pack.alias)) {
      available.set(String(alias), pack);
    }
  }
  const written = [];
  for (const name of packNames) {
    const pack = available.get(name);
    if (!pack) throw new Error(`Unknown pack "${name}". Run --list to see available packs.`);
    const marker = `## Reference Pack: ${pack.name}`;
    const changed = await appendIfMissing(ledger, ledgerEntry(pack), marker);
    if (changed) written.push(pack.name);
  }
  console.log(JSON.stringify({ ledger, written, skippedExisting: packNames.filter((name) => !written.includes(name)) }, null, 2));
}

main().catch((error) => {
  console.error(`seed-reference-ledger: ${error.message}`);
  process.exit(1);
});
