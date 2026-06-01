import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const node = process.execPath;

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
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

test("fast mockup init creates isolated context and assert rejects placeholder", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dd-fast-path-"));
  await runScript(["scripts/init-mockup.mjs", "--target-root", root, "--slug", "support-dashboard", "--surface", "dashboard"]);
  const contextPath = path.join(root, ".design-director/mockups/support-dashboard/run-context.json");
  const context = JSON.parse(await fs.readFile(contextPath, "utf8"));
  assert.equal(context.surface, "dashboard");
  assert.ok(context.outputRoot.startsWith(root));

  await assert.rejects(
    runScript(["scripts/assert-output-root.mjs", "--context", contextPath]),
    /DESIGN_DIRECTOR_PLACEHOLDER/,
  );

  await fs.writeFile(path.join(context.outputRoot, "index.html"), "<!doctype html><main data-qa=\"decision-area\">Queue risk</main>");
  const { stdout } = await runScript(["scripts/assert-output-root.mjs", "--context", contextPath, "--json"]);
  const result = JSON.parse(stdout);
  assert.equal(result.ok, true);
});

test("reference seed appends selected local pack once", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dd-reference-pack-"));
  await runScript(["scripts/init-mockup.mjs", "--target-root", root, "--slug", "table", "--surface", "data-table"]);
  const contextPath = path.join(root, ".design-director/mockups/table/run-context.json");
  await runScript(["scripts/seed-reference-ledger.mjs", "--context", contextPath, "--pack", "data-table"]);
  await runScript(["scripts/seed-reference-ledger.mjs", "--context", contextPath, "--pack", "data-table"]);
  const ledger = await fs.readFile(path.join(root, ".design-director/mockups/table/research-ledger.md"), "utf8");
  assert.equal((ledger.match(/Reference Pack: data-table/g) || []).length, 1);
  assert.match(ledger, /Cloudscape table/);
});

test("peer evidence validator accepts compact available evidence and rejects skipped peers", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dd-peer-evidence-"));
  await fs.writeFile(path.join(out, "peer-execution.md"), `# Peer Skill Evidence

## impeccable-execution

- Status: available
- Outcome: Loaded Impeccable and ran craft, bolder, layout, and typeset checks.
- Commands/checks: craft, bolder, layout, typeset
`);
  await writeJson(path.join(out, "design-quality.json"), {
    peerSkills: {
      impeccable: {
        status: "available",
        executionEvidence: {
          path: "peer-execution.md#impeccable-execution",
          commands: ["craft", "bolder", "layout", "typeset"],
          summary: "Loaded and applied checks.",
        },
      },
    },
  });
  const ok = await runScript(["scripts/validate-peer-evidence.mjs", "--out", out, "--design-quality", path.join(out, "design-quality.json")]);
  assert.match(ok.stdout, /"ok": true/);

  await writeJson(path.join(out, "design-quality.json"), {
    peerSkills: {
      hallmark: { status: "skipped-while-available" },
    },
  });
  await assert.rejects(
    runScript(["scripts/validate-peer-evidence.mjs", "--out", out, "--design-quality", path.join(out, "design-quality.json")]),
    /skipped while available/,
  );
});

test("source caveat audit requires local label for simulated data", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dd-caveat-"));
  const html = path.join(root, "page.html");
  const config = path.join(root, "render.config.json");
  await fs.writeFile(html, "<!doctype html><main><h1>Ops Dashboard</h1></main>");
  await writeJson(config, {
    url: `file://${html}`,
    dataCaveat: {
      truthStatus: "simulated",
      sourceLabel: "Simulated data",
      requiredInBrief: true,
      requiredInQa: true,
      uiPolicy: "source-row-caption-or-footnote",
      prominentUiBannerAllowed: false,
    },
  });
  await assert.rejects(
    runScript(["scripts/source-caveat-audit.mjs", "--config", config]),
    /source label/,
  );

  await fs.writeFile(html, "<!doctype html><main><p>Source: Simulated data</p></main>");
  const { stdout } = await runScript(["scripts/source-caveat-audit.mjs", "--config", config]);
  assert.match(stdout, /"ok": true/);

  await fs.writeFile(html, "<!doctype html><main><p class=\"source-pill\">Simulated data</p></main>");
  await assert.rejects(
    runScript(["scripts/source-caveat-audit.mjs", "--config", config]),
    /must not be styled as a pill/,
  );
});

test("draft web QA writes draft-only design quality artifact", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dd-draft-qa-"));
  const html = path.join(root, "dashboard.html");
  const out = path.join(root, ".design-director");
  await fs.writeFile(html, `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Support Queue</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; }
      main { padding: 24px; }
      .panel { border: 1px solid #ccd3d0; padding: 16px; }
    </style>
  </head>
  <body>
    <main data-qa="decision-area">
      <p>Source: Simulated data</p>
      <section class="panel"><h1>Queue Risk</h1><p>Billing needs attention first.</p></section>
    </main>
  </body>
</html>`);

  await runScript([
    "scripts/run-web-qa.mjs",
    "--file",
    html,
    "--out",
    out,
    "--static",
    "--draft",
    "--viewport-preset",
    "mockup",
    "--surface",
    "dashboard",
    "--recipe",
    "dashboard-basic",
    "--caveat-policy",
    "simulated",
    "--timeout",
    "12000",
  ], { timeout: 90000 });
  const draft = JSON.parse(await fs.readFile(path.join(out, "design-quality.draft.json"), "utf8"));
  assert.equal(draft.finalArtifact, false);
  assert.equal(draft.acceptanceReady, false);
  assert.equal(draft.mode, "draft");
  assert.ok(draft.recipes.includes("dashboard-basic"));
  assert.equal(draft.dataCaveat.truthStatus, "simulated");
});
