#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_VIEWPORTS, launchBrowser, loadPlaywright, parseViewports, preparePage, readJsonIfExists, resolveTarget, slug, writeJson } from "./lib/browser-utils.mjs";

function parseArgs(argv) {
  const args = { out: ".design-director", timeout: 15000, maxCandidates: 80, viewportMode: "smallest-largest", routesMode: "all" };
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
    } else if (arg === "--max-candidates") {
      args.maxCandidates = Number(argv[++i]);
    } else if (arg === "--viewports") {
      args.viewports = argv[++i];
    } else if (arg === "--viewport-mode") {
      args.viewportMode = argv[++i];
    } else if (arg === "--routes") {
      args.routesMode = argv[++i];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function usage() {
  return `Usage: discover-states.mjs --url <url> [--config .design-director/render.config.json] [--out .design-director] [--viewport-mode smallest-largest|all|largest] [--routes all|first]

Scans a rendered web page and emits:
- discovered-states.json: interactive candidates with confidence and mutation risk.
- render.config.discovered.json: draft render-check config with safe active states.

This command does not submit forms or perform destructive actions. Review the
draft config before using it for final QA.`;
}

function candidateStateName(kind, label, index) {
  const base = slug(`${kind}-${label || index + 1}`);
  return base || `${kind}-${index + 1}`;
}

function selectViewports(viewports, mode) {
  const sorted = [...viewports].sort((a, b) => a.width - b.width || a.height - b.height);
  if (mode === "all") return sorted;
  if (mode === "largest") return [sorted.at(-1)];
  if (mode !== "smallest-largest") throw new Error(`Unknown viewport mode: ${mode}`);
  const smallest = sorted[0];
  const largest = sorted.at(-1);
  if (!smallest || !largest) return [];
  if (smallest.width === largest.width && smallest.height === largest.height) return [smallest];
  return [smallest, largest];
}

function selectStates(config, routesMode) {
  const states = config.states?.length ? config.states : [{ name: "default" }];
  if (routesMode === "all") return states;
  if (routesMode === "first") return [states[0]];
  throw new Error(`Unknown routes mode: ${routesMode}`);
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

  const configuredViewports = parseViewports(args.viewports) || config.viewports || [DEFAULT_VIEWPORTS.find((viewport) => viewport.width === 375), DEFAULT_VIEWPORTS.find((viewport) => viewport.width === 1440)];
  const viewports = selectViewports(configuredViewports.filter(Boolean), args.viewportMode);
  const targetStates = selectStates(config, args.routesMode);
  const outDir = path.resolve(args.out);
  await fs.mkdir(outDir, { recursive: true });

  const { chromium } = await loadPlaywright();
  const browser = await launchBrowser(chromium);
  const results = {
    tool: "discover-states",
    generatedAt: new Date().toISOString(),
    baseUrl,
    viewportMode: args.viewportMode,
    routesMode: args.routesMode,
    targets: targetStates.map((state) => ({
      state: state.name || "default",
      url: resolveTarget(baseUrl, state),
    })),
    viewports,
    scans: [],
    candidates: [],
    draftConfigPath: path.join(outDir, "render.config.discovered.json"),
  };

  try {
    for (const targetState of targetStates) {
      for (const viewport of viewports) {
        const page = await browser.newPage({ viewport });
        const targetUrl = resolveTarget(baseUrl, targetState);
        const scan = {
          state: targetState.name || "default",
          url: targetUrl,
          viewport,
          candidates: [],
          ok: false,
        };
        try {
          await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: args.timeout });
          await preparePage(page, config, targetState, args.timeout);
          scan.candidates = await page.evaluate((maxCandidates) => {
        const visible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0.01;
        };
        const cssEscape = (value) => {
          if (window.CSS?.escape) return CSS.escape(value);
          return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
        };
        const selectorFor = (el) => {
          if (el.id) return `#${cssEscape(el.id)}`;
          const testId = el.getAttribute("data-testid") || el.getAttribute("data-test") || el.getAttribute("data-cy");
          if (testId) return `[data-testid="${testId}"], [data-test="${testId}"], [data-cy="${testId}"]`;
          const label = el.getAttribute("aria-label");
          if (label) return `${el.tagName.toLowerCase()}[aria-label="${label.replace(/"/g, '\\"')}"]`;
          const name = el.getAttribute("name");
          if (name) return `${el.tagName.toLowerCase()}[name="${name.replace(/"/g, '\\"')}"]`;
          const classes = String(el.className || "")
            .split(/\s+/)
            .filter(Boolean)
            .filter((token) => !/^(active|selected|open|closed|focus|hover)$/.test(token))
            .slice(0, 3);
          const classPart = classes.length ? `.${classes.map(cssEscape).join(".")}` : "";
          const siblings = [...(el.parentElement?.children || [])].filter((child) => child.tagName === el.tagName);
          const nth = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(el) + 1})` : "";
          return `${el.tagName.toLowerCase()}${classPart}${nth}`;
        };
        const labelFor = (el) => {
          const text = (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ");
          return el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("title") || el.getAttribute("name") || text || el.id || el.tagName.toLowerCase();
        };
        const labelConfidenceFor = (el) => {
          if (el.getAttribute("aria-label") || el.getAttribute("name")) return "high";
          if ((el.innerText || el.textContent || "").trim()) return "medium";
          return "low";
        };
        const riskFor = (el, label) => {
          const type = (el.getAttribute("type") || "").toLowerCase();
          const text = `${label} ${el.id || ""} ${el.className || ""}`.toLowerCase();
          if (el.closest("form") && /(submit|send|save|delete|remove|archive|purchase|checkout|pay|confirm|publish|post|upload)/.test(text)) return "destructive";
          if (["submit", "file", "password"].includes(type)) return type === "submit" ? "destructive" : "sensitive";
          if (/(delete|remove|archive|purchase|checkout|pay|confirm|publish|post|send|save)/.test(text)) return "destructive";
          if (/(email|phone|address|password|token|secret|card|ssn)/.test(text)) return "sensitive";
          return "safe";
        };
        const candidates = [];
        const add = (candidate) => {
          if (!candidate.selector || candidates.some((item) => item.selector === candidate.selector && item.kind === candidate.kind)) return;
          candidates.push(candidate);
        };
        const controls = [...document.querySelectorAll("button, a[href], input, select, textarea, label[for], [role], details, summary, [popover], [aria-controls], [aria-expanded], [data-state], [data-headlessui-state], [tabindex]:not([tabindex='-1'])")].filter(visible);
        controls.forEach((el) => {
          const role = el.getAttribute("role") || "";
          const tag = el.tagName.toLowerCase();
          const label = labelFor(el);
          const controlledId = el.getAttribute("aria-controls");
          const controlledSelector = controlledId ? `#${cssEscape(controlledId)}` : null;
          const selector = selectorFor(el);
          const risk = riskFor(el, label);
          const expanded = el.getAttribute("aria-expanded");
          const hasPopup = el.getAttribute("aria-haspopup");
          const rect = el.getBoundingClientRect();
          const base = {
            selector,
            label: label.slice(0, 120),
            tag,
            role: role || null,
            rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
            labelConfidence: labelConfidenceFor(el),
            mutationRisk: risk,
          };
          if (tag === "label" && el.getAttribute("for")) {
            const target = document.getElementById(el.getAttribute("for"));
            if (target && ["checkbox", "radio"].includes((target.getAttribute("type") || "").toLowerCase())) {
              add({ ...base, kind: "toggle-label", confidence: "medium", action: { type: "click", selector } });
            }
          } else if (tag === "select") {
            const option = [...el.options].find((item) => !item.disabled && item.value !== el.value) || [...el.options].find((item) => !item.disabled);
            if (option) add({ ...base, kind: "select", confidence: "high", action: { type: "select", selector, value: option.value } });
          } else if (tag === "input" || tag === "textarea" || role === "combobox" || role === "searchbox") {
            const type = (el.getAttribute("type") || "text").toLowerCase();
            const textLike = ["text", "search", "email", "url", "tel", ""].includes(type) || tag === "textarea" || role === "combobox" || role === "searchbox";
            if (textLike && risk === "safe") {
              const sample = /(search|filter|find|query|theme|tag|category)/i.test(label) ? "sample" : "test";
              add({ ...base, kind: role === "combobox" ? "combobox" : "text-input", confidence: "medium", action: { type: "fill", selector, value: sample } });
            } else {
              add({ ...base, kind: "input-review", confidence: "low", action: { type: "focus", selector } });
            }
          } else if (expanded === "false" || hasPopup || el.hasAttribute("aria-controls") || el.hasAttribute("popover") || ["closed", "unchecked"].includes(el.getAttribute("data-state")) || el.hasAttribute("data-headlessui-state") || /menu|listbox|dialog|popover|combobox/.test(role)) {
            add({
              ...base,
              kind: "overlay-trigger",
              confidence: "high",
              action: { type: "click", selector },
              postActions: controlledSelector ? [{ type: "waitForSelector", selector: controlledSelector, state: "visible", timeout: 1000 }] : [],
              followUp: "Verify overlay is topmost, not clipped, and keyboard/touch reachable.",
            });
          } else if (tag === "summary" || tag === "details") {
            add({ ...base, kind: "disclosure", confidence: "high", action: { type: "click", selector } });
          } else if (role === "tab") {
            const selected = el.getAttribute("aria-selected") === "true";
            if (!selected) add({ ...base, kind: "tab", confidence: "high", action: { type: "click", selector } });
          } else if ((tag === "button" || role === "button") && risk === "safe" && /(filter|sort|menu|more|details|expand|collapse|open|settings|options)/i.test(label)) {
            add({ ...base, kind: "safe-button", confidence: "medium", action: { type: "click", selector } });
          }
        });
        [...document.querySelectorAll("svg, canvas, [class*='chart'], [class*='graph'], [class*='viz']")].filter(visible).forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width < 80 || rect.height < 60) return;
          add({
            kind: "chart-or-canvas",
            confidence: "medium",
            selector: selectorFor(el),
            label: labelFor(el).slice(0, 120),
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute("role") || null,
            rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
            mutationRisk: "safe",
            action: { type: "screenshotElement", selector: selectorFor(el) },
            followUp: "Verify data/labels, resize behavior, and tooltip/control states manually.",
          });
        });
        [...document.querySelectorAll("body *")].filter(visible).forEach((el) => {
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          const canScroll = (el.scrollHeight > el.clientHeight + 16 || el.scrollWidth > el.clientWidth + 16) && rect.width > 120 && rect.height > 120;
          if (!canScroll) return;
          if (!/(auto|scroll)/.test(`${style.overflow} ${style.overflowY} ${style.overflowX}`)) return;
          add({
            kind: "scroll-container",
            confidence: "medium",
            selector: selectorFor(el),
            label: labelFor(el).slice(0, 120),
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute("role") || null,
            rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
            mutationRisk: "safe",
            action: { type: "scrollBoundaryCheck", selector: selectorFor(el), y: -240 },
            followUp: "Verify nested scroll passes page scroll at top/bottom boundaries.",
          });
        });
            return candidates.slice(0, maxCandidates);
          }, args.maxCandidates);
          scan.ok = true;
        } catch (error) {
          scan.error = error.message;
        } finally {
          await page.close();
        }
        results.scans.push(scan);
        for (const candidate of scan.candidates) {
          if (results.candidates.length >= args.maxCandidates) break;
          results.candidates.push({
            ...candidate,
            discoveredFrom: {
              state: scan.state,
              url: scan.url,
              viewport: scan.viewport,
            },
          });
        }
      }
    }
  } finally {
    await browser.close();
  }

  const safeStates = results.candidates
    .filter((candidate) => candidate.mutationRisk === "safe" && candidate.action)
    .slice(0, 24)
    .map((candidate, index) => {
      const sourceState = targetStates.find((state) => (state.name || "default") === candidate.discoveredFrom?.state) || {};
      const state = {
        name: candidateStateName(candidate.kind, candidate.label, index),
        actions: [
          candidate.action,
          ...(candidate.postActions || []),
          { type: "waitForStableLayout", ms: 200 },
        ],
        discoveredFrom: {
          kind: candidate.kind,
          selector: candidate.selector,
          confidence: candidate.confidence,
          labelConfidence: candidate.labelConfidence,
          state: candidate.discoveredFrom?.state,
          viewport: candidate.discoveredFrom?.viewport,
        },
      };
      if (sourceState.path) state.path = sourceState.path;
      else if (sourceState.url) state.url = candidate.discoveredFrom?.url || resolveTarget(baseUrl, sourceState);
      return state;
    });

  const draftConfig = {
    url: baseUrl,
    waitForSelector: config.waitForSelector,
    viewports: configuredViewports,
    states: [
      ...targetStates.map((state) => {
        if (state.path) return { name: state.name || "default", path: state.path };
        if (state.url) return { name: state.name || "default", url: resolveTarget(baseUrl, state) };
        return { name: state.name || "default" };
      }),
      ...safeStates,
    ],
    discoveryNote: "Review this draft before final QA. Remove duplicate, destructive, account-changing, or low-value states.",
  };

  await writeJson(path.join(outDir, "discovered-states.json"), results);
  await writeJson(results.draftConfigPath, draftConfig);
  console.log(`discover-states: wrote ${path.join(outDir, "discovered-states.json")} and ${results.draftConfigPath} (${results.candidates.length} candidates, ${safeStates.length} draft states)`);
}

main().catch((error) => {
  console.error(`discover-states: ${error.message}`);
  process.exit(1);
});
