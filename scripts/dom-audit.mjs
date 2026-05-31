#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { runActions } from "./lib/actions.mjs";
import { DEFAULT_VIEWPORTS, launchBrowser, loadPlaywright, preparePage, readJsonIfExists, resolveTarget, stateIdFor, stateNameFor } from "./lib/browser-utils.mjs";

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
  const screenshotDir = path.join(outDir, "screenshots");
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
    for (const [stateIndex, state] of states.entries()) {
      for (const viewport of viewports) {
        const page = await browser.newPage({ viewport });
        const targetUrl = resolveTarget(baseUrl, state);
        const stateName = stateNameFor(state);
        const entry = {
          state: stateName,
          stateId: stateIdFor(state, stateIndex),
          url: targetUrl,
          viewport,
          actions: [...(config.actions || []), ...(state.actions || [])],
          discoveredFrom: state.discoveredFrom || null,
          ok: false,
        };
        try {
          await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: args.timeout });
          await preparePage(page, config, state, args.timeout);
          entry.actionArtifacts = await runActions(page, [...(config.actions || []), ...(state.actions || [])], {
            timeout: args.timeout,
            screenshotDir,
            artifactPathBase: outDir,
            stateName: entry.state,
            viewport,
          });
          entry.finalUrl = page.url();
          entry.audit = await page.evaluate(({ minTextPx, minTargetPx }) => {
            const interestingRoles = new Set(["button", "link", "menuitem", "tab", "checkbox", "radio", "switch"]);
            const selector = [
              "button",
              "a[href]",
              "input",
              "select",
              "textarea",
              "details",
              "summary",
              "[aria-expanded]",
              "[aria-controls]",
              "[popover]",
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

            const staticControlSelector = [
              "button",
              "input",
              "select",
              "textarea",
              "details",
              "summary",
              "[role='button']",
              "[role='combobox']",
              "[aria-expanded]",
              "[aria-controls]",
              "[popover]",
              "[onclick]",
            ].join(",");
            const interactiveControls = [...document.querySelectorAll(staticControlSelector)]
              .filter(visible)
              .slice(0, 120)
              .map(preview);

            return { overflow, clipped, tinyText, smallTargets, unlabeledFocusable, hoverOnlyCandidates, interactiveControls };
          }, { minTextPx: args.minTextPx, minTargetPx: args.minTargetPx });
          entry.finalUrl = page.url();
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
