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
    } else if (arg === "--init-notes") {
      args.initNotes = true;
    } else if (arg === "--static") {
      args.static = true;
    } else if (arg === "--partial") {
      args.partial = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function usage() {
  return `Usage: qa-report.mjs [--out .design-director] [--notes .design-director/screenshot-notes.md] [--waivers .design-director/waivers.json] [--init-notes] [--static] [--partial]

Merges render-results.json, dom-audit.json, and visual-consistency-audit.json
into design-qa.json and design-qa.md. Missing evidence is incomplete/failing by
default. Use --static to waive state discovery for non-interactive static pages.
Use --partial only for draft reports that are not acceptance evidence.`;
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

function stateKey(state = {}) {
  return [
    state.state || state.name || "default",
    viewportKey(state.viewport),
    normalizeUrl(state.finalUrl || state.url),
  ].join("|");
}

function buildStateMatrix(states = []) {
  const matrix = new Map();
  for (const state of states) matrix.set(stateKey(state), state);
  return matrix;
}

async function inspectScreenshot(file, outDir) {
  const absolute = resolveEvidencePath(outDir, file);
  if (!absolute) return { path: file, exists: false, valid: false, reason: "path missing" };
  try {
    const data = await fs.readFile(absolute);
    const isPng = data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a;
    const isJpeg = data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    const isWebp = data.length >= 12 && data.slice(0, 4).toString("ascii") === "RIFF" && data.slice(8, 12).toString("ascii") === "WEBP";
    const valid = data.length > 16 && (isPng || isJpeg || isWebp);
    return {
      path: file,
      absolutePath: absolute,
      exists: true,
      valid,
      size: data.length,
      format: isPng ? "png" : isJpeg ? "jpeg" : isWebp ? "webp" : "unknown",
      reason: valid ? null : "not a valid PNG, JPEG, or WebP screenshot",
    };
  } catch (error) {
    if (error.code === "ENOENT") return { path: file, absolutePath: absolute, exists: false, valid: false, reason: "file is missing" };
    throw error;
  }
}

async function validateWaivers(waivers, { outDir, partial }) {
  const valid = [];
  const invalid = [];
  for (const [index, waiver] of waivers.entries()) {
    const problems = [];
    const check = normalizeCheck(waiver.check || waiver.id || waiver.type);
    if (!check) problems.push("check is required");
    if (check === "*") problems.push("wildcard waivers are not allowed");
    for (const field of ["reason", "evidence", "owner", "expires"]) {
      if (!String(waiver[field] || "").trim()) problems.push(`${field} is required`);
    }
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

function hasWaiver(waivers, check) {
  const target = normalizeCheck(check);
  return waivers.find((waiver) => {
    const waiverCheck = normalizeCheck(waiver.check || waiver.id || waiver.type);
    return waiverCheck === target || target.startsWith(`${waiverCheck}:`);
  });
}

function loadScreenshots(render) {
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
        path: state.screenshot,
        type: "page",
        state: state.state || "unknown",
        viewport: state.viewport || null,
        url: state.finalUrl || state.url || "unknown",
      });
    }
    for (const artifact of state.actionArtifacts || []) {
      if (artifact.type === "element-screenshot" && artifact.path) {
        add({
          path: artifact.path,
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
      path: screenshot,
      type: "page",
      state: state?.state || "unknown",
      viewport: state?.viewport || null,
      url: state?.finalUrl || state?.url || "unknown",
    });
  }

  return screenshots;
}

function screenshotNoteTemplate(render) {
  const screenshots = loadScreenshots(render);
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

function parseNoteSections(notes) {
  const sections = new Map();
  const lines = notes.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = { key: heading[1], lines: [] };
      sections.set(current.key, current);
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

async function validateScreenshotNotes({ screenshots, notesText, notesExists, outDir }) {
  const sections = parseNoteSections(notesText);
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

function actionSelectors(states = []) {
  const selectors = new Set();
  for (const state of states) {
    if (state.discoveredFrom?.selector) selectors.add(state.discoveredFrom.selector);
    for (const action of state.actions || []) {
      if (action.selector) selectors.add(action.selector);
    }
    for (const artifact of state.actionArtifacts || []) {
      if (artifact.selector) selectors.add(artifact.selector);
    }
  }
  return selectors;
}

function stateCoverageItems(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.dispositions)) return value.dispositions;
  if (Array.isArray(value.candidates)) return value.candidates;
  return [];
}

function dispositionForCandidate(candidate, stateCoverage) {
  const items = stateCoverageItems(stateCoverage);
  return items.find((item) => {
    if (candidate.selector && item.selector === candidate.selector) return true;
    if (candidate.kind && item.kind === candidate.kind && item.label === candidate.label) return true;
    return false;
  });
}

function safeHighConfidenceCandidates(discovery) {
  return (discovery?.candidates || []).filter((candidate) =>
    candidate.selector &&
    candidate.confidence === "high" &&
    (candidate.mutationRisk || "safe") === "safe"
  );
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

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

  if (args.initNotes && loadScreenshots(render).length && !(await pathExists(notesPath))) {
    await fs.writeFile(notesPath, screenshotNoteTemplate(render));
  }
  const notesArtifact = await readTextArtifact(notesPath);

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

  const addBlocker = (message, check) => {
    const waiver = check ? hasWaiver(waivers, check) : null;
    if (waiver) {
      appliedWaivers.push({ check, message, waiver });
      warnings.push(`waived blocker ${check}: ${message} (${waiver.reason || "no reason recorded"})`);
    }
    else blockers.push(message);
  };
  const addIncomplete = (message, check) => {
    const waiver = check ? hasWaiver(waivers, check) : null;
    if (waiver) {
      appliedWaivers.push({ check, message, waiver });
      warnings.push(`waived incomplete evidence ${check}: ${message} (${waiver.reason || "no reason recorded"})`);
    }
    else incomplete.push(message);
  };

  for (const invalidWaiver of waiverValidation.invalid) {
    incomplete.push(`waiver ${invalidWaiver.index + 1} is invalid: ${invalidWaiver.problems.join("; ")}`);
  }

  for (const artifact of [
    ["render-results", renderArtifact],
    ["dom-audit", domArtifact],
    ["visual-consistency-audit", visualArtifact],
  ]) {
    const [name, result] = artifact;
    if (!result.exists) addIncomplete(`${name}.json is missing`, name);
  }

  if (renderArtifact.exists && !(render.states || []).length) addIncomplete("render-results.json has no state entries", "render-results:empty");
  if (domArtifact.exists && !(dom.states || []).length) addIncomplete("dom-audit.json has no state entries", "dom-audit:empty");
  if (visualArtifact.exists && !(visual.states || []).length) addIncomplete("visual-consistency-audit.json has no state entries", "visual-consistency-audit:empty");

  const renderMatrix = buildStateMatrix(render.states || []);
  const domMatrix = buildStateMatrix(dom.states || []);
  const visualMatrix = buildStateMatrix(visual.states || []);
  coverage.stateMatrix.render = [...renderMatrix.keys()];
  coverage.stateMatrix.dom = [...domMatrix.keys()];
  coverage.stateMatrix.visual = [...visualMatrix.keys()];
  for (const [key, state] of renderMatrix.entries()) {
    if (!domMatrix.has(key)) {
      const message = `${formatStateLabel(state)}: DOM audit missing for rendered state matrix key ${key}`;
      coverage.missingDomAudit.push({ key, state: state.state, viewport: state.viewport, url: state.finalUrl || state.url });
      addIncomplete(message, "coverage:dom");
    }
    if (!visualMatrix.has(key)) {
      const message = `${formatStateLabel(state)}: visual audit missing for rendered state matrix key ${key}`;
      coverage.missingVisualAudit.push({ key, state: state.state, viewport: state.viewport, url: state.finalUrl || state.url });
      addIncomplete(message, "coverage:visual");
    }
  }

  if (!args.static && !discoveryArtifact.exists) {
    addIncomplete("state discovery output was not found; run discover-states.mjs or record a waiver", "state-discovery");
  } else if (!args.static && discoveryArtifact.exists && !((discoveryArtifact.data?.candidates?.length || 0) || (discoveryArtifact.data?.scans?.length || 0))) {
    addIncomplete("state discovery output exists but contains no candidates or scans", "state-discovery:empty");
  }

  if (args.static && !hasWaiver(waivers, "state-discovery")) {
    const controls = staticControlsFromDom(dom);
    coverage.staticControlEvidence = controls;
    if (!domArtifact.exists || (dom.states || []).some((state) => !Array.isArray(state.audit?.interactiveControls))) {
      addIncomplete("--static requires DOM interactive-control evidence or a valid state-discovery waiver", "static-verification");
    } else if (controls.length) {
      addIncomplete(`--static used but DOM audit found ${controls.length} interactive control candidate(s)`, "static-verification");
    }
  }

  if (!args.static && discoveryArtifact.exists) {
    const renderedSelectors = actionSelectors(render.states || []);
    for (const candidate of safeHighConfidenceCandidates(discoveryArtifact.data)) {
      const disposition = dispositionForCandidate(candidate, stateCoverageArtifact.data);
      const rendered = renderedSelectors.has(candidate.selector);
      const acceptableDisposition = disposition && ["rendered", "waived", "duplicate", "rejected", "low-value"].includes(disposition.disposition || disposition.coverage);
      if (!rendered && !acceptableDisposition) {
        coverage.unrenderedDiscoveredStates.push(candidate);
        addIncomplete(`discovered state ${candidate.kind} ${candidate.selector} was not rendered, waived, or rejected in state-coverage.json`, "state-coverage");
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

  const screenshots = loadScreenshots(render);
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

  const evidenceCompleteness = {
    partial: Boolean(args.partial),
    static: Boolean(args.static),
    artifacts: {
      renderResults: { path: renderArtifact.path, exists: renderArtifact.exists, stateCount: render.states?.length || 0 },
      domAudit: { path: domArtifact.path, exists: domArtifact.exists, stateCount: dom.states?.length || 0 },
      visualConsistencyAudit: { path: visualArtifact.path, exists: visualArtifact.exists, stateCount: visual.states?.length || 0 },
      stateDiscovery: { path: discoveryArtifact.path, exists: discoveryArtifact.exists, waived: Boolean(args.static || hasWaiver(waivers, "state-discovery")) },
      stateCoverage: { path: stateCoverageArtifact.path, exists: stateCoverageArtifact.exists, count: stateCoverageItems(stateCoverageArtifact.data).length },
      waivers: { path: waiversArtifact.path, exists: waiversArtifact.exists, count: rawWaivers.length, validCount: waivers.length, invalidCount: waiverValidation.invalid.length },
    },
    coverage,
    screenshots: {
      count: screenshots.length,
      paths: screenshots.map((screenshot) => screenshot.path),
      notes: screenshotNotes,
    },
  };

  const status = blockers.length ? "fail" : incomplete.length ? "incomplete" : "pass";
  const qa = {
    generatedAt: new Date().toISOString(),
    status,
    blockers,
    incomplete,
    warnings,
    screenshotCount: screenshots.length,
    screenshotNotesPath: notesArtifact.exists ? notesPath : null,
    stateDiscoveryPath: discoveryArtifact.exists ? discoveryArtifact.path : null,
    renderResultsPath: renderArtifact.path,
    domAuditPath: domArtifact.path,
    visualConsistencyAuditPath: visualArtifact.path,
    stateCoveragePath: stateCoverageArtifact.exists ? stateCoverageArtifact.path : null,
    waiverValidation,
    appliedWaivers,
    evidenceCompleteness,
    acceptanceReady: status === "pass" && !args.partial,
  };

  const md = `# Design QA

Generated: ${qa.generatedAt}

## Status

- Status: ${qa.status}
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

  await fs.writeFile(path.join(outDir, "design-qa.json"), `${JSON.stringify(qa, null, 2)}\n`);
  await fs.writeFile(path.join(outDir, "design-qa.md"), md);
  if (args.partial && incomplete.length) {
    console.warn(`qa-report: partial report has ${incomplete.length} incomplete evidence item(s); this is not acceptance evidence`);
  }
  console.log(`qa-report: wrote ${path.join(outDir, "design-qa.md")} (${status}, ${blockers.length} blockers, ${incomplete.length} incomplete)`);
  if (blockers.length || (incomplete.length && !args.partial)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`qa-report: ${error.message}`);
  process.exit(1);
});
