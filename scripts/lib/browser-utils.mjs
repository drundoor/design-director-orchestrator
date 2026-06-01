import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

export const DEFAULT_VIEWPORTS = [
  { width: 320, height: 900 },
  { width: 375, height: 900 },
  { width: 414, height: 900 },
  { width: 768, height: 1024 },
  { width: 1024, height: 900 },
  { width: 1280, height: 900 },
  { width: 1440, height: 1000 },
];

export async function readJsonIfExists(file, fallback = {}) {
  if (!file) return fallback;
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function loadPlaywright() {
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

    throw new Error("Playwright is required. Install it in the target project or set DESIGN_DIRECTOR_NODE_MODULES to a node_modules directory containing Playwright.");
  }
}

export async function launchBrowser(chromium) {
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

export function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "state";
}

export function resolveTarget(baseUrl, state = {}) {
  if (state.url) return state.url;
  if (state.path) return new URL(state.path, baseUrl).toString();
  return baseUrl;
}

export function parseViewports(value) {
  if (!value) return null;
  return value.split(",").map((part) => {
    const [width, height = "900"] = part.split("x");
    return { width: Number(width), height: Number(height) };
  });
}

export async function preparePage(page, config, state, timeout) {
  const waitForSelector = state.waitForSelector || config.waitForSelector;
  if (waitForSelector) {
    await page.waitForSelector(waitForSelector, { timeout });
  }
  const waitMs = state.waitMs || config.waitMs;
  if (waitMs) {
    await page.waitForTimeout(waitMs);
  }
}

export function stateNameFor(state = {}) {
  return state.name || slug(state.path || state.url || "default");
}

export function stateIdFor(state = {}, index = 0) {
  if (state.id || state.stateId) return slug(state.id || state.stateId);
  const base = slug(stateNameFor(state) || `state-${index + 1}`);
  return index === 0 ? base : `${base}-${index + 1}`;
}

export function relativeArtifactPath(baseDir, file) {
  if (!file) return file;
  const absolute = path.isAbsolute(file) ? file : path.resolve(file);
  return path.relative(baseDir, absolute).replaceAll(path.sep, "/");
}

export function stableHash(value, length = 8) {
  return createHash("sha256").update(String(value || "")).digest("hex").slice(0, length);
}

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}

export function configHashFor(config = {}, effective = {}) {
  return stableHash(stableStringify({ config, effective }), 16);
}

export function qaRunMetadata(config = {}, effective = {}, startedAt = new Date().toISOString()) {
  const { scriptOptions = {}, tool = null, ...sharedEffective } = effective;
  const configHash = configHashFor(config, sharedEffective);
  const configuredRunId = process.env.DESIGN_DIRECTOR_QA_RUN_ID || config.qaRunId;
  const appBuildId = process.env.DESIGN_DIRECTOR_APP_BUILD_ID || config.appBuildId || null;
  return {
    startedAt,
    configHash,
    evidenceHash: stableHash(stableStringify({ configHash, tool, scriptOptions }), 16),
    scriptOptions,
    qaRunId: configuredRunId || `generated-${stableHash(`${configHash}:${process.pid}:${startedAt}:${Math.random()}`, 16)}`,
    qaRunIdSource: configuredRunId ? "configured" : "generated",
    appBuildId,
    evidenceMode: config.evidenceMode || null,
    allowFinalUrlMismatch: Boolean(config.allowFinalUrlMismatch),
  };
}
