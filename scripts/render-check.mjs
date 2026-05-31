#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const DEFAULT_VIEWPORTS = [
  { width: 320, height: 900 },
  { width: 375, height: 900 },
  { width: 414, height: 900 },
  { width: 768, height: 1024 },
  { width: 1024, height: 900 },
  { width: 1280, height: 900 },
  { width: 1440, height: 1000 },
];

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

async function readJsonIfExists(file) {
  if (!file) return {};
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const candidates = [
      process.env.DESIGN_DIRECTOR_NODE_MODULES,
      process.env.NODE_REPL_NODE_MODULE_DIRS,
      path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules"),
    ]
      .filter(Boolean)
      .flatMap((entry) => entry.split(":"))
      .filter(Boolean);

    for (const dir of candidates) {
      try {
        const requireFromDir = createRequire(path.join(dir, "design-director-require.cjs"));
        return requireFromDir("playwright");
      } catch {
        // Try the next candidate.
      }
    }

    throw new Error("Playwright is required for render-check.mjs. Install it in the target project or set DESIGN_DIRECTOR_NODE_MODULES to a node_modules directory containing Playwright.");
  }
}

async function launchBrowser(chromium) {
  try {
    return await chromium.launch();
  } catch (firstError) {
    const fallbackErrors = [firstError.message];
    try {
      return await chromium.launch({ channel: "chrome" });
    } catch (error) {
      fallbackErrors.push(error.message);
    }
    const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    try {
      await fs.access(macChrome);
      return await chromium.launch({ executablePath: macChrome });
    } catch (error) {
      fallbackErrors.push(error.message);
    }
    throw new Error(`Unable to launch Playwright browser. Tried bundled Chromium and system Chrome. ${fallbackErrors.join(" | ")}`);
  }
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "state";
}

function resolveTarget(baseUrl, state) {
  if (state.url) return state.url;
  if (state.path) return new URL(state.path, baseUrl).toString();
  return baseUrl;
}

function parseViewports(value) {
  if (!value) return null;
  return value.split(",").map((part) => {
    const [width, height = "900"] = part.split("x");
    return { width: Number(width), height: Number(height) };
  });
}

async function runActions(page, actions = [], timeout = 15000) {
  for (const action of actions) {
    const type = action.type || action.action;
    if (type === "wait") {
      await page.waitForTimeout(action.ms ?? action.waitMs ?? 250);
    } else if (type === "waitForSelector") {
      await page.waitForSelector(action.selector, { timeout: action.timeout ?? timeout, state: action.state || "visible" });
    } else if (type === "click") {
      await page.locator(action.selector).first().click({ timeout: action.timeout ?? timeout });
    } else if (type === "fill") {
      await page.locator(action.selector).first().fill(action.value ?? "", { timeout: action.timeout ?? timeout });
    } else if (type === "type") {
      await page.locator(action.selector).first().type(action.value ?? "", { delay: action.delay ?? 0, timeout: action.timeout ?? timeout });
    } else if (type === "focus") {
      await page.locator(action.selector).first().focus({ timeout: action.timeout ?? timeout });
    } else if (type === "hover") {
      await page.locator(action.selector).first().hover({ timeout: action.timeout ?? timeout });
    } else if (type === "press") {
      await page.locator(action.selector || "body").first().press(action.key, { timeout: action.timeout ?? timeout });
    } else if (type === "select") {
      await page.locator(action.selector).first().selectOption(action.value, { timeout: action.timeout ?? timeout });
    } else if (type === "check") {
      await page.locator(action.selector).first().check({ timeout: action.timeout ?? timeout });
    } else if (type === "uncheck") {
      await page.locator(action.selector).first().uncheck({ timeout: action.timeout ?? timeout });
    } else if (type === "scrollIntoView") {
      await page.locator(action.selector).first().scrollIntoViewIfNeeded({ timeout: action.timeout ?? timeout });
    } else if (type === "scrollBy") {
      await page.evaluate(({ x = 0, y = 0 }) => window.scrollBy(x, y), { x: action.x, y: action.y });
    } else if (type === "scrollTo") {
      await page.evaluate(({ x = 0, y = 0 }) => window.scrollTo(x, y), { x: action.x, y: action.y });
    } else {
      throw new Error(`Unknown state action: ${type}`);
    }
  }
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
    screenshots: [],
    states: [],
  };

  try {
    for (const state of states) {
      for (const viewport of viewports) {
        const page = await browser.newPage({ viewport });
        const consoleMessages = [];
        const pageErrors = [];
        page.on("console", (message) => {
          if (["error", "warning"].includes(message.type())) {
            consoleMessages.push({
              type: message.type(),
              text: message.text(),
              location: message.location(),
            });
          }
        });
        page.on("pageerror", (error) => {
          pageErrors.push({ message: error.message, stack: error.stack });
        });

        const targetUrl = resolveTarget(baseUrl, state);
        const stateName = state.name || slug(state.path || state.url || "default");
        const fileName = `${slug(stateName)}-${viewport.width}.png`;
        const screenshotPath = path.join(screenshotDir, fileName);
        const entry = {
          state: stateName,
          url: targetUrl,
          viewport,
          screenshot: screenshotPath,
          consoleMessages,
          pageErrors,
          ok: false,
        };

        try {
          await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: args.timeout });
          if (state.waitForSelector || config.waitForSelector) {
            await page.waitForSelector(state.waitForSelector || config.waitForSelector, { timeout: args.timeout });
          }
          if (state.waitMs || config.waitMs) {
            await page.waitForTimeout(state.waitMs || config.waitMs);
          }
          await runActions(page, [...(config.actions || []), ...(state.actions || [])], args.timeout);
          await page.screenshot({ path: screenshotPath, fullPage: Boolean(config.fullPage ?? true) });
          entry.title = await page.title();
          entry.finalUrl = page.url();
          entry.ok = pageErrors.length === 0;
        } catch (error) {
          entry.error = error.message;
        } finally {
          await page.close();
        }

        results.screenshots.push(screenshotPath);
        results.states.push(entry);
      }
    }
  } finally {
    await browser.close();
  }

  await fs.writeFile(path.join(outDir, "render-results.json"), `${JSON.stringify(results, null, 2)}\n`);
  const failures = results.states.filter((state) => state.error || state.pageErrors.length);
  console.log(`render-check: wrote ${path.join(outDir, "render-results.json")} (${failures.length} failure candidates)`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`render-check: ${error.message}`);
  process.exit(1);
});
