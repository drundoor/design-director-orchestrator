#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { runActions } from "./lib/actions.mjs";
import { DEFAULT_VIEWPORTS, launchBrowser, loadPlaywright, parseViewports, preparePage, readJsonIfExists, relativeArtifactPath, resolveTarget, slug, stableHash, stateIdFor, stateNameFor } from "./lib/browser-utils.mjs";

function parseArgs(argv) {
  const args = { out: ".design-director", timeout: 15000 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--url") {
      args.url = argv[++i];
    } else if (arg === "--config") {
      args.config = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--timeout") {
      args.timeout = Number(argv[++i]);
    } else if (arg === "--viewports") {
      args.viewports = argv[++i];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function usage() {
  return `Usage: render-check.mjs --url <url> [--config .design-director/render.config.json] [--out .design-director]

Captures screenshots and console/page errors for configured states and viewports.

Config shape:
{
  "url": "http://localhost:5173",
  "states": [
    { "name": "default", "path": "/" },
    { "name": "cards", "url": "http://localhost:5173/?view=cards" }
  ],
  "viewports": [{ "width": 375, "height": 900 }],
  "waitForSelector": "main",
  "states": [
    {
      "name": "search-open",
      "path": "/",
      "actions": [
        { "type": "fill", "selector": "#searchInput", "value": "ark" },
        { "type": "wait", "ms": 300 }
      ]
    }
  ]
}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const config = await readJsonIfExists(args.config);
  const baseUrl = args.url || config.url;
  if (!baseUrl) throw new Error("Missing --url or config.url");

  const states = config.states?.length ? config.states : [{ name: "default" }];
  const viewports = parseViewports(args.viewports) || config.viewports || DEFAULT_VIEWPORTS;
  const outDir = path.resolve(args.out);
  const screenshotDir = path.join(outDir, "screenshots");
  await fs.mkdir(screenshotDir, { recursive: true });

  const { chromium } = await loadPlaywright();

  const browser = await launchBrowser(chromium);
  const results = {
    tool: "render-check",
    generatedAt: new Date().toISOString(),
    baseUrl,
    config: args.config || null,
    qaProfile: config.qaProfile || null,
    surface: config.surface || null,
    platform: config.platform || "web",
    screenshots: [],
    states: [],
  };

  try {
    for (const [stateIndex, state] of states.entries()) {
      for (const viewport of viewports) {
        const page = await browser.newPage({ viewport });
        const consoleMessages = [];
        const consoleErrors = [];
        const consoleWarnings = [];
        const pageErrors = [];
        page.on("console", (message) => {
          if (["error", "warning"].includes(message.type())) {
            const entry = {
              type: message.type(),
              text: message.text(),
              location: message.location(),
            };
            consoleMessages.push(entry);
            if (message.type() === "error") consoleErrors.push(entry);
            else consoleWarnings.push(entry);
          }
        });
        page.on("pageerror", (error) => {
          pageErrors.push({ message: error.message, stack: error.stack });
        });

        const targetUrl = resolveTarget(baseUrl, state);
        const stateName = stateNameFor(state);
        const stateId = stateIdFor(state, stateIndex);
        const routeHash = stableHash(targetUrl);
        const fileName = `${slug(stateId)}-${stateIndex + 1}-${routeHash}-${viewport.width}x${viewport.height}.png`;
        const screenshotPath = path.join(screenshotDir, fileName);
        const screenshotArtifactPath = relativeArtifactPath(outDir, screenshotPath);
        const entry = {
          state: stateName,
          stateId,
          stateIndex,
          routeHash,
          url: targetUrl,
          viewport,
          screenshot: screenshotArtifactPath,
          actions: [...(config.actions || []), ...(state.actions || [])],
          discoveredFrom: state.discoveredFrom || null,
          consoleMessages,
          consoleErrors,
          consoleWarnings,
          pageErrors,
          ok: false,
        };

        try {
          await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: args.timeout });
          await preparePage(page, config, state, args.timeout);
          entry.actionArtifacts = await runActions(page, [...(config.actions || []), ...(state.actions || [])], {
            timeout: args.timeout,
            screenshotDir,
            artifactPathBase: outDir,
            stateName: stateId,
            viewport,
          });
          await page.screenshot({ path: screenshotPath, fullPage: Boolean(config.fullPage ?? true) });
          results.screenshots.push(screenshotArtifactPath);
          entry.title = await page.title();
          entry.finalUrl = page.url();
          entry.ok = pageErrors.length === 0 && consoleErrors.length === 0;
        } catch (error) {
          entry.error = error.message;
        } finally {
          await page.close();
        }

        results.states.push(entry);
      }
    }
  } finally {
    await browser.close();
  }

  await fs.writeFile(path.join(outDir, "render-results.json"), `${JSON.stringify(results, null, 2)}\n`);
  const failures = results.states.filter((state) => state.error || state.pageErrors.length || state.consoleErrors?.length);
  console.log(`render-check: wrote ${path.join(outDir, "render-results.json")} (${failures.length} failure candidates)`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`render-check: ${error.message}`);
  process.exit(1);
});
