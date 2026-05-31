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
  const args = { out: ".design-director", timeout: 15000, minTextPx: 12, minTargetPx: 44 };
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
    } else if (arg === "--min-text-px") {
      args.minTextPx = Number(argv[++i]);
    } else if (arg === "--min-target-px") {
      args.minTargetPx = Number(argv[++i]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function usage() {
  return `Usage: dom-audit.mjs --url <url> [--config .design-director/render.config.json] [--out .design-director]

Collects DOM evidence: overflow, clipped text candidates, tiny text candidates,
small tap targets, focusable elements without labels, and hover-only candidates.
Configured state actions are run before auditing so open dropdown/popover states
can be checked.`;
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

    throw new Error("Playwright is required for dom-audit.mjs. Install it in the target project or set DESIGN_DIRECTOR_NODE_MODULES to a node_modules directory containing Playwright.");
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

function resolveTarget(baseUrl, state) {
  if (state.url) return state.url;
  if (state.path) return new URL(state.path, baseUrl).toString();
  return baseUrl;
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
  const viewports = config.viewports || DEFAULT_VIEWPORTS;
  const outDir = path.resolve(args.out);
  await fs.mkdir(outDir, { recursive: true });

  const { chromium } = await loadPlaywright();

  const browser = await launchBrowser(chromium);
  const results = {
    tool: "dom-audit",
    generatedAt: new Date().toISOString(),
    baseUrl,
    states: [],
  };

  try {
    for (const state of states) {
      for (const viewport of viewports) {
        const page = await browser.newPage({ viewport });
        const targetUrl = resolveTarget(baseUrl, state);
        const entry = {
          state: state.name || "default",
          url: targetUrl,
          viewport,
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
          entry.audit = await page.evaluate(({ minTextPx, minTargetPx }) => {
            const interestingRoles = new Set(["button", "link", "menuitem", "tab", "checkbox", "radio", "switch"]);
            const selector = [
              "button",
              "a[href]",
              "input",
              "select",
              "textarea",
              "[role]",
              "[tabindex]:not([tabindex='-1'])",
              "[onclick]",
            ].join(",");
            const visible = (el) => {
              const rect = el.getBoundingClientRect();
              const style = getComputedStyle(el);
              return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
            };
            const labelFor = (el) => {
              const text = (el.innerText || el.textContent || "").trim();
              return el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("alt") || el.getAttribute("placeholder") || text;
            };
            const preview = (el) => {
              const rect = el.getBoundingClientRect();
              return {
                tag: el.tagName.toLowerCase(),
                role: el.getAttribute("role"),
                id: el.id || null,
                className: String(el.className || "").slice(0, 100),
                text: (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120),
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              };
            };

            const all = [...document.querySelectorAll("body *")].filter(visible);
            const overflow = {
              documentScrollWidth: document.documentElement.scrollWidth,
              documentClientWidth: document.documentElement.clientWidth,
              bodyScrollWidth: document.body?.scrollWidth || 0,
              bodyClientWidth: document.body?.clientWidth || 0,
              hasHorizontalOverflow:
                document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 ||
                (document.body && document.body.scrollWidth > document.body.clientWidth + 1),
            };

            const clipped = all
              .filter((el) => {
                const text = (el.innerText || el.textContent || "").trim();
                if (!text || text.length > 220) return false;
                return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
              })
              .slice(0, 80)
              .map(preview);

            const tinyText = all
              .filter((el) => {
                const text = (el.innerText || el.textContent || "").trim();
                if (!text) return false;
                const size = Number.parseFloat(getComputedStyle(el).fontSize);
                return size > 0 && size < minTextPx;
              })
              .slice(0, 80)
              .map((el) => ({ ...preview(el), fontSize: getComputedStyle(el).fontSize }));

            const targets = [...document.querySelectorAll(selector)].filter(visible);
            const smallTargets = targets
              .filter((el) => {
                const rect = el.getBoundingClientRect();
                const role = el.getAttribute("role");
                if (role && !interestingRoles.has(role)) return false;
                return rect.width < minTargetPx || rect.height < minTargetPx;
              })
              .slice(0, 80)
              .map(preview);

            const unlabeledFocusable = targets
              .filter((el) => !labelFor(el))
              .slice(0, 80)
              .map(preview);

            const hoverOnlyCandidates = all
              .filter((el) => {
                const text = `${el.className || ""} ${el.id || ""} ${el.getAttribute("aria-label") || ""}`.toLowerCase();
                return (text.includes("hover") || text.includes("tooltip")) && !el.matches("button,a,input,select,textarea,[tabindex]");
              })
              .slice(0, 80)
              .map(preview);

            return { overflow, clipped, tinyText, smallTargets, unlabeledFocusable, hoverOnlyCandidates };
          }, { minTextPx: args.minTextPx, minTargetPx: args.minTargetPx });
          entry.ok = true;
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

  await fs.writeFile(path.join(outDir, "dom-audit.json"), `${JSON.stringify(results, null, 2)}\n`);
  const overflowCount = results.states.filter((state) => state.audit?.overflow?.hasHorizontalOverflow).length;
  console.log(`dom-audit: wrote ${path.join(outDir, "dom-audit.json")} (${overflowCount} overflow candidates)`);
  if (results.states.some((state) => state.error)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`dom-audit: ${error.message}`);
  process.exit(1);
});
