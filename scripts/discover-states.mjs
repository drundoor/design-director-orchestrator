#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_VIEWPORTS, launchBrowser, loadPlaywright, parseViewports, preparePage, readJsonIfExists, resolveTarget, slug, writeJson } from "./lib/browser-utils.mjs";

function parseArgs(argv) {
  const args = { out: ".design-director", timeout: 15000, maxCandidates: 80 };
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
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function usage() {
  return `Usage: discover-states.mjs --url <url> [--config .design-director/render.config.json] [--out .design-director]

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const config = await readJsonIfExists(args.config);
  const baseUrl = args.url || config.url;
  if (!baseUrl) throw new Error("Missing --url or config.url");

  const viewports = parseViewports(args.viewports) || config.viewports || [DEFAULT_VIEWPORTS.find((viewport) => viewport.width === 375), DEFAULT_VIEWPORTS.find((viewport) => viewport.width === 1440)];
  const outDir = path.resolve(args.out);
  await fs.mkdir(outDir, { recursive: true });

  const { chromium } = await loadPlaywright();
  const browser = await launchBrowser(chromium);
  const targetState = config.states?.[0] || { name: "default" };
  const targetUrl = resolveTarget(baseUrl, targetState);
  const results = {
    tool: "discover-states",
    generatedAt: new Date().toISOString(),
    baseUrl,
    targetUrl,
    candidates: [],
    draftConfigPath: path.join(outDir, "render.config.discovered.json"),
  };

  try {
    const page = await browser.newPage({ viewport: viewports.at(-1) || { width: 1440, height: 1000 } });
    try {
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: args.timeout });
      await preparePage(page, config, targetState, args.timeout);
      results.candidates = await page.evaluate((maxCandidates) => {
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
        const controls = [...document.querySelectorAll("button, a[href], input, select, textarea, [role], details, summary, [tabindex]:not([tabindex='-1'])")].filter(visible);
        controls.forEach((el) => {
          const role = el.getAttribute("role") || "";
          const tag = el.tagName.toLowerCase();
          const label = labelFor(el);
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
            mutationRisk: risk,
          };
          if (tag === "select") {
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
          } else if (expanded === "false" || hasPopup || /menu|listbox|dialog|popover|combobox/.test(role)) {
            add({ ...base, kind: "overlay-trigger", confidence: "high", action: { type: "click", selector }, followUp: "Verify overlay is topmost, not clipped, and keyboard/touch reachable." });
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
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const safeStates = results.candidates
    .filter((candidate) => candidate.mutationRisk === "safe" && candidate.action)
    .slice(0, 24)
    .map((candidate, index) => ({
      name: candidateStateName(candidate.kind, candidate.label, index),
      path: targetState.path || undefined,
      url: targetState.url ? targetUrl : undefined,
      actions: [
        candidate.action,
        { type: "waitForStableLayout", ms: 200 },
      ],
      discoveredFrom: {
        kind: candidate.kind,
        selector: candidate.selector,
        confidence: candidate.confidence,
      },
    }));

  const draftConfig = {
    url: baseUrl,
    waitForSelector: config.waitForSelector,
    viewports,
    states: [
      targetState.path ? { name: "default", path: targetState.path } : targetState.url ? { name: "default", url: targetUrl } : { name: "default" },
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
