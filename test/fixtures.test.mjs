import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { qaRunMetadata } from "../scripts/lib/browser-utils.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const node = process.execPath;

function pngBytes(width = 375, height = 700) {
  const data = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(data, 0);
  data.writeUInt32BE(13, 8);
  data.write("IHDR", 12, "ascii");
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  data[24] = 8;
  data[25] = 6;
  return data;
}

function webpVp8Bytes(width = 375, height = 700) {
  const payloadSize = 10;
  const data = Buffer.alloc(20 + payloadSize);
  data.write("RIFF", 0, "ascii");
  data.writeUInt32LE(4 + 8 + payloadSize, 4);
  data.write("WEBP", 8, "ascii");
  data.write("VP8 ", 12, "ascii");
  data.writeUInt32LE(payloadSize, 16);
  const payloadOffset = 20;
  data[payloadOffset] = 0x00;
  data[payloadOffset + 1] = 0x00;
  data[payloadOffset + 2] = 0x00;
  data[payloadOffset + 3] = 0x9d;
  data[payloadOffset + 4] = 0x01;
  data[payloadOffset + 5] = 0x2a;
  data.writeUInt16LE(width & 0x3fff, payloadOffset + 6);
  data.writeUInt16LE(height & 0x3fff, payloadOffset + 8);
  return data;
}

const pagePng = pngBytes(375, 700);
const changedPagePng = Buffer.from(pagePng);
changedPagePng[30] = 1;

function imageMetadataForBytes(bytes, overrides = {}) {
  let width = overrides.width || 375;
  let height = overrides.height || 700;
  let format = overrides.format || "png";
  if (bytes.length >= 12 && bytes.slice(0, 4).toString("ascii") === "RIFF" && bytes.slice(8, 12).toString("ascii") === "WEBP") {
    format = overrides.format || "webp";
    const subtype = bytes.slice(12, 16).toString("ascii");
    if (subtype === "VP8 " && bytes.length >= 30) {
      const payloadOffset = 20;
      width = overrides.width || (bytes.readUInt16LE(payloadOffset + 6) & 0x3fff);
      height = overrides.height || (bytes.readUInt16LE(payloadOffset + 8) & 0x3fff);
    }
  } else if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    format = overrides.format || "png";
    width = overrides.width || bytes.readUInt32BE(16);
    height = overrides.height || bytes.readUInt32BE(20);
  }
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.length,
    width,
    height,
    format,
  };
}

function webMeta(tool, overrides = {}) {
  const now = Date.now();
  const startedAt = overrides.startedAt || new Date(now).toISOString();
  const finishedAt = overrides.finishedAt || new Date(now + 1000).toISOString();
  return {
    tool,
    generatedAt: startedAt,
    startedAt,
    finishedAt,
    configHash: "test-config-hash",
    evidenceHash: `${tool}-evidence-hash`,
    scriptOptions: {},
    qaRunId: "test-run",
    qaRunIdSource: "configured",
    appBuildId: "test-build",
    baseUrl: "http://example.invalid",
    ...overrides,
    generatedAt: overrides.generatedAt || startedAt,
    startedAt,
    finishedAt,
  };
}

function discoveryMeta(overrides = {}) {
  return {
    ...webMeta("discover-states"),
    discoveryHash: overrides.discoveryHash || "test-discovery-hash",
    candidates: [],
    scans: [{ ok: true }],
    ...overrides,
  };
}

async function runScript(args, options = {}) {
  return execFileAsync(node, args, {
    cwd: repoRoot,
    timeout: options.timeout || 60000,
    maxBuffer: 1024 * 1024 * 8,
    env: { ...process.env, ...options.env },
  });
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}

async function writeNativeProfileArtifacts(out, names, options = {}) {
  const imageBytes = options.imageBytes || pagePng;
  const treeText = options.treeText || JSON.stringify({ windows: [] });
  const treeExt = options.treeExt || "json";
  const imageExt = options.imageExt || "png";
  for (const name of names) {
    await fs.writeFile(path.join(out, `${name}.${imageExt}`), imageBytes);
    await fs.writeFile(path.join(out, `${name}-hierarchy.${treeExt}`), treeText);
  }
}

async function writeInspectedNotes(file, screenshots) {
  const rows = screenshots.map((screenshot) => `## ${screenshot.path}

- Viewport: ${screenshot.viewport || "375x700"}
- State: ${screenshot.state || "default"}
- URL: ${screenshot.url || "http://example.invalid"}
- Observation: Checked rendered state.
- Pass/fail: Pass
- Issues found: None
- Waiver/evidence: N/A
`).join("\n");
  await fs.writeFile(file, `# Screenshot Inspection Notes\n\n${rows}`);
}

async function createQaArtifacts(out, overrides = {}) {
  const screenshot = overrides.screenshot || path.join(out, "screenshots/default-375x700.png");
  const screenshotBytes = overrides.screenshotBytes || pagePng;
  if (!overrides.skipScreenshotFile) {
    await fs.mkdir(path.dirname(screenshot), { recursive: true });
    await fs.writeFile(screenshot, screenshotBytes);
  }
  const state = {
    state: "default",
    url: "http://example.invalid",
    finalUrl: "http://example.invalid",
    viewport: { width: 375, height: 700 },
    screenshot,
    screenshotMetadata: overrides.screenshotMetadata || imageMetadataForBytes(screenshotBytes, overrides.screenshotMetadataOptions || {}),
    pageErrors: [],
    consoleMessages: [],
    consoleErrors: [],
    consoleWarnings: [],
    ...(overrides.state || {}),
  };
  await writeJson(path.join(out, "render-results.json"), {
    ...webMeta("render-check"),
    screenshots: [screenshot],
    states: [state],
    ...(overrides.render || {}),
  });
  await writeJson(path.join(out, "dom-audit.json"), { ...webMeta("dom-audit"), ...(overrides.dom || { states: [{ state: "default", url: "http://example.invalid", viewport: { width: 375, height: 700 }, audit: { interactiveControls: [] } }] }) });
  await writeJson(path.join(out, "visual-consistency-audit.json"), { ...webMeta("visual-consistency-audit"), ...(overrides.visual || { states: [{ state: "default", url: "http://example.invalid", viewport: { width: 375, height: 700 }, audit: { blockers: [], warnings: [] } }] }) });
  if (!overrides.skipDiscovery) {
    await writeJson(path.join(out, "discovered-states.json"), overrides.discovery || discoveryMeta({ candidates: [{ kind: "select" }] }));
  }
  if (!overrides.skipNotes) {
    await writeInspectedNotes(path.join(out, "screenshot-notes.md"), [{ path: screenshot }]);
  }
  if (!overrides.skipBrief) {
    await fs.writeFile(path.join(out, "design-brief.md"), "Source truth: fixture.\nAnti-goals: none.\nAcceptance: QA evidence passes.\n");
  }
  return { screenshot };
}

test("discover-states emits safe draft states for generic fixture", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-discover-"));
  const fixtureUrl = pathToFileURL(path.join(repoRoot, "fixtures/visual-invariants/bad.html")).toString();
  await runScript(["scripts/discover-states.mjs", "--url", fixtureUrl, "--out", out, "--max-candidates", "20"]);

  const discovered = JSON.parse(await fs.readFile(path.join(out, "discovered-states.json"), "utf8"));
  const draft = JSON.parse(await fs.readFile(path.join(out, "render.config.discovered.json"), "utf8"));

  assert.ok(discovered.candidates.some((candidate) => candidate.kind === "select"));
  assert.ok(discovered.candidates.some((candidate) => candidate.kind === "overlay-trigger"));
  assert.ok(discovered.candidates.some((candidate) => candidate.kind === "chart-or-canvas"));
  assert.equal(discovered.qaRunIdSource, "generated");
  assert.ok(discovered.configHash);
  assert.ok(discovered.evidenceHash);
  assert.ok(discovered.discoveryHash);
  assert.ok(discovered.startedAt);
  assert.ok(discovered.finishedAt);
  assert.ok(draft.states.length >= 3);
});

test("discover-states scans mobile-only controls and excludes destructive draft actions", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-discover-mobile-"));
  const fixtureUrl = pathToFileURL(path.join(repoRoot, "fixtures/discovery/mobile.html")).toString();
  const configPath = path.join(out, "render.config.json");
  await writeJson(configPath, {
    url: fixtureUrl,
    viewports: [{ width: 375, height: 700 }, { width: 1000, height: 700 }],
    states: [{ name: "default" }]
  });

  await runScript(["scripts/discover-states.mjs", "--config", configPath, "--out", out, "--viewport-mode", "all", "--max-candidates", "20"]);
  const discovered = JSON.parse(await fs.readFile(path.join(out, "discovered-states.json"), "utf8"));
  const draft = JSON.parse(await fs.readFile(path.join(out, "render.config.discovered.json"), "utf8"));

  assert.ok(discovered.scans.some((scan) => scan.viewport.width === 375));
  assert.ok(discovered.candidates.some((candidate) => candidate.selector === "#mobileMenuButton" && candidate.kind === "overlay-trigger"));
  assert.equal(draft.states.some((state) => JSON.stringify(state).includes("#payButton")), false);
});

test("discover-states scans multiple configured routes", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-discover-routes-"));
  const fixtureUrl = pathToFileURL(path.join(repoRoot, "fixtures/discovery/routes.html")).toString();
  const configPath = path.join(out, "render.config.json");
  await writeJson(configPath, {
    url: fixtureUrl,
    viewports: [{ width: 900, height: 700 }],
    states: [
      { name: "route-one" },
      { name: "route-two", path: "?route=two" }
    ]
  });

  await runScript(["scripts/discover-states.mjs", "--config", configPath, "--out", out, "--viewport-mode", "all"]);
  const discovered = JSON.parse(await fs.readFile(path.join(out, "discovered-states.json"), "utf8"));
  assert.equal(discovered.scans.length, 2);
  assert.ok(discovered.candidates.some((candidate) => candidate.selector === "#routeTwoFilter"));
});

test("discover-states --depth 2 emits grouped drawer search state", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-discover-depth-"));
  const fixtureUrl = pathToFileURL(path.join(repoRoot, "fixtures/discovery/depth.html")).toString();
  await runScript(["scripts/discover-states.mjs", "--url", fixtureUrl, "--out", out, "--viewports", "375x700", "--depth", "2"]);
  const discovered = JSON.parse(await fs.readFile(path.join(out, "discovered-states.json"), "utf8"));
  const draft = JSON.parse(await fs.readFile(path.join(out, "render.config.discovered.json"), "utf8"));

  assert.ok(discovered.candidates.some((candidate) => candidate.depth === 2 && candidate.selector === "#drawerSearch"));
  assert.ok(discovered.candidates.some((candidate) => candidate.depth === 2 && candidate.selector === "#deleteAccount" && candidate.mutationRisk === "destructive"));
  assert.ok(discovered.candidates.some((candidate) => candidate.depth === 2 && candidate.selector === "#saveChanges" && candidate.mutationRisk === "destructive"));
  assert.ok(draft.states.some((state) =>
    (state.actions || []).some((action) => action.selector === "#filtersButton") &&
    (state.actions || []).some((action) => action.selector === "#drawerSearch" && action.type === "fill")
  ));
  assert.equal(draft.states.some((state) => JSON.stringify(state).includes("#deleteAccount")), false);
  assert.equal(draft.states.some((state) => JSON.stringify(state).includes("#saveChanges")), false);
});

test("visual audit detects bad overlay and peer value fixture", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-visual-bad-"));
  const fixtureUrl = pathToFileURL(path.join(repoRoot, "fixtures/visual-invariants/bad.html")).toString();
  const configPath = path.join(out, "render.config.json");
  await fs.writeFile(configPath, JSON.stringify({
    url: fixtureUrl,
    viewports: [{ width: 375, height: 700 }],
    states: [
      {
        name: "overlay-open",
        actions: [
          { type: "click", selector: "#filtersButton" },
          { type: "waitForStableLayout", ms: 100 }
        ]
      }
    ]
  }, null, 2));

  await assert.rejects(
    runScript(["scripts/visual-consistency-audit.mjs", "--config", configPath, "--out", out, "--max-elements", "500"]),
    /visual-consistency-audit/,
  );

  const audit = JSON.parse(await fs.readFile(path.join(out, "visual-consistency-audit.json"), "utf8"));
  const blockers = audit.states.flatMap((state) => state.audit?.blockers || []);
  const warnings = audit.states.flatMap((state) => state.audit?.warnings || []);
  assert.ok(blockers.some((finding) => finding.type === "overlay-occluded"));
  assert.ok([...blockers, ...warnings].some((finding) => finding.type === "peer-value-typography-mismatch"));
});

test("visual audit does not downgrade overlay blockers with warningOnlySelectors", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-visual-warning-only-overlay-"));
  const fixtureUrl = pathToFileURL(path.join(repoRoot, "fixtures/visual-invariants/bad.html")).toString();
  const configPath = path.join(out, "render.config.json");
  await writeJson(configPath, {
    url: fixtureUrl,
    viewports: [{ width: 375, height: 700 }],
    visualAudit: { warningOnlySelectors: ["body", "*", ".dropdown"] },
    states: [{
      name: "overlay-open",
      actions: [
        { type: "click", selector: "#filtersButton" },
        { type: "waitForStableLayout", ms: 100 }
      ]
    }]
  });
  await assert.rejects(
    runScript(["scripts/visual-consistency-audit.mjs", "--config", configPath, "--out", out, "--max-elements", "500"]),
    /visual-consistency-audit/,
  );
  const audit = JSON.parse(await fs.readFile(path.join(out, "visual-consistency-audit.json"), "utf8"));
  const blockers = audit.states.flatMap((state) => state.audit?.blockers || []);
  assert.ok(blockers.some((finding) => finding.type === "overlay-occluded"));
});

test("visual audit leaves fixed, hierarchy, and normal flow role fixtures without blockers", async () => {
  for (const fixture of ["fixed.html", "hierarchy.html", "data-grid.html", "listbox-flow.html"]) {
    const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-visual-fixed-"));
    const fixtureUrl = pathToFileURL(path.join(repoRoot, "fixtures/visual-invariants", fixture)).toString();
    await runScript(["scripts/visual-consistency-audit.mjs", "--url", fixtureUrl, "--out", out, "--viewports", "375x700", "--max-elements", "500"]);
    const audit = JSON.parse(await fs.readFile(path.join(out, "visual-consistency-audit.json"), "utf8"));
    const blockers = audit.states.flatMap((state) => state.audit?.blockers || []);
    assert.deepEqual(blockers, []);
  }
});

test("render-check screenshot names include viewport width and height", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-render-name-"));
  const fixtureUrl = pathToFileURL(path.join(repoRoot, "fixtures/visual-invariants/fixed.html")).toString();
  await runScript(["scripts/render-check.mjs", "--url", fixtureUrl, "--out", out, "--viewports", "375x700"]);
  const render = JSON.parse(await fs.readFile(path.join(out, "render-results.json"), "utf8"));
  assert.ok(render.screenshots.some((screenshot) => /default-1-[a-f0-9]{8}-375x700\.png$/.test(path.basename(screenshot))));
});

test("render-check keeps duplicate state names on different routes from overwriting screenshots", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-render-dup-names-"));
  const fixtureUrl = pathToFileURL(path.join(repoRoot, "fixtures/visual-invariants/hierarchy.html")).toString();
  const configPath = path.join(out, "render.config.json");
  await writeJson(configPath, {
    url: fixtureUrl,
    viewports: [{ width: 375, height: 700 }],
    states: [
      { name: "default" },
      { name: "default", path: "?route=two" }
    ]
  });
  await runScript(["scripts/render-check.mjs", "--config", configPath, "--out", out]);
  const render = JSON.parse(await fs.readFile(path.join(out, "render-results.json"), "utf8"));
  assert.equal(render.states.length, 2);
  assert.notEqual(render.states[0].screenshot, render.states[1].screenshot);
  assert.notEqual(render.states[0].stateId, render.states[1].stateId);
});

test("scrollBoundaryCheck passes when page cannot scroll farther in the wheel direction", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-scroll-boundary-"));
  const fixtureUrl = pathToFileURL(path.join(repoRoot, "fixtures/actions/scroll-boundary.html")).toString();
  const configPath = path.join(out, "render.config.json");
  await writeJson(configPath, {
    url: fixtureUrl,
    viewports: [{ width: 375, height: 700 }],
    states: [
      {
        name: "scroll-top",
        actions: [{ type: "scrollBoundaryCheck", selector: "#scrollbox", y: -240 }]
      }
    ]
  });
  await runScript(["scripts/render-check.mjs", "--config", configPath, "--out", out]);
  const render = JSON.parse(await fs.readFile(path.join(out, "render-results.json"), "utf8"));
  assert.equal(render.states[0].ok, true);
});

test("render, DOM, and visual audits record finalUrl after route-changing actions", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-route-final-url-"));
  const fixtureUrl = pathToFileURL(path.join(repoRoot, "fixtures/actions/route-change.html")).toString();
  const configPath = path.join(out, "render.config.json");
  await writeJson(configPath, {
    url: fixtureUrl,
    viewports: [{ width: 375, height: 700 }],
    states: [
      {
        name: "details-open",
        actions: [
          { type: "click", selector: "#routeButton" },
          { type: "waitForStableLayout", ms: 100 }
        ]
      }
    ]
  });

  await runScript(["scripts/render-check.mjs", "--config", configPath, "--out", out]);
  await runScript(["scripts/dom-audit.mjs", "--config", configPath, "--out", out]);
  await runScript(["scripts/visual-consistency-audit.mjs", "--config", configPath, "--out", out]);
  const render = JSON.parse(await fs.readFile(path.join(out, "render-results.json"), "utf8"));
  const dom = JSON.parse(await fs.readFile(path.join(out, "dom-audit.json"), "utf8"));
  const visual = JSON.parse(await fs.readFile(path.join(out, "visual-consistency-audit.json"), "utf8"));
  assert.match(render.states[0].finalUrl, /view=details/);
  assert.match(dom.states[0].finalUrl, /view=details/);
  assert.match(visual.states[0].finalUrl, /view=details/);
});

test("render, DOM, and visual audits persist config-sourced finalUrlException", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-route-final-url-exception-"));
  const fixtureUrl = pathToFileURL(path.join(repoRoot, "fixtures/actions/route-change.html")).toString();
  const configPath = path.join(out, "render.config.json");
  await writeJson(configPath, {
    url: fixtureUrl,
    viewports: [{ width: 375, height: 700 }],
    states: [
      {
        name: "default",
        finalUrlException: {
          fromFinalUrl: fixtureUrl,
          toFinalUrl: `${fixtureUrl}?view=details`,
          reason: "Fixture route is allowed to change during details checks.",
          evidence: "screenshots/default-1-route-375x700.png"
        }
      }
    ]
  });

  await runScript(["scripts/render-check.mjs", "--config", configPath, "--out", out]);
  await runScript(["scripts/dom-audit.mjs", "--config", configPath, "--out", out]);
  await runScript(["scripts/visual-consistency-audit.mjs", "--config", configPath, "--out", out]);
  const render = JSON.parse(await fs.readFile(path.join(out, "render-results.json"), "utf8"));
  const dom = JSON.parse(await fs.readFile(path.join(out, "dom-audit.json"), "utf8"));
  const visual = JSON.parse(await fs.readFile(path.join(out, "visual-consistency-audit.json"), "utf8"));
  assert.equal(render.states[0].finalUrlException.source, "config");
  assert.equal(dom.states[0].finalUrlException.source, "config");
  assert.equal(visual.states[0].finalUrlException.source, "config");
});

test("qa-report initializes notes but keeps template as blocker", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-"));
  await fs.mkdir(path.join(out, "screenshots"), { recursive: true });
  await fs.writeFile(path.join(out, "screenshots/default-375x700.png"), pagePng);
  await fs.writeFile(path.join(out, "render-results.json"), JSON.stringify({
    ...webMeta("render-check"),
    screenshots: [path.join(out, "screenshots/default-375x700.png")],
    states: [
      {
        state: "default",
        url: "http://example.invalid",
        finalUrl: "http://example.invalid",
        viewport: { width: 375, height: 700 },
        screenshot: path.join(out, "screenshots/default-375x700.png"),
        pageErrors: [],
        consoleMessages: [],
        consoleErrors: [],
        consoleWarnings: []
      }
    ]
  }, null, 2));
  await writeJson(path.join(out, "dom-audit.json"), { ...webMeta("dom-audit"), states: [{ state: "default", url: "http://example.invalid", viewport: { width: 375, height: 700 }, audit: { interactiveControls: [] } }] });
  await writeJson(path.join(out, "visual-consistency-audit.json"), { ...webMeta("visual-consistency-audit"), states: [{ state: "default", url: "http://example.invalid", viewport: { width: 375, height: 700 }, audit: { blockers: [], warnings: [] } }] });

  await assert.rejects(
    runScript(["scripts/qa-report.mjs", "--out", out, "--init-notes"]),
    /qa-report/,
  );

  const notes = await fs.readFile(path.join(out, "screenshot-notes.md"), "utf8");
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.match(notes, /Observation: TODO/);
  assert.ok(qa.incomplete.some((issue) => issue.includes("generated-template TODO")));
  assert.ok(qa.incomplete.some((issue) => issue.includes("state discovery output")));
  assert.equal(qa.status, "incomplete");
});

test("qa-report fails empty output directory instead of passing fallbacks", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-empty-"));
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.equal(qa.status, "incomplete");
  assert.ok(qa.incomplete.some((issue) => issue.includes("render-results.json is missing")));
  assert.ok(qa.incomplete.some((issue) => issue.includes("no screenshots")));
});

test("qa-report treats missing screenshot files as incomplete evidence", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-missing-screenshot-"));
  const { screenshot } = await createQaArtifacts(out, { skipScreenshotFile: true });
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes(`${path.relative(out, screenshot).replaceAll(path.sep, "/")}: screenshot file is missing`)));
});

test("qa-report rejects page screenshot bytes changed after render", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-screenshot-hash-"));
  const { screenshot } = await createQaArtifacts(out);
  await fs.writeFile(screenshot, changedPagePng);
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("screenshot sha256 mismatch")));
});

test("qa-report rejects element screenshot bytes changed after render", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-element-hash-"));
  const pageShot = path.join(out, "screenshots/default-375x700.png");
  const elementShot = path.join(out, "screenshots/default-375x700-chart.png");
  await fs.mkdir(path.dirname(pageShot), { recursive: true });
  await fs.writeFile(pageShot, pagePng);
  await fs.writeFile(elementShot, pagePng);
  await createQaArtifacts(out, {
    screenshot: pageShot,
    state: {
      actionArtifacts: [{
        type: "element-screenshot",
        path: "screenshots/default-375x700-chart.png",
        selector: "#chart",
        viewport: { width: 375, height: 700 },
        screenshotMetadata: imageMetadataForBytes(pagePng)
      }]
    }
  });
  await writeInspectedNotes(path.join(out, "screenshot-notes.md"), [
    { path: pageShot },
    { path: "screenshots/default-375x700-chart.png" }
  ]);
  await fs.writeFile(elementShot, changedPagePng);
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("default-375x700-chart.png") && issue.includes("screenshot sha256 mismatch")));
});

test("qa-report separates console errors from console warnings", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-console-"));
  await createQaArtifacts(out, {
    state: {
      consoleMessages: [
        { type: "error", text: "boom" },
        { type: "warning", text: "heads up" }
      ],
      consoleErrors: [{ type: "error", text: "boom" }],
      consoleWarnings: [{ type: "warning", text: "heads up" }]
    }
  });
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.equal(qa.status, "fail");
  assert.ok(qa.blockers.some((blocker) => blocker.includes("console error")));
  assert.ok(qa.warnings.some((warning) => warning.includes("console warning")));
});

test("qa-report --static allows missing state discovery when other evidence is complete", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-static-"));
  await createQaArtifacts(out, { skipDiscovery: true });
  await runScript(["scripts/qa-report.mjs", "--out", out, "--static"]);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.equal(qa.status, "pass");
  assert.equal(qa.qaMode, "final-static");
  assert.equal(qa.acceptanceReady, true);
  assert.equal(qa.evidenceCompleteness.artifacts.stateDiscovery.waived, true);
});

test("dom-audit separates static navigation links from stateful link controls", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-static-link-controls-"));
  const page = path.join(out, "static-links.html");
  await fs.writeFile(page, `<!doctype html>
<html><body>
  <main>
    <a href="https://example.com/docs">Docs</a>
    <a href="#" class="menu-button">Menu</a>
    <a href="/drawer" class="drawer-trigger" onclick="event.preventDefault()">Drawer</a>
  </main>
</body></html>`);
  await runScript(["scripts/dom-audit.mjs", "--url", pathToFileURL(page).toString(), "--out", out]);
  const dom = JSON.parse(await fs.readFile(path.join(out, "dom-audit.json"), "utf8"));
  const audit = dom.states[0].audit;
  assert.equal(audit.links.length, 1);
  assert.ok(audit.statefulControls.some((control) => control.text === "Menu" && control.reason.includes("anchor without real navigation")));
  assert.ok(audit.statefulControls.some((control) => control.text === "Drawer"));
});

test("qa-report --static fails link-styled stateful controls but permits navigation links", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-static-link-control-"));
  await createQaArtifacts(out, {
    skipDiscovery: true,
    dom: {
      ...webMeta("dom-audit"),
      states: [{
        state: "default",
        url: "http://example.invalid",
        finalUrl: "http://example.invalid",
        viewport: { width: 375, height: 700 },
        audit: {
          links: [{ tag: "a", text: "Docs", href: "https://example.com/docs" }],
          statefulControls: [{ tag: "a", text: "Menu", href: "#", reason: "anchor without real navigation" }]
        }
      }]
    }
  });
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out, "--static"]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("--static used but DOM audit found 1 interactive control candidate")));
});

test("qa-report requires DOM and visual audit coverage for every rendered state", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-coverage-"));
  const first = path.join(out, "screenshots/default-375x700.png");
  const second = path.join(out, "screenshots/details-375x700.png");
  await fs.mkdir(path.dirname(first), { recursive: true });
  await fs.writeFile(first, pagePng);
  await fs.writeFile(second, pagePng);
  await writeJson(path.join(out, "render-results.json"), {
    ...webMeta("render-check"),
    screenshots: [first, second],
    states: [
      { state: "default", url: "http://example.invalid", finalUrl: "http://example.invalid", viewport: { width: 375, height: 700 }, screenshot: first, pageErrors: [], consoleErrors: [], consoleWarnings: [] },
      { state: "details", url: "http://example.invalid/details", finalUrl: "http://example.invalid/details", viewport: { width: 375, height: 700 }, screenshot: second, pageErrors: [], consoleErrors: [], consoleWarnings: [] }
    ]
  });
  await writeJson(path.join(out, "dom-audit.json"), { ...webMeta("dom-audit"), states: [{ state: "default", url: "http://example.invalid", viewport: { width: 375, height: 700 }, audit: { interactiveControls: [] } }] });
  await writeJson(path.join(out, "visual-consistency-audit.json"), { ...webMeta("visual-consistency-audit"), states: [{ state: "default", url: "http://example.invalid", viewport: { width: 375, height: 700 }, audit: { blockers: [], warnings: [] } }] });
  await writeJson(path.join(out, "discovered-states.json"), { candidates: [], scans: [{ ok: true }] });
  await writeInspectedNotes(path.join(out, "screenshot-notes.md"), [{ path: first }, { path: second, state: "details", url: "http://example.invalid/details" }]);

  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.equal(qa.status, "incomplete");
  assert.ok(qa.incomplete.some((issue) => issue.includes("DOM audit missing")));
  assert.ok(qa.incomplete.some((issue) => issue.includes("visual audit missing")));
});

test("qa-report rejects duplicate state matrix keys", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-duplicate-state-key-"));
  const first = path.join(out, "screenshots/first.png");
  const second = path.join(out, "screenshots/second.png");
  await fs.mkdir(path.dirname(first), { recursive: true });
  await fs.writeFile(first, pagePng);
  await fs.writeFile(second, pagePng);
  const duplicateState = (screenshot, url) => ({
    state: "default",
    stateId: "duplicate",
    url,
    finalUrl: url,
    viewport: { width: 375, height: 700 },
    screenshot,
    pageErrors: [],
    consoleErrors: [],
    consoleWarnings: []
  });
  await writeJson(path.join(out, "render-results.json"), {
    ...webMeta("render-check"),
    screenshots: [first, second],
    states: [
      duplicateState(first, "http://example.invalid/one"),
      duplicateState(second, "http://example.invalid/two")
    ]
  });
  await writeJson(path.join(out, "dom-audit.json"), { ...webMeta("dom-audit"), states: [duplicateState(first, "http://example.invalid/one")] });
  await writeJson(path.join(out, "visual-consistency-audit.json"), { ...webMeta("visual-consistency-audit"), states: [duplicateState(first, "http://example.invalid/one")] });
  await writeJson(path.join(out, "discovered-states.json"), { candidates: [], scans: [{ ok: true }] });
  await fs.writeFile(path.join(out, "design-brief.md"), "Source truth: fixture.\nAnti-goals: none.\nAcceptance: duplicate keys fail.\n");
  await writeInspectedNotes(path.join(out, "screenshot-notes.md"), [{ path: first }, { path: second }]);

  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("duplicate state matrix key duplicate|375x700")));
});

test("qa-report requires discovered high-confidence safe candidates to be disposed", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-state-coverage-"));
  await createQaArtifacts(out, {
    discovery: {
      candidates: [{ kind: "overlay-trigger", selector: "#mobileMenuButton", confidence: "high", mutationRisk: "safe" }],
      scans: [{ ok: true }]
    }
  });

  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("state-coverage.json")));
  assert.ok(qa.evidenceCompleteness.coverage.unrenderedDiscoveredStates.some((candidate) => candidate.selector === "#mobileMenuButton"));
});

test("qa-report requires state coverage disposition to match route and viewport", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-state-scope-"));
  await createQaArtifacts(out, {
    discovery: {
      candidates: [{
        kind: "overlay-trigger",
        selector: "#menuButton",
        confidence: "high",
        mutationRisk: "safe",
        discoveredFrom: { state: "default", url: "http://example.invalid/", viewport: { width: 375, height: 700 } }
      }],
      scans: [{ ok: true }]
    }
  });
  await writeJson(path.join(out, "state-coverage.json"), {
    dispositions: [{
      kind: "overlay-trigger",
      selector: "#menuButton",
      disposition: "rendered",
      discoveredFrom: { state: "default", url: "http://example.invalid/", viewport: "1440x1000" },
      evidence: "screenshots/default-375x700.png"
    }]
  });

  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("matching route and viewport")));
});

test("qa-report requires reasons and evidence for non-rendered state coverage dispositions", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-state-disposition-evidence-"));
  await createQaArtifacts(out, {
    discovery: {
      candidates: [{
        kind: "chart-or-canvas",
        selector: "#chart",
        confidence: "medium",
        mutationRisk: "safe",
        discoveredFrom: { state: "default", url: "http://example.invalid/", viewport: { width: 375, height: 700 } }
      }],
      scans: [{ ok: true }]
    },
    render: { qaProfile: "final-qa", surface: "dashboard" }
  });
  await writeJson(path.join(out, "state-coverage.json"), {
    dispositions: [{
      kind: "chart-or-canvas",
      selector: "#chart",
      disposition: "low-value",
      discoveredFrom: { state: "default", url: "http://example.invalid/", viewport: "375x700" }
    }]
  });

  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("requires a reason")));
  assert.ok(qa.incomplete.some((issue) => issue.includes("requires evidence")));
});

test("qa-report enforces design brief unless evidence-only mode is explicit", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-brief-"));
  await createQaArtifacts(out, { skipBrief: true });
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  let qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("design-brief.md is missing")));

  await runScript(["scripts/qa-report.mjs", "--out", out, "--evidence-only"]);
  qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.equal(qa.status, "pass");
  assert.equal(qa.qaMode, "evidence-only");
  assert.equal(qa.acceptanceReady, false);
  assert.equal(qa.evidenceCompleteness.artifacts.designBrief.waived, true);
});

test("qa-report persisted JSON does not leak absolute output paths", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-path-sanitize-"));
  await createQaArtifacts(out);
  await runScript(["scripts/qa-report.mjs", "--out", out]);
  const raw = await fs.readFile(path.join(out, "design-qa.json"), "utf8");
  assert.equal(raw.includes(out), false);
  assert.equal(raw.includes("absolutePath"), false);
});

test("qa-report rejects mixed config hashes and base URLs", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-mixed-evidence-"));
  await createQaArtifacts(out, {
    dom: {
      ...webMeta("dom-audit", { configHash: "other-config-hash", baseUrl: "http://other.example.invalid" }),
      states: [{ state: "default", url: "http://other.example.invalid", finalUrl: "http://other.example.invalid", viewport: { width: 375, height: 700 }, audit: { interactiveControls: [] } }]
    }
  });
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("different configHash values")));
  assert.ok(qa.incomplete.some((issue) => issue.includes("different baseUrl values")));
});

test("qa-report rejects stale evidence generated outside the freshness window", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-stale-evidence-"));
  await createQaArtifacts(out, {
    visual: {
      ...webMeta("visual-consistency-audit", {
        startedAt: "2026-01-01T01:00:00.000Z",
        finishedAt: "2026-01-01T01:00:01.000Z"
      }),
      states: [{ state: "default", url: "http://example.invalid", finalUrl: "http://example.invalid", viewport: { width: 375, height: 700 }, audit: { blockers: [], warnings: [] } }]
    }
  });
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("exceeding max evidence age")));
});

test("qa-report rejects old but internally consistent evidence", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-old-consistent-evidence-"));
  const oldRender = webMeta("render-check", {
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:01.000Z"
  });
  const oldDom = webMeta("dom-audit", {
    startedAt: "2026-01-01T00:00:02.000Z",
    finishedAt: "2026-01-01T00:00:03.000Z"
  });
  const oldVisual = webMeta("visual-consistency-audit", {
    startedAt: "2026-01-01T00:00:04.000Z",
    finishedAt: "2026-01-01T00:00:05.000Z"
  });
  await createQaArtifacts(out, {
    render: oldRender,
    dom: {
      ...oldDom,
      states: [{ state: "default", url: "http://example.invalid", finalUrl: "http://example.invalid", viewport: { width: 375, height: 700 }, audit: { interactiveControls: [] } }]
    },
    visual: {
      ...oldVisual,
      states: [{ state: "default", url: "http://example.invalid", finalUrl: "http://example.invalid", viewport: { width: 375, height: 700 }, audit: { blockers: [], warnings: [] } }]
    }
  });
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("web audit artifacts are") && issue.includes("exceeding max evidence age")));
});

test("qa-report requires fresh same-run discovery metadata for final QA", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-stale-discovery-"));
  await createQaArtifacts(out, {
    discovery: discoveryMeta({
      candidates: [],
      scans: [{ ok: true }],
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:00:01.000Z",
      generatedAt: "2026-01-01T00:00:00.000Z"
    })
  });
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("discovered-states.json is") && issue.includes("exceeding max evidence age")));
});

test("qa-report requires state coverage to bind to current discovery", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-coverage-hash-"));
  await createQaArtifacts(out, {
    discovery: discoveryMeta({
      discoveryHash: "current-discovery",
      candidates: [{
        kind: "overlay-trigger",
        selector: "#menuButton",
        confidence: "high",
        mutationRisk: "safe",
        discoveredFrom: { state: "default", url: "http://example.invalid/", viewport: { width: 375, height: 700 } }
      }]
    })
  });
  await writeJson(path.join(out, "state-coverage.json"), {
    generatedAt: new Date().toISOString(),
    discoveryHash: "old-discovery",
    dispositions: [{
      kind: "overlay-trigger",
      selector: "#menuButton",
      disposition: "rejected",
      risk: "not-relevant",
      discoveredFrom: { state: "default", url: "http://example.invalid/", viewport: "375x700" }
    }]
  });
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("state-coverage.json discoveryHash old-discovery does not match")));
});

test("qa-report rejects stale state coverage dispositions", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-stale-state-coverage-"));
  await createQaArtifacts(out, {
    discovery: discoveryMeta({
      discoveryHash: "current-discovery",
      candidates: [{
        kind: "overlay-trigger",
        selector: "#menuButton",
        confidence: "high",
        mutationRisk: "safe",
        discoveredFrom: { state: "default", url: "http://example.invalid/", viewport: { width: 375, height: 700 } }
      }]
    })
  });
  await writeJson(path.join(out, "state-coverage.json"), {
    generatedAt: "2026-01-01T00:00:00.000Z",
    discoveryHash: "current-discovery",
    dispositions: [{
      kind: "overlay-trigger",
      selector: "#menuButton",
      disposition: "rejected",
      risk: "not-relevant",
      discoveredFrom: { state: "default", url: "http://example.invalid/", viewport: "375x700" }
    }]
  });
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("state-coverage.json is") && issue.includes("exceeding max evidence age")));
});

test("qa-report requires configured same-run qaRunId for final acceptance", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-generated-run-id-"));
  const generated = { qaRunId: "generated-shared", qaRunIdSource: "generated" };
  await createQaArtifacts(out, {
    render: generated,
    dom: {
      ...generated,
      states: [{ state: "default", url: "http://example.invalid", finalUrl: "http://example.invalid", viewport: { width: 375, height: 700 }, audit: { interactiveControls: [] } }]
    },
    visual: {
      ...generated,
      states: [{ state: "default", url: "http://example.invalid", finalUrl: "http://example.invalid", viewport: { width: 375, height: 700 }, audit: { blockers: [], warnings: [] } }]
    }
  });
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("used generated qaRunId values")));
  assert.equal(qa.acceptanceReady, false);
});

test("qa-report rejects final URL drift across web artifacts", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-final-url-"));
  await createQaArtifacts(out, {
    dom: {
      ...webMeta("dom-audit"),
      states: [{ state: "default", url: "http://example.invalid", finalUrl: "http://example.invalid/details", viewport: { width: 375, height: 700 }, audit: { interactiveControls: [] } }]
    }
  });
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("final URL mismatch")));
});

test("qa-report allows final URL drift only with scoped evidence", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-final-url-scoped-"));
  await createQaArtifacts(out, {
    state: {
      finalUrlException: {
        fromFinalUrl: "http://example.invalid/",
        toFinalUrl: "http://example.invalid/details",
        reason: "Details action intentionally redirects after render capture.",
        evidence: "screenshots/default-375x700.png",
        source: "config"
      }
    },
    dom: {
      ...webMeta("dom-audit"),
      states: [{ state: "default", url: "http://example.invalid", finalUrl: "http://example.invalid/details", viewport: { width: 375, height: 700 }, audit: { interactiveControls: [] } }]
    }
  });
  await runScript(["scripts/qa-report.mjs", "--out", out]);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.equal(qa.status, "pass");
  assert.equal(qa.acceptanceReady, true);
  assert.ok(qa.warnings.some((warning) => warning.includes("scoped final URL exception")));
});

test("qa-report rejects final URL exception patched only into DOM artifact", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-dom-only-final-url-"));
  await createQaArtifacts(out, {
    dom: {
      ...webMeta("dom-audit"),
      states: [{
        state: "default",
        url: "http://example.invalid",
        finalUrl: "http://example.invalid/details",
        viewport: { width: 375, height: 700 },
        finalUrlException: {
          fromFinalUrl: "http://example.invalid/",
          toFinalUrl: "http://example.invalid/details",
          reason: "Patched into DOM only.",
          evidence: "screenshots/default-375x700.png",
          source: "config"
        },
        audit: { interactiveControls: [] }
      }]
    }
  });
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("no scoped exception")));
});

test("qa-report rejects legacy final URL exception shape", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-legacy-final-url-"));
  await createQaArtifacts(out, {
    state: {
      finalUrlException: {
        expectedFinalUrl: "http://example.invalid/details",
        reason: "Old shape.",
        evidence: "screenshots/default-375x700.png",
        source: "config"
      }
    },
    dom: {
      ...webMeta("dom-audit"),
      states: [{ state: "default", url: "http://example.invalid", finalUrl: "http://example.invalid/details", viewport: { width: 375, height: 700 }, audit: { interactiveControls: [] } }]
    }
  });
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("missing fromFinalUrl or toFinalUrl")));
});

test("qa-report rejects final URL exception evidence from another screenshot", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-final-url-wrong-shot-"));
  await fs.mkdir(path.join(out, "screenshots"), { recursive: true });
  await fs.writeFile(path.join(out, "screenshots/other.png"), pagePng);
  await createQaArtifacts(out, {
    state: {
      finalUrlException: {
        fromFinalUrl: "http://example.invalid/",
        toFinalUrl: "http://example.invalid/details",
        reason: "Evidence points at unrelated screenshot.",
        evidence: "screenshots/other.png",
        source: "config"
      }
    },
    dom: {
      ...webMeta("dom-audit"),
      states: [{ state: "default", url: "http://example.invalid", finalUrl: "http://example.invalid/details", viewport: { width: 375, height: 700 }, audit: { interactiveControls: [] } }]
    }
  });
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("does not match a screenshot artifact")));
});

test("qa-report treats global final URL mismatch allowances as non-final", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-global-final-url-"));
  await createQaArtifacts(out, {
    render: { allowFinalUrlMismatch: true }
  });
  await runScript(["scripts/qa-report.mjs", "--out", out]);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.equal(qa.status, "pass");
  assert.equal(qa.qaMode, "evidence-only");
  assert.equal(qa.acceptanceReady, false);
});

test("qa-report cross-checks screenshot note viewport, state, and URL", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-note-cross-check-"));
  const { screenshot } = await createQaArtifacts(out);
  await fs.writeFile(path.join(out, "screenshot-notes.md"), `# Screenshot Inspection Notes

## ${screenshot}

- Viewport: 1440x1000
- State: wrong-state
- URL: http://example.invalid/wrong
- Observation: Checked rendered state.
- Pass/fail: Pass
- Issues found: None
- Waiver/evidence: N/A
`);
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("note viewport 1440x1000")));
  assert.ok(qa.incomplete.some((issue) => issue.includes("note state wrong-state")));
  assert.ok(qa.incomplete.some((issue) => issue.includes("note URL http://example.invalid/wrong")));
});

test("qa-report redacts embedded and outside evidence paths", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-redact-"));
  const outside = path.join(os.tmpdir(), "outside-dd-shot.png");
  await fs.writeFile(outside, pagePng);
  await createQaArtifacts(out, {
    screenshot: outside,
    state: {
      error: "Failure wrote details to /Users/alice/project/private.log, /mnt/data/private/project/file.log, and C:\\Users\\Alice\\project\\private.log while URL https://example.com/path/name stayed public"
    }
  });
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const raw = await fs.readFile(path.join(out, "design-qa.json"), "utf8");
  assert.equal(raw.includes("alice"), false);
  assert.equal(raw.includes("Alice"), false);
  assert.equal(raw.includes("/mnt/data/private"), false);
  assert.equal(raw.includes("../"), false);
  assert.ok(raw.includes("https://example.com/path/name"));
  assert.ok(raw.includes("[absolute-path-redacted]"));
});

test("qa-report does not let broad coverage waivers hide final coverage gaps", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-broad-coverage-"));
  const first = path.join(out, "screenshots/default-375x700.png");
  await fs.mkdir(path.dirname(first), { recursive: true });
  await fs.writeFile(first, pagePng);
  await writeJson(path.join(out, "render-results.json"), {
    ...webMeta("render-check"),
    screenshots: [first],
    states: [{ state: "default", stateId: "default", url: "http://example.invalid", finalUrl: "http://example.invalid", viewport: { width: 375, height: 700 }, screenshot: first, pageErrors: [], consoleErrors: [], consoleWarnings: [] }]
  });
  await writeJson(path.join(out, "dom-audit.json"), { ...webMeta("dom-audit"), states: [] });
  await writeJson(path.join(out, "visual-consistency-audit.json"), { ...webMeta("visual-consistency-audit"), states: [] });
  await writeJson(path.join(out, "discovered-states.json"), { candidates: [], scans: [{ ok: true }] });
  await fs.writeFile(path.join(out, "design-brief.md"), "Source truth: fixture.\nAnti-goals: none.\nAcceptance: broad waiver fails.\n");
  await writeInspectedNotes(path.join(out, "screenshot-notes.md"), [{ path: first }]);
  await writeJson(path.join(out, "waivers.json"), [{
    check: "coverage",
    reason: "Broad coverage waiver should not apply to final QA.",
    evidence: "screenshots/default-375x700.png",
    owner: "qa",
    expires: "2999-01-01"
  }]);
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("DOM audit missing")));
  assert.ok(qa.incomplete.some((issue) => issue.includes("visual audit missing")));
});

test("qa-report rejects failed discovery scans", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-discovery-fail-"));
  await createQaArtifacts(out, {
    discovery: { candidates: [], scans: [{ state: "default", viewport: { width: 375, height: 700 }, ok: false, error: "navigation timeout" }] }
  });
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("state discovery scan failed")));
});

test("qa-report reads VP8 WebP dimensions", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-webp-"));
  await createQaArtifacts(out, { screenshotBytes: webpVp8Bytes(375, 700), screenshot: path.join(out, "screenshots/default-375x700.webp") });
  await runScript(["scripts/qa-report.mjs", "--out", out]);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.equal(qa.status, "pass");
  assert.equal(qa.evidenceCompleteness.screenshots.notes.integrity[0].width, 375);
});

test("qa-report rejects tiny VP8 WebP screenshots", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-tiny-webp-"));
  await createQaArtifacts(out, { screenshotBytes: webpVp8Bytes(1, 1), screenshot: path.join(out, "screenshots/default-375x700.webp") });
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("page screenshot width 1px")));
});

test("qa-report enforces important medium-confidence candidates for final QA", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-medium-candidate-"));
  await createQaArtifacts(out, {
    render: { qaProfile: "final-qa", surface: "dashboard" },
    discovery: {
      candidates: [{
        kind: "chart-or-canvas",
        selector: "#primaryChart",
        confidence: "medium",
        mutationRisk: "safe",
        discoveredFrom: { state: "default", url: "http://example.invalid/", viewport: { width: 375, height: 700 } }
      }],
      scans: [{ ok: true }]
    }
  });

  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.evidenceCompleteness.coverage.unrenderedDiscoveredStates.some((candidate) => candidate.selector === "#primaryChart"));
});

test("qa-report fails when screenshot notes record a failed inspection", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-note-fail-"));
  const { screenshot } = await createQaArtifacts(out);
  await fs.writeFile(path.join(out, "screenshot-notes.md"), `# Screenshot Inspection Notes

## ${screenshot}

- Viewport: 375x700
- State: default
- URL: http://example.invalid
- Observation: Overlay is visibly clipped.
- Pass/fail: Fail
- Issues found: Overlay clipped behind chart.
- Waiver/evidence: N/A
`);
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.equal(qa.status, "fail");
  assert.ok(qa.blockers.some((blocker) => blocker.includes("note records Fail")));
});

test("qa-report rejects invalid broad or unevidenced waivers", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-waiver-"));
  await createQaArtifacts(out);
  await writeJson(path.join(out, "waivers.json"), [
    { check: "*", reason: "known issue", evidence: path.join(out, "screenshots/default-375x700.png"), owner: "qa", expires: "2999-01-01" },
    { check: "state-discovery", reason: "missing evidence", owner: "qa", expires: "2999-01-01" }
  ]);
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("wildcard waivers are not allowed")));
  assert.ok(qa.incomplete.some((issue) => issue.includes("evidence is required")));
});

test("qa-report rejects waiver evidence outside the QA output directory", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-waiver-outside-"));
  const outside = path.join(os.tmpdir(), "dd-waiver-outside-evidence.png");
  await fs.writeFile(outside, pagePng);
  await createQaArtifacts(out);
  await writeJson(path.join(out, "waivers.json"), [{
    check: "console-error",
    reason: "Outside evidence must not be accepted for final public QA.",
    evidence: outside,
    owner: "qa",
    expires: "2999-01-01"
  }]);

  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("evidence path must be inside")));
});

test("qa-report rejects state coverage evidence outside the QA output directory", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-state-outside-evidence-"));
  const outside = path.join(os.tmpdir(), "dd-state-outside-evidence.png");
  await fs.writeFile(outside, pagePng);
  await createQaArtifacts(out, {
    discovery: {
      candidates: [{
        kind: "chart-or-canvas",
        selector: "#chart",
        confidence: "medium",
        mutationRisk: "safe",
        discoveredFrom: { state: "default", url: "http://example.invalid/", viewport: { width: 375, height: 700 } }
      }],
      scans: [{ ok: true }]
    },
    render: { qaProfile: "final-qa", surface: "dashboard" }
  });
  await writeJson(path.join(out, "state-coverage.json"), {
    dispositions: [{
      kind: "chart-or-canvas",
      selector: "#chart",
      disposition: "low-value",
      reason: "Outside evidence should not satisfy coverage.",
      evidence: outside,
      discoveredFrom: { state: "default", url: "http://example.invalid/", viewport: "375x700" }
    }]
  });

  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("state-coverage evidence must be inside")));
});

test("qa-report rejects fake screenshot files", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-fake-shot-"));
  await createQaArtifacts(out, { screenshotBytes: Buffer.from("png-placeholder") });
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("not a valid PNG")));
});

test("qa-report rejects tiny page screenshots", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-tiny-shot-"));
  await createQaArtifacts(out, { screenshotBytes: pngBytes(1, 1) });
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("page screenshot width 1px")));
});

test("qa-report --static fails when DOM audit shows interactive controls", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-static-misuse-"));
  await createQaArtifacts(out, {
    skipDiscovery: true,
    dom: {
      states: [{
        state: "default",
        url: "http://example.invalid",
        viewport: { width: 375, height: 700 },
        audit: {
          interactiveControls: [{ tag: "button", text: "Menu", rect: { width: 48, height: 44 } }]
        }
      }]
    }
  });
  await writeJson(path.join(out, "waivers.json"), [
    {
      check: "state-discovery",
      reason: "Static page waiver should not bypass visible controls.",
      evidence: "screenshots/default-375x700.png",
      owner: "qa",
      expires: "2999-01-01"
    }
  ]);
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out, "--static"]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("--static used but DOM audit found")));
});

test("qa-report screenshot note template includes element screenshots", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-element-notes-"));
  const fixtureUrl = pathToFileURL(path.join(repoRoot, "fixtures/visual-invariants/fixed.html")).toString();
  const configPath = path.join(out, "render.config.json");
  await writeJson(configPath, {
    url: fixtureUrl,
    viewports: [{ width: 375, height: 700 }],
    states: [
      {
        name: "chart-capture",
        actions: [{ type: "screenshotElement", selector: "svg" }]
      }
    ]
  });
  await runScript(["scripts/render-check.mjs", "--config", configPath, "--out", out]);
  await writeJson(path.join(out, "dom-audit.json"), { states: [{ state: "chart-capture", url: fixtureUrl, viewport: { width: 375, height: 700 }, audit: { interactiveControls: [] } }] });
  await writeJson(path.join(out, "visual-consistency-audit.json"), { states: [{ state: "chart-capture", url: fixtureUrl, viewport: { width: 375, height: 700 }, audit: { blockers: [], warnings: [] } }] });
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out, "--init-notes", "--static"]), /qa-report/);
  const render = JSON.parse(await fs.readFile(path.join(out, "render-results.json"), "utf8"));
  const elementPath = render.states[0].actionArtifacts[0].path;
  const notes = await fs.readFile(path.join(out, "screenshot-notes.md"), "utf8");
  assert.match(notes, new RegExp(elementPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("render-check keeps same-named element screenshots collision-free", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-render-element-collision-"));
  const fixtureUrl = pathToFileURL(path.join(repoRoot, "fixtures/visual-invariants/fixed.html")).toString();
  const configPath = path.join(out, "render.config.json");
  await writeJson(configPath, {
    url: fixtureUrl,
    qaRunId: "element-collision-test",
    viewports: [{ width: 375, height: 700 }],
    states: [
      { name: "default", actions: [{ type: "screenshotElement", selector: "svg", name: "chart" }] },
      { name: "default", path: "?variant=two", actions: [{ type: "screenshotElement", selector: "svg", name: "chart" }] }
    ]
  });
  await runScript(["scripts/render-check.mjs", "--config", configPath, "--out", out]);
  const render = JSON.parse(await fs.readFile(path.join(out, "render-results.json"), "utf8"));
  const elementPaths = render.states.map((state) => state.actionArtifacts[0].path);
  assert.equal(new Set(elementPaths).size, 2);
  for (const elementPath of elementPaths) {
    await fs.access(path.join(out, elementPath));
  }
});

test("qa-report rejects duplicate screenshot artifact paths", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-duplicate-screenshot-"));
  await createQaArtifacts(out, {
    state: {
      actionArtifacts: [
        { type: "element-screenshot", path: "screenshots/default-375x700.png", selector: "#chart" }
      ]
    }
  });
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("duplicate screenshot artifact path")));
});

test("script options affect evidenceHash without changing shared configHash", () => {
  const config = { url: "http://example.invalid", qaRunId: "evidence-hash-test" };
  const effective = {
    baseUrl: "http://example.invalid",
    states: [{ name: "default" }],
    viewports: [{ width: 375, height: 700 }],
    tool: "visual-consistency-audit",
  };
  const lowThreshold = qaRunMetadata(config, { ...effective, scriptOptions: { fontDeltaPx: 2 } }, "2026-01-01T00:00:00.000Z");
  const highThreshold = qaRunMetadata(config, { ...effective, scriptOptions: { fontDeltaPx: 8 } }, "2026-01-01T00:00:00.000Z");
  assert.equal(lowThreshold.configHash, highThreshold.configHash);
  assert.notEqual(lowThreshold.evidenceHash, highThreshold.evidenceHash);
});

test("native-qa-report passes complete iOS evidence", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-native-ios-"));
  await writeNativeProfileArtifacts(out, ["home-light", "home-dark", "home-large", "home-keyboard"]);
  await fs.writeFile(path.join(out, "runtime.log"), "No runtime errors captured.\n");
  await writeJson(path.join(out, "native-ios-qa.json"), {
    platform: "native-ios",
    target: {
      workspace: "App.xcworkspace",
      scheme: "App",
      simulator: "iPhone 16",
      osVersion: "latest"
    },
    tooling: {
      commandsOrToolCalls: ["session_show_defaults", "build_run_sim", "capture screenshot"]
    },
    matrix: [
      {
        state: "home-light",
        appearance: "light",
        contentSize: "default",
        orientation: "portrait",
        screenshot: "home-light.png",
        uiHierarchy: "home-light-hierarchy.json",
        result: "pass"
      },
      {
        state: "home-dark",
        appearance: "dark",
        contentSize: "default",
        orientation: "portrait",
        screenshot: "home-dark.png",
        uiHierarchy: "home-dark-hierarchy.json",
        result: "pass"
      },
      {
        state: "home-large",
        appearance: "light",
        contentSize: "accessibilityLarge",
        orientation: "portrait",
        screenshot: "home-large.png",
        uiHierarchy: "home-large-hierarchy.json",
        result: "pass"
      },
      {
        state: "home-keyboard",
        appearance: "light",
        contentSize: "default",
        orientation: "portrait",
        keyboard: true,
        screenshot: "home-keyboard.png",
        uiHierarchy: "home-keyboard-hierarchy.json",
        result: "pass"
      }
    ],
    checks: { logsReviewed: "checked" },
    logs: "runtime.log",
    blockers: [],
    warnings: []
  });

  await runScript(["scripts/native-qa-report.mjs", "--report", path.join(out, "native-ios-qa.json"), "--out", out]);
  const qa = JSON.parse(await fs.readFile(path.join(out, "native-design-qa.json"), "utf8"));
  assert.equal(qa.status, "pass");
  assert.equal(qa.acceptanceReady, true);
  const raw = await fs.readFile(path.join(out, "native-design-qa.json"), "utf8");
  assert.equal(raw.includes(out), false);
  assert.equal(raw.includes("absolutePath"), false);
});

test("native-qa-report does not count self-declared profiles without supporting metadata", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-native-profile-spoof-"));
  await fs.writeFile(path.join(out, "home.png"), pagePng);
  await fs.writeFile(path.join(out, "hierarchy.json"), JSON.stringify({ windows: [] }));
  await fs.writeFile(path.join(out, "runtime.log"), "No runtime errors captured.\n");
  await writeJson(path.join(out, "native-ios-qa.json"), {
    platform: "native-ios",
    target: { workspace: "App.xcworkspace", scheme: "App", simulator: "iPhone 16" },
    tooling: { commandsOrToolCalls: ["capture screenshot"] },
    matrix: [
      {
        state: "home",
        profiles: ["default-light", "dark", "large-text", "keyboard-focused"],
        appearance: "light",
        contentSize: "default",
        orientation: "portrait",
        screenshot: "home.png",
        uiHierarchy: "hierarchy.json",
        result: "pass"
      }
    ],
    checks: { logsReviewed: "checked" },
    logs: "runtime.log"
  });

  await assert.rejects(runScript(["scripts/native-qa-report.mjs", "--report", path.join(out, "native-ios-qa.json"), "--out", out]), /native-qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "native-design-qa.json"), "utf8"));
  assert.equal(qa.status, "incomplete");
  assert.ok(qa.incomplete.some((issue) => issue.includes("required profile not covered: dark")));
  assert.ok(qa.warnings.some((warning) => warning.includes("declared profile dark is not supported")));
});

test("native-qa-report rejects combined iOS appearance evidence", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-native-ios-both-"));
  await fs.writeFile(path.join(out, "home.png"), pagePng);
  await fs.writeFile(path.join(out, "hierarchy.json"), JSON.stringify({ windows: [] }));
  await fs.writeFile(path.join(out, "runtime.log"), "No runtime errors captured.\n");
  await writeJson(path.join(out, "native-ios-qa.json"), {
    platform: "native-ios",
    target: { workspace: "App.xcworkspace", scheme: "App", simulator: "iPhone 16" },
    tooling: { commandsOrToolCalls: ["capture screenshot"] },
    matrix: [
      { state: "home", appearance: "both", contentSize: "default", orientation: "portrait", screenshot: "home.png", uiHierarchy: "hierarchy.json", result: "pass" }
    ],
    checks: { logsReviewed: "checked" },
    logs: "runtime.log"
  });

  await assert.rejects(runScript(["scripts/native-qa-report.mjs", "--report", path.join(out, "native-ios-qa.json"), "--out", out]), /native-qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "native-design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("appearance must be light or dark")));
});

test("native-qa-report rejects combined Android theme evidence", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-native-android-both-"));
  await fs.writeFile(path.join(out, "home.png"), pagePng);
  await fs.writeFile(path.join(out, "tree.xml"), "<hierarchy />");
  await fs.writeFile(path.join(out, "runtime.log"), "No runtime errors captured.\n");
  await writeJson(path.join(out, "native-android-qa.json"), {
    platform: "native-android",
    target: { module: ":app", variant: "debug", device: "Pixel 8", apiLevel: 35 },
    tooling: { commandsOrToolCalls: ["adb exec-out screencap -p"] },
    matrix: [
      { state: "home", theme: "both", fontScale: 1, displaySize: "default", screenshot: "home.png", uiTree: "tree.xml", result: "pass" }
    ],
    checks: { logsReviewed: "checked" },
    logs: "runtime.log"
  });

  await assert.rejects(runScript(["scripts/native-qa-report.mjs", "--report", path.join(out, "native-android-qa.json"), "--out", out]), /native-qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "native-design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("theme must be light or dark")));
});

test("native-qa-report requires true default iOS light profile semantics", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-native-ios-default-semantics-"));
  await writeNativeProfileArtifacts(out, ["light-large", "dark", "keyboard", "landscape", "log"]);
  await writeJson(path.join(out, "native-ios-qa.json"), {
    platform: "native-ios",
    target: { project: "Example.xcodeproj", scheme: "Example", simulator: "iPhone 16" },
    tooling: { commandsOrToolCalls: ["capture screenshots"] },
    matrix: [
      { state: "light-large", appearance: "light", contentSize: "accessibilityLarge", orientation: "portrait", screenshot: "light-large.png", uiHierarchy: "light-large-hierarchy.json", result: "pass" },
      { state: "dark", appearance: "dark", contentSize: "default", orientation: "portrait", screenshot: "dark.png", uiHierarchy: "dark-hierarchy.json", result: "pass" },
      { state: "keyboard", appearance: "light", contentSize: "default", orientation: "portrait", keyboard: true, screenshot: "keyboard.png", uiHierarchy: "keyboard-hierarchy.json", result: "pass" },
      { state: "landscape", appearance: "light", contentSize: "default", orientation: "landscape", screenshot: "landscape.png", uiHierarchy: "landscape-hierarchy.json", result: "pass" }
    ],
    checks: { logsReviewed: "checked" },
    logs: ["log-hierarchy.json"]
  });
  await assert.rejects(runScript(["scripts/native-qa-report.mjs", "--report", path.join(out, "native-ios-qa.json"), "--out", out]), /native-qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "native-design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("required profile not covered: default-light")));
});

test("native-qa-report requires true default Android light profile semantics", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-native-android-default-semantics-"));
  await writeNativeProfileArtifacts(out, ["light-large", "dark", "ime", "log"], { treeExt: "xml" });
  await writeJson(path.join(out, "native-android-qa.json"), {
    platform: "native-android",
    target: { module: ":app", variant: "debug", device: "Pixel", apiLevel: 35 },
    tooling: { commandsOrToolCalls: ["capture screenshots"] },
    matrix: [
      { state: "light-large", theme: "light", fontScale: 1.3, displaySize: "default", screenshot: "light-large.png", uiTree: "light-large-hierarchy.xml", result: "pass" },
      { state: "dark", theme: "dark", fontScale: 1, displaySize: "default", screenshot: "dark.png", uiTree: "dark-hierarchy.xml", result: "pass" },
      { state: "ime", theme: "light", fontScale: 1, displaySize: "default", ime: true, screenshot: "ime.png", uiTree: "ime-hierarchy.xml", result: "pass" }
    ],
    checks: { logsReviewed: "checked" },
    logs: ["log-hierarchy.xml"]
  });
  await assert.rejects(runScript(["scripts/native-qa-report.mjs", "--report", path.join(out, "native-android-qa.json"), "--out", out]), /native-qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "native-design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("required profile not covered: default-light")));
});

test("native-qa-report does not let combined dark large evidence satisfy dark profile", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-native-combined-profile-"));
  await writeNativeProfileArtifacts(out, ["light", "dark-large", "keyboard", "log"]);
  await writeJson(path.join(out, "native-ios-qa.json"), {
    platform: "native-ios",
    target: { project: "Example.xcodeproj", scheme: "Example", simulator: "iPhone 16" },
    tooling: { commandsOrToolCalls: ["capture screenshots"] },
    matrix: [
      { state: "light", appearance: "light", contentSize: "default", orientation: "portrait", screenshot: "light.png", uiHierarchy: "light-hierarchy.json", result: "pass" },
      { state: "dark-large", appearance: "dark", contentSize: "accessibilityLarge", orientation: "portrait", screenshot: "dark-large.png", uiHierarchy: "dark-large-hierarchy.json", result: "pass" },
      { state: "keyboard", appearance: "light", contentSize: "default", orientation: "portrait", keyboard: true, screenshot: "keyboard.png", uiHierarchy: "keyboard-hierarchy.json", result: "pass" }
    ],
    checks: { logsReviewed: "checked" },
    logs: ["log-hierarchy.json"]
  });
  await assert.rejects(runScript(["scripts/native-qa-report.mjs", "--report", path.join(out, "native-ios-qa.json"), "--out", out]), /native-qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "native-design-qa.json"), "utf8"));
  assert.ok(qa.coveredProfiles.includes("large-text"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("required profile not covered: dark")));
});

test("native-qa-report requires unique screenshot and tree evidence per required profile", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-native-unique-profile-evidence-"));
  await fs.writeFile(path.join(out, "home.png"), pagePng);
  await fs.writeFile(path.join(out, "hierarchy.json"), JSON.stringify({ windows: [] }));
  await fs.writeFile(path.join(out, "runtime.log"), "No runtime errors captured.\n");
  await writeJson(path.join(out, "native-ios-qa.json"), {
    platform: "native-ios",
    target: { workspace: "App.xcworkspace", scheme: "App", simulator: "iPhone 16" },
    tooling: { commandsOrToolCalls: ["capture screenshot"] },
    matrix: [
      { state: "home-light", appearance: "light", contentSize: "default", orientation: "portrait", screenshot: "home.png", uiHierarchy: "hierarchy.json", result: "pass" },
      { state: "home-dark", appearance: "dark", contentSize: "default", orientation: "portrait", screenshot: "home.png", uiHierarchy: "hierarchy.json", result: "pass" },
      { state: "home-large", appearance: "light", contentSize: "accessibilityLarge", orientation: "portrait", screenshot: "home.png", uiHierarchy: "hierarchy.json", result: "pass" },
      { state: "home-keyboard", appearance: "light", contentSize: "default", orientation: "portrait", keyboard: true, screenshot: "home.png", uiHierarchy: "hierarchy.json", result: "pass" }
    ],
    checks: { logsReviewed: "checked" },
    logs: "runtime.log"
  });

  await assert.rejects(runScript(["scripts/native-qa-report.mjs", "--report", path.join(out, "native-ios-qa.json"), "--out", out]), /native-qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "native-design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("required profile lacks unique screenshot/tree evidence")));
});

test("native-qa-report does not infer iOS keyboard coverage from state names", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-native-keyboard-name-"));
  await fs.writeFile(path.join(out, "home.png"), pagePng);
  await fs.writeFile(path.join(out, "hierarchy.json"), JSON.stringify({ windows: [] }));
  await fs.writeFile(path.join(out, "runtime.log"), "No runtime errors captured.\n");
  await writeJson(path.join(out, "native-ios-qa.json"), {
    platform: "native-ios",
    target: { workspace: "App.xcworkspace", scheme: "App", simulator: "iPhone 16" },
    tooling: { commandsOrToolCalls: ["capture screenshot"] },
    matrix: [
      { state: "home-light", appearance: "light", contentSize: "default", orientation: "portrait", screenshot: "home.png", uiHierarchy: "hierarchy.json", result: "pass" },
      { state: "home-dark", appearance: "dark", contentSize: "default", orientation: "portrait", screenshot: "home.png", uiHierarchy: "hierarchy.json", result: "pass" },
      { state: "home-large", appearance: "light", contentSize: "accessibilityLarge", orientation: "portrait", screenshot: "home.png", uiHierarchy: "hierarchy.json", result: "pass" },
      { state: "form-focused", appearance: "light", contentSize: "default", orientation: "portrait", screenshot: "home.png", uiHierarchy: "hierarchy.json", result: "pass" }
    ],
    checks: { logsReviewed: "checked" },
    logs: "runtime.log"
  });

  await assert.rejects(runScript(["scripts/native-qa-report.mjs", "--report", path.join(out, "native-ios-qa.json"), "--out", out]), /native-qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "native-design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("required profile not covered: keyboard-focused")));
});

test("native-qa-report does not infer Android IME coverage from state names", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-native-ime-name-"));
  await fs.writeFile(path.join(out, "home.png"), pagePng);
  await fs.writeFile(path.join(out, "tree.xml"), "<hierarchy />");
  await fs.writeFile(path.join(out, "runtime.log"), "No runtime errors captured.\n");
  await writeJson(path.join(out, "native-android-qa.json"), {
    platform: "native-android",
    target: { module: ":app", variant: "debug", device: "Pixel 8", apiLevel: 35 },
    tooling: { commandsOrToolCalls: ["adb exec-out screencap -p"] },
    matrix: [
      { state: "home-light", theme: "light", fontScale: 1, displaySize: "default", screenshot: "home.png", uiTree: "tree.xml", result: "pass" },
      { state: "home-dark", theme: "dark", fontScale: 1, displaySize: "default", screenshot: "home.png", uiTree: "tree.xml", result: "pass" },
      { state: "home-large", theme: "light", fontScale: 1.3, displaySize: "default", screenshot: "home.png", uiTree: "tree.xml", result: "pass" },
      { state: "ime-focused", theme: "light", fontScale: 1, displaySize: "default", screenshot: "home.png", uiTree: "tree.xml", result: "pass" }
    ],
    checks: { logsReviewed: "checked" },
    logs: "runtime.log"
  });

  await assert.rejects(runScript(["scripts/native-qa-report.mjs", "--report", path.join(out, "native-android-qa.json"), "--out", out]), /native-qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "native-design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("required profile not covered: ime-focused")));
});

test("native-qa-report rejects string-only not-applicable profile records", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-native-not-applicable-string-"));
  await fs.writeFile(path.join(out, "home.png"), pagePng);
  await fs.writeFile(path.join(out, "hierarchy.json"), JSON.stringify({ windows: [] }));
  await fs.writeFile(path.join(out, "runtime.log"), "No runtime errors captured.\n");
  await writeJson(path.join(out, "native-ios-qa.json"), {
    platform: "native-ios",
    target: { workspace: "App.xcworkspace", scheme: "App", simulator: "iPhone 16" },
    tooling: { commandsOrToolCalls: ["capture screenshot"] },
    matrix: [
      { state: "home-light", appearance: "light", contentSize: "default", orientation: "portrait", screenshot: "home.png", uiHierarchy: "hierarchy.json", result: "pass" },
      { state: "home-dark", appearance: "dark", contentSize: "default", orientation: "portrait", screenshot: "home.png", uiHierarchy: "hierarchy.json", result: "pass" },
      { state: "home-large", appearance: "light", contentSize: "accessibilityLarge", orientation: "portrait", screenshot: "home.png", uiHierarchy: "hierarchy.json", result: "pass" }
    ],
    notApplicableProfiles: {
      "keyboard-focused": "Read-only screen has no editable field."
    },
    checks: { logsReviewed: "checked" },
    logs: "runtime.log"
  });

  await assert.rejects(runScript(["scripts/native-qa-report.mjs", "--report", path.join(out, "native-ios-qa.json"), "--out", out]), /native-qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "native-design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("must include reason and evidence object")));
});

test("native-qa-report sanitizes report-provided paths and accepts VP8 WebP screenshots", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-native-webp-redact-"));
  await writeNativeProfileArtifacts(out, ["home-light", "home-dark", "home-large", "home-keyboard"], {
    imageBytes: webpVp8Bytes(375, 700),
    imageExt: "webp",
  });
  await fs.writeFile(path.join(out, "runtime.log"), "No runtime errors captured.\n");
  await writeJson(path.join(out, "native-ios-qa.json"), {
    platform: "native-ios",
    target: { workspace: "App.xcworkspace", scheme: "App", simulator: "iPhone 16" },
    tooling: { commandsOrToolCalls: ["capture screenshot"] },
    matrix: [
      { state: "home-light", appearance: "light", contentSize: "default", orientation: "portrait", screenshot: "home-light.webp", uiHierarchy: "home-light-hierarchy.json", result: "pass" },
      { state: "home-dark", appearance: "dark", contentSize: "default", orientation: "portrait", screenshot: "home-dark.webp", uiHierarchy: "home-dark-hierarchy.json", result: "pass" },
      { state: "home-large", appearance: "light", contentSize: "accessibilityLarge", orientation: "portrait", screenshot: "home-large.webp", uiHierarchy: "home-large-hierarchy.json", result: "pass" },
      { state: "home-keyboard", appearance: "light", contentSize: "default", orientation: "portrait", keyboard: true, screenshot: "home-keyboard.webp", uiHierarchy: "home-keyboard-hierarchy.json", result: "pass" }
    ],
    checks: { logsReviewed: "checked" },
    logs: "runtime.log",
    warnings: ["see /Users/alice/project/private.log and /workspaces/customer/app/log.txt; public docs remain https://example.com/path/name"]
  });

  await runScript(["scripts/native-qa-report.mjs", "--report", path.join(out, "native-ios-qa.json"), "--out", out]);
  const raw = await fs.readFile(path.join(out, "native-design-qa.json"), "utf8");
  const qa = JSON.parse(raw);
  assert.equal(qa.status, "pass");
  assert.equal(qa.evidence.screenshots[0].width, 375);
  assert.equal(raw.includes("alice"), false);
  assert.equal(raw.includes("/workspaces/customer"), false);
  assert.ok(raw.includes("https://example.com/path/name"));
  assert.ok(raw.includes("[absolute-path-redacted]"));
});

test("native-qa-report accepts not-applicable keyboard profile only with hierarchy evidence", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-native-not-applicable-"));
  await writeNativeProfileArtifacts(out, ["home-light", "home-dark", "home-large"], {
    treeText: "<hierarchy><window label=\"Read only\" /></hierarchy>",
  });
  await fs.writeFile(path.join(out, "keyboard-not-applicable-hierarchy.json"), "<hierarchy><window label=\"Read only\" /></hierarchy>");
  await fs.writeFile(path.join(out, "runtime.log"), "No runtime errors captured.\n");
  await writeJson(path.join(out, "native-ios-qa.json"), {
    platform: "native-ios",
    target: { workspace: "App.xcworkspace", scheme: "App", simulator: "iPhone 16" },
    tooling: { commandsOrToolCalls: ["capture screenshot"] },
    matrix: [
      { state: "home-light", appearance: "light", contentSize: "default", orientation: "portrait", screenshot: "home-light.png", uiHierarchy: "home-light-hierarchy.json", result: "pass" },
      { state: "home-dark", appearance: "dark", contentSize: "default", orientation: "portrait", screenshot: "home-dark.png", uiHierarchy: "home-dark-hierarchy.json", result: "pass" },
      { state: "home-large", appearance: "light", contentSize: "accessibilityLarge", orientation: "portrait", screenshot: "home-large.png", uiHierarchy: "home-large-hierarchy.json", result: "pass" }
    ],
    notApplicableProfiles: {
      "keyboard-focused": {
        "reason": "Read-only screen has no editable field in the hierarchy.",
        "evidence": "keyboard-not-applicable-hierarchy.json"
      }
    },
    checks: { logsReviewed: "checked" },
    logs: "runtime.log"
  });

  await runScript(["scripts/native-qa-report.mjs", "--report", path.join(out, "native-ios-qa.json"), "--out", out]);
  const qa = JSON.parse(await fs.readFile(path.join(out, "native-design-qa.json"), "utf8"));
  assert.equal(qa.status, "pass");
  assert.ok(qa.warnings.some((warning) => warning.includes("required profile marked not applicable: keyboard-focused")));
});

test("native-qa-report rejects not-applicable keyboard profile when hierarchy has editable fields", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-native-not-applicable-editable-"));
  await fs.writeFile(path.join(out, "home.png"), pagePng);
  await fs.writeFile(path.join(out, "hierarchy.json"), "<hierarchy><XCUIElementTypeTextField /></hierarchy>");
  await fs.writeFile(path.join(out, "runtime.log"), "No runtime errors captured.\n");
  await writeJson(path.join(out, "native-ios-qa.json"), {
    platform: "native-ios",
    target: { workspace: "App.xcworkspace", scheme: "App", simulator: "iPhone 16" },
    tooling: { commandsOrToolCalls: ["capture screenshot"] },
    matrix: [
      { state: "home-light", appearance: "light", contentSize: "default", orientation: "portrait", screenshot: "home.png", uiHierarchy: "hierarchy.json", result: "pass" },
      { state: "home-dark", appearance: "dark", contentSize: "default", orientation: "portrait", screenshot: "home.png", uiHierarchy: "hierarchy.json", result: "pass" },
      { state: "home-large", appearance: "light", contentSize: "accessibilityLarge", orientation: "portrait", screenshot: "home.png", uiHierarchy: "hierarchy.json", result: "pass" }
    ],
    notApplicableProfiles: {
      "keyboard-focused": { "reason": "No keyboard flow.", "evidence": "hierarchy.json" }
    },
    checks: { logsReviewed: "checked" },
    logs: "runtime.log"
  });

  await assert.rejects(runScript(["scripts/native-qa-report.mjs", "--report", path.join(out, "native-ios-qa.json"), "--out", out]), /native-qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "native-design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("contains editable fields")));
});

test("native-qa-report partial exit semantics match web QA", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-native-partial-exit-"));
  await fs.writeFile(path.join(out, "home.png"), pagePng);
  await fs.writeFile(path.join(out, "hierarchy.json"), JSON.stringify({ windows: [] }));
  await fs.writeFile(path.join(out, "runtime.log"), "No runtime errors captured.\n");
  await writeJson(path.join(out, "native-ios-qa.json"), {
    platform: "native-ios",
    target: { workspace: "App.xcworkspace", scheme: "App", simulator: "iPhone 16" },
    tooling: { commandsOrToolCalls: ["capture screenshot"] },
    matrix: [
      { state: "home", appearance: "light", contentSize: "default", orientation: "portrait", screenshot: "home.png", uiHierarchy: "hierarchy.json", result: "pass" }
    ],
    checks: { logsReviewed: "checked" },
    logs: "runtime.log"
  });

  await assert.rejects(
    runScript(["scripts/native-qa-report.mjs", "--report", path.join(out, "native-ios-qa.json"), "--out", out, "--partial"]),
    (error) => error.code === 2,
  );
  await runScript(["scripts/native-qa-report.mjs", "--report", path.join(out, "native-ios-qa.json"), "--out", out, "--partial", "--allow-partial-exit-zero"]);
  const qa = JSON.parse(await fs.readFile(path.join(out, "native-design-qa.json"), "utf8"));
  assert.equal(qa.status, "incomplete");
  assert.equal(qa.acceptanceReady, false);
});

test("native-qa-report rejects missing Android screenshot, tree, and logs", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-native-android-"));
  await writeJson(path.join(out, "native-android-qa.json"), {
    platform: "native-android",
    target: {
      module: ":app",
      variant: "debug",
      device: "Pixel 8",
      apiLevel: 35
    },
    tooling: {
      commandsOrToolCalls: ["./gradlew :app:assembleDebug", "adb exec-out screencap -p"]
    },
    matrix: [
      {
        state: "home",
        theme: "light",
        fontScale: 1,
        displaySize: "default",
        screenshot: "missing.png",
        uiTree: "missing.xml",
        result: "pass"
      }
    ],
    checks: { logsReviewed: "checked" },
    logs: "missing-logcat.txt",
    blockers: [],
    warnings: []
  });

  await assert.rejects(runScript(["scripts/native-qa-report.mjs", "--report", path.join(out, "native-android-qa.json"), "--out", out]), /native-qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "native-design-qa.json"), "utf8"));
  assert.equal(qa.status, "incomplete");
  assert.ok(qa.incomplete.some((issue) => issue.includes("screenshot missing.png file is missing")));
  assert.ok(qa.incomplete.some((issue) => issue.includes("uiTree missing.xml file is missing")));
  assert.ok(qa.incomplete.some((issue) => issue.includes("logs: missing-logcat.txt file is missing")));
});

test("native-qa-report treats needs-review as incomplete acceptance evidence", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-native-review-"));
  await fs.writeFile(path.join(out, "home.png"), pagePng);
  await fs.writeFile(path.join(out, "tree.xml"), "<hierarchy />");
  await fs.writeFile(path.join(out, "runtime.log"), "No runtime errors captured.\n");
  await writeJson(path.join(out, "native-android-qa.json"), {
    platform: "native-android",
    target: { module: ":app", variant: "debug", device: "Pixel 8", apiLevel: 35 },
    tooling: { commandsOrToolCalls: ["./gradlew :app:assembleDebug"] },
    matrix: [
      {
        state: "home",
        profiles: ["default-light", "dark", "font-scale-large", "ime-focused"],
        theme: "light",
        fontScale: 1.3,
        displaySize: "default",
        ime: true,
        screenshot: "home.png",
        uiTree: "tree.xml",
        result: "needs-review"
      }
    ],
    checks: { logsReviewed: "checked" },
    logs: "runtime.log"
  });

  await assert.rejects(runScript(["scripts/native-qa-report.mjs", "--report", path.join(out, "native-android-qa.json"), "--out", out]), /native-qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "native-design-qa.json"), "utf8"));
  assert.equal(qa.status, "incomplete");
  assert.equal(qa.acceptanceReady, false);
  assert.ok(qa.incomplete.some((issue) => issue.includes("result needs review")));
});

test("native-qa-report fails crash signatures in logs", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-native-crash-"));
  await fs.writeFile(path.join(out, "home.png"), pagePng);
  await fs.writeFile(path.join(out, "tree.xml"), "<hierarchy />");
  await fs.writeFile(path.join(out, "runtime.log"), "FATAL EXCEPTION: main\n");
  await writeJson(path.join(out, "native-android-qa.json"), {
    platform: "native-android",
    target: { module: ":app", variant: "debug", device: "Pixel 8", apiLevel: 35 },
    tooling: { commandsOrToolCalls: ["./gradlew :app:assembleDebug"] },
    matrix: [
      {
        state: "home",
        profiles: ["default-light", "dark", "font-scale-large", "ime-focused"],
        theme: "light",
        fontScale: 1.3,
        displaySize: "default",
        ime: true,
        screenshot: "home.png",
        uiTree: "tree.xml",
        result: "pass"
      }
    ],
    checks: { logsReviewed: "checked" },
    logs: "runtime.log"
  });

  await assert.rejects(runScript(["scripts/native-qa-report.mjs", "--report", path.join(out, "native-android-qa.json"), "--out", out]), /native-qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "native-design-qa.json"), "utf8"));
  assert.equal(qa.status, "fail");
  assert.ok(qa.blockers.some((issue) => issue.includes("contains crash signature")));
});
