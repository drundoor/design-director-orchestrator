#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseKeyValueArgs } from "./lib/mockup-context.mjs";

function usage() {
  return `Usage: source-caveat-audit.mjs --config <render.config.json> [--file <page.html>]

Checks the configured data/source caveat policy. Simulated/demo data normally
needs a local source label, caption, footnote, or metadata row, not a dominant
warning banner.`;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function readTextIfExists(file) {
  if (!file) return "";
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

function filePathFromUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "file:") return null;
    return fileURLToPath(url);
  } catch {
    return null;
  }
}

function prominentBannerLikely(text) {
  return /\b(warning|alert|caution|danger|important)\b[\s\S]{0,120}\b(simulated|demo|sample)\b/i.test(text)
    || /\b(simulated|demo|sample)\b[\s\S]{0,120}\b(warning|alert|caution|danger|important)\b/i.test(text);
}

function sourceLabelPresent(text, label) {
  if (!text.trim()) return false;
  if (label && text.toLowerCase().includes(String(label).toLowerCase())) return true;
  return /\b(source|data source|sample data|simulated data|demo data|last updated)\b/i.test(text);
}

function caveatPillClassLikely(text) {
  const classAttrs = text.match(/class\s*=\s*["'][^"']+["']/gi) || [];
  return classAttrs.some((attr) => {
    const value = attr.toLowerCase();
    const hasCaveatToken = /\b(source|data|caveat|simulated|demo|sample)\b/.test(value);
    const hasPillToken = /\b(pill|chip|badge|tag)\b/.test(value);
    return hasCaveatToken && hasPillToken;
  });
}

async function main() {
  const args = parseKeyValueArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.config) throw new Error("Provide --config");
  const config = await readJson(path.resolve(args.config));
  const caveat = config.dataCaveat || {};
  const htmlFile = args.file ? path.resolve(args.file) : filePathFromUrl(config.url);
  const html = await readTextIfExists(htmlFile);
  const failures = [];
  const warnings = [];
  const truthStatus = String(caveat.truthStatus || "").toLowerCase();
  if (caveat.requiredInQa === true && !truthStatus) failures.push("dataCaveat.truthStatus is required");
  if (/simulated|demo|sample|unknown/.test(truthStatus) && html && !sourceLabelPresent(html, caveat.sourceLabel)) {
    failures.push("simulated/demo/unknown data needs a source label, caption, footnote, or local annotation in the rendered HTML");
  }
  if (caveat.prominentUiBannerAllowed === false && html && prominentBannerLikely(html)) {
    warnings.push("simulated/demo caveat appears to be presented like a warning banner; prefer a source label or caption unless risk requires prominence");
  }
  if (/simulated|demo|sample|unknown/.test(truthStatus) && html && caveatPillClassLikely(html)) {
    failures.push("simulated/demo/unknown data caveat must not be styled as a pill, chip, badge, or tag; use a source row, caption, footnote, or local annotation");
  }
  const result = {
    ok: failures.length === 0,
    failures,
    warnings,
    dataCaveat: caveat,
    inspectedFile: htmlFile || null,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    console.error(`source-caveat-audit: ${failures.join(" | ")}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`source-caveat-audit: ${error.message}`);
  process.exit(1);
});
