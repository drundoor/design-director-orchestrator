#!/usr/bin/env node

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const node = process.execPath;

async function run(args) {
  await execFileAsync(node, args, { cwd: repoRoot, maxBuffer: 1024 * 1024 * 8 });
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "design-director-web-smoke-"));
  const fixtureUrl = pathToFileURL(path.join(repoRoot, "fixtures/visual-invariants/hierarchy.html")).toString();
  const configPath = path.join(out, "render.config.json");
  await writeJson(configPath, {
    url: fixtureUrl,
    qaProfile: "static",
    viewports: [{ width: 375, height: 700 }],
    states: [{ name: "default" }]
  });
  await fs.writeFile(path.join(out, "design-brief.md"), "Source truth: static hierarchy smoke fixture.\nAnti-goals: no interactive controls.\nAcceptance: QA report passes.\n");

  await run(["scripts/render-check.mjs", "--config", configPath, "--out", out]);
  await run(["scripts/dom-audit.mjs", "--config", configPath, "--out", out]);
  await run(["scripts/visual-consistency-audit.mjs", "--config", configPath, "--out", out]);

  const render = JSON.parse(await fs.readFile(path.join(out, "render-results.json"), "utf8"));
  const screenshots = render.states.map((state) => ({
    path: state.screenshot,
    viewport: `${state.viewport.width}x${state.viewport.height}`,
    state: state.state,
    url: state.finalUrl || state.url
  }));
  const notes = screenshots.map((screenshot) => `## ${screenshot.path}

- Viewport: ${screenshot.viewport}
- State: ${screenshot.state}
- URL: ${screenshot.url}
- Observation: Smoke fixture rendered without visible interaction states.
- Pass/fail: Pass
- Issues found: None
- Waiver/evidence: N/A
`).join("\n");
  await fs.writeFile(path.join(out, "screenshot-notes.md"), `# Screenshot Inspection Notes\n\n${notes}`);
  await run(["scripts/qa-report.mjs", "--out", out, "--static"]);
  console.log(`smoke:web passed; artifacts are in ${out}`);
}

main().catch((error) => {
  console.error(`smoke:web failed: ${error.message}`);
  process.exit(1);
});
