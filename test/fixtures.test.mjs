import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const node = process.execPath;
const png1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");

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
  if (!overrides.skipScreenshotFile) {
    await fs.mkdir(path.dirname(screenshot), { recursive: true });
    await fs.writeFile(screenshot, overrides.screenshotBytes || png1x1);
  }
  const state = {
    state: "default",
    url: "http://example.invalid",
    finalUrl: "http://example.invalid",
    viewport: { width: 375, height: 700 },
    screenshot,
    pageErrors: [],
    consoleMessages: [],
    consoleErrors: [],
    consoleWarnings: [],
    ...(overrides.state || {}),
  };
  await writeJson(path.join(out, "render-results.json"), {
    screenshots: [screenshot],
    states: [state],
    ...(overrides.render || {}),
  });
  await writeJson(path.join(out, "dom-audit.json"), overrides.dom || { states: [{ state: "default", url: "http://example.invalid", viewport: { width: 375, height: 700 }, audit: { interactiveControls: [] } }] });
  await writeJson(path.join(out, "visual-consistency-audit.json"), overrides.visual || { states: [{ state: "default", url: "http://example.invalid", viewport: { width: 375, height: 700 }, audit: { blockers: [], warnings: [] } }] });
  if (!overrides.skipDiscovery) {
    await writeJson(path.join(out, "discovered-states.json"), overrides.discovery || { candidates: [{ kind: "select" }], scans: [{ ok: true }] });
  }
  if (!overrides.skipNotes) {
    await writeInspectedNotes(path.join(out, "screenshot-notes.md"), [{ path: screenshot }]);
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

test("visual audit leaves fixed and hierarchy fixtures without blockers", async () => {
  for (const fixture of ["fixed.html", "hierarchy.html", "data-grid.html"]) {
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
  assert.ok(render.screenshots.some((screenshot) => path.basename(screenshot) === "default-375x700.png"));
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

test("qa-report initializes notes but keeps template as blocker", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-"));
  await fs.mkdir(path.join(out, "screenshots"), { recursive: true });
  await fs.writeFile(path.join(out, "screenshots/default-375x700.png"), png1x1);
  await fs.writeFile(path.join(out, "render-results.json"), JSON.stringify({
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
  await writeJson(path.join(out, "dom-audit.json"), { states: [{ state: "default", url: "http://example.invalid", viewport: { width: 375, height: 700 }, audit: { interactiveControls: [] } }] });
  await writeJson(path.join(out, "visual-consistency-audit.json"), { states: [{ state: "default", url: "http://example.invalid", viewport: { width: 375, height: 700 }, audit: { blockers: [], warnings: [] } }] });

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
  assert.ok(qa.incomplete.some((issue) => issue.includes(`${screenshot}: screenshot file is missing`)));
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
  assert.equal(qa.evidenceCompleteness.artifacts.stateDiscovery.waived, true);
});

test("qa-report requires DOM and visual audit coverage for every rendered state", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-coverage-"));
  const first = path.join(out, "screenshots/default-375x700.png");
  const second = path.join(out, "screenshots/details-375x700.png");
  await fs.mkdir(path.dirname(first), { recursive: true });
  await fs.writeFile(first, png1x1);
  await fs.writeFile(second, png1x1);
  await writeJson(path.join(out, "render-results.json"), {
    screenshots: [first, second],
    states: [
      { state: "default", url: "http://example.invalid", finalUrl: "http://example.invalid", viewport: { width: 375, height: 700 }, screenshot: first, pageErrors: [], consoleErrors: [], consoleWarnings: [] },
      { state: "details", url: "http://example.invalid/details", finalUrl: "http://example.invalid/details", viewport: { width: 375, height: 700 }, screenshot: second, pageErrors: [], consoleErrors: [], consoleWarnings: [] }
    ]
  });
  await writeJson(path.join(out, "dom-audit.json"), { states: [{ state: "default", url: "http://example.invalid", viewport: { width: 375, height: 700 }, audit: { interactiveControls: [] } }] });
  await writeJson(path.join(out, "visual-consistency-audit.json"), { states: [{ state: "default", url: "http://example.invalid", viewport: { width: 375, height: 700 }, audit: { blockers: [], warnings: [] } }] });
  await writeJson(path.join(out, "discovered-states.json"), { candidates: [], scans: [{ ok: true }] });
  await writeInspectedNotes(path.join(out, "screenshot-notes.md"), [{ path: first }, { path: second, state: "details", url: "http://example.invalid/details" }]);

  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.equal(qa.status, "incomplete");
  assert.ok(qa.incomplete.some((issue) => issue.includes("DOM audit missing")));
  assert.ok(qa.incomplete.some((issue) => issue.includes("visual audit missing")));
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

test("qa-report rejects fake screenshot files", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-fake-shot-"));
  await createQaArtifacts(out, { screenshotBytes: Buffer.from("png-placeholder") });
  await assert.rejects(runScript(["scripts/qa-report.mjs", "--out", out]), /qa-report/);
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.ok(qa.incomplete.some((issue) => issue.includes("not a valid PNG")));
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

test("native-qa-report passes complete iOS evidence", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-native-ios-"));
  await fs.writeFile(path.join(out, "home.png"), png1x1);
  await fs.writeFile(path.join(out, "hierarchy.json"), JSON.stringify({ windows: [] }));
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
        state: "home",
        appearance: "light",
        contentSize: "default",
        orientation: "portrait",
        screenshot: "home.png",
        uiHierarchy: "hierarchy.json",
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
