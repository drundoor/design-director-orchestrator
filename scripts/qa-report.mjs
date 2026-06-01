#!/usr/bin/env node

import fs from "node:fs/promises";
import { createHash } from "node:crypto";
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
const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000;

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

function evidencePathInside(outDir, file) {
  const absolute = resolveEvidencePath(outDir, file);
  return Boolean(absolute && pathInsideDir(outDir, absolute));
}

function artifactPath(outDir, file) {
  if (!file) return file;
  const absolute = resolveEvidencePath(outDir, file);
  if (!absolute) return file;
  if (!pathInsideDir(outDir, absolute)) return "[absolute-path-redacted]";
  return path.relative(outDir, absolute).replaceAll(path.sep, "/");
}

function absoluteLike(value) {
  return path.isAbsolute(String(value || "")) || /^[A-Za-z]:[\\/]/.test(String(value || ""));
}

function parentTraversalLike(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .split("/")
    .includes("..");
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

function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
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
      sha256: sha256Hex(data),
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
      if (!evidencePathInside(outDir, waiver.evidence)) problems.push(`evidence path must be inside ${path.basename(outDir)}: ${waiver.evidence}`);
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
        expectedMetadata: state.screenshotMetadata || null,
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
          expectedMetadata: artifact.screenshotMetadata || null,
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
      expectedMetadata: state?.screenshotMetadata || null,
    });
  }

  return screenshots;
}

function duplicateScreenshotPaths(render, outDir) {
  const paths = [];
  for (const state of render?.states || []) {
    if (state.screenshot) paths.push(artifactPath(outDir, state.screenshot));
    for (const artifact of state.actionArtifacts || []) {
      if (artifact.type === "element-screenshot" && artifact.path) paths.push(artifactPath(outDir, artifact.path));
    }
  }
  const counts = new Map();
  for (const file of paths.filter(Boolean)) counts.set(file, (counts.get(file) || 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([file, count]) => ({ file, count }));
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

function parseEvidenceReference(reference) {
  const [file, fragment] = String(reference || "").split("#");
  return {
    file: String(file || "").trim(),
    fragment: String(fragment || "").trim(),
  };
}

async function readMarkdownSection(outDir, reference) {
  const parsed = parseEvidenceReference(reference);
  if (!parsed.file || !evidencePathInside(outDir, parsed.file)) return null;
  const filePath = resolveEvidencePath(outDir, parsed.file);
  let text = "";
  try {
    text = await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
  if (!parsed.fragment) return text;
  const lines = text.split(/\r?\n/);
  let active = false;
  const body = [];
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (heading) {
      if (active) break;
      const title = heading[2].trim();
      active = title === parsed.fragment || markdownAnchor(title) === markdownAnchor(parsed.fragment);
      continue;
    }
    if (active) body.push(line);
  }
  return active ? body.join("\n") : null;
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
  if (fields.get("state alias") || fields.get("alias") || fields.get("redirect") || fields.get("url redirect")) {
    problems.push(`${screenshot.path}: screenshot-note alias/redirect shortcuts are not acceptance evidence; update the captured state or use a scoped finalUrlException with evidence`);
  }
  if (viewport && viewport !== expectedViewport) {
    problems.push(`${screenshot.path}: note viewport ${viewport} does not match screenshot viewport ${expectedViewport}`);
  }
  if (state && state !== expectedState) {
    problems.push(`${screenshot.path}: note state ${state} does not match rendered state ${expectedState}`);
  }
  if (url && normalizeUrl(url) !== expectedUrl) {
    problems.push(`${screenshot.path}: note URL ${url} does not match screenshot URL ${screenshot.url}`);
  }
  return problems;
}

function screenshotDimensionProblems(screenshot, integrity) {
  const problems = [];
  if (!integrity.valid) return problems;
  if (!screenshot.expectedMetadata) {
    problems.push(`${screenshot.path}: screenshot metadata is missing from render artifact; rerun render-check.mjs`);
  } else {
    const expected = screenshot.expectedMetadata;
    for (const field of ["sha256", "size", "width", "height", "format"]) {
      if (expected[field] !== undefined && expected[field] !== null && integrity[field] !== expected[field]) {
        problems.push(`${screenshot.path}: screenshot ${field} mismatch; render artifact recorded ${expected[field]} but file is ${integrity[field]}`);
      }
    }
  }
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
    const evidenceFreeRisk = ["destructive", "sensitive"].includes(rejectionRisk);
    const highConfidenceSafe = candidate.confidence === "high" && (candidate.mutationRisk || "safe") === "safe";
    if (!evidence && (!evidenceFreeRisk || rejectionRisk === "not-relevant" || highConfidenceSafe)) {
      problems.push(`state-coverage rejected disposition for ${candidate.kind} ${candidate.selector} requires evidence unless risk is destructive or sensitive`);
    }
  }
  if (value === "rendered" && !rendered && !evidence) {
    problems.push(`state-coverage rendered disposition for ${candidate.kind} ${candidate.selector} requires evidence when no rendered state/action proves it`);
  }
  if (evidence) {
    if (!evidencePathInside(outDir, evidence)) {
      problems.push(`state-coverage evidence must be inside ${path.basename(outDir)} for ${candidate.kind} ${candidate.selector}: ${evidence}`);
    } else if (!(await pathExists(resolveEvidencePath(outDir, evidence)))) {
      problems.push(`state-coverage evidence does not exist for ${candidate.kind} ${candidate.selector}: ${evidence}`);
    }
  }
  return problems;
}

const IMPORTANT_MEDIUM_KINDS = new Set(["chart-or-canvas", "scroll-container", "combobox", "keyboard-combobox", "focus-overlay", "text-input"]);
const COVERAGE_KIND_PRIORITY = new Map([
  ["overlay-trigger", 0],
  ["select", 1],
  ["combobox", 2],
  ["keyboard-combobox", 3],
  ["focus-overlay", 4],
  ["text-input", 5],
  ["chart-or-canvas", 6],
  ["scroll-container", 7],
  ["tab", 8],
  ["disclosure", 9],
  ["safe-button", 10],
]);
const COVERAGE_KIND_LIMITS = new Map([
  ["overlay-trigger", 8],
  ["select", 6],
  ["combobox", 5],
  ["keyboard-combobox", 5],
  ["focus-overlay", 5],
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
    (state.audit?.statefulControls || state.audit?.interactiveControls || []).map((control) => ({
      state: state.state || "default",
      viewport: state.viewport || null,
      control,
    }))
  );
}

function artifactFreshness(artifacts, maxAgeMs) {
  const present = artifacts.filter((artifact) => artifact.result.exists);
  const now = Date.now();
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
  const timestampRecords = present.flatMap((artifact) =>
    ["startedAt", "finishedAt", "generatedAt"].map((field) => ({
      artifact: artifact.name,
      field,
      value: artifact.result.data?.[field],
      timestamp: Date.parse(artifact.result.data?.[field]),
    }))
  ).filter((record) => Number.isFinite(record.timestamp));
  const futureTimestamps = timestampRecords
    .filter((record) => record.timestamp - now > MAX_CLOCK_SKEW_MS)
    .map((record) => ({
      artifact: record.artifact,
      field: record.field,
      value: record.value,
      skewMs: record.timestamp - now,
    }));
  const times = timestampRecords
    .map((record) => record.timestamp)
    .filter((value) => Number.isFinite(value));
  const earliest = times.length ? Math.min(...times) : null;
  const latest = times.length ? Math.max(...times) : null;
  const latestAgeMs = latest ? Math.max(0, now - latest) : null;
  return {
    artifacts: present.map((artifact) => ({
      name: artifact.name,
      configHash: artifact.result.data?.configHash || null,
      evidenceHash: artifact.result.data?.evidenceHash || null,
      scriptOptions: artifact.result.data?.scriptOptions || null,
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
    latestAgeMs,
    futureTimestamps,
    maxAgeMs,
  };
}

function artifactLatestAgeMs(data = {}) {
  const times = [data.startedAt, data.finishedAt || data.generatedAt]
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  if (!times.length) return null;
  return Math.max(0, Date.now() - Math.max(...times));
}

function artifactFutureTimestampProblems(name, data = {}) {
  const now = Date.now();
  return ["startedAt", "finishedAt", "generatedAt"]
    .map((field) => ({ field, value: data[field], timestamp: Date.parse(data[field]) }))
    .filter((entry) => Number.isFinite(entry.timestamp) && entry.timestamp - now > MAX_CLOCK_SKEW_MS)
    .map((entry) => `${name}.json ${entry.field} timestamp is in the future beyond allowed clock skew: ${entry.value}`);
}

function artifactSpanAgainst(data = {}, freshness = {}) {
  const times = [data.startedAt, data.finishedAt || data.generatedAt]
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  const evidenceTimes = [freshness.earliest, freshness.latest]
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  if (!times.length || !evidenceTimes.length) return null;
  return Math.max(...times, ...evidenceTimes) - Math.min(...times, ...evidenceTimes);
}

function artifactHasFreshnessMetadata(data = {}) {
  return Boolean(data.configHash && data.evidenceHash && data.qaRunId && data.startedAt && data.finishedAt);
}

function stateFinalUrl(state = {}) {
  return normalizeUrl(state.finalUrl || state.url);
}

async function finalUrlException(state = {}, other = {}, outDir) {
  const exception = state.finalUrlException || null;
  if (!exception || typeof exception !== "object") return { allowed: false, reason: "no scoped exception" };
  if (exception.source !== "config") return { allowed: false, reason: "finalUrlException must come from render config state, not a post-hoc artifact patch" };
  const fromFinalUrl = exception.fromFinalUrl;
  const toFinalUrl = exception.toFinalUrl;
  const reason = String(exception.reason || "").trim();
  const evidence = exception.evidence;
  if (!fromFinalUrl || !toFinalUrl) return { allowed: false, reason: "missing fromFinalUrl or toFinalUrl" };
  if (!reason) return { allowed: false, reason: "missing reason" };
  if (!evidence) return { allowed: false, reason: "missing evidence" };
  if (!evidencePathInside(outDir, evidence)) return { allowed: false, reason: `evidence must be inside ${path.basename(outDir)}` };
  if (!(await pathExists(resolveEvidencePath(outDir, evidence)))) return { allowed: false, reason: "evidence file missing" };
  const normalizedFrom = normalizeUrl(fromFinalUrl);
  const normalizedTo = normalizeUrl(toFinalUrl);
  if (stateFinalUrl(state) !== normalizedFrom || stateFinalUrl(other) !== normalizedTo) {
    return { allowed: false, reason: `finalUrlException pair ${normalizedFrom} -> ${normalizedTo} does not match render/artifact pair ${stateFinalUrl(state)} -> ${stateFinalUrl(other)}` };
  }
  const allowedEvidence = new Set([
    state.screenshot,
    ...(state.actionArtifacts || []).filter((artifact) => artifact.type === "element-screenshot").map((artifact) => artifact.path),
  ].filter(Boolean).map((file) => artifactPath(outDir, file)));
  const evidenceArtifact = artifactPath(outDir, evidence);
  if (!allowedEvidence.has(evidenceArtifact)) {
    return { allowed: false, reason: `evidence ${evidenceArtifact} does not match a screenshot artifact for ${state.state || "default"} ${viewportKey(state.viewport)}` };
  }
  return { allowed: true, reason, evidence: evidenceArtifact, fromFinalUrl: normalizedFrom, toFinalUrl: normalizedTo };
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
  const urls = [];
  result = result.replace(/\bhttps?:\/\/[^\s"'`<>)]+/g, (url) => {
    const token = `__DESIGN_DIRECTOR_URL_${urls.length}__`;
    urls.push([token, url]);
    return token;
  });
  result = result.replace(/(^|[\s("'=])\/(?!\/)(?:[^\s"'`<>)\/]+\/){1,}[^\s"'`<>)]+/g, "$1[absolute-path-redacted]");
  result = result.replace(/(^|[\s("'=])[A-Za-z]:\\(?:Users|Documents and Settings)\\[^\s"'`<>)]+/g, "$1[absolute-path-redacted]");
  for (const [token, url] of urls) result = result.replaceAll(token, url);
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

const DESIGN_VERDICT_FIELDS = [
  "thesisExpressed",
  "stylePostureExpressed",
  "signatureMoveVisible",
  "styleCommitmentHonored",
  "genericScaffoldAvoided",
];
const PEER_SKILL_STATUSES = new Set(["available", "unavailable-fallback-used", "user-waived", "skipped-while-available"]);
const REFERENCE_OUTCOMES = new Set(["lean-complete", "local-system-sufficient", "offline-constrained", "user-forbids-browsing", "deep-requested"]);
const FALLBACK_CHECKS = {
  impeccable: ["craftCompleteness", "styleCommitment", "layoutHierarchy", "typographyConsistency", "responsiveAdaptation"],
  hallmark: ["genericScaffold", "decorativePills", "fakeChrome", "stockHero", "weakHierarchy"],
};

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function evidenceReferenceExists(outDir, reference) {
  const [file] = String(reference || "").split("#");
  if (!file) return false;
  if (!evidencePathInside(outDir, file)) return false;
  return pathExists(resolveEvidencePath(outDir, file));
}

async function validateEvidenceReferences(outDir, references, label, incomplete) {
  const entries = asArray(references).map((item) => String(item || "").trim()).filter(Boolean);
  if (!entries.length) {
    incomplete.push(`${label} needs screenshot-note or screenshot evidence`);
    return [];
  }
  const valid = [];
  for (const entry of entries) {
    if (!(await evidenceReferenceExists(outDir, entry))) {
      incomplete.push(`${label} evidence must reference an existing file inside ${path.basename(outDir)}: ${entry}`);
    } else {
      valid.push(entry);
    }
  }
  return valid;
}

async function validateEvidenceFileReference(outDir, reference, label, incomplete, options = {}) {
  const ref = typeof reference === "string" ? reference : reference?.path;
  if (!String(ref || "").trim()) {
    incomplete.push(`${label} needs an evidence path`);
    return null;
  }
  if (absoluteLike(ref)) {
    incomplete.push(`${label} must use a repo-relative or .design-director-relative path, not an absolute path: ${ref}`);
    return null;
  }
  const parsed = parseEvidenceReference(ref);
  if (!parsed.file) {
    incomplete.push(`${label} evidence path is empty`);
    return null;
  }
  if (parentTraversalLike(parsed.file)) {
    incomplete.push(`${label} must not use parent-directory traversal: ${ref}`);
    return null;
  }
  const insideOutDir = evidencePathInside(outDir, parsed.file);
  const outputPath = insideOutDir ? resolveEvidencePath(outDir, parsed.file) : path.resolve(parsed.file);
  if (!insideOutDir && options.outputOnly !== false) {
    incomplete.push(`${label} evidence must be inside ${path.basename(outDir)}: ${ref}`);
    return null;
  }
  if (!(await pathExists(outputPath))) {
    incomplete.push(`${label} evidence path does not exist: ${ref}`);
    return null;
  }
  return { ref, path: outputPath };
}

async function fallbackChecklistProblems(outDir, name, peerSkill = {}) {
  const incomplete = [];
  const fallbackEvidence = peerSkill.fallbackEvidence || peerSkill.fallback_evidence || peerSkill.fallbackSummary || peerSkill.fallback_summary || "";
  if (!fallbackEvidence || typeof fallbackEvidence !== "object" || Array.isArray(fallbackEvidence)) {
    incomplete.push(`design-quality.json peerSkills.${name}.fallbackEvidence must be an object with path and requiredChecks`);
    return incomplete;
  }
  const requiredChecks = asArray(fallbackEvidence.requiredChecks || fallbackEvidence.required_checks);
  const expectedChecks = FALLBACK_CHECKS[name] || [];
  const missingExpected = expectedChecks.filter((check) => !requiredChecks.includes(check));
  if (!requiredChecks.length) {
    incomplete.push(`design-quality.json peerSkills.${name}.fallbackEvidence.requiredChecks is required`);
  } else if (missingExpected.length) {
    incomplete.push(`design-quality.json peerSkills.${name}.fallbackEvidence.requiredChecks is missing ${missingExpected.join(", ")}`);
  }
  const evidence = await validateEvidenceFileReference(outDir, fallbackEvidence.path, `design-quality.json peerSkills.${name}.fallbackEvidence.path`, incomplete);
  if (!evidence) return incomplete;
  const sectionText = await readMarkdownSection(outDir, fallbackEvidence.path);
  if (!sectionText) {
    incomplete.push(`design-quality.json peerSkills.${name}.fallbackEvidence.path must reference an existing markdown section: ${fallbackEvidence.path}`);
    return incomplete;
  }
  for (const check of requiredChecks) {
    const pattern = new RegExp(`${check.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]{0,140}\\b(pass|passed|checked|complete|completed|reject|rejected|none|n/a|not applicable)\\b`, "i");
    if (!pattern.test(sectionText) || /\bTODO\b/i.test(sectionText)) {
      incomplete.push(`design-quality.json peerSkills.${name}.fallbackEvidence section must record a filled outcome for ${check}`);
    }
  }
  return incomplete;
}

async function peerExecutionEvidenceProblems(outDir, name, peerSkill = {}) {
  const incomplete = [];
  const executionEvidence = peerSkill.executionEvidence || peerSkill.execution_evidence || "";
  if (!executionEvidence || typeof executionEvidence !== "object" || Array.isArray(executionEvidence)) {
    incomplete.push(`design-quality.json peerSkills.${name}.executionEvidence must be an object with path and summary`);
    return incomplete;
  }
  const summary = executionEvidence.summary || executionEvidence.outcome || executionEvidence.result || "";
  const commands = asArray(executionEvidence.commands || executionEvidence.loadedCommands || executionEvidence.loaded_commands);
  const references = asArray(executionEvidence.references || executionEvidence.loadedReferences || executionEvidence.loaded_references);
  const checks = asArray(executionEvidence.checks || executionEvidence.requiredChecks || executionEvidence.required_checks);
  if (!String(summary).trim() && !commands.length && !references.length && !checks.length) {
    incomplete.push(`design-quality.json peerSkills.${name}.executionEvidence needs summary, commands, references, or checks`);
  }
  const evidence = await validateEvidenceFileReference(outDir, executionEvidence.path, `design-quality.json peerSkills.${name}.executionEvidence.path`, incomplete);
  if (!evidence) return incomplete;
  const sectionText = await readMarkdownSection(outDir, executionEvidence.path);
  if (!sectionText) {
    incomplete.push(`design-quality.json peerSkills.${name}.executionEvidence.path must reference an existing markdown section: ${executionEvidence.path}`);
    return incomplete;
  }
  if (/\bTODO\b/i.test(sectionText)) {
    incomplete.push(`design-quality.json peerSkills.${name}.executionEvidence section still contains TODO text`);
  }
  const sectionHasOutcome = /\b(loaded|ran|used|checked|executed|reviewed|applied|pass|passed|complete|completed)\b/i.test(sectionText);
  if (!sectionHasOutcome) {
    incomplete.push(`design-quality.json peerSkills.${name}.executionEvidence section must record what was loaded, run, checked, or applied`);
  }
  const expectedOutcomes = [...commands, ...checks].map((item) => String(item || "").trim()).filter(Boolean);
  for (const item of expectedOutcomes) {
    const spaced = item.replace(/([a-z])([A-Z])/g, "$1 $2");
    const singular = item.endsWith("s") ? item.slice(0, -1) : item;
    const spacedSingular = singular.replace(/([a-z])([A-Z])/g, "$1 $2");
    const aliases = [...new Set([item, spaced, singular, spacedSingular])].map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"));
    const pattern = new RegExp(`(?:${aliases.join("|")})[\\s\\S]{0,160}\\b(pass|passed|check|checks|checked|complete|completed|loaded|run|ran|used|applied|reviewed|executed|n/a|not applicable)\\b`, "i");
    if (!pattern.test(sectionText)) {
      incomplete.push(`design-quality.json peerSkills.${name}.executionEvidence section must record a filled outcome for ${item}`);
    }
  }
  return incomplete;
}

async function peerSkillProblems(outDir, name, peerSkill = {}) {
  const incomplete = [];
  const normalized = {
    status: peerSkill.status || "",
    executionEvidence: peerSkill.executionEvidence || peerSkill.execution_evidence || "",
    fallbackChecklistCompleted: peerSkill.fallbackChecklistCompleted === true || peerSkill.fallback_checklist_completed === true,
    fallbackEvidence: peerSkill.fallbackEvidence || peerSkill.fallback_evidence || peerSkill.fallbackSummary || peerSkill.fallback_summary || "",
    waiverEvidence: peerSkill.waiverEvidence || peerSkill.waiver_evidence || "",
    reason: peerSkill.reason || "",
  };
  if (!normalized.status) {
    incomplete.push(`design-quality.json peerSkills.${name}.status is required`);
    return { normalized, incomplete };
  }
  if (!PEER_SKILL_STATUSES.has(normalized.status)) {
    incomplete.push(`design-quality.json peerSkills.${name}.status must be available, unavailable-fallback-used, user-waived, or skipped-while-available`);
  }
  if (normalized.status === "available") {
    incomplete.push(...await peerExecutionEvidenceProblems(outDir, name, peerSkill));
  }
  if (normalized.status === "unavailable-fallback-used") {
    if (!normalized.fallbackChecklistCompleted) {
      incomplete.push(`design-quality.json peerSkills.${name}.fallbackChecklistCompleted must be true when unavailable fallback is used`);
    }
    incomplete.push(...await fallbackChecklistProblems(outDir, name, peerSkill));
  }
  if (normalized.status === "user-waived" && !String(normalized.waiverEvidence || normalized.reason).trim()) {
    incomplete.push(`design-quality.json peerSkills.${name}.waiverEvidence or reason is required when user waived the peer skill`);
  }
  if (normalized.status === "skipped-while-available") {
    incomplete.push(`design-quality.json peerSkills.${name} was skipped while available; broad design work is not final acceptance-ready`);
  }
  return { normalized, incomplete };
}

async function validateLocalEvidence(outDir, references, label, incomplete) {
  const entries = asArray(references).map((item) => typeof item === "string" ? item : (item.path || item.source || "")).filter(Boolean);
  if (!entries.length) {
    incomplete.push(`${label} is required`);
    return;
  }
  for (const entry of entries) {
    if (absoluteLike(entry)) {
      incomplete.push(`${label} must not use absolute paths: ${entry}`);
      continue;
    }
    const parsed = parseEvidenceReference(entry);
    if (!parsed.file) {
      incomplete.push(`${label} has an empty evidence reference`);
      continue;
    }
    if (parentTraversalLike(parsed.file)) {
      incomplete.push(`${label} must not use parent-directory traversal: ${entry}`);
      continue;
    }
    if (evidencePathInside(outDir, parsed.file)) {
      if (!(await pathExists(resolveEvidencePath(outDir, parsed.file)))) incomplete.push(`${label} evidence path does not exist: ${entry}`);
      continue;
    }
    const repoRelative = path.resolve(parsed.file);
    const repoRoot = process.cwd();
    const relative = path.relative(repoRoot, repoRelative);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      incomplete.push(`${label} evidence must stay inside the repository root: ${entry}`);
      continue;
    }
    if (!(await pathExists(repoRelative))) incomplete.push(`${label} evidence path does not exist: ${entry}`);
  }
}

async function referenceDiscoveryProblems(outDir, referenceDiscovery = {}, gate = {}, deepExploration = {}) {
  const incomplete = [];
  const warnings = [];
  const outcome = referenceDiscovery.outcome || referenceDiscovery.status || "";
  if (!outcome) {
    incomplete.push("design-quality.json referenceDiscovery.outcome is required for broad design work");
  } else if (!REFERENCE_OUTCOMES.has(outcome)) {
    incomplete.push(`design-quality.json referenceDiscovery.outcome must be one of: ${[...REFERENCE_OUTCOMES].join(", ")}`);
  }
  if (outcome === "lean-complete") {
    const buckets = asArray(referenceDiscovery.sources || referenceDiscovery.buckets || referenceDiscovery.checkedBuckets)
      .map((source) => typeof source === "string" ? source : (source.bucket || source.type || source.role || ""))
      .join(" ")
      .toLowerCase();
    for (const bucket of ["correctness", "domain", "taste"]) {
      if (!buckets.includes(bucket)) incomplete.push(`design-quality.json referenceDiscovery lean-complete needs a ${bucket} source or checked bucket`);
    }
  }
  if (outcome === "local-system-sufficient") {
    await validateLocalEvidence(outDir, referenceDiscovery.localDesignSystemEvidence || referenceDiscovery.local_design_system_evidence, "design-quality.json referenceDiscovery.localDesignSystemEvidence", incomplete);
    if (!String(referenceDiscovery.tasteDecision || referenceDiscovery.taste_decision || "").trim()) {
      incomplete.push("design-quality.json referenceDiscovery.tasteDecision is required for local-system-sufficient");
    }
  }
  if (["offline-constrained", "user-forbids-browsing"].includes(outcome) && !String(referenceDiscovery.constraint || referenceDiscovery.reason || "").trim()) {
    incomplete.push(`design-quality.json referenceDiscovery.${outcome} needs a constraint or reason`);
  }
  if (outcome === "deep-requested" || gate.depth === "deep") {
    const deep = deepExploration || {};
    const accepted = asArray(deep.acceptedSources || deep.accepted_sources);
    const rejected = asArray(deep.rejectedSources || deep.rejected_sources);
    const directions = asArray(deep.directions);
    const artifact = deep.artifact || deep.researchLedgerPath || deep.research_ledger_path;
    await validateEvidenceFileReference(outDir, artifact, "design-quality.json deepExploration.artifact", incomplete);
    if (!accepted.length) incomplete.push("design-quality.json deepExploration.acceptedSources is required for deep design exploration");
    if (!rejected.length) incomplete.push("design-quality.json deepExploration.rejectedSources is required for deep design exploration");
    if (!deep.studyOnly && (directions.length < 2 || directions.length > 3)) {
      incomplete.push("design-quality.json deepExploration.directions must include 2-3 directions unless studyOnly is true");
    }
    for (const field of ["recommendation", "doNotCopy", "implementationRisk", "qaImplications"]) {
      if (!String(deep[field] || "").trim()) incomplete.push(`design-quality.json deepExploration.${field} is required`);
    }
  }
  if (outcome === "offline-constrained") {
    warnings.push("design-quality.json records offline-constrained reference discovery; treat deep exploration requests as non-final until refreshed online");
  }
  return { incomplete, warnings };
}

function verdictRecord(verdict, field) {
  const raw = verdict[field];
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return {
      verdict: String(raw.verdict || raw.status || raw.value || "").trim().toLowerCase(),
      evidence: asArray(raw.evidence || raw.reviewEvidence || raw.review_evidence),
    };
  }
  return {
    verdict: String(raw || "").trim().toLowerCase(),
    evidence: asArray(verdict[`${field}Evidence`] || verdict[`${field}_evidence`]),
  };
}

function noteProblemPaths(problems = []) {
  const paths = new Set();
  for (const problem of problems) {
    const pathPart = String(problem).split(":")[0];
    if (pathPart) paths.add(pathPart);
  }
  return paths;
}

function screenshotIntegrityMap(screenshotNotes = {}) {
  const map = new Map();
  for (const item of screenshotNotes.integrity || []) {
    const p = artifactPath(process.cwd(), item.path || "");
    if (item.path) {
      map.set(item.path, item);
      map.set(p, item);
      map.set(String(item.path).replaceAll("\\", "/"), item);
    }
  }
  return map;
}

function evidenceScreenshotPath(reference, notesPath, outDir) {
  const parsed = parseEvidenceReference(reference);
  if (!parsed.file) return "";
  const filePath = artifactPath(outDir, parsed.file);
  const normalizedNotes = artifactPath(outDir, notesPath);
  if (filePath === normalizedNotes || path.basename(filePath) === "screenshot-notes.md") {
    return parsed.fragment || "";
  }
  return filePath;
}

async function validateDesignEvidenceReferences({
  outDir,
  notesPath,
  notesText,
  screenshots,
  screenshotNotes,
  reviewedScreenshotHashes,
  references,
  label,
  incomplete,
}) {
  const entries = asArray(references).map((item) => String(item || "").trim()).filter(Boolean);
  const cited = [];
  if (!entries.length) {
    incomplete.push(`${label} needs per-verdict screenshot-note evidence`);
    return cited;
  }
  const sections = parseNoteSections(notesText, outDir);
  const screenshotMap = new Map(screenshots.map((screenshot) => [screenshot.path, screenshot]));
  const integrityMap = screenshotIntegrityMap(screenshotNotes);
  const invalidPaths = noteProblemPaths(screenshotNotes.invalid);
  const failedPaths = noteProblemPaths(screenshotNotes.failed);
  for (const entry of entries) {
    const parsed = parseEvidenceReference(entry);
    if (!parsed.file || !(await evidenceReferenceExists(outDir, parsed.file))) {
      incomplete.push(`${label} evidence must reference an existing file inside ${path.basename(outDir)}: ${entry}`);
      continue;
    }
    const screenshotPath = evidenceScreenshotPath(entry, notesPath, outDir);
    const screenshot = screenshotMap.get(screenshotPath);
    if (!screenshot) {
      incomplete.push(`${label} evidence must point to a current screenshot manifest entry: ${entry}`);
      continue;
    }
    if (!sections.get(screenshot.path)) {
      incomplete.push(`${label} evidence must point to an inspected screenshot-note section: ${entry}`);
      continue;
    }
    if (invalidPaths.has(screenshot.path)) {
      incomplete.push(`${label} evidence points to an incomplete screenshot-note section: ${entry}`);
    }
    if (failedPaths.has(screenshot.path)) {
      incomplete.push(`${label} evidence points to a failed screenshot-note section: ${entry}`);
    }
    const integrity = integrityMap.get(screenshot.path);
    const expectedHash = reviewedScreenshotHashes?.[screenshot.path] || reviewedScreenshotHashes?.[entry] || reviewedScreenshotHashes?.[screenshotPath];
    if (!expectedHash) {
      incomplete.push(`${label} reviewedScreenshotHashes is missing ${screenshot.path}`);
    } else if (!integrity?.sha256 || expectedHash !== integrity.sha256) {
      incomplete.push(`${label} reviewedScreenshotHashes.${screenshot.path} does not match the current screenshot file`);
    }
    cited.push(screenshot.path);
  }
  return cited;
}

function evidenceCoverageProblems(citedPaths, screenshots, briefText, surfaceText, incomplete, warnings) {
  const cited = new Set(citedPaths);
  const citedScreenshots = screenshots.filter((screenshot) => cited.has(screenshot.path));
  const hasMobile = citedScreenshots.some((screenshot) => Number(screenshot.viewport?.width || 0) && Number(screenshot.viewport.width) <= 700);
  const hasDesktop = citedScreenshots.some((screenshot) => Number(screenshot.viewport?.width || 0) >= 900);
  if (!hasMobile) incomplete.push("design-quality.json evidence must include at least one mobile/narrow screenshot for broad final design QA");
  if (!hasDesktop) incomplete.push("design-quality.json evidence must include at least one desktop/wide screenshot for broad final design QA");
  const evidenceContext = `${briefText || ""} ${surfaceText || ""}`;
  if (/\b(dashboard|data-viz|data visualization|chart|table|analytics|report)\b/i.test(evidenceContext)) {
    const hasFocused = citedScreenshots.some((screenshot) => screenshot.type === "element" || /\b(chart|table|decision|dashboard|viz)\b/i.test(`${screenshot.path} ${screenshot.state} ${screenshot.selector || ""}`));
    if (!hasFocused) {
      incomplete.push("design-quality.json dashboard/data-viz work must include a chart, table, or decision-area focused screenshot evidence pointer");
    }
  } else if (/\bdecision\b/i.test(evidenceContext)) {
    const hasFocused = citedScreenshots.some((screenshot) => screenshot.type === "element" || /\b(decision|chart|table|dashboard|viz)\b/i.test(`${screenshot.path} ${screenshot.state} ${screenshot.selector || ""}`));
    if (!hasFocused) warnings.push("design-quality.json decision-heavy work should include a focused screenshot evidence pointer when a specific decision area exists");
  }
}

async function validateDesignQualityArtifact({ artifact, gate, outDir, screenshots, screenshotNotes, notesPath, notesText, freshness, maxEvidenceAgeMs, briefText, surfaceText }) {
  const data = artifact.data || {};
  const incomplete = [];
  const blockers = [];
  const warnings = [];
  const required = Boolean(gate.applies);

  if (!required) {
    if (gate.explicit && !gate.reason) incomplete.push("design-quality.json design_quality_gate.applies is false but no reason is recorded");
    if (gate.explicit && gate.heuristicApplies && !/\b(single component|component-only|plain utility|deliberately plain|small visual bug|tiny css fix|focused repair)\b/i.test(gate.reason)) {
      incomplete.push("design-quality.json design_quality_gate.applies is false for broad-looking work; reason must explain the narrow component repair or plain-utility exception");
    }
    return { required: false, gateApplies: false, data, incomplete, blockers, warnings };
  }

  if (!artifact.exists) {
    incomplete.push("design-quality.json is missing; broad final design QA needs structured gate, peer-skill, reference, and aesthetic verdict evidence");
    return { required: true, gateApplies: true, data: null, incomplete, blockers, warnings };
  }

  const rawGate = data.design_quality_gate || data.designQualityGate || {};
  if (rawGate.applies !== true) incomplete.push("design-quality.json design_quality_gate.applies must be true for broad concept/revamp/new-build final QA");
  if (!String(rawGate.reason || "").trim()) incomplete.push("design-quality.json design_quality_gate.reason is required");
  const depth = String(rawGate.depth || rawGate.design_exploration_depth || "").trim().toLowerCase();
  if (!["lean", "standard", "deep"].includes(depth)) incomplete.push("design-quality.json design_quality_gate.depth must be lean, standard, or deep");
  if (rawGate.final_required === false || rawGate.finalRequired === false) {
    incomplete.push("design-quality.json design_quality_gate.final_required is false; this is not final design acceptance");
  }

  const qaRunId = data.qaRunId || data.qa_run_id;
  if (!qaRunId) {
    incomplete.push("design-quality.json qaRunId is required for same-run final acceptance");
  } else if (freshness?.configuredRunIds?.length === 1 && qaRunId !== freshness.configuredRunIds[0]) {
    incomplete.push(`design-quality.json qaRunId ${qaRunId} does not match web audit qaRunId ${freshness.configuredRunIds[0]}`);
  }
  const generatedAt = Date.parse(data.generatedAt || data.generated_at || "");
  if (!Number.isFinite(generatedAt)) {
    incomplete.push("design-quality.json generatedAt is required and must be parseable");
  } else if (generatedAt - Date.now() > MAX_CLOCK_SKEW_MS) {
    incomplete.push("design-quality.json generatedAt is in the future beyond allowed clock skew; rerun final design-quality review with current screenshots");
  } else if (Date.now() - generatedAt > maxEvidenceAgeMs) {
    incomplete.push("design-quality.json generatedAt is stale; rerun final design-quality review with current screenshots");
  }
  const expectedNotesHash = sha256Hex(notesText || "");
  const notesHash = data.screenshotNotesHash || data.screenshot_notes_hash;
  if (!notesHash) {
    incomplete.push("design-quality.json screenshotNotesHash is required");
  } else if (notesHash !== expectedNotesHash) {
    incomplete.push("design-quality.json screenshotNotesHash does not match current screenshot-notes.md");
  }
  const reviewedScreenshotHashes = data.reviewedScreenshotHashes || data.reviewed_screenshot_hashes || {};

  const verdict = data.designQuality || data.design_quality || {};
  if (verdict.required === false) {
    incomplete.push("design-quality.json designQuality.required cannot be false for broad final design QA");
  }
  const citedEvidence = [];
  for (const field of DESIGN_VERDICT_FIELDS) {
    const record = verdictRecord(verdict, field);
    const value = record.verdict;
    if (!value) incomplete.push(`design-quality.json designQuality.${field} is required`);
    else if (value === "fail") blockers.push(`design-quality.json designQuality.${field} is fail`);
    else if (value !== "pass") incomplete.push(`design-quality.json designQuality.${field} must be pass for final acceptance, not ${value}`);
    citedEvidence.push(...await validateDesignEvidenceReferences({
      outDir,
      notesPath,
      notesText,
      screenshots,
      screenshotNotes,
      reviewedScreenshotHashes,
      references: record.evidence,
      label: `design-quality.json designQuality.${field}`,
      incomplete,
    }));
  }
  if (verdict.reviewEvidence || verdict.review_evidence) {
    incomplete.push("design-quality.json designQuality.reviewEvidence is legacy top-level evidence; provide per-verdict evidence arrays instead");
  }
  evidenceCoverageProblems(citedEvidence, screenshots, briefText, surfaceText, incomplete, warnings);
  if (!String(verdict.reviewerNotes || verdict.reviewer_notes || "").trim()) {
    incomplete.push("design-quality.json designQuality.reviewerNotes is required");
  }

  const peerSkills = data.peerSkills || data.peer_skills || {};
  for (const name of ["impeccable", "hallmark"]) {
    const result = await peerSkillProblems(outDir, name, peerSkills[name] || {});
    incomplete.push(...result.incomplete);
  }

  const referenceResult = await referenceDiscoveryProblems(outDir, data.referenceDiscovery || data.reference_discovery || {}, { ...gate, depth }, data.deepExploration || data.deep_exploration || {});
  incomplete.push(...referenceResult.incomplete);
  warnings.push(...referenceResult.warnings);

  return { required: true, gateApplies: true, data, incomplete, blockers, warnings };
}

function warningCategory(message) {
  if (/console warning/i.test(message)) return "console";
  if (/visual consistency|typography|alignment|spacing|camouflaged|overlay|occlud|clipped overlay/i.test(message)) return "visual-consistency";
  if (/clipped|tiny text|small tap target|unlabeled focusable|hover-only/i.test(message)) return "dom";
  if (/waived/i.test(message)) return "waivers";
  if (/final URL|mixed|brief|evidence/i.test(message)) return "evidence";
  return "other";
}

function groupedWarnings(warnings) {
  const groups = new Map();
  for (const warning of warnings) {
    const category = warningCategory(warning);
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(warning);
  }
  return [...groups.entries()].map(([category, items]) => ({ category, count: items.length, items }));
}

function likelyVisualIssues(warnings, limit = 5) {
  const priority = [/overlay|occlud|behind|z-index|clipped/i, /camouflaged|same color|contrast/i, /typography|font|peer/i, /alignment|spacing|width|anchoring/i, /small tap target|tiny text/i];
  const scored = warnings
    .map((warning, index) => {
      const bucket = priority.findIndex((pattern) => pattern.test(warning));
      return { warning, index, score: bucket === -1 ? 99 : bucket };
    })
    .sort((left, right) => left.score - right.score || left.index - right.index);
  return scored.slice(0, limit).map((item) => item.warning);
}

function extractBriefField(text, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(new RegExp(`^\\s*-?\\s*${escaped}\\s*:\\s*(.+)$`, "im"))?.[1]?.trim() || "";
}

function designQualityGateFor(briefText = "", designQualityData = null, runConfig = {}) {
  const rawGate = designQualityData?.design_quality_gate || designQualityData?.designQualityGate || null;
  const explicitBriefRequired = /\bdesign\s*quality\s*required\s*:\s*true\b/i.test(briefText);
  const heuristicApplies = explicitBriefRequired || requiresDesignQualityGate(briefText);
  const configRequired = typeof runConfig.designQualityRequired === "boolean" ? runConfig.designQualityRequired : null;
  const configReason = String(runConfig.designQualityReason || runConfig.design_quality_reason || "").trim();
  if (rawGate && typeof rawGate.applies === "boolean") {
    return {
      explicit: true,
      applies: rawGate.applies,
      reason: String(rawGate.reason || "").trim(),
      depth: String(rawGate.depth || rawGate.design_exploration_depth || "").trim().toLowerCase(),
      finalRequired: rawGate.final_required !== false && rawGate.finalRequired !== false,
      peerSkills: designQualityData?.peerSkills || designQualityData?.peer_skills || {},
      heuristicApplies,
    };
  }
  if (configRequired !== null) {
    return {
      explicit: true,
      applies: configRequired,
      reason: configReason || (configRequired ? "required by render config" : ""),
      depth: "",
      finalRequired: true,
      peerSkills: designQualityData?.peerSkills || designQualityData?.peer_skills || {},
      heuristicApplies,
    };
  }
  return {
    explicit: false,
    applies: heuristicApplies,
    reason: heuristicApplies ? "inferred from broad concept/revamp/new-build brief language" : "",
    depth: "",
    finalRequired: true,
    peerSkills: designQualityData?.peerSkills || designQualityData?.peer_skills || {},
    heuristicApplies,
  };
}

function peerSkillAllowsFallback(peerSkill = {}) {
  return peerSkill.status === "unavailable-fallback-used" && peerSkill.fallbackChecklistCompleted === true;
}

function hasImpeccableCommand(route, command) {
  return new RegExp(`\\b(?:impeccable\\s+)?${command}\\b`, "i").test(route);
}

function executionEvidenceProblem(text, field, label, options = {}) {
  const evidence = extractBriefField(text, field);
  if (!evidence || /^TODO\b/i.test(evidence)) {
    return `design-brief.md needs filled ${label} execution evidence for concept/revamp/new-build work`;
  }
  const hasUserWaiver = /\b(user waiver|user waived|explicitly waived|waived by user)\b/i.test(evidence);
  if (options.peerSkill?.status === "user-waived") return null;
  if (peerSkillAllowsFallback(options.peerSkill)) return null;
  if (options.blockUnavailable && /\b(unavailable|not available|not installed|fallback|manual fallback|skipped|not run)\b/i.test(evidence) && !hasUserWaiver) {
    return `design-brief.md ${label} execution indicates the peer skill was not run; this needs an explicit user waiver for final acceptance`;
  }
  if (/\b(skipped|not run)\b/i.test(evidence) && !/\b(unavailable|not available|not installed|fallback|waiv)/i.test(evidence)) {
    return `design-brief.md ${label} execution indicates the peer skill was skipped without an unavailable/waived fallback`;
  }
  return null;
}

function requiredImpeccableCommands(text) {
  const lower = text.toLowerCase();
  const required = new Set();
  const greenfield = /\b(concept\s*->\s*implement\s*->\s*qa|greenfield|new build|new site|new app|new dashboard|create\s+\+|build from scratch)\b/i.test(lower);
  if (greenfield) {
    required.add("craft");
  }
  if (/\b(revamp|redesign|makeover|broad polish)\b/i.test(lower)) {
    required.add("polish");
  }
  if (/\b(dashboard|data-viz|data visualization|data-heavy|dense reference|catalog|admin ui|admin surface)\b/i.test(lower)) {
    required.add("layout");
    required.add("typeset");
  }
  const bolderWaived = /\b(deliberately plain|plain utility|utilitarian only|bolder waived|user waived bolder|user-supplied strong style|user supplied strong style)\b/i.test(lower);
  if (!bolderWaived && (greenfield || /\b(functional but bland|generic scaffold|ai-slop|merely functional|bland|generic)\b/i.test(lower))) {
    required.add("bolder");
  }
  return [...required];
}

function briefProblems(text, gate = designQualityGateFor(text, null)) {
  const problems = [];
  if (!/(source truth|local truth|source[-\s]?of[-\s]?truth)/i.test(text)) {
    problems.push("design-brief.md is missing source truth or local truth");
  }
  if (!/anti[-\s]?goals?/i.test(text)) {
    problems.push("design-brief.md is missing anti-goals");
  }
  if (!/acceptance/i.test(text)) {
    problems.push("design-brief.md is missing acceptance gates or acceptance notes");
  }
  if (gate.applies) {
    if (!/(design quality bar|design thesis|surface quality bar)/i.test(text)) {
      problems.push("design-brief.md is missing a design quality bar for concept/revamp/new-build work");
    }
    if (!/design thesis\s*:/i.test(text) || /design thesis\s*:\s*TODO\b/i.test(text)) {
      problems.push("design-brief.md needs a filled design thesis for concept/revamp/new-build work");
    }
    if (!/primary workflow\s*:/i.test(text) || /primary workflow\s*:\s*TODO\b/i.test(text)) {
      problems.push("design-brief.md needs a filled primary workflow for concept/revamp/new-build work");
    }
    if (!/style posture\s*:/i.test(text) || /style posture\s*:\s*TODO\b/i.test(text)) {
      problems.push("design-brief.md needs a filled style posture for concept/revamp/new-build work");
    }
    if (!/(why this posture fits|posture fit|style posture reason)\s*:/i.test(text) || /(why this posture fits|posture fit|style posture reason)\s*:\s*TODO\b/i.test(text)) {
      problems.push("design-brief.md needs a filled why this posture fits field for concept/revamp/new-build work");
    }
    if (!/surface quality bar\s*:/i.test(text) || /surface quality bar\s*:\s*TODO\b/i.test(text)) {
      problems.push("design-brief.md needs a filled surface quality bar for concept/revamp/new-build work");
    }
    const explorationDepth = extractBriefField(text, "Design exploration depth");
    if (!explorationDepth || /^TODO\b/i.test(explorationDepth)) {
      problems.push("design-brief.md needs a filled design exploration depth for concept/revamp/new-build work");
    } else if (!/\b(lean|standard|deep)\b/i.test(explorationDepth)) {
      problems.push("design-brief.md design exploration depth must be lean, standard, or deep");
    }
    if (!/visual signature\s*:/i.test(text) || /visual signature\s*:\s*TODO\b/i.test(text)) {
      problems.push("design-brief.md needs a filled visual signature for concept/revamp/new-build work");
    }
    if (!/signature move\s*:/i.test(text) || /signature move\s*:\s*TODO\b/i.test(text)) {
      problems.push("design-brief.md needs a filled signature move for concept/revamp/new-build work");
    }
    for (const field of [
      "Style commitment",
      "First-viewport consequence",
      "Layout consequence",
      "Typography consequence",
      "Color/material consequence",
      "Generic pattern rejected",
    ]) {
      const value = extractBriefField(text, field);
      if (!value || /^TODO\b/i.test(value)) {
        problems.push(`design-brief.md needs a filled ${field.toLowerCase()} for concept/revamp/new-build work`);
      }
    }
    if (!/composition proof\s*:/i.test(text) || /composition proof\s*:\s*TODO\b/i.test(text)) {
      problems.push("design-brief.md needs a filled composition proof for concept/revamp/new-build work");
    }
    const impeccableRoute = extractBriefField(text, "Impeccable route");
    if (!impeccableRoute || /^TODO\b/i.test(impeccableRoute)) {
      problems.push("design-brief.md needs a filled Impeccable route for concept/revamp/new-build work");
    } else {
      const missingCommands = requiredImpeccableCommands(text).filter((command) => !hasImpeccableCommand(impeccableRoute, command));
      if (missingCommands.length) {
        problems.push(`design-brief.md Impeccable route is missing required command(s): ${missingCommands.join(", ")}`);
      }
    }
    const impeccableExecutionProblem = executionEvidenceProblem(text, "Impeccable execution", "Impeccable", { blockUnavailable: true, peerSkill: gate.peerSkills?.impeccable });
    if (impeccableExecutionProblem) problems.push(impeccableExecutionProblem);
    if (!/reference discovery plan\s*:/i.test(text) || /reference discovery plan\s*:\s*TODO\b/i.test(text)) {
      problems.push("design-brief.md needs a filled reference discovery plan for concept/revamp/new-build work");
    }
    if (!/anti[-\s]?generic checks\s*:/i.test(text) || /anti[-\s]?generic checks\s*:\s*TODO\b/i.test(text)) {
      problems.push("design-brief.md needs filled anti-generic checks for concept/revamp/new-build work");
    }
    if (!/(hallmark|anti[-\s]?slop review)\s*:/i.test(text) || /(hallmark|anti[-\s]?slop review)\s*:\s*TODO\b/i.test(text)) {
      problems.push("design-brief.md needs a filled Hallmark or anti-slop review plan for concept/revamp/new-build work");
    }
    const hallmarkExecutionProblem = executionEvidenceProblem(text, "Hallmark execution", "Hallmark", { peerSkill: gate.peerSkills?.hallmark });
    if (hallmarkExecutionProblem) problems.push(hallmarkExecutionProblem);
  }
  return problems;
}

function requiresDesignQualityGate(text) {
  if (/\b(single component|one component|component-only|plain utility|deliberately plain|small visual bug|tiny css fix)\b/i.test(text)
    && !/\b(broad|revamp|makeover|new build|greenfield|full redesign|whole page|whole screen)\b/i.test(text)) {
    return false;
  }
  return /concept\s*->\s*implement\s*->\s*QA/i.test(text)
    || /\b(greenfield|new build|new site|new app|new dashboard|create\s+\+\s|revamp|makeover|redesign)\b/i.test(text)
    || /design quality bar/i.test(text);
}

function nonFinalReasons({ args, status, qaMode, blockers, incomplete, warnings, globalFinalUrlMismatch }) {
  const reasons = [];
  if (args.partial) reasons.push("partial mode is draft evidence, not final acceptance");
  if (status !== "pass") reasons.push(`status is ${status}`);
  if (blockers.length) reasons.push(`${blockers.length} blocker(s) remain`);
  if (incomplete.length) reasons.push(`${incomplete.length} incomplete evidence item(s) remain`);
  if (qaMode === "evidence-only") reasons.push("evidence-only mode cannot be final design acceptance");
  if (args.allowMixedEvidence) reasons.push("mixed evidence was explicitly allowed");
  if (args.evidenceOnly || args.noBrief) reasons.push("design brief requirement was skipped");
  if (globalFinalUrlMismatch) reasons.push("global final URL mismatch allowance was present");
  if (!reasons.length) reasons.push("acceptanceReady is false");
  return [...new Set(reasons)];
}

function nextActionsFor({ args, blockers, incomplete, warnings }) {
  const actions = [];
  if (blockers.length) actions.push("Resolve or explicitly waive blocker-class findings with scoped evidence.");
  if (incomplete.some((item) => /screenshot notes|TODO|generated-template/i.test(item))) {
    actions.push("Inspect every screenshot and replace generated screenshot-note TODO fields.");
  }
  if (incomplete.some((item) => /state discovery|state-coverage|discovered state/i.test(item))) {
    actions.push("Rerun state discovery and render, waive, reject, or mark duplicate/low-value discovered states with evidence.");
  }
  if (incomplete.some((item) => /fresh|qaRunId|configHash|evidenceHash|stale|generated run/i.test(item))) {
    actions.push("Rerun discovery/render/DOM/visual scripts with one configured qaRunId and fresh artifacts.");
  }
  if (incomplete.some((item) => /design-brief/i.test(item))) {
    actions.push("Create or update .design-director/design-brief.md with source truth, anti-goals, design quality bar, and acceptance gates.");
  }
  if (warnings.length) actions.push("Review warning summary and promote warnings confirmed by screenshots or core task paths.");
  if (args.partial) actions.push("Run final QA after notes, state coverage, and waivers are resolved.");
  if (!actions.length) actions.push("No next action required; report is acceptance-ready.");
  return [...new Set(actions)];
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
  const designQualityArtifact = await readJsonArtifact(path.join(outDir, "design-quality.json"));
  const waiversArtifact = await readJsonArtifact(args.waivers || path.join(outDir, "waivers.json"));
  const rawWaivers = waiverArray(waiversArtifact.data);
  const waiverValidation = await validateWaivers(rawWaivers, { outDir, partial: args.partial });
  const waivers = waiverValidation.valid;

  const render = renderArtifact.data || { states: [], screenshots: [] };
  const dom = domArtifact.data || { states: [] };
  const visual = visualArtifact.data || { states: [] };
  const globalFinalUrlMismatch = Boolean(render.allowFinalUrlMismatch || dom.allowFinalUrlMismatch || visual.allowFinalUrlMismatch);
  const notesPath = args.notes || path.join(outDir, "screenshot-notes.md");
  const briefPath = args.brief || path.join(outDir, "design-brief.md");

  if (args.initNotes && loadScreenshots(render, outDir).length && !(await pathExists(notesPath))) {
    await fs.writeFile(notesPath, screenshotNoteTemplate(render, outDir));
  }
  const notesArtifact = await readTextArtifact(notesPath);
  const briefArtifact = await readTextArtifact(briefPath);
  const designGate = designQualityGateFor(briefArtifact.text, designQualityArtifact.data, renderArtifact.data || {});

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
  } else {
    for (const problem of briefProblems(briefArtifact.text, designGate)) addIncomplete(problem, "design-brief");
  }
  if (args.allowMixedEvidence) {
    warnings.push("--allow-mixed-evidence was supplied; this report cannot be final design acceptance");
  }
  if (globalFinalUrlMismatch) {
    warnings.push("global allowFinalUrlMismatch was present in audit artifacts; use scoped finalUrlException evidence for final acceptance");
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
    if (!artifact.evidenceHash) addIncomplete(`${artifact.name}.json is missing evidenceHash; rerun current audit scripts`, "evidence-freshness");
    if (!artifact.qaRunId) addIncomplete(`${artifact.name}.json is missing qaRunId; rerun current audit scripts`, "evidence-freshness");
    if (!artifact.startedAt || !artifact.finishedAt) addIncomplete(`${artifact.name}.json is missing startedAt/finishedAt; rerun current audit scripts`, "evidence-freshness");
  }
  for (const entry of freshness.futureTimestamps || []) {
    addIncomplete(`${entry.artifact}.json ${entry.field} timestamp is in the future beyond allowed clock skew: ${entry.value}`, "evidence-freshness");
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
  }
  if (freshness.generatedRunIds.length) {
    const message = "web audit artifacts used generated qaRunId values; set config.qaRunId or DESIGN_DIRECTOR_QA_RUN_ID for final same-run acceptance";
    if (mixedEvidenceAllowed) warnings.push(message);
    else addIncomplete(message, "evidence-freshness");
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
  if (freshness.latestAgeMs !== null && freshness.latestAgeMs > maxEvidenceAgeMs) {
    const message = `web audit artifacts are ${freshness.latestAgeMs}ms old, exceeding max evidence age ${maxEvidenceAgeMs}ms`;
    if (mixedEvidenceAllowed) warnings.push(message);
    else addIncomplete(message, "evidence-freshness");
  }

  if (!args.static && discoveryArtifact.exists) {
    const discovery = discoveryArtifact.data || {};
    for (const problem of artifactFutureTimestampProblems("discovered-states", discovery)) addIncomplete(problem, "state-discovery:freshness");
    if (!discovery.discoveryHash) addIncomplete("discovered-states.json is missing discoveryHash; rerun discover-states.mjs", "state-discovery:freshness");
    if (!artifactHasFreshnessMetadata(discovery)) addIncomplete("discovered-states.json is missing freshness/run metadata; rerun discover-states.mjs", "state-discovery:freshness");
    if (freshness.hashes.length === 1 && discovery.configHash && discovery.configHash !== freshness.hashes[0]) {
      addIncomplete(`discovered-states.json configHash ${discovery.configHash} does not match web audit configHash ${freshness.hashes[0]}`, "state-discovery:freshness");
    }
    if (freshness.baseUrls.length === 1 && discovery.baseUrl && normalizeUrl(discovery.baseUrl) !== freshness.baseUrls[0]) {
      addIncomplete(`discovered-states.json baseUrl ${discovery.baseUrl} does not match web audit baseUrl ${freshness.baseUrls[0]}`, "state-discovery:freshness");
    }
    if (discovery.qaRunIdSource !== "configured") {
      const message = "discovered-states.json used a generated qaRunId; set config.qaRunId or DESIGN_DIRECTOR_QA_RUN_ID for final same-run acceptance";
      if (mixedEvidenceAllowed) warnings.push(message);
      else addIncomplete(message, "state-discovery:freshness");
    }
    if (freshness.configuredRunIds.length === 1 && discovery.qaRunId && discovery.qaRunId !== freshness.configuredRunIds[0]) {
      addIncomplete(`discovered-states.json qaRunId ${discovery.qaRunId} does not match web audit qaRunId ${freshness.configuredRunIds[0]}`, "state-discovery:freshness");
    }
    if (freshness.appBuildIds.length === 1 && discovery.appBuildId && discovery.appBuildId !== freshness.appBuildIds[0]) {
      addIncomplete(`discovered-states.json appBuildId ${discovery.appBuildId} does not match web audit appBuildId ${freshness.appBuildIds[0]}`, "state-discovery:freshness");
    }
    const discoveryAgeMs = artifactLatestAgeMs(discovery);
    if (discoveryAgeMs === null) {
      addIncomplete("discovered-states.json is missing parseable timestamps; rerun discover-states.mjs", "state-discovery:freshness");
    } else if (discoveryAgeMs > maxEvidenceAgeMs) {
      addIncomplete(`discovered-states.json is ${discoveryAgeMs}ms old, exceeding max evidence age ${maxEvidenceAgeMs}ms`, "state-discovery:freshness");
    }
    const discoverySpanMs = artifactSpanAgainst(discovery, freshness);
    if (discoverySpanMs !== null && discoverySpanMs > maxEvidenceAgeMs) {
      addIncomplete(`discovered-states.json was generated ${discoverySpanMs}ms apart from web audit evidence, exceeding max evidence age ${maxEvidenceAgeMs}ms`, "state-discovery:freshness");
    }
  }

  if (!args.static && stateCoverageArtifact.exists) {
    const stateCoverage = stateCoverageArtifact.data || {};
    const items = stateCoverageItems(stateCoverage);
    if (items.length) {
      for (const problem of artifactFutureTimestampProblems("state-coverage", stateCoverage)) addIncomplete(problem, "state-coverage:freshness");
      const discoveryHash = discoveryArtifact.data?.discoveryHash || null;
      if (stateCoverage.discoveryHash) {
        if (!discoveryHash) addIncomplete("state-coverage.json declares discoveryHash but discovered-states.json has no discoveryHash", "state-coverage:freshness");
        else if (stateCoverage.discoveryHash !== discoveryHash) addIncomplete(`state-coverage.json discoveryHash ${stateCoverage.discoveryHash} does not match discovered-states.json discoveryHash ${discoveryHash}`, "state-coverage:freshness");
      } else if (artifactHasFreshnessMetadata(stateCoverage)) {
        if (freshness.hashes.length === 1 && stateCoverage.configHash !== freshness.hashes[0]) {
          addIncomplete(`state-coverage.json configHash ${stateCoverage.configHash} does not match web audit configHash ${freshness.hashes[0]}`, "state-coverage:freshness");
        }
        if (freshness.configuredRunIds.length === 1 && stateCoverage.qaRunId !== freshness.configuredRunIds[0]) {
          addIncomplete(`state-coverage.json qaRunId ${stateCoverage.qaRunId} does not match web audit qaRunId ${freshness.configuredRunIds[0]}`, "state-coverage:freshness");
        }
      } else {
        addIncomplete("state-coverage.json dispositions must include discoveryHash or same-run freshness metadata", "state-coverage:freshness");
      }
      const coverageAgeMs = artifactLatestAgeMs(stateCoverage);
      if (coverageAgeMs === null) {
        addIncomplete("state-coverage.json is missing parseable generatedAt/finishedAt timestamp", "state-coverage:freshness");
      } else if (coverageAgeMs > maxEvidenceAgeMs) {
        addIncomplete(`state-coverage.json is ${coverageAgeMs}ms old, exceeding max evidence age ${maxEvidenceAgeMs}ms`, "state-coverage:freshness");
      }
    }
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
        const exception = await finalUrlException(state, other, outDir);
        if (exception.allowed) warnings.push(`${message}; allowed by scoped final URL exception (${exception.reason})`);
        else if (args.partial) warnings.push(message);
        else addIncomplete(`${message}; ${exception.reason}`, "final-url", state);
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
    if (!domArtifact.exists || (dom.states || []).some((state) => !Array.isArray(state.audit?.statefulControls) && !Array.isArray(state.audit?.interactiveControls))) {
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
  for (const duplicate of duplicateScreenshotPaths(render, outDir)) {
    addIncomplete(`duplicate screenshot artifact path ${duplicate.file} is referenced ${duplicate.count} times; screenshot evidence must be collision-free`, "screenshots:duplicates");
  }
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

  const designQuality = await validateDesignQualityArtifact({
    artifact: designQualityArtifact,
    gate: designGate,
    outDir,
    screenshots,
    screenshotNotes,
    notesPath,
    notesText: notesArtifact.text,
    freshness,
    maxEvidenceAgeMs,
    briefText: briefArtifact.text,
    surfaceText: `${render.platform || ""} ${render.surface || ""} ${render.qaProfile || ""}`,
  });
  for (const issue of designQuality.incomplete) addIncomplete(issue, "design-quality");
  for (const issue of designQuality.blockers) addBlocker(issue, "design-quality");
  for (const issue of designQuality.warnings) warnings.push(issue);

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
      designQuality: {
        path: artifactPath(outDir, designQualityArtifact.path),
        exists: designQualityArtifact.exists,
        required: designQuality.required,
        gateApplies: designQuality.gateApplies,
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
  const qaMode = args.partial ? "partial" : (args.evidenceOnly || args.noBrief || args.allowMixedEvidence || globalFinalUrlMismatch) ? "evidence-only" : args.static ? "final-static" : "final";
  const acceptanceReady = status === "pass" && (qaMode === "final" || qaMode === "final-static");
  const qa = {
    generatedAt: new Date().toISOString(),
    qaMode,
    status,
    blockers,
    incomplete,
    warnings,
    warningSummary: {
      groups: groupedWarnings(warnings),
      topLikelyIssues: likelyVisualIssues(warnings),
      promotionHint: "Promote a warning to a blocker when screenshot review, a user complaint, or a core task path confirms visible design harm.",
      requiresHumanReview: warnings.length > 0,
    },
    screenshotCount: screenshots.length,
    screenshotNotesPath: notesArtifact.exists ? artifactPath(outDir, notesPath) : null,
    stateDiscoveryPath: discoveryArtifact.exists ? artifactPath(outDir, discoveryArtifact.path) : null,
    renderResultsPath: artifactPath(outDir, renderArtifact.path),
    domAuditPath: artifactPath(outDir, domArtifact.path),
    visualConsistencyAuditPath: artifactPath(outDir, visualArtifact.path),
    stateCoveragePath: stateCoverageArtifact.exists ? artifactPath(outDir, stateCoverageArtifact.path) : null,
    designQualityPath: designQualityArtifact.exists ? artifactPath(outDir, designQualityArtifact.path) : null,
    designQuality,
    waiverValidation,
    appliedWaivers,
    evidenceCompleteness,
    acceptanceReady,
    nonFinalBecause: acceptanceReady ? [] : nonFinalReasons({ args, status, qaMode, blockers, incomplete, warnings, globalFinalUrlMismatch }),
    nextActions: acceptanceReady ? ["No next action required; report is acceptance-ready."] : nextActionsFor({ args, blockers, incomplete, warnings }),
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
${qa.acceptanceReady ? "" : `- Non-final because: ${qa.nonFinalBecause.join("; ")}`}

## Next Actions

${bullet(qa.nextActions)}

## Blockers

${bullet(blockers)}

## Incomplete Evidence

${bullet(incomplete)}

## Warnings

${bullet(warnings)}

## Warning Summary

Top likely visual issues:

${bullet(qa.warningSummary.topLikelyIssues)}

Grouped warning counts:

${bullet(qa.warningSummary.groups.map((group) => `${group.category}: ${group.count}`))}

Promotion hint: ${qa.warningSummary.promotionHint}

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
