#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseKeyValueArgs, toArray, writeJson } from "./lib/mockup-context.mjs";

const DEFAULT_PEERS = ["impeccable", "hallmark"];

function usage() {
  return `Usage: check-peer-skills.mjs [--peer impeccable --peer hallmark] [--skills-dir ~/.codex/skills] [--out .design-director] [--write-markdown]

Checks whether recommended peer skills are installed and writes compact evidence
that can be referenced from design-quality.draft.json or design-quality.json.`;
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function expandHome(value) {
  const text = String(value || "");
  if (text === "~") return os.homedir();
  if (text.startsWith("~/")) return path.join(os.homedir(), text.slice(2));
  return text;
}

function defaultCommandHints(peer) {
  if (peer === "impeccable") return ["craft", "bolder", "layout", "typeset", "adapt", "harden", "clarify"];
  if (peer === "hallmark") return ["audit", "redesign", "pre-emit critique"];
  return [];
}

function markdownReport(results) {
  const sections = results.peers.map((peer) => {
    const status = peer.available ? "available" : "unavailable-fallback-needed";
    const commands = peer.commandHints.length ? peer.commandHints.join(", ") : "none";
    return `## ${peer.name}-execution

- Status: ${status}
- Entrypoint: ${peer.entrypoint || "not found"}
- Outcome: ${peer.available ? "Loaded peer skill entrypoint and recorded compact availability evidence." : "Peer skill not found; use the fallback checklist in references/peer-compact-checks.md."}
- Commands/checks: ${commands}
- Next evidence: Record the specific command references loaded/run and what changed because of them before final acceptance.
`;
  }).join("\n");
  return `# Peer Skill Evidence

${sections}`;
}

async function main() {
  const args = parseKeyValueArgs(process.argv.slice(2), {
    skillsDir: path.join(os.homedir(), ".codex", "skills"),
    out: ".design-director",
  });
  if (args.help) {
    console.log(usage());
    return;
  }
  const skillsDir = path.resolve(expandHome(args.skillsDir));
  const peers = toArray(args.peer).length ? toArray(args.peer) : DEFAULT_PEERS;
  const results = {
    generatedAt: new Date().toISOString(),
    skillsDir,
    peers: [],
  };
  for (const peer of peers) {
    const entrypoint = path.join(skillsDir, peer, "SKILL.md");
    const available = await exists(entrypoint);
    results.peers.push({
      name: peer,
      available,
      status: available ? "available" : "unavailable-fallback-needed",
      entrypoint: available ? entrypoint : null,
      commandHints: defaultCommandHints(peer),
    });
  }
  const outDir = path.resolve(args.out);
  await writeJson(path.join(outDir, "peer-skills.detected.json"), results);
  if (args.writeMarkdown) {
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, "peer-execution.md"), markdownReport(results));
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(`check-peer-skills: ${error.message}`);
  process.exit(1);
});
