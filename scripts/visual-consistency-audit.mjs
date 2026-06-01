#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { runActions } from "./lib/actions.mjs";
import { DEFAULT_VIEWPORTS, launchBrowser, loadPlaywright, parseViewports, preparePage, qaRunMetadata, readJsonIfExists, resolveTarget, stableHash, stateIdFor, stateNameFor } from "./lib/browser-utils.mjs";

function parseArgs(argv) {
  const args = {
    out: ".design-director",
    timeout: 15000,
    maxFindings: 80,
    fontDeltaPx: 1,
    alignDeltaPx: 3,
    widthDeltaPx: 6,
    gapRatio: 3,
    maxElements: 1600,
    maxContainers: 160,
  };
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
    } else if (arg === "--max-findings") {
      args.maxFindings = Number(argv[++i]);
    } else if (arg === "--font-delta-px") {
      args.fontDeltaPx = Number(argv[++i]);
    } else if (arg === "--align-delta-px") {
      args.alignDeltaPx = Number(argv[++i]);
    } else if (arg === "--width-delta-px") {
      args.widthDeltaPx = Number(argv[++i]);
    } else if (arg === "--gap-ratio") {
      args.gapRatio = Number(argv[++i]);
    } else if (arg === "--viewports") {
      args.viewports = argv[++i];
    } else if (arg === "--max-elements") {
      args.maxElements = Number(argv[++i]);
    } else if (arg === "--max-containers") {
      args.maxContainers = Number(argv[++i]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function usage() {
  return `Usage: visual-consistency-audit.mjs --url <url> [--config .design-director/render.config.json] [--out .design-director]

Collects visual consistency evidence that generic DOM checks miss: peer
typography mismatches, grid/row alignment drift, spacing outliers, related
width mismatches, media-card anchoring issues, camouflaged controls, and
occluded/clipped overlays.

State actions can open active UI before auditing:
{
  "name": "search-open",
  "path": "/",
  "actions": [
    { "type": "fill", "selector": "#searchInput", "value": "ark" },
    { "type": "wait", "ms": 300 }
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

  const visualAuditConfig = config.visualAudit || {};
  const states = config.states?.length ? config.states : [{ name: "default" }];
  const viewports = parseViewports(args.viewports) || config.viewports || DEFAULT_VIEWPORTS;
  const outDir = path.resolve(args.out);
  const screenshotDir = path.join(outDir, "screenshots");
  await fs.mkdir(outDir, { recursive: true });
  const startedAt = new Date().toISOString();
  const runMeta = qaRunMetadata(config, {
    baseUrl,
    states,
    viewports,
    tool: "visual-consistency-audit",
    scriptOptions: {
      timeout: args.timeout,
      maxFindings: args.maxFindings,
      fontDeltaPx: args.fontDeltaPx,
      alignDeltaPx: args.alignDeltaPx,
      widthDeltaPx: args.widthDeltaPx,
      gapRatio: args.gapRatio,
      maxElements: args.maxElements,
      maxContainers: args.maxContainers,
      viewportsOverride: args.viewports || null,
    },
  }, startedAt);

  const { chromium } = await loadPlaywright();
  const browser = await launchBrowser(chromium);
  const results = {
    tool: "visual-consistency-audit",
    generatedAt: startedAt,
    startedAt,
    finishedAt: null,
    ...runMeta,
    baseUrl,
    config: args.config || null,
    thresholds: {
      fontDeltaPx: args.fontDeltaPx,
      alignDeltaPx: args.alignDeltaPx,
      widthDeltaPx: args.widthDeltaPx,
      gapRatio: args.gapRatio,
      maxElements: args.maxElements,
      maxContainers: args.maxContainers,
    },
    states: [],
  };

  try {
    for (const [stateIndex, state] of states.entries()) {
      for (const viewport of viewports) {
        const page = await browser.newPage({ viewport });
        const targetUrl = resolveTarget(baseUrl, state);
        const stateName = stateNameFor(state);
        const stateId = stateIdFor(state, stateIndex);
        const routeHash = stableHash(targetUrl);
        const entry = {
          state: stateName,
          stateId,
          stateIndex,
          url: targetUrl,
          viewport,
          finalUrlException: state.finalUrlException ? { ...state.finalUrlException, source: "config" } : null,
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
            stateName: stateId,
            stateIndex,
            routeHash,
            viewport,
          });
          entry.finalUrl = page.url();
          entry.audit = await page.evaluate(
            ({ fontDeltaPx, alignDeltaPx, widthDeltaPx, gapRatio, maxFindings, maxElements, maxContainers, visualAudit }) => {
              const BLOCKER_LIMIT = maxFindings;
              const WARNING_LIMIT = maxFindings;
              const textTokenRe = /(value|metric|score|rank|rating|count|stat|number|amount|price|total|player|complexity|key)/i;
              const componentTokenRe = /(card|tile|panel|metric|stat|grid|row|item|cell|list|result|summary|detail)/i;
              const labelTokenRe = /(label|caption|eyebrow|title|heading|name|meta|year)/i;
              const overlayTokenRe = /(popover|dropdown|menu|listbox|options|suggestions|autocomplete|combobox|picker|tooltip|modal|dialog|flyout|drawer)/i;

              const blockers = [];
              const warnings = [];
              const seen = new Set();
              const selectorList = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
              const ignoreSelectors = selectorList(visualAudit.ignoreSelectors);
              const componentSelectors = selectorList(visualAudit.componentSelectors);
              const peerValueSelectors = selectorList(visualAudit.peerValueSelectors);
              const overlaySelectors = selectorList(visualAudit.overlaySelectors);
              const warningOnlySelectors = selectorList(visualAudit.warningOnlySelectors);
              const warningOnlyFindingTypes = new Set([
                "peer-typography-mismatch",
                "peer-value-typography-mismatch",
                "grid-column-alignment-drift",
                "spacing-rhythm-outlier",
                "related-width-mismatch",
                "media-title-floating",
                "camouflaged-control",
              ]);
              const matchesAny = (el, selectors) => selectors.some((selector) => {
                try {
                  return el.matches(selector);
                } catch {
                  return false;
                }
              });
              const closestAny = (el, selectors) => selectors.some((selector) => {
                try {
                  return Boolean(el.closest(selector));
                } catch {
                  return false;
                }
              });

              const addFinding = (bucket, finding) => {
                const key = `${finding.type}|${finding.selector}|${finding.message}`;
                if (seen.has(key)) return;
                seen.add(key);
                if (bucket === "blocker" && warningOnlySelectors.length && warningOnlyFindingTypes.has(finding.type)) {
                  try {
                    const el = document.querySelector(finding.selector);
                    if (el && (matchesAny(el, warningOnlySelectors) || closestAny(el, warningOnlySelectors))) bucket = "warning";
                  } catch {
                    // Keep the original severity when the selector is not queryable.
                  }
                }
                if (bucket === "blocker" && blockers.length < BLOCKER_LIMIT) blockers.push(finding);
                if (bucket === "warning" && warnings.length < WARNING_LIMIT) warnings.push(finding);
              };

              const visible = (el) => {
                if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
                const rect = el.getBoundingClientRect();
                const style = getComputedStyle(el);
                return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity || 1) > 0.01;
              };

              const rectFor = (el) => {
                const rect = el.getBoundingClientRect();
                return {
                  x: Number(rect.x.toFixed(1)),
                  y: Number(rect.y.toFixed(1)),
                  width: Number(rect.width.toFixed(1)),
                  height: Number(rect.height.toFixed(1)),
                  left: Number(rect.left.toFixed(1)),
                  top: Number(rect.top.toFixed(1)),
                  right: Number(rect.right.toFixed(1)),
                  bottom: Number(rect.bottom.toFixed(1)),
                };
              };

              const classText = (el) => String(el.className || "");
              const tokensFor = (el) => classText(el).toLowerCase().split(/\s+/).filter(Boolean).sort();
              const classSignature = (el) => {
                const tokens = tokensFor(el).filter((token) => !/^(active|selected|current|open|closed|hover|focus|is-|has-|js-)/.test(token));
                return `${el.tagName.toLowerCase()}${tokens.length ? `.${tokens.slice(0, 5).join(".")}` : ""}`;
              };
              const selectorFor = (el) => {
                if (el.id) return `#${CSS.escape(el.id)}`;
                const sig = classSignature(el);
                const parent = el.parentElement;
                if (!parent) return sig;
                const siblings = [...parent.children].filter((child) => child.tagName === el.tagName);
                const index = siblings.indexOf(el) + 1;
                return `${classSignature(parent)} > ${sig}${index > 0 ? `:nth-of-type(${index})` : ""}`;
              };
              const textFor = (el) => (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 90);
              const directTextFor = (el) =>
                [...el.childNodes]
                  .filter((node) => node.nodeType === Node.TEXT_NODE)
                  .map((node) => node.textContent.trim())
                  .filter(Boolean)
                  .join(" ")
                  .replace(/\s+/g, " ")
                  .trim();
              const computed = (el) => {
                const style = getComputedStyle(el);
                const lineHeight = Number.parseFloat(style.lineHeight);
                return {
                  fontSize: Number.parseFloat(style.fontSize) || 0,
                  fontWeight: Number.parseFloat(style.fontWeight) || 400,
                  lineHeight: Number.isFinite(lineHeight) ? lineHeight : 0,
                  fontFamily: style.fontFamily,
                  display: style.display,
                  backgroundColor: style.backgroundColor,
                  borderColor: style.borderColor,
                  color: style.color,
                  boxShadow: style.boxShadow,
                };
              };

              const nearViewport = (el) => {
                const rect = el.getBoundingClientRect();
                return rect.bottom >= -200 && rect.top <= window.innerHeight + 400 && rect.right >= -200 && rect.left <= window.innerWidth + 200;
              };
              const rawAll = [...document.querySelectorAll("body *")].filter((el) => visible(el) && !matchesAny(el, ignoreSelectors) && !closestAny(el, ignoreSelectors));
              const all = rawAll.filter(nearViewport).slice(0, maxElements);
              const textLeaves = all.filter((el) => {
                const text = directTextFor(el);
                if (!text && !matchesAny(el, peerValueSelectors)) return false;
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
              });

              const likelyContainers = all.filter((el) => {
                const rect = el.getBoundingClientRect();
                if (rect.width < 120 || rect.height < 40) return false;
                const signature = `${classText(el)} ${el.tagName}`.toLowerCase();
                if (!matchesAny(el, componentSelectors) && !componentTokenRe.test(signature) && !["ARTICLE", "LI", "TR", "SECTION", "DETAILS"].includes(el.tagName)) return false;
                const leaves = textLeaves.filter((leaf) => el !== leaf && el.contains(leaf));
                return leaves.length >= 2 && leaves.length <= 60;
              }).slice(0, maxContainers);

              // Same semantic/class peer typography: if elements with the same visual role
              // inside a component disagree on font size, weight, or line-height, it is
              // almost always visible polish debt.
              for (const container of likelyContainers) {
                const groups = new Map();
                const descendants = textLeaves.filter((leaf) => container !== leaf && container.contains(leaf));
                for (const leaf of descendants) {
                  const signature = classSignature(leaf);
                  if (!classText(leaf) && !textTokenRe.test(signature)) continue;
                  if (!groups.has(signature)) groups.set(signature, []);
                  groups.get(signature).push(leaf);
                }
                for (const [signature, group] of groups) {
                  if (group.length < 2 || group.length > 20) continue;
                  const samples = group.map((el) => ({ el, style: computed(el), rect: rectFor(el), text: textFor(el) }));
                  const sizes = samples.map((sample) => sample.style.fontSize).filter(Boolean);
                  const weights = samples.map((sample) => sample.style.fontWeight).filter(Boolean);
                  const lines = samples.map((sample) => sample.style.lineHeight).filter(Boolean);
                  const sizeDelta = Math.max(...sizes) - Math.min(...sizes);
                  const weightDelta = Math.max(...weights) - Math.min(...weights);
                  const lineDelta = lines.length ? Math.max(...lines) - Math.min(...lines) : 0;
                  if (sizeDelta > fontDeltaPx || weightDelta > 150 || lineDelta > 3) {
                    addFinding("warning", {
                      type: "peer-typography-mismatch",
                      selector: selectorFor(container),
                      peerSignature: signature,
                      message: `Peer text with the same role has inconsistent typography: font-size delta ${sizeDelta.toFixed(1)}px, weight delta ${weightDelta.toFixed(0)}, line-height delta ${lineDelta.toFixed(1)}px.`,
                      samples: samples.slice(0, 6).map((sample) => ({
                        text: sample.text,
                        selector: selectorFor(sample.el),
                        fontSize: sample.style.fontSize,
                        fontWeight: sample.style.fontWeight,
                        lineHeight: sample.style.lineHeight,
                        rect: sample.rect,
                      })),
                    });
                  }
                }
              }

              // Repeated box children: metric grids/cards often have direct child boxes.
              // Compare the primary value in each box and column alignment across rows.
              for (const container of likelyContainers) {
                const children = [...container.children].filter(visible);
                if (children.length < 2 || children.length > 12) continue;
                const childRects = children.map((child) => ({ child, rect: child.getBoundingClientRect() }));
                const similarChildCount = new Map();
                for (const { child } of childRects) {
                  const sig = classSignature(child);
                  similarChildCount.set(sig, (similarChildCount.get(sig) || 0) + 1);
                }
                const hasRepeatedChildShape = [...similarChildCount.values()].some((count) => count >= 2);
                if (!hasRepeatedChildShape && !/(grid|metrics|stats|key-list|metric-grid|stat-grid)/i.test(classText(container))) continue;

                const childValues = childRects
                  .map(({ child }) => {
                    const descendants = textLeaves.filter((leaf) => child.contains(leaf));
                    const ranked = descendants
                      .map((leaf) => ({ leaf, style: computed(leaf), text: textFor(leaf), rect: rectFor(leaf) }))
                      .filter((item) => item.text && item.text.length <= 80)
                      .sort((a, b) => (b.style.fontSize + b.style.fontWeight / 1000) - (a.style.fontSize + a.style.fontWeight / 1000));
                    const primary = ranked[0];
                    return primary ? { child, primary } : null;
                  })
                  .filter(Boolean);

                if (childValues.length >= 2) {
                  const sizes = childValues.map((item) => item.primary.style.fontSize);
                  const weights = childValues.map((item) => item.primary.style.fontWeight);
                  const sizeDelta = Math.max(...sizes) - Math.min(...sizes);
                  const weightDelta = Math.max(...weights) - Math.min(...weights);
                  if (sizeDelta > fontDeltaPx || weightDelta > 150) {
                    addFinding("warning", {
                      type: "peer-value-typography-mismatch",
                      selector: selectorFor(container),
                      message: `Repeated peer boxes have primary values with inconsistent typography: font-size delta ${sizeDelta.toFixed(1)}px, weight delta ${weightDelta.toFixed(0)}.`,
                      samples: childValues.slice(0, 8).map((item) => ({
                        text: item.primary.text,
                        childSelector: selectorFor(item.child),
                        valueSelector: selectorFor(item.primary.leaf),
                        fontSize: item.primary.style.fontSize,
                        fontWeight: item.primary.style.fontWeight,
                        rect: item.primary.rect,
                      })),
                    });
                  }
                }

                const sorted = childRects
                  .map(({ child, rect }) => ({ child, rect }))
                  .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
                const rows = [];
                for (const item of sorted) {
                  const row = rows.find((candidate) => Math.abs(candidate.top - item.rect.top) <= 8);
                  if (row) {
                    row.items.push(item);
                    row.top = (row.top + item.rect.top) / 2;
                  } else {
                    rows.push({ top: item.rect.top, items: [item] });
                  }
                }
                rows.forEach((row) => row.items.sort((a, b) => a.rect.left - b.rect.left));
                const rowLengths = rows.map((row) => row.items.length);
                if (rows.length >= 2 && new Set(rowLengths).size === 1 && rowLengths[0] >= 2) {
                  for (let col = 0; col < rowLengths[0]; col += 1) {
                    const lefts = rows.map((row) => row.items[col].rect.left);
                    const delta = Math.max(...lefts) - Math.min(...lefts);
                    if (delta > alignDeltaPx) {
                      addFinding("warning", {
                        type: "grid-column-alignment-drift",
                        selector: selectorFor(container),
                        message: `Repeated grid children in column ${col + 1} do not share the same left edge; delta ${delta.toFixed(1)}px.`,
                        samples: rows.map((row) => ({
                          selector: selectorFor(row.items[col].child),
                          text: textFor(row.items[col].child),
                          left: Number(row.items[col].rect.left.toFixed(1)),
                          rect: rectFor(row.items[col].child),
                        })),
                      });
                    }
                  }
                }
              }

              // Local spacing rhythm: adjacent inline items in title/header/meta rows should
              // not have a single gap that is wildly larger than nearby gaps.
              for (const parent of all) {
                const children = [...parent.children].filter(visible);
                if (children.length < 3 || children.length > 8) continue;
                const parentName = `${classText(parent)} ${parent.tagName}`.toLowerCase();
                if (!/(title|heading|header|meta|toolbar|controls|summary|card)/i.test(parentName)) continue;
                const rects = children.map((child) => ({ child, rect: child.getBoundingClientRect() })).sort((a, b) => a.rect.left - b.rect.left);
                const sameRow = rects.filter((item, _, arr) => {
                  const base = arr[0].rect;
                  const overlap = Math.min(base.bottom, item.rect.bottom) - Math.max(base.top, item.rect.top);
                  return overlap >= Math.min(base.height, item.rect.height) * 0.45;
                });
                if (sameRow.length < 3) continue;
                const gaps = [];
                for (let i = 1; i < sameRow.length; i += 1) {
                  const gap = sameRow[i].rect.left - sameRow[i - 1].rect.right;
                  if (gap >= 0) gaps.push({ gap, before: sameRow[i - 1].child, after: sameRow[i].child });
                }
                const positive = gaps.map((gap) => gap.gap).filter((gap) => gap > 1).sort((a, b) => a - b);
                if (positive.length < 2) continue;
                const median = positive[Math.floor(positive.length / 2)];
                const outlier = gaps.find((gap) => gap.gap > Math.max(18, median * gapRatio));
                if (outlier) {
                  addFinding("warning", {
                    type: "spacing-rhythm-outlier",
                    selector: selectorFor(parent),
                    message: `Adjacent inline items have a spacing outlier: ${outlier.gap.toFixed(1)}px gap vs local median ${median.toFixed(1)}px.`,
                    samples: [
                      { text: textFor(outlier.before), selector: selectorFor(outlier.before), rect: rectFor(outlier.before) },
                      { text: textFor(outlier.after), selector: selectorFor(outlier.after), rect: rectFor(outlier.after) },
                    ],
                  });
                }
              }

              // Related-width mismatch: details/summary expanders and action rows usually
              // need to align to the primary panel/grid they visually control.
              for (const container of likelyContainers) {
                const children = [...container.children].filter(visible);
                if (children.length < 2 || children.length > 10) continue;
                for (let i = 1; i < children.length; i += 1) {
                  const current = children[i];
                  const previous = children[i - 1];
                  const currentText = `${textFor(current)} ${classText(current)} ${current.tagName}`.toLowerCase();
                  if (!/(more|less|details|summary|expand|collapse|show|hide)/.test(currentText)) continue;
                  const currentRect = current.getBoundingClientRect();
                  const previousRect = previous.getBoundingClientRect();
                  const widthDelta = Math.abs(currentRect.width - previousRect.width);
                  if (widthDelta > widthDeltaPx) {
                    addFinding("warning", {
                      type: "related-width-mismatch",
                      selector: selectorFor(container),
                      message: `A details/summary control width differs from the preceding related panel by ${widthDelta.toFixed(1)}px.`,
                      samples: [
                        { text: textFor(previous), selector: selectorFor(previous), rect: rectFor(previous) },
                        { text: textFor(current), selector: selectorFor(current), rect: rectFor(current) },
                      ],
                    });
                  }
                }
              }

              // Media-card anchoring: if title text sits beside an image, it should usually
              // anchor to the top or bottom of the media box instead of floating in the middle.
              for (const container of likelyContainers) {
                const image = [...container.querySelectorAll("img, picture, svg, canvas, .cover, [class*='image'], [class*='art']")].find(visible);
                if (!image) continue;
                const imageRect = image.getBoundingClientRect();
                if (imageRect.width < 32 || imageRect.height < 32) continue;
                const title = textLeaves
                  .filter((leaf) => container.contains(leaf) && leaf !== image)
                  .map((leaf) => ({ leaf, style: computed(leaf), rect: leaf.getBoundingClientRect(), text: textFor(leaf) }))
                  .filter((item) => item.text && item.text.length <= 80 && item.rect.left > imageRect.left)
                  .sort((a, b) => (b.style.fontSize + b.style.fontWeight / 1000) - (a.style.fontSize + a.style.fontWeight / 1000))[0];
                if (!title) continue;
                const beside = title.rect.left >= imageRect.right - 4 || imageRect.left >= title.rect.right - 4;
                if (!beside) continue;
                const topDelta = Math.abs(title.rect.top - imageRect.top);
                const bottomDelta = Math.abs(title.rect.bottom - imageRect.bottom);
                const centerDelta = Math.abs((title.rect.top + title.rect.bottom) / 2 - (imageRect.top + imageRect.bottom) / 2);
                if (topDelta > 10 && bottomDelta > 10 && centerDelta < imageRect.height * 0.28) {
                  addFinding("warning", {
                    type: "media-title-floating",
                    selector: selectorFor(container),
                    message: `Title text appears vertically floating beside media instead of anchoring to the top or bottom of the image.`,
                    samples: [
                      { text: textFor(image), selector: selectorFor(image), rect: rectFor(image) },
                      { text: title.text, selector: selectorFor(title.leaf), rect: rectFor(title.leaf) },
                    ],
                  });
                }
              }

              const parseRgb = (value) => {
                const match = String(value).match(/rgba?\(([^)]+)\)/i);
                if (!match) return null;
                const parts = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
                if (parts.length < 3) return null;
                const alpha = parts.length >= 4 ? parts[3] : 1;
                if (alpha < 0.1) return null;
                return { r: parts[0], g: parts[1], b: parts[2], a: alpha };
              };
              const colorDistance = (a, b) => {
                if (!a || !b) return Infinity;
                return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
              };
              const nearestBackground = (el) => {
                let current = el.parentElement;
                while (current) {
                  const color = parseRgb(getComputedStyle(current).backgroundColor);
                  if (color) return color;
                  current = current.parentElement;
                }
                return { r: 255, g: 255, b: 255, a: 1 };
              };

              for (const control of [...document.querySelectorAll("button, select, input, textarea, [role='button'], [role='combobox']")].filter(visible)) {
                const style = computed(control);
                const bg = parseRgb(style.backgroundColor);
                const parentBg = nearestBackground(control);
                const border = parseRgb(style.borderColor);
                const rect = control.getBoundingClientRect();
                if (rect.width < 24 || rect.height < 20) continue;
                const bgDelta = colorDistance(bg, parentBg);
                const borderDelta = colorDistance(border, parentBg);
                const hasShadow = style.boxShadow && style.boxShadow !== "none";
                if (bgDelta < 10 && borderDelta < 14 && !hasShadow) {
                  addFinding("warning", {
                    type: "camouflaged-control",
                    selector: selectorFor(control),
                    message: `Interactive control has nearly the same background and border color as its surrounding surface.`,
                    samples: [{
                      text: textFor(control) || control.getAttribute("aria-label") || control.getAttribute("placeholder") || control.tagName.toLowerCase(),
                      selector: selectorFor(control),
                      rect: rectFor(control),
                      backgroundDelta: Number(bgDelta.toFixed(1)),
                      borderDelta: Number(borderDelta.toFixed(1)),
                    }],
                  });
                }
              }

              // Open dropdowns, autocomplete lists, popovers, dialogs, and filter
              // menus must sit above cards, charts, tables, and sticky chrome. This
              // catches low z-index and stacking-context failures once a state action
              // has opened the overlay.
              const overlayRoles = new Set(["listbox", "menu", "dialog", "tooltip"]);
              const overlayCandidates = all.filter((el) => {
                const rect = el.getBoundingClientRect();
                if (rect.width < 40 || rect.height < 24) return false;
                if (el.matches("select, option")) return false;
                if (matchesAny(el, overlaySelectors)) return true;
                const role = el.getAttribute("role");
                const label = `${classText(el)} ${el.id || ""} ${role || ""} ${el.getAttribute("aria-label") || ""}`.toLowerCase();
                const style = getComputedStyle(el);
                const explicitlyOpen = el.matches("[popover]:popover-open, [open], [data-state='open']") || /(^|\s)open(\s|$)/.test(label);
                const overlayPosition = ["absolute", "fixed"].includes(style.position);
                return (overlayTokenRe.test(label) && (overlayPosition || explicitlyOpen)) || ((overlayRoles.has(role) || explicitlyOpen) && overlayPosition);
              });

              for (const overlay of overlayCandidates) {
                const rect = overlay.getBoundingClientRect();
                const style = getComputedStyle(overlay);
                const clippedSides = [];
                if (rect.left < -1) clippedSides.push("left");
                if (rect.top < -1) clippedSides.push("top");
                if (rect.right > window.innerWidth + 1) clippedSides.push("right");
                if (rect.bottom > window.innerHeight + 1) clippedSides.push("bottom");
                if (clippedSides.length) {
                  addFinding("blocker", {
                    type: "overlay-viewport-clipped",
                    selector: selectorFor(overlay),
                    message: `Open overlay is clipped by the viewport on: ${clippedSides.join(", ")}.`,
                    samples: [{
                      text: textFor(overlay),
                      selector: selectorFor(overlay),
                      rect: rectFor(overlay),
                      zIndex: style.zIndex,
                      position: style.position,
                    }],
                  });
                }

                const inset = Math.min(12, Math.max(2, Math.min(rect.width, rect.height) / 4));
                const points = [
                  { name: "center", x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
                  { name: "top-left", x: rect.left + inset, y: rect.top + inset },
                  { name: "top-right", x: rect.right - inset, y: rect.top + inset },
                  { name: "bottom-left", x: rect.left + inset, y: rect.bottom - inset },
                  { name: "bottom-right", x: rect.right - inset, y: rect.bottom - inset },
                ].filter((point) => point.x >= 0 && point.y >= 0 && point.x <= window.innerWidth && point.y <= window.innerHeight);

                const occluded = [];
                for (const point of points) {
                  const top = document.elementFromPoint(point.x, point.y);
                  if (!top) continue;
                  if (top === overlay || overlay.contains(top)) continue;
                  occluded.push({
                    point: point.name,
                    x: Number(point.x.toFixed(1)),
                    y: Number(point.y.toFixed(1)),
                    topSelector: selectorFor(top),
                    topText: textFor(top),
                    topRect: rectFor(top),
                  });
                }

                if (occluded.length) {
                  addFinding("blocker", {
                    type: "overlay-occluded",
                    selector: selectorFor(overlay),
                    message: `Open overlay is not the topmost element at ${occluded.length} sampled point(s); it may be behind another container, chart, or stacking context.`,
                    samples: [{
                      text: textFor(overlay),
                      selector: selectorFor(overlay),
                      rect: rectFor(overlay),
                      zIndex: style.zIndex,
                      position: style.position,
                      occluded,
                    }],
                  });
                }
              }

              return {
                blockers,
                warnings,
                counts: {
                  visibleElements: all.length,
                  textLeaves: textLeaves.length,
                  likelyContainers: likelyContainers.length,
                },
              };
            },
            {
              fontDeltaPx: args.fontDeltaPx,
              alignDeltaPx: args.alignDeltaPx,
              widthDeltaPx: args.widthDeltaPx,
              gapRatio: args.gapRatio,
              maxFindings: args.maxFindings,
              maxElements: args.maxElements,
              maxContainers: args.maxContainers,
              visualAudit: visualAuditConfig,
            },
          );
          entry.ok = true;
          entry.finalUrl = page.url();
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

  results.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(outDir, "visual-consistency-audit.json"), `${JSON.stringify(results, null, 2)}\n`);
  const blockerCount = results.states.reduce((sum, state) => sum + (state.audit?.blockers?.length || 0) + (state.error ? 1 : 0), 0);
  const warningCount = results.states.reduce((sum, state) => sum + (state.audit?.warnings?.length || 0), 0);
  console.log(`visual-consistency-audit: wrote ${path.join(outDir, "visual-consistency-audit.json")} (${blockerCount} blockers, ${warningCount} warnings)`);
  if (blockerCount) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`visual-consistency-audit: ${error.message}`);
  process.exit(1);
});
