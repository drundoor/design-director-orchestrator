#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { SEVERITY, qaSeverityForFinding } from "./lib/findings.mjs";

const REQUIRED_NOTE_FIELDS = [
  "Viewport",
  "State",
  "URL",
  "Observation",
  "Pass/fail",
  "Issues found",
  "Waiver/evidence",
];

function parseArgs(argv) {
  const args = { out: ".design-director" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--notes") {
      args.notes = argv[++i];
    } else if (arg === "--waivers") {
      args.waivers = argv[++i];
    } else if (arg === "--brief") {
      args.brief = argv[++i];
    } else if (arg === "--evidence-only") {
      args.evidenceOnly = true;
    } else if (arg === "--no-brief") {
      args.noBrief = true;
    } else if (arg === "--init-notes") {
      args.initNotes = true;
    } else if (arg === "--static") {
      args.static = true;
    } else if (arg === "--partial") {
      args.partial = true;
    } else if (arg === "--allow-partial-exit-zero") {
      args.allowPartialExitZero = true;
    } else if (arg === "--allow-mixed-evidence") {
      args.allowMixedEvidence = true;
    } else if (arg === "--max-evidence-age-ms") {
      args.maxEvidenceAgeMs = Number(argv[++i]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function usage() {
  return `Usage: qa-report.mjs [--out .design-director] [--notes .design-director/screenshot-notes.md] [--waivers .design-director/waivers.json] [--brief .design-director/design-brief.md] [--evidence-only|--no-brief] [--init-notes] [--static] [--partial] [--allow-partial-exit-zero] [--allow-mixed-evidence] [--max-evidence-age-ms 1800000]

Merges render-results.json, dom-audit.json, and visual-consistency-audit.json
into design-qa.json and design-qa.md. Missing evidence is incomplete/failing by
default. Use --static to waive state discovery for non-interactive static pages.
Final design acceptance requires a design brief unless --evidence-only or --no-brief
records that this run is only validating QA evidence.
Use --partial only for draft reports that are not acceptance evidence. Partial
reports with incomplete evidence exit nonzero unless --allow-partial-exit-zero
is explicitly supplied.`;
}

async function readJsonArtifact(file) {
  try {
    return { exists: true, path: file, data: JSON.parse(await fs.readFile(file, "utf8")) };
  } catch (error) {
    if (error.code === "ENOENT") return { exists: false, path: file, data: null };
    throw error;
  }
}

async function readTextArtifact(file) {
  if (!file) return { exists: false, path: null, text: "" };
  try {
    return { exists: true, path: file, text: await fs.readFile(file, "utf8") };
  } catch (error) {
    if (error.code === "ENOENT") return { exists: false, path: file, text: "" };
    throw error;
  }
}

async function pathExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function bullet(items) {
  if (!items.length) return "- None recorded.";
  return items.map((item) => `- ${item}`).join("\n");
}

function waiverArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.waivers)) return value.waivers;
  return [];
}

function normalizeCheck(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveEvidencePath(outDir, file) {
  if (!file) return null;
  if (path.isAbsolute(file)) return file;
  const normalized = file.replaceAll("\\", "/");
  const outBase = path.basename(outDir);
  if (normalized === outBase || normalized.startsWith(`${outBase}/`)) return path.resolve(file);
  return path.resolve(outDir, file);
}

function pathInsideDir(dir, file) {
  const relative = path.relative(dir, file);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function artifactPath(outDir, file) {
  if (!file) return file;
  const absolute = resolveEvidencePath(outDir, file);
  if (!absolute) return file;
  if (!pathInsideDir(outDir, absolute)) return "[absolute-path-redacted]";
  return path.relative(outDir, absolute).replaceAll(path.sep, "/");
}

function normalizeUrl(value) {
  if (!value) return "unknown-url";
  try {
    const url = new URL(value);
    url.hash = "";
    if ((url.protocol === "http:" || url.protocol === "https:") && url.pathname.endsWith("/") && url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.toString();
  } catch {
    return String(value).replace(/#.*$/, "").replace(/\/+$/, "");
  }
}

function viewportKey(viewport = {}) {
  return `${viewport.width || "?"}x${viewport.height || "?"}`;
}

function stateIdForArtifact(state = {}) {
  return state.stateId || state.id || state.state || state.name || "default";
}

function stateKey(state = {}) {
  return [
    stateIdForArtifact(state),
    viewportKey(state.viewport),
  ].join("|");
}

function buildStateMatrix(states = []) {
  const matrix = new Map();
  for (const state of states) matrix.set(stateKey(state), state);
  return matrix;
}

function duplicateStateKeys(states = []) {
  const counts = new Map();
  for (const state of states) {
    const key = stateKey(state);
    if (!counts.has(key)) counts.set(key, []);
    counts.get(key).push(state);
  }
  return [...counts.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([key, entries]) => ({
      key,
      states: entries.map((state) => ({
        state: state.state || state.name || "default",
        stateId: stateIdForArtifact(state),
        viewport: state.viewport || null,
        url: state.finalUrl || state.url || null,
        screenshot: state.screenshot || null,
      })),
    }));
}

async function inspectScreenshot(file, outDir) {
  const absolute = resolveEvidencePath(outDir, file);
  if (!absolute) return { path: file, exists: false, valid: false, reason: "path missing" };
  if (!pathInsideDir(outDir, absolute)) {
    return { path: artifactPath(outDir, file), exists: false, valid: false, reason: "evidence path is outside QA output directory" };
  }
  try {
    const data = await fs.readFile(absolute);
    const isPng = data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a;
    const isJpeg = data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    const isWebp = data.length >= 12 && data.slice(0, 4).toString("ascii") === "RIFF" && data.slice(8, 12).toString("ascii") === "WEBP";
    const dimensions = imageDimensions(data, { isPng, isJpeg, isWebp });
    const valid = data.length > 16 && (isPng || isJpeg || isWebp);
    return {
      path: file,
      exists: true,
      valid,
      size: data.length,
      width: dimensions?.width || null,
      height: dimensions?.height || null,
      format: isPng ? "png" : isJpeg ? "jpeg" : isWebp ? "webp" : "unknown",
      reason: valid ? null : "not a valid PNG, JPEG, or WebP screenshot",
    };
  } catch (error) {
    if (error.code === "ENOENT") return { path: file, exists: false, valid: false, reason: "file is missing" };
    throw error;
  }
}

function imageDimensions(data, flags) {
  if (flags.isPng && data.length >= 24) {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (flags.isJpeg) {
    let offset = 2;
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = data[offset + 1];
      const length = data.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
      }
      if (!length) break;
      offset += 2 + length;
    }
  }
  if (flags.isWebp && data.length >= 30) {
    const subtype = data.slice(12, 16).toString("ascii");
    if (subtype === "VP8X" && data.length >= 30) {
      return {
        width: 1 + data.readUIntLE(24, 3),
        height: 1 + data.readUIntLE(27, 3),
      };
    }
    if (subtype === "VP8 " && data.length >= 30) {
      const payloadOffset = 20;
      if (data[payloadOffset + 3] === 0x9d && data[payloadOffset + 4] === 0x01 && data[payloadOffset + 5] === 0x2a) {
        return {
          width: data.readUInt16LE(payloadOffset + 6) & 0x3fff,
          height: data.readUInt16LE(payloadOffset + 8) & 0x3fff,
        };
      }
    }
    if (subtype === "VP8L" && data.length >= 25) {
      const payloadOffset = 20;
      if (data[payloadOffset] === 0x2f) {
        const bits = data.readUInt32LE(payloadOffset + 1);
        return {
          width: (bits & 0x3fff) + 1,
          height: ((bits >> 14) & 0x3fff) + 1,
        };
      }
    }
  }
  return null;
}

async function validateWaivers(waivers, { outDir, partial }) {
  const valid = [];
  const invalid = [];
  for (const [index, waiver] of waivers.entries()) {
    const problems = [];
    const check = normalizeCheck(waiver.check || waiver.id || waiver.type);
    if (!check) problems.push("check is required");
    if (check === "*") problems.push("wildcard waivers are not allowed");
    for (const field of ["reason", "evidence", "owner"]) {
      if (!String(waiver[field] || "").trim()) problems.push(`${field} is required`);
    }
    if (!partial && !String(waiver.expires || "").trim()) problems.push("expires is required");
    if (waiver.expires && Number.isNaN(Date.parse(waiver.expires))) {
      problems.push("expires must be a parseable date");
    } else if (!partial && waiver.expires && Date.parse(waiver.expires) < Date.now()) {
      problems.push("expires is in the past");
    }
    if (waiver.evidence) {
      const evidencePath = resolveEvidencePath(outDir, waiver.evidence);
      if (!(await pathExists(evidencePath))) problems.push(`evidence path does not exist: ${waiver.evidence}`);
    }
    const normalized = { ...waiver, check, index, valid: problems.length === 0, problems };
    if (problems.length) invalid.push(normalized);
    else valid.push(normalized);
  }
  return { valid, invalid };
}

const PREFIX_WAIVER_CHECKS = new Set(["coverage", "state-discovery"]);

function matchScope(waiver, context = {}) {
  const scope = waiver.scope || {};
  const direct = {
    stateId: waiver.stateId,
    state: waiver.state,
    selector: waiver.selector,
    kind: waiver.kind,
    url: waiver.url,
    viewport: waiver.viewport,
  };
  const expected = { ...scope, ...Object.fromEntries(Object.entries(direct).filter(([, value]) => value !== undefined && value !== null && value !== "")) };
  for (const [key, value] of Object.entries(expected)) {
    if (key === "viewport") {
      if (String(value) !== viewportKey(context.viewport || context.discoveredFrom?.viewport || {})) return false;
    } else if (key === "url") {
      if (normalizeUrl(value) !== normalizeUrl(context.url || context.finalUrl || context.discoveredFrom?.url)) return false;
    } else if (context[key] !== value && context.discoveredFrom?.[key] !== value) {
      return false;
    }
  }
  return true;
}

function hasWaiver(waivers, check, context = {}, options = {}) {
  const target = normalizeCheck(check);
  return waivers.find((waiver) => {
    const waiverCheck = normalizeCheck(waiver.check || waiver.id || waiver.type);
    const checkMatches = waiverCheck === target || (options.partial && PREFIX_WAIVER_CHECKS.has(waiverCheck) && target.startsWith(`${waiverCheck}:`));
    return checkMatches && matchScope(waiver, context);
  });
}

function loadScreenshots(render, outDir) {
  const screenshots = [];
  const seen = new Set();
  const add = (item) => {
    if (!item?.path || seen.has(item.path)) return;
    seen.add(item.path);
    screenshots.push(item);
  };

  for (const state of render?.states || []) {
    if (state.screenshot) {
      add({
        path: artifactPath(outDir, state.screenshot),
        type: "page",
        state: state.state || "unknown",
        viewport: state.viewport || null,
        url: state.finalUrl || state.url || "unknown",
      });
    }
    for (const artifact of state.actionArtifacts || []) {
      if (artifact.type === "element-screenshot" && artifact.path) {
        add({
          path: artifactPath(outDir, artifact.path),
          type: "element",
          selector: artifact.selector,
          state: state.state || "unknown",
          viewport: artifact.viewport || state.viewport || null,
          url: state.finalUrl || state.url || "unknown",
        });
      }
    }
  }

  for (const screenshot of render?.screenshots || []) {
    const state = (render?.states || []).find((entry) => entry.screenshot === screenshot);
    add({
      path: artifactPath(outDir, screenshot),
      type: "page",
      state: state?.state || "unknown",
      viewport: state?.viewport || null,
      url: state?.finalUrl || state?.url || "unknown",
    });
  }

  return screenshots;
}

function screenshotNoteTemplate(render, outDir) {
  const screenshots = loadScreenshots(render, outDir);
  const rows = screenshots.length
    ? screenshots.map((screenshot) => {
        const viewport = screenshot.viewport ? `${screenshot.viewport.width}x${screenshot.viewport.height}` : "unknown";
        const selectorLine = screenshot.selector ? `- Selector: ${screenshot.selector}\n` : "";
        return `## ${screenshot.path}

- Viewport: ${viewport}
- State: ${screenshot.state || "unknown"}
- URL: ${screenshot.url || "unknown"}
${selectorLine}- Observation: TODO
- Pass/fail: TODO
- Issues found: TODO
- Waiver/evidence: TODO
`;
      }).join("\n")
    : "No screenshots found in render-results.json.\n";
  return `# Screenshot Inspection Notes

Replace every TODO with a real observation. A generated template does not count
as inspection.

${rows}`;
}

function parseNoteSections(notes, outDir) {
  const sections = new Map();
  const lines = notes.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = { key: heading[1], lines: [] };
      sections.set(current.key, current);
      sections.set(artifactPath(outDir, heading[1]), current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return sections;
}

function parseFields(section) {
  const fields = new Map();
  for (const line of section?.lines || []) {
    const match = line.match(/^-\s*([^:]+):\s*(.*)$/);
    if (match) fields.set(match[1].trim().toLowerCase(), match[2].trim());
  }
  return fields;
}

function invalidFieldValue(field, value) {
  if (!value || /\bTODO\b/i.test(value)) return true;
  if (["Viewport", "State", "URL"].includes(field) && /^unknown$/i.test(value)) return true;
  if (field === "Pass/fail" && !/\b(pass|fail|waiv|blocked|issue|not applicable|n\/a)\b/i.test(value)) return true;
  return false;
}

function issuesAreClear(value) {
  return /^(none|n\/a|not applicable|no issues?|no issue found|no visible issues?)\.?$/i.test(String(value || "").trim());
}

function noteMetadataProblems(screenshot, fields) {
  const problems = [];
  const viewport = fields.get("viewport");
  const state = fields.get("state");
  const url = fields.get("url");
  const expectedViewport = screenshot.viewport ? `${screenshot.viewport.width}x${screenshot.viewport.height}` : "unknown";
  const expectedState = screenshot.state || "unknown";
  const expectedUrl = normalizeUrl(screenshot.url);
  const aliasAllowed = /^(yes|true)$/i.test(fields.get("state alias") || fields.get("alias") || "");
  const redirectAllowed = /^(yes|true)$/i.test(fields.get("redirect") || fields.get("url redirect") || "");
  if (viewport && viewport !== expectedViewport) {
    problems.push(`${screenshot.path}: note viewport ${viewport} does not match screenshot viewport ${expectedViewport}`);
  }
  if (state && state !== expectedState && !aliasAllowed) {
    problems.push(`${screenshot.path}: note state ${state} does not match rendered state ${expectedState}`);
  }
  if (url && normalizeUrl(url) !== expectedUrl && !redirectAllowed) {
    problems.push(`${screenshot.path}: note URL ${url} does not match screenshot URL ${screenshot.url}`);
  }
  return problems;
}

function screenshotDimensionProblems(screenshot, integrity) {
  const problems = [];
  if (!integrity.valid) return problems;
  if (!integrity.width || !integrity.height) {
    problems.push(`${screenshot.path}: screenshot dimensions could not be read`);
    return problems;
  }
  if (screenshot.type === "page") {
    const expectedWidth = Number(screenshot.viewport?.width || 0);
    const expectedHeight = Number(screenshot.viewport?.height || 0);
    if (expectedWidth && integrity.width < expectedWidth - 2) {
      problems.push(`${screenshot.path}: page screenshot width ${integrity.width}px is smaller than viewport width ${expectedWidth}px`);
    }
    const minimumHeight = expectedHeight ? Math.min(120, expectedHeight) : 120;
    if (integrity.height < minimumHeight) {
      problems.push(`${screenshot.path}: page screenshot height ${integrity.height}px is not plausible for viewport ${viewportKey(screenshot.viewport)}`);
    }
  } else if (screenshot.type === "element" && (integrity.width < 24 || integrity.height < 24)) {
    problems.push(`${screenshot.path}: element screenshot is too small (${integrity.width}x${integrity.height})`);
  }
  return problems;
}

async function validateScreenshotNotes({ screenshots, notesText, notesExists, outDir }) {
  const sections = parseNoteSections(notesText, outDir);
  const invalid = [];
  const failed = [];
  const integrity = [];
  let validCount = 0;

  for (const screenshot of screenshots) {
    const section = sections.get(screenshot.path);
    const screenshotIntegrity = await inspectScreenshot(screenshot.path, outDir);
    integrity.push(screenshotIntegrity);
    if (!screenshotIntegrity.exists) {
      invalid.push(`${screenshot.path}: screenshot file is missing`);
    } else if (!screenshotIntegrity.valid) {
      invalid.push(`${screenshot.path}: ${screenshotIntegrity.reason}`);
    } else {
      invalid.push(...screenshotDimensionProblems(screenshot, screenshotIntegrity));
    }
    if (!notesExists || !section) {
      invalid.push(`${screenshot.path}: screenshot note section missing`);
      continue;
    }
    const fields = parseFields(section);
    const missingFields = [];
    for (const field of REQUIRED_NOTE_FIELDS) {
      const value = fields.get(field.toLowerCase());
      if (invalidFieldValue(field, value)) missingFields.push(field);
    }
    if (missingFields.length) {
      invalid.push(`${screenshot.path}: missing inspected fields (${missingFields.join(", ")})`);
    } else {
      const passFail = fields.get("pass/fail");
      const issuesFound = fields.get("issues found");
      invalid.push(...noteMetadataProblems(screenshot, fields));
      if (/\b(fail|failed|blocked|issue)\b/i.test(passFail) || !issuesAreClear(issuesFound)) {
        failed.push(`${screenshot.path}: note records ${passFail}; issues found: ${issuesFound}`);
      }
    }
    if (!missingFields.length && screenshotIntegrity.valid) {
      validCount += 1;
    }
  }

  const generatedTemplate = /\bTODO\b|generated template does not count/i.test(notesText);
  if (generatedTemplate) invalid.push("screenshot notes still contain generated-template TODO text");

  return {
    exists: notesExists,
    requiredCount: screenshots.length,
    validCount,
    invalid,
    failed,
    integrity,
  };
}

function formatStateLabel(state) {
  return `${state.state || "default"} ${state.viewport?.width || "?"}`;
}

function stateCoverageItems(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.dispositions)) return value.dispositions;
  if (Array.isArray(value.candidates)) return value.candidates;
  return [];
}

function candidateScope(candidate = {}) {
  return {
    selector: candidate.selector,
    kind: candidate.kind,
    state: candidate.discoveredFrom?.state,
    url: normalizeUrl(candidate.discoveredFrom?.url),
    viewport: viewportKey(candidate.discoveredFrom?.viewport),
  };
}

function candidateScopeMatches(candidate, item = {}) {
  const expected = candidateScope(candidate);
  const actual = item.discoveredFrom || item.scope || item;
  const actualSelector = item.selector || actual.selector;
  const actualKind = item.kind || actual.kind;
  if (candidate.selector && actualSelector !== candidate.selector) return false;
  if (candidate.kind && actualKind !== candidate.kind) return false;
  if (expected.state && actual.state && actual.state !== expected.state) return false;
  if (expected.url !== "unknown-url" && actual.url && normalizeUrl(actual.url) !== expected.url) return false;
  const actualViewport = typeof actual.viewport === "string" ? actual.viewport : viewportKey(actual.viewport);
  if (expected.viewport !== "?x?" && actual.viewport && actualViewport !== expected.viewport) return false;
  return Boolean(actual.url && actual.viewport);
}

function dispositionForCandidate(candidate, stateCoverage) {
  const items = stateCoverageItems(stateCoverage);
  return items.find((item) => {
    if (!candidateScopeMatches(candidate, item)) return false;
    return true;
  });
}

function dispositionValue(item = {}) {
  return item.disposition || item.coverage;
}

async function dispositionProblems(candidate, disposition, { outDir, rendered }) {
  if (!disposition) return [];
  const value = dispositionValue(disposition);
  const problems = [];
  const reason = String(disposition.reason || "").trim();
  const evidence = disposition.evidence;
  if (value && value !== "rendered" && !reason) {
    problems.push(`state-coverage ${value} disposition for ${candidate.kind} ${candidate.selector} requires a reason`);
  }
  if (["waived", "duplicate", "low-value"].includes(value) && !evidence) {
    problems.push(`state-coverage ${value} disposition for ${candidate.kind} ${candidate.selector} requires evidence`);
  }
  if (value === "rejected") {
    const rejectionRisk = disposition.risk || disposition.rejectionRisk;
    const acceptableRisk = ["destructive", "sensitive", "not-relevant"].includes(rejectionRisk);
    if (!evidence && !acceptableRisk) {
      problems.push(`state-coverage rejected disposition for ${candidate.kind} ${candidate.selector} requires evidence or risk destructive|sensitive|not-relevant`);
    }
  }
  if (value === "rendered" && !rendered && !evidence) {
    problems.push(`state-coverage rendered disposition for ${candidate.kind} ${candidate.selector} requires evidence when no rendered state/action proves it`);
  }
  if (evidence && !(await pathExists(resolveEvidencePath(outDir, evidence)))) {
    problems.push(`state-coverage evidence does not exist for ${candidate.kind} ${candidate.selector}: ${evidence}`);
  }
  return problems;
}

const IMPORTANT_MEDIUM_KINDS = new Set(["chart-or-canvas", "scroll-container", "combobox", "text-input"]);
const COVERAGE_KIND_PRIORITY = new Map([
  ["overlay-trigger", 0],
  ["select", 1],
  ["combobox", 2],
  ["text-input", 3],
  ["chart-or-canvas", 4],
  ["scroll-container", 5],
  ["tab", 6],
  ["disclosure", 7],
  ["safe-button", 8],
]);
const COVERAGE_KIND_LIMITS = new Map([
  ["overlay-trigger", 8],
  ["select", 6],
  ["combobox", 5],
  ["text-input", 5],
  ["chart-or-canvas", 5],
  ["scroll-container", 4],
  ["tab", 6],
  ["disclosure", 5],
  ["safe-button", 5],
]);

function enforceMediumCandidates(render = {}) {
  const qaProfile = render.qaProfile || "audit";
  const surface = `${render.platform || ""} ${render.surface || ""}`.toLowerCase();
  return qaProfile === "final-qa" || /\b(data-viz|dashboard|analytics|table|catalog)\b/.test(surface);
}

function prioritizeCoverageCandidates(candidates) {
  const counts = new Map();
  const sorted = [...candidates].sort((a, b) => {
    const left = COVERAGE_KIND_PRIORITY.has(a.kind) ? COVERAGE_KIND_PRIORITY.get(a.kind) : 99;
    const right = COVERAGE_KIND_PRIORITY.has(b.kind) ? COVERAGE_KIND_PRIORITY.get(b.kind) : 99;
    if (left !== right) return left - right;
    const leftY = a.rect?.y ?? 99999;
    const rightY = b.rect?.y ?? 99999;
    if (leftY !== rightY) return leftY - rightY;
    return String(a.selector || "").localeCompare(String(b.selector || ""));
  });
  const selected = [];
  for (const candidate of sorted) {
    const viewport = candidate.discoveredFrom?.viewport;
    const bucket = [
      candidate.kind,
      candidate.discoveredFrom?.state || "default",
      candidate.discoveredFrom?.url || "unknown-url",
      viewport ? `${viewport.width}x${viewport.height}` : "unknown-viewport",
    ].join("|");
    const limit = COVERAGE_KIND_LIMITS.get(candidate.kind) || 3;
    const count = counts.get(bucket) || 0;
    if (count >= limit) continue;
    counts.set(bucket, count + 1);
    selected.push(candidate);
  }
  return selected;
}

function enforcedCandidates(discovery, render = {}) {
  const includeMedium = enforceMediumCandidates(render);
  const candidates = (discovery?.candidates || []).filter((candidate) => {
    if (!candidate.selector || (candidate.mutationRisk || "safe") !== "safe") return false;
    if (candidate.confidence === "high") return true;
    return includeMedium && candidate.confidence === "medium" && IMPORTANT_MEDIUM_KINDS.has(candidate.kind);
  });
  return prioritizeCoverageCandidates(candidates);
}

function renderedCandidate(candidate, states = []) {
  return states.some((state) => {
    if (state.discoveredFrom?.selector === candidate.selector && (!candidate.kind || state.discoveredFrom?.kind === candidate.kind)) {
      if (candidateScopeMatches(candidate, { selector: candidate.selector, kind: candidate.kind, discoveredFrom: state.discoveredFrom })) return true;
    }
    const stateUrl = normalizeUrl(state.finalUrl || state.url);
    const candidateUrl = normalizeUrl(candidate.discoveredFrom?.url);
    const sameViewport = viewportKey(state.viewport) === viewportKey(candidate.discoveredFrom?.viewport);
    const sameUrl = candidateUrl === "unknown-url" || stateUrl === candidateUrl;
    if (!sameViewport || !sameUrl) return false;
    return (state.actions || []).some((action) => action.selector === candidate.selector) ||
      (state.actionArtifacts || []).some((artifact) => artifact.selector === candidate.selector);
  });
}

function staticControlsFromDom(dom) {
  return (dom?.states || []).flatMap((state) =>
    (state.audit?.interactiveControls || []).map((control) => ({
      state: state.state || "default",
      viewport: state.viewport || null,
      control,
    }))
  );
}

function artifactFreshness(artifacts, maxAgeMs) {
  const present = artifacts.filter((artifact) => artifact.result.exists);
  const hashes = new Set(present.map((artifact) => artifact.result.data?.configHash).filter(Boolean));
  const baseUrls = new Set(present.map((artifact) => normalizeUrl(artifact.result.data?.baseUrl)).filter((url) => url !== "unknown-url"));
  const configuredRunIds = new Set(
    present
      .filter((artifact) => artifact.result.data?.qaRunIdSource === "configured")
      .map((artifact) => artifact.result.data?.qaRunId)
      .filter(Boolean)
  );
  const appBuildIds = new Set(present.map((artifact) => artifact.result.data?.appBuildId).filter(Boolean));
  const generatedRunIds = new Set(
    present
      .filter((artifact) => artifact.result.data?.qaRunIdSource !== "configured")
      .map((artifact) => artifact.result.data?.qaRunId)
      .filter(Boolean)
  );
  const times = present.flatMap((artifact) => [artifact.result.data?.startedAt, artifact.result.data?.finishedAt || artifact.result.data?.generatedAt])
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  const earliest = times.length ? Math.min(...times) : null;
  const latest = times.length ? Math.max(...times) : null;
  return {
    artifacts: present.map((artifact) => ({
      name: artifact.name,
      configHash: artifact.result.data?.configHash || null,
      qaRunId: artifact.result.data?.qaRunId || null,
      qaRunIdSource: artifact.result.data?.qaRunIdSource || null,
      appBuildId: artifact.result.data?.appBuildId || null,
      baseUrl: artifact.result.data?.baseUrl || null,
      startedAt: artifact.result.data?.startedAt || null,
      finishedAt: artifact.result.data?.finishedAt || null,
      generatedAt: artifact.result.data?.generatedAt || null,
    })),
    hashes: [...hashes],
    baseUrls: [...baseUrls],
    configuredRunIds: [...configuredRunIds],
    appBuildIds: [...appBuildIds],
    generatedRunIds: [...generatedRunIds],
    earliest: earliest ? new Date(earliest).toISOString() : null,
    latest: latest ? new Date(latest).toISOString() : null,
    spanMs: earliest && latest ? latest - earliest : null,
    maxAgeMs,
  };
}

function stateFinalUrl(state = {}) {
  return normalizeUrl(state.finalUrl || state.url);
}

function sanitizeStringForOutput(value, outDir) {
  if (typeof value !== "string") return value;
  const normalizedOut = path.resolve(outDir);
  let result = value.split(normalizedOut).join(".");
  if (path.isAbsolute(result)) {
    const relative = path.relative(outDir, result);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return relative.replaceAll(path.sep, "/");
    return "[absolute-path-redacted]";
  }
  result = result.replace(/(^|[\s("'=])\/(?:Users|home|var|tmp|private|opt|Volumes)\/[^\s"'`<>)]+/g, "$1[absolute-path-redacted]");
  result = result.replace(/(^|[\s("'=])[A-Za-z]:\\(?:Users|Documents and Settings)\\[^\s"'`<>)]+/g, "$1[absolute-path-redacted]");
  return result;
}

function sanitizeForOutput(value, outDir) {
  if (Array.isArray(value)) return value.map((item) => sanitizeForOutput(item, outDir));
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === "absolutePath" || key === "_absolutePath") continue;
      result[key] = sanitizeForOutput(item, outDir);
    }
    return result;
  }
  return sanitizeStringForOutput(value, outDir);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const maxEvidenceAgeMs = Number.isFinite(args.maxEvidenceAgeMs) ? args.maxEvidenceAgeMs : 30 * 60 * 1000;

  const outDir = path.resolve(args.out);
  await fs.mkdir(outDir, { recursive: true });

  const renderArtifact = await readJsonArtifact(path.join(outDir, "render-results.json"));
  const domArtifact = await readJsonArtifact(path.join(outDir, "dom-audit.json"));
  const visualArtifact = await readJsonArtifact(path.join(outDir, "visual-consistency-audit.json"));
  const discoveryArtifact = await readJsonArtifact(path.join(outDir, "discovered-states.json"));
  const stateCoverageArtifact = await readJsonArtifact(path.join(outDir, "state-coverage.json"));
  const waiversArtifact = await readJsonArtifact(args.waivers || path.join(outDir, "waivers.json"));
  const rawWaivers = waiverArray(waiversArtifact.data);
  const waiverValidation = await validateWaivers(rawWaivers, { outDir, partial: args.partial });
  const waivers = waiverValidation.valid;

  const render = renderArtifact.data || { states: [], screenshots: [] };
  const dom = domArtifact.data || { states: [] };
  const visual = visualArtifact.data || { states: [] };
  const notesPath = args.notes || path.join(outDir, "screenshot-notes.md");
  const briefPath = args.brief || path.join(outDir, "design-brief.md");

  if (args.initNotes && loadScreenshots(render, outDir).length && !(await pathExists(notesPath))) {
    await fs.writeFile(notesPath, screenshotNoteTemplate(render, outDir));
  }
  const notesArtifact = await readTextArtifact(notesPath);
  const briefArtifact = await readTextArtifact(briefPath);

  const blockers = [];
  const warnings = [];
  const incomplete = [];
  const coverage = {
    missingDomAudit: [],
    missingVisualAudit: [],
    unrenderedDiscoveredStates: [],
    staticControlEvidence: [],
    stateMatrix: {
      render: [],
      dom: [],
      visual: [],
    },
  };
  const appliedWaivers = [];

  const addBlocker = (message, check, context = {}) => {
    const waiver = check ? hasWaiver(waivers, check, context, { partial: args.partial }) : null;
    if (waiver) {
      appliedWaivers.push({ check, message, waiver, appliedTo: context });
      warnings.push(`waived blocker ${check}: ${message} (${waiver.reason || "no reason recorded"})`);
    }
    else blockers.push(message);
  };
  const addIncomplete = (message, check, context = {}) => {
    const waiver = check ? hasWaiver(waivers, check, context, { partial: args.partial }) : null;
    if (waiver) {
      appliedWaivers.push({ check, message, waiver, appliedTo: context });
      warnings.push(`waived incomplete evidence ${check}: ${message} (${waiver.reason || "no reason recorded"})`);
    }
    else incomplete.push(message);
  };

  for (const invalidWaiver of waiverValidation.invalid) {
    incomplete.push(`waiver ${invalidWaiver.index + 1} is invalid: ${invalidWaiver.problems.join("; ")}`);
  }

  if (args.evidenceOnly || args.noBrief) {
    warnings.push("design brief requirement skipped because --evidence-only or --no-brief was supplied; this report validates QA evidence only");
  } else if (!briefArtifact.exists || !briefArtifact.text.trim()) {
    addIncomplete("design-brief.md is missing or empty; final design acceptance requires source truth, anti-goals, and acceptance notes", "design-brief");
  }
  if (args.allowMixedEvidence) {
    warnings.push("--allow-mixed-evidence was supplied; this report cannot be final design acceptance");
  }

  for (const artifact of [
    ["render-results", renderArtifact],
    ["dom-audit", domArtifact],
    ["visual-consistency-audit", visualArtifact],
  ]) {
    const [name, result] = artifact;
    if (!result.exists) addIncomplete(`${name}.json is missing`, name);
  }

  const freshness = artifactFreshness([
    { name: "render-results", result: renderArtifact },
    { name: "dom-audit", result: domArtifact },
    { name: "visual-consistency-audit", result: visualArtifact },
  ], maxEvidenceAgeMs);
  for (const artifact of freshness.artifacts) {
    if (!artifact.configHash) addIncomplete(`${artifact.name}.json is missing configHash; rerun current audit scripts`, "evidence-freshness");
    if (!artifact.startedAt || !artifact.finishedAt) addIncomplete(`${artifact.name}.json is missing startedAt/finishedAt; rerun current audit scripts`, "evidence-freshness");
  }
  const mixedEvidenceAllowed = Boolean(args.partial || args.allowMixedEvidence);
  if (freshness.hashes.length > 1) {
    const message = `web audit artifacts were produced from different configHash values: ${freshness.hashes.join(", ")}`;
    if (mixedEvidenceAllowed) warnings.push(message);
    else addIncomplete(message, "evidence-freshness");
  }
  if (freshness.baseUrls.length > 1) {
    const message = `web audit artifacts use different baseUrl values: ${freshness.baseUrls.join(", ")}`;
    if (mixedEvidenceAllowed) warnings.push(message);
    else addIncomplete(message, "evidence-freshness");
  }
  if (freshness.configuredRunIds.length > 1) {
    addIncomplete(`configured qaRunId differs across web audit artifacts: ${freshness.configuredRunIds.join(", ")}`, "evidence-freshness");
  } else if (freshness.generatedRunIds.length > 1) {
    warnings.push("web audit artifacts used generated qaRunId values; configHash, baseUrl, and timestamps are enforcing freshness");
  }
  if (freshness.appBuildIds.length > 1) {
    const message = `web audit artifacts use different appBuildId values: ${freshness.appBuildIds.join(", ")}`;
    if (mixedEvidenceAllowed) warnings.push(message);
    else addIncomplete(message, "evidence-freshness");
  }
  if (freshness.spanMs !== null && freshness.spanMs > maxEvidenceAgeMs) {
    const message = `web audit artifacts were generated ${freshness.spanMs}ms apart, exceeding max evidence age ${maxEvidenceAgeMs}ms`;
    if (mixedEvidenceAllowed) warnings.push(message);
    else addIncomplete(message, "evidence-freshness");
  }

  if (renderArtifact.exists && !(render.states || []).length) addIncomplete("render-results.json has no state entries", "render-results:empty");
  if (domArtifact.exists && !(dom.states || []).length) addIncomplete("dom-audit.json has no state entries", "dom-audit:empty");
  if (visualArtifact.exists && !(visual.states || []).length) addIncomplete("visual-consistency-audit.json has no state entries", "visual-consistency-audit:empty");

  const renderMatrix = buildStateMatrix(render.states || []);
  const domMatrix = buildStateMatrix(dom.states || []);
  const visualMatrix = buildStateMatrix(visual.states || []);
  const duplicateRenderKeys = duplicateStateKeys(render.states || []);
  const duplicateDomKeys = duplicateStateKeys(dom.states || []);
  const duplicateVisualKeys = duplicateStateKeys(visual.states || []);
  for (const duplicate of duplicateRenderKeys) addIncomplete(`render-results.json has duplicate state matrix key ${duplicate.key}; set unique state.id values`, "coverage:duplicates");
  for (const duplicate of duplicateDomKeys) addIncomplete(`dom-audit.json has duplicate state matrix key ${duplicate.key}; set unique state.id values`, "coverage:duplicates");
  for (const duplicate of duplicateVisualKeys) addIncomplete(`visual-consistency-audit.json has duplicate state matrix key ${duplicate.key}; set unique state.id values`, "coverage:duplicates");
  coverage.stateMatrix.render = [...renderMatrix.keys()];
  coverage.stateMatrix.dom = [...domMatrix.keys()];
  coverage.stateMatrix.visual = [...visualMatrix.keys()];
  for (const [key, state] of renderMatrix.entries()) {
    if (!domMatrix.has(key)) {
      const message = `${formatStateLabel(state)}: DOM audit missing for rendered state matrix key ${key}`;
      coverage.missingDomAudit.push({ key, state: state.state, viewport: state.viewport, url: state.finalUrl || state.url });
      addIncomplete(message, "coverage:dom", state);
    }
    if (!visualMatrix.has(key)) {
      const message = `${formatStateLabel(state)}: visual audit missing for rendered state matrix key ${key}`;
      coverage.missingVisualAudit.push({ key, state: state.state, viewport: state.viewport, url: state.finalUrl || state.url });
      addIncomplete(message, "coverage:visual", state);
    }
    const urlChecks = [
      ["DOM", domMatrix.get(key)],
      ["visual", visualMatrix.get(key)],
    ].filter(([, other]) => other);
    for (const [label, other] of urlChecks) {
      const renderUrl = stateFinalUrl(state);
      const otherUrl = stateFinalUrl(other);
      if (renderUrl !== otherUrl) {
        const message = `${formatStateLabel(state)}: final URL mismatch for ${key}; render=${renderUrl}, ${label}=${otherUrl}`;
        if (args.partial || render.allowFinalUrlMismatch || dom.allowFinalUrlMismatch || visual.allowFinalUrlMismatch) warnings.push(message);
        else addIncomplete(message, "final-url", state);
      }
    }
  }

  if (!args.static && !discoveryArtifact.exists) {
    addIncomplete("state discovery output was not found; run discover-states.mjs or record a waiver", "state-discovery");
  } else if (!args.static && discoveryArtifact.exists && !((discoveryArtifact.data?.candidates?.length || 0) || (discoveryArtifact.data?.scans?.length || 0))) {
    addIncomplete("state discovery output exists but contains no candidates or scans", "state-discovery:empty");
  }

  if (!args.static && discoveryArtifact.exists) {
    for (const scan of discoveryArtifact.data?.scans || []) {
      const scanContext = { state: scan.state, url: scan.url, viewport: scan.viewport };
      if (scan.ok === false || scan.error) {
        addIncomplete(`state discovery scan failed for ${scan.state || "default"} ${viewportKey(scan.viewport)}: ${scan.error || "ok is false"}`, "state-discovery", scanContext);
      }
      if (scan.depth2Error) {
        const hasHighConfidenceParent = (discoveryArtifact.data?.candidates || []).some((candidate) =>
          candidate.kind === "overlay-trigger" &&
          candidate.confidence === "high" &&
          (candidate.mutationRisk || "safe") === "safe" &&
          candidate.discoveredFrom?.state === scan.state &&
          normalizeUrl(candidate.discoveredFrom?.url) === normalizeUrl(scan.url) &&
          viewportKey(candidate.discoveredFrom?.viewport) === viewportKey(scan.viewport)
        );
        const message = `state discovery depth-2 scan failed for ${scan.state || "default"} ${viewportKey(scan.viewport)}: ${scan.depth2Error}`;
        if (hasHighConfidenceParent) addIncomplete(message, "state-discovery", scanContext);
        else warnings.push(message);
      }
    }
  }

  if (args.static) {
    const controls = staticControlsFromDom(dom);
    coverage.staticControlEvidence = controls;
    if (!domArtifact.exists || (dom.states || []).some((state) => !Array.isArray(state.audit?.interactiveControls))) {
      addIncomplete("--static requires DOM interactive-control evidence or a valid state-discovery waiver", "static-verification");
    } else if (controls.length) {
      addIncomplete(`--static used but DOM audit found ${controls.length} interactive control candidate(s)`, "static-verification");
    }
  }

  if (!args.static && discoveryArtifact.exists) {
    for (const candidate of enforcedCandidates(discoveryArtifact.data, render)) {
      const disposition = dispositionForCandidate(candidate, stateCoverageArtifact.data);
      const rendered = renderedCandidate(candidate, render.states || []);
      const acceptableDisposition = disposition && ["rendered", "waived", "duplicate", "rejected", "low-value"].includes(dispositionValue(disposition));
      if (!rendered && !acceptableDisposition) {
        coverage.unrenderedDiscoveredStates.push(candidate);
        addIncomplete(`discovered state ${candidate.kind} ${candidate.selector} at ${candidateScope(candidate).viewport} was not rendered, waived, or rejected in state-coverage.json with matching route and viewport`, "state-coverage", candidate);
      } else {
        const problems = await dispositionProblems(candidate, disposition, { outDir, rendered });
        for (const problem of problems) addIncomplete(problem, "state-coverage", candidate);
      }
    }
  }

  for (const state of render.states || []) {
    const label = formatStateLabel(state);
    if (state.error) addBlocker(`${label}: render failed: ${state.error}`, "render-error");
    if (state.pageErrors?.length) addBlocker(`${label}: ${state.pageErrors.length} page error(s)`, "page-error");
    if (state.consoleErrors?.length) addBlocker(`${label}: ${state.consoleErrors.length} console error(s)`, "console-error");
    const consoleWarnings = state.consoleWarnings || (state.consoleMessages || []).filter((message) => message.type === "warning");
    if (consoleWarnings.length) warnings.push(`${label}: ${consoleWarnings.length} console warning candidate(s)`);
    const legacyErrors = !state.consoleErrors && (state.consoleMessages || []).filter((message) => message.type === "error");
    if (legacyErrors.length) addBlocker(`${label}: ${legacyErrors.length} console error(s)`, "console-error");
  }

  for (const state of dom.states || []) {
    const label = formatStateLabel(state);
    if (state.error) addBlocker(`${label}: DOM audit failed: ${state.error}`, "dom-audit-error");
    if (state.audit?.overflow?.hasHorizontalOverflow) addBlocker(`${label}: horizontal overflow candidate`, "horizontal-overflow");
    if (state.audit?.clipped?.length) warnings.push(`${label}: ${state.audit.clipped.length} clipped text/control candidate(s)`);
    if (state.audit?.tinyText?.length) warnings.push(`${label}: ${state.audit.tinyText.length} tiny text candidate(s)`);
    if (state.audit?.smallTargets?.length) warnings.push(`${label}: ${state.audit.smallTargets.length} small tap target candidate(s)`);
    if (state.audit?.unlabeledFocusable?.length) warnings.push(`${label}: ${state.audit.unlabeledFocusable.length} unlabeled focusable candidate(s)`);
    if (state.audit?.hoverOnlyCandidates?.length) warnings.push(`${label}: ${state.audit.hoverOnlyCandidates.length} hover-only candidate(s)`);
  }

  for (const state of visual.states || []) {
    const label = formatStateLabel(state);
    if (state.error) addBlocker(`${label}: visual consistency audit failed: ${state.error}`, "visual-audit-error");
    for (const finding of state.audit?.blockers || []) {
      if (qaSeverityForFinding(finding, SEVERITY.BLOCKER) === SEVERITY.WARNING) {
        warnings.push(`${label}: ${finding.type}: ${finding.message}`);
      } else {
        addBlocker(`${label}: ${finding.type}: ${finding.message}`, finding.type);
      }
    }
    if (state.audit?.warnings?.length) warnings.push(`${label}: ${state.audit.warnings.length} visual consistency warning candidate(s)`);
  }

  const screenshots = loadScreenshots(render, outDir);
  if (!screenshots.length) {
    addIncomplete("no screenshots were produced by render-check.mjs", "screenshots");
  }

  const screenshotNotes = await validateScreenshotNotes({
    screenshots,
    notesText: notesArtifact.text,
    notesExists: notesArtifact.exists,
    outDir,
  });
  if (screenshots.length && screenshotNotes.invalid.length) {
    for (const issue of screenshotNotes.invalid) addIncomplete(issue, "screenshot-notes");
  }
  if (screenshots.length && screenshotNotes.failed.length) {
    for (const issue of screenshotNotes.failed) addBlocker(issue, "screenshot-notes");
  }

  const usedWaiverIndexes = new Set(appliedWaivers.map((entry) => entry.waiver.index));
  for (const waiver of waivers) {
    if (!usedWaiverIndexes.has(waiver.index)) {
      incomplete.push(`waiver ${waiver.index + 1} is valid but unused; remove it or narrow it to a current finding`);
    }
  }

  const evidenceCompleteness = {
    partial: Boolean(args.partial),
    static: Boolean(args.static),
    mixedEvidenceAllowed: Boolean(args.allowMixedEvidence),
    freshness,
    artifacts: {
      renderResults: { path: artifactPath(outDir, renderArtifact.path), exists: renderArtifact.exists, stateCount: render.states?.length || 0 },
      domAudit: { path: artifactPath(outDir, domArtifact.path), exists: domArtifact.exists, stateCount: dom.states?.length || 0 },
      visualConsistencyAudit: { path: artifactPath(outDir, visualArtifact.path), exists: visualArtifact.exists, stateCount: visual.states?.length || 0 },
      stateDiscovery: { path: artifactPath(outDir, discoveryArtifact.path), exists: discoveryArtifact.exists, waived: Boolean(args.static || hasWaiver(waivers, "state-discovery", {}, { partial: args.partial })) },
      stateCoverage: { path: artifactPath(outDir, stateCoverageArtifact.path), exists: stateCoverageArtifact.exists, count: stateCoverageItems(stateCoverageArtifact.data).length },
      waivers: { path: artifactPath(outDir, waiversArtifact.path), exists: waiversArtifact.exists, count: rawWaivers.length, validCount: waivers.length, invalidCount: waiverValidation.invalid.length },
      designBrief: {
        path: artifactPath(outDir, briefPath),
        exists: briefArtifact.exists,
        waived: Boolean(args.evidenceOnly || args.noBrief),
      },
    },
    coverage,
    screenshots: {
      count: screenshots.length,
      paths: screenshots.map((screenshot) => screenshot.path),
      notes: screenshotNotes,
    },
  };

  const status = blockers.length ? "fail" : incomplete.length ? "incomplete" : "pass";
  const qaMode = args.partial ? "partial" : args.static ? "static" : (args.evidenceOnly || args.noBrief || args.allowMixedEvidence) ? "evidence-only" : "final";
  const qa = {
    generatedAt: new Date().toISOString(),
    qaMode,
    status,
    blockers,
    incomplete,
    warnings,
    screenshotCount: screenshots.length,
    screenshotNotesPath: notesArtifact.exists ? artifactPath(outDir, notesPath) : null,
    stateDiscoveryPath: discoveryArtifact.exists ? artifactPath(outDir, discoveryArtifact.path) : null,
    renderResultsPath: artifactPath(outDir, renderArtifact.path),
    domAuditPath: artifactPath(outDir, domArtifact.path),
    visualConsistencyAuditPath: artifactPath(outDir, visualArtifact.path),
    stateCoveragePath: stateCoverageArtifact.exists ? artifactPath(outDir, stateCoverageArtifact.path) : null,
    waiverValidation,
    appliedWaivers,
    evidenceCompleteness,
    acceptanceReady: status === "pass" && qaMode === "final",
  };

  const md = `# Design QA

Generated: ${qa.generatedAt}

## Status

- Status: ${qa.status}
- QA mode: ${qa.qaMode}
- Blockers: ${blockers.length}
- Incomplete evidence: ${incomplete.length}
- Warnings: ${warnings.length}
- Screenshots: ${qa.screenshotCount}
- Screenshot notes: ${qa.screenshotNotesPath || "missing"}
- State discovery: ${args.static ? "waived by --static" : qa.stateDiscoveryPath || "missing"}
- Acceptance ready: ${qa.acceptanceReady ? "yes" : "no"}

## Blockers

${bullet(blockers)}

## Incomplete Evidence

${bullet(incomplete)}

## Warnings

${bullet(warnings)}

## Screenshot Manifest

${bullet(screenshots.map((screenshot) => `${screenshot.path} (${screenshot.type}, ${screenshot.viewport ? `${screenshot.viewport.width}x${screenshot.viewport.height}` : "unknown viewport"}, ${screenshot.state})`))}

## Screenshot Inspection Notes

${notesArtifact.text.trim() || "_Missing. Add inspected screenshot notes or waive this blocker with evidence._"}

## Evidence Files

- Render results: ${qa.renderResultsPath}
- DOM audit: ${qa.domAuditPath}
- Visual consistency audit: ${qa.visualConsistencyAuditPath}
${qa.stateDiscoveryPath ? `- State discovery: ${qa.stateDiscoveryPath}` : "- State discovery: missing"}
- State coverage: ${qa.stateCoveragePath || "missing"}
- Waivers: ${waiversArtifact.exists ? waiversArtifact.path : "missing"}
`;

  const publicQa = sanitizeForOutput(qa, outDir);
  const publicMd = sanitizeStringForOutput(md, outDir);
  await fs.writeFile(path.join(outDir, "design-qa.json"), `${JSON.stringify(publicQa, null, 2)}\n`);
  await fs.writeFile(path.join(outDir, "design-qa.md"), publicMd);
  if (args.partial && incomplete.length) {
    console.warn(`qa-report: partial report has ${incomplete.length} incomplete evidence item(s); this is not acceptance evidence`);
  }
  console.log(`qa-report: wrote ${path.join(outDir, "design-qa.md")} (${status}, ${blockers.length} blockers, ${incomplete.length} incomplete)`);
  if (blockers.length || (incomplete.length && !args.partial)) process.exitCode = 1;
  else if (incomplete.length && args.partial && !args.allowPartialExitZero) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`qa-report: ${error.message}`);
  process.exit(1);
});
