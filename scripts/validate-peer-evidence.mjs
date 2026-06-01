#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { parseKeyValueArgs } from "./lib/mockup-context.mjs";

const VALID_STATUSES = new Set(["available", "unavailable-fallback-used", "user-waived", "skipped-while-available"]);
const NEGATIVE_PATTERN = /\b(not run|not loaded|skipped|pending|todo|missing|unavailable)\b/i;
const POSITIVE_PATTERN = /\b(pass|passed|loaded|run|ran|used|applied|reviewed|executed|completed|checked)\b/i;

function usage() {
  return `Usage: validate-peer-evidence.mjs [--design-quality .design-director/design-quality.json] [--out .design-director]

Performs a compact peer-skill evidence check before final qa-report enforces the
full acceptance contract.`;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function readText(file) {
  return fs.readFile(file, "utf8");
}

function pathInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveEvidencePath(outDir, value) {
  const file = String(value || "").split("#")[0];
  if (!file) return null;
  const absolute = path.resolve(outDir, file);
  if (!pathInside(outDir, absolute)) return null;
  return absolute;
}

function markdownAnchor(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9\s/_-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function readEvidenceSection(outDir, reference) {
  const [file, fragment] = String(reference || "").split("#");
  const evidencePath = resolveEvidencePath(outDir, file);
  if (!evidencePath) return null;
  let text = "";
  try {
    text = await readText(evidencePath);
  } catch {
    return null;
  }
  if (!fragment) return text;
  const lines = text.split(/\r?\n/);
  let active = false;
  const body = [];
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (heading) {
      if (active) break;
      const title = heading[2].trim();
      active = title === fragment || markdownAnchor(title) === markdownAnchor(fragment);
      continue;
    }
    if (active) body.push(line);
  }
  return active ? body.join("\n") : null;
}

async function validatePeer(outDir, name, peer) {
  const failures = [];
  const status = peer.status || "";
  if (!VALID_STATUSES.has(status)) failures.push(`${name}.status must be one of ${[...VALID_STATUSES].join(", ")}`);
  if (status === "available") {
    const evidence = peer.executionEvidence || peer.execution_evidence;
    if (!evidence || typeof evidence !== "object") failures.push(`${name}.executionEvidence object is required`);
    else {
      if (!String(evidence.summary || "").trim() && !Array.isArray(evidence.commands) && !Array.isArray(evidence.checks)) {
        failures.push(`${name}.executionEvidence needs summary, commands, or checks`);
      }
      const section = await readEvidenceSection(outDir, evidence.path);
      if (!section) failures.push(`${name}.executionEvidence.path must point to an existing markdown section inside the QA output`);
      else {
        if (/\bTODO\b/i.test(section)) failures.push(`${name}.executionEvidence section contains TODO`);
        if (!POSITIVE_PATTERN.test(section)) failures.push(`${name}.executionEvidence section must record what was loaded, run, checked, or applied`);
        if (NEGATIVE_PATTERN.test(section)) failures.push(`${name}.executionEvidence section contains negative or pending wording`);
      }
    }
  } else if (status === "unavailable-fallback-used") {
    const evidence = peer.fallbackEvidence || peer.fallback_evidence || peer.fallbackSummary || peer.fallback_summary;
    if (peer.fallbackChecklistCompleted !== true && peer.fallback_checklist_completed !== true) {
      failures.push(`${name}.fallbackChecklistCompleted must be true`);
    }
    if (!evidence || typeof evidence !== "object") failures.push(`${name}.fallbackEvidence object is required`);
    else {
      const checks = Array.isArray(evidence.requiredChecks) ? evidence.requiredChecks : [];
      if (!checks.length) failures.push(`${name}.fallbackEvidence.requiredChecks is required`);
      const section = await readEvidenceSection(outDir, evidence.path);
      if (!section) failures.push(`${name}.fallbackEvidence.path must point to an existing markdown section inside the QA output`);
      else if (/\bTODO\b/i.test(section)) failures.push(`${name}.fallbackEvidence section contains TODO`);
    }
  } else if (status === "user-waived") {
    if (!String(peer.reason || peer.waiverEvidence || peer.waiver_evidence || "").trim()) {
      failures.push(`${name}.reason or waiverEvidence is required for user-waived status`);
    }
  } else if (status === "skipped-while-available") {
    failures.push(`${name} was skipped while available`);
  }
  return failures;
}

async function main() {
  const args = parseKeyValueArgs(process.argv.slice(2), {
    out: ".design-director",
    designQuality: ".design-director/design-quality.json",
  });
  if (args.help) {
    console.log(usage());
    return;
  }
  const outDir = path.resolve(args.out);
  const designQuality = await readJson(path.resolve(args.designQuality));
  const peerSkills = designQuality.peerSkills || designQuality.peer_skills || {};
  const failures = [];
  for (const [name, peer] of Object.entries(peerSkills)) {
    failures.push(...await validatePeer(outDir, name, peer || {}));
  }
  const result = {
    ok: failures.length === 0,
    checked: Object.keys(peerSkills),
    failures,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    console.error(`validate-peer-evidence: ${failures.join(" | ")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`validate-peer-evidence: ${error.message}`);
  process.exit(1);
});
