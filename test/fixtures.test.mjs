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

async function runScript(args, options = {}) {
  return execFileAsync(node, args, {
    cwd: repoRoot,
    timeout: options.timeout || 40000,
    maxBuffer: 1024 * 1024 * 8,
    env: { ...process.env, ...options.env },
  });
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

test("qa-report initializes notes but keeps template as blocker", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-qa-"));
  await fs.writeFile(path.join(out, "render-results.json"), JSON.stringify({
    screenshots: [path.join(out, "screenshots/default-375.png")],
    states: [
      {
        state: "default",
        url: "http://example.invalid",
        finalUrl: "http://example.invalid",
        viewport: { width: 375, height: 900 },
        screenshot: path.join(out, "screenshots/default-375.png"),
        pageErrors: [],
        consoleMessages: []
      }
    ]
  }, null, 2));
  await fs.writeFile(path.join(out, "dom-audit.json"), JSON.stringify({ states: [] }));
  await fs.writeFile(path.join(out, "visual-consistency-audit.json"), JSON.stringify({ states: [] }));

  await assert.rejects(
    runScript(["scripts/qa-report.mjs", "--out", out, "--init-notes"]),
    /qa-report/,
  );

  const notes = await fs.readFile(path.join(out, "screenshot-notes.md"), "utf8");
  const qa = JSON.parse(await fs.readFile(path.join(out, "design-qa.json"), "utf8"));
  assert.match(notes, /Observation: TODO/);
  assert.ok(qa.blockers.some((blocker) => blocker.includes("screenshot inspection notes")));
  assert.ok(qa.blockers.some((blocker) => blocker.includes("state discovery output")));
});
