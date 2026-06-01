import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function parseKeyValueArgs(argv, defaults = {}) {
  const args = { ...defaults, _: [] };
  const seen = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) args[key] = true;
      else {
        if (!seen.has(key)) args[key] = next;
        else if (Array.isArray(args[key])) args[key].push(next);
        else args[key] = [args[key], next];
        seen.add(key);
        i += 1;
      }
      if (next === undefined || next.startsWith("--")) seen.add(key);
    } else {
      args._.push(arg);
    }
  }
  return args;
}

export function toArray(value) {
  if (value === undefined || value === null || value === false) return [];
  return Array.isArray(value) ? value : [value];
}

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "mockup";
}

export function ensureAbsoluteTarget(targetRoot) {
  if (!targetRoot) throw new Error("Provide --target-root");
  const resolved = path.resolve(targetRoot);
  if (!path.isAbsolute(targetRoot)) {
    throw new Error(`--target-root must be absolute: ${targetRoot}`);
  }
  return resolved;
}

export function pathInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

export function mockupOutputRoot(targetRoot, slug) {
  return path.join(targetRoot, ".design-director", "mockups", slugify(slug));
}

export function fileUrlFor(file) {
  return pathToFileURL(path.resolve(file)).toString();
}

export function qaRunIdFor(slug, profile = "draft") {
  return `${slugify(slug)}-${slugify(profile)}-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
}

export async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

export async function readJsonIfExists(file, fallback = null) {
  try {
    return await readJson(file);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

export async function loadRunContext(contextPath) {
  if (!contextPath) throw new Error("Provide --context");
  const context = await readJson(path.resolve(contextPath));
  if (!context.outputRoot) throw new Error("run-context.json is missing outputRoot");
  if (!context.targetRoot) throw new Error("run-context.json is missing targetRoot");
  return {
    ...context,
    contextPath: path.resolve(contextPath),
    targetRoot: path.resolve(context.targetRoot),
    outputRoot: path.resolve(context.outputRoot),
    entry: context.entry || "index.html",
    qaOut: context.qaOut || "qa",
  };
}

export function entryPathForContext(context) {
  return path.join(context.outputRoot, context.entry || "index.html");
}

export function qaOutPathForContext(context) {
  return path.isAbsolute(context.qaOut) ? context.qaOut : path.join(context.outputRoot, context.qaOut || "qa");
}

export function renderConfigPathForContext(context) {
  return context.renderConfig
    ? path.resolve(context.outputRoot, context.renderConfig)
    : path.join(context.outputRoot, "render.config.json");
}
