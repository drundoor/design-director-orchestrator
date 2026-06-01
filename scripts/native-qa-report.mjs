#!/usr/bin/env node

import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { stableHash, stableStringify } from "./lib/browser-utils.mjs";

function parseArgs(argv) {
  const args = { out: ".design-director", profile: "standard" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--report") {
      args.report = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--profile") {
      args.profile = argv[++i];
    } else if (arg === "--partial") {
      args.partial = true;
    } else if (arg === "--allow-partial-exit-zero") {
      args.allowPartialExitZero = true;
    } else if (arg === "--max-evidence-age-ms") {
      args.maxEvidenceAgeMs = Number(argv[++i]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function usage() {
  return `Usage: native-qa-report.mjs --report .design-director/native-ios-qa.json [--out .design-director] [--profile minimal|standard|deep] [--partial] [--allow-partial-exit-zero] [--max-evidence-age-ms 1800000]

Validates native iOS/Android QA report evidence and writes:
- native-design-qa.json
- native-design-qa.md

Missing screenshots, UI hierarchy/tree captures, logs, required profile coverage,
or target/tool metadata make the report incomplete. Failed/blocked matrix states
are blockers; needs-review is incomplete unless --partial is supplied. Final
native acceptance requires qaRunId, startedAt/finishedAt, toolingHash, fresh
artifact hashes, and unique screenshot/tree evidence per required profile.`;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function evidencePath(outDir, file) {
  if (!file) return null;
  if (path.isAbsolute(file)) return file;
  const normalized = file.replaceAll("\\", "/");
  const outBase = path.basename(outDir);
  if (normalized === outBase || normalized.startsWith(`${outBase}/`)) return path.resolve(file);
  return path.resolve(outDir, file);
}

function artifactPath(outDir, file) {
  if (!file) return file;
  const absolute = evidencePath(outDir, file);
  if (!absolute) return file;
  const relative = path.relative(outDir, absolute);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return relative.replaceAll(path.sep, "/");
  return "[absolute-path-redacted]";
}

function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

async function fileMetadata(absolute) {
  const [stat, data] = await Promise.all([fs.stat(absolute), fs.readFile(absolute)]);
  return {
    size: data.length,
    sha256: sha256Hex(data),
    modifiedAt: stat.mtime.toISOString(),
    _mtimeMs: stat.mtimeMs,
  };
}

function pathInsideDir(dir, file) {
  const relative = path.relative(dir, file);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function imageDimensions(data, flags) {
  if (flags.isPng && data.length >= 24) {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (flags.isJpeg) {
    let offset = 2;
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = data[offset + 1];
      const length = data.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
      }
      if (!length) break;
      offset += 2 + length;
    }
  }
  if (flags.isWebp && data.length >= 30) {
    const subtype = data.slice(12, 16).toString("ascii");
    if (subtype === "VP8X" && data.length >= 30) {
      return {
        width: 1 + data.readUIntLE(24, 3),
        height: 1 + data.readUIntLE(27, 3),
      };
    }
    if (subtype === "VP8 " && data.length >= 30) {
      const payloadOffset = 20;
      if (data[payloadOffset + 3] === 0x9d && data[payloadOffset + 4] === 0x01 && data[payloadOffset + 5] === 0x2a) {
        return {
          width: data.readUInt16LE(payloadOffset + 6) & 0x3fff,
          height: data.readUInt16LE(payloadOffset + 8) & 0x3fff,
        };
      }
    }
    if (subtype === "VP8L" && data.length >= 25) {
      const payloadOffset = 20;
      if (data[payloadOffset] === 0x2f) {
        const bits = data.readUInt32LE(payloadOffset + 1);
        return {
          width: (bits & 0x3fff) + 1,
          height: ((bits >> 14) & 0x3fff) + 1,
        };
      }
    }
  }
  return null;
}

async function inspectImage(file, outDir) {
  const absolute = evidencePath(outDir, file);
  if (!absolute) return { path: file, exists: false, valid: false, reason: "path missing" };
  if (!pathInsideDir(outDir, absolute)) {
    return { path: artifactPath(outDir, file), exists: false, valid: false, reason: "evidence path is outside QA output directory" };
  }
  try {
    const data = await fs.readFile(absolute);
    const stat = await fs.stat(absolute);
    const isPng = data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a;
    const isJpeg = data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    const isWebp = data.length >= 12 && data.slice(0, 4).toString("ascii") === "RIFF" && data.slice(8, 12).toString("ascii") === "WEBP";
    const dimensions = imageDimensions(data, { isPng, isJpeg, isWebp });
    const valid = data.length > 16 && (isPng || isJpeg || isWebp) && dimensions && dimensions.width >= 24 && dimensions.height >= 24;
    return {
      path: artifactPath(outDir, file),
      _absolutePath: absolute,
      exists: true,
      valid,
      size: data.length,
      sha256: sha256Hex(data),
      modifiedAt: stat.mtime.toISOString(),
      _mtimeMs: stat.mtimeMs,
      width: dimensions?.width || null,
      height: dimensions?.height || null,
      format: isPng ? "png" : isJpeg ? "jpeg" : isWebp ? "webp" : "unknown",
      reason: valid ? null : "not a valid or meaningful PNG, JPEG, or WebP image with readable dimensions"
    };
  } catch (error) {
    if (error.code === "ENOENT") return { path: artifactPath(outDir, file), _absolutePath: absolute, exists: false, valid: false, reason: "file is missing" };
    throw error;
  }
}

async function inspectTextArtifact(file, outDir) {
  const absolute = evidencePath(outDir, file);
  if (!absolute) return { path: file, exists: false, valid: false, reason: "path missing" };
  if (!pathInsideDir(outDir, absolute)) {
    return { path: artifactPath(outDir, file), exists: false, valid: false, reason: "evidence path is outside QA output directory" };
  }
  try {
    const metadata = await fileMetadata(absolute);
    return { path: artifactPath(outDir, file), _absolutePath: absolute, exists: true, valid: metadata.size > 0, ...metadata, reason: metadata.size > 0 ? null : "file is empty" };
  } catch (error) {
    if (error.code === "ENOENT") return { path: artifactPath(outDir, file), _absolutePath: absolute, exists: false, valid: false, reason: "file is missing" };
    throw error;
  }
}

async function inspectLogArtifact(file, outDir) {
  const base = await inspectTextArtifact(file, outDir);
  if (!base.exists || !base.valid) return base;
  const text = await fs.readFile(base._absolutePath, "utf8");
  const crashPattern = /(FATAL EXCEPTION|CRASH|uncaught exception|Terminating app due to uncaught exception|SIGABRT|Fatal signal)/i;
  return { ...base, crashSignature: crashPattern.test(text) };
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function requiredTargetFields(platform) {
  if (platform === "native-ios") return ["scheme", "simulator"];
  if (platform === "native-android") return ["module", "variant", "device", "apiLevel"];
  return [];
}

function matrixTreeField(platform) {
  return platform === "native-ios" ? "uiHierarchy" : "uiTree";
}

function addMissingFields(incomplete, object, fields, prefix) {
  for (const field of fields) {
    if (object?.[field] === undefined || object?.[field] === null || object?.[field] === "") {
      incomplete.push(`${prefix}: missing ${field}`);
    }
  }
}

function requiredProfilesFor(platform, profile) {
  const ios = {
    minimal: ["default-light"],
    standard: ["default-light", "dark", "large-text", "keyboard-focused"],
    deep: ["default-light", "dark", "large-text", "keyboard-focused", "landscape"],
  };
  const android = {
    minimal: ["default-light"],
    standard: ["default-light", "dark", "font-scale-large", "ime-focused"],
    deep: ["default-light", "dark", "font-scale-large", "ime-focused", "display-large"],
  };
  return (platform === "native-ios" ? ios : android)[profile] || null;
}

function declaredProfiles(entry) {
  return new Set(asArray(entry.profiles || entry.profile).filter(Boolean));
}

function isDefaultContentSize(value) {
  return /^(default|normal|medium|standard)$/i.test(String(value || "default"));
}

function isPortraitOrientation(value) {
  return !value || /^portrait$/i.test(String(value));
}

function isDefaultDisplaySize(value) {
  return /^(default|normal|standard)$/i.test(String(value || "default"));
}

function entryProfiles(entry, platform) {
  const profiles = new Set();
  if (platform === "native-ios") {
    const defaultContent = isDefaultContentSize(entry.contentSize);
    const defaultOrientation = isPortraitOrientation(entry.orientation);
    const noKeyboard = entry.keyboard !== true && entry.focusedEditable !== true;
    if (entry.appearance === "light" && defaultContent && defaultOrientation && noKeyboard) profiles.add("default-light");
    if (entry.appearance === "dark" && defaultContent && defaultOrientation && noKeyboard) profiles.add("dark");
    if (!defaultContent && /large|accessibility/i.test(String(entry.contentSize || ""))) profiles.add("large-text");
    if (entry.keyboard === true || entry.focusedEditable === true) profiles.add("keyboard-focused");
    if (/landscape/i.test(String(entry.orientation || ""))) profiles.add("landscape");
  } else if (platform === "native-android") {
    const fontScale = Number(entry.fontScale || 1);
    const defaultFont = fontScale <= 1.1;
    const defaultDisplay = isDefaultDisplaySize(entry.displaySize);
    const noIme = entry.ime !== true;
    if (entry.theme === "light" && defaultFont && defaultDisplay && noIme) profiles.add("default-light");
    if (entry.theme === "dark" && defaultFont && defaultDisplay && noIme) profiles.add("dark");
    if (fontScale > 1.1) profiles.add("font-scale-large");
    if (entry.ime === true) profiles.add("ime-focused");
    if (!defaultDisplay && /large/i.test(String(entry.displaySize || ""))) profiles.add("display-large");
  }
  return profiles;
}

function normalizeNotApplicableProfiles(value) {
  if (!value) return new Map();
  if (Array.isArray(value)) {
    return new Map(value.filter((entry) => entry?.profile).map((entry) => [entry.profile, entry]));
  }
  return new Map(Object.entries(value).map(([profile, entry]) => [
    profile,
    typeof entry === "string" ? { profile, invalidType: "string", reason: entry } : { profile, ...entry },
  ]));
}

function artifactPublic(entry) {
  if (!entry || typeof entry !== "object") return entry;
  return Object.fromEntries(Object.entries(entry).filter(([key]) => !key.startsWith("_")));
}

function parseTime(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function artifactFreshnessProblems(label, artifact, runWindow, maxEvidenceAgeMs) {
  const problems = [];
  if (!artifact?.exists || artifact._mtimeMs === undefined) return problems;
  const ageMs = Math.max(0, Date.now() - artifact._mtimeMs);
  if (ageMs > maxEvidenceAgeMs) {
    problems.push(`${label}: artifact is ${Math.round(ageMs)}ms old, exceeding max evidence age ${maxEvidenceAgeMs}ms`);
  }
  if (runWindow.finishedAtMs && artifact._mtimeMs > runWindow.finishedAtMs + 2000) {
    problems.push(`${label}: artifact was modified after native report finishedAt`);
  }
  return problems;
}

function nativeRunMetadata(report, maxEvidenceAgeMs) {
  const startedAtMs = parseTime(report.startedAt);
  const finishedAtMs = parseTime(report.finishedAt || report.generatedAt);
  const computedToolingHash = stableHash(stableStringify(report.tooling || {}), 16);
  const problems = [];
  if (!String(report.qaRunId || "").trim()) problems.push("report.qaRunId is required for final native acceptance");
  if (!String(report.startedAt || "").trim()) problems.push("report.startedAt is required for final native acceptance");
  if (!String(report.finishedAt || report.generatedAt || "").trim()) problems.push("report.finishedAt is required for final native acceptance");
  if (!String(report.toolingHash || "").trim()) problems.push(`report.toolingHash is required for final native acceptance; computed toolingHash is ${computedToolingHash}`);
  if (report.startedAt && !startedAtMs) problems.push("report.startedAt must be a parseable timestamp");
  if ((report.finishedAt || report.generatedAt) && !finishedAtMs) problems.push("report.finishedAt must be a parseable timestamp");
  if (startedAtMs && finishedAtMs && finishedAtMs < startedAtMs) problems.push("report.finishedAt must not be earlier than startedAt");
  if (report.toolingHash && report.toolingHash !== computedToolingHash) {
    problems.push(`report.toolingHash ${report.toolingHash} does not match computed tooling hash ${computedToolingHash}`);
  }
  return {
    qaRunId: report.qaRunId || null,
    appBuildId: report.appBuildId || null,
    startedAt: report.startedAt || null,
    finishedAt: report.finishedAt || report.generatedAt || null,
    startedAtMs,
    finishedAtMs,
    toolingHash: report.toolingHash || null,
    computedToolingHash,
    maxEvidenceAgeMs,
    problems,
  };
}

function sanitizeStringForOutput(value, outDir) {
  if (typeof value !== "string") return value;
  const normalizedOut = path.resolve(outDir);
  let result = value.split(normalizedOut).join(".");
  if (path.isAbsolute(result)) {
    const relative = path.relative(outDir, result);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return relative.replaceAll(path.sep, "/");
    return "[absolute-path-redacted]";
  }
  const urls = [];
  result = result.replace(/\bhttps?:\/\/[^\s"'`<>)]+/g, (url) => {
    const token = `__DESIGN_DIRECTOR_URL_${urls.length}__`;
    urls.push([token, url]);
    return token;
  });
  result = result.replace(/(^|[\s("'=])\/(?!\/)(?:[^\s"'`<>)\/]+\/){1,}[^\s"'`<>)]+/g, "$1[absolute-path-redacted]");
  result = result.replace(/(^|[\s("'=])[A-Za-z]:\\(?:Users|Documents and Settings)\\[^\s"'`<>)]+/g, "$1[absolute-path-redacted]");
  for (const [token, url] of urls) result = result.replaceAll(token, url);
  return result;
}

function sanitizeForOutput(value, outDir) {
  if (Array.isArray(value)) return value.map((item) => sanitizeForOutput(item, outDir));
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === "_absolutePath" || key === "absolutePath") continue;
      result[key] = sanitizeForOutput(item, outDir);
    }
    return result;
  }
  return sanitizeStringForOutput(value, outDir);
}

function treeSuggestsEditable(text) {
  return /(XCUIElementTypeTextField|XCUIElementTypeTextView|android\.widget\.EditText|class=\"[^\"]*EditText|editable=\"true\"|<input\b|<textarea\b|contenteditable)/i.test(text || "");
}

function bullet(items) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- None recorded.";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.report) throw new Error("Missing --report");
  if (!["minimal", "standard", "deep"].includes(args.profile)) throw new Error(`Unknown --profile: ${args.profile}`);

  const outDir = path.resolve(args.out);
  await fs.mkdir(outDir, { recursive: true });
  const reportPath = path.resolve(args.report);
  const report = await readJson(reportPath);
  const maxEvidenceAgeMs = Number.isFinite(args.maxEvidenceAgeMs) ? args.maxEvidenceAgeMs : 30 * 60 * 1000;
  const runMetadata = nativeRunMetadata(report, maxEvidenceAgeMs);

  const blockers = [];
  const incomplete = [];
  const warnings = [];
  const evidence = { screenshots: [], trees: [], logs: [] };
  const platform = report.platform;
  const coveredProfiles = new Set();
  const claimedProfiles = new Set();
  const profileEvidence = new Map();
  const treeTexts = [];
  const notApplicableProfiles = normalizeNotApplicableProfiles(report.notApplicableProfiles);

  if (!["native-ios", "native-android"].includes(platform)) {
    incomplete.push("platform must be native-ios or native-android");
  }

  addMissingFields(incomplete, report, ["target", "tooling", "matrix", "checks", "logs"], "report");
  if (platform === "native-ios" && !(report.target?.project || report.target?.workspace)) {
    incomplete.push("target: missing project or workspace");
  }
  addMissingFields(incomplete, report.target || {}, requiredTargetFields(platform), "target");
  if (!Array.isArray(report.tooling?.commandsOrToolCalls) || !report.tooling.commandsOrToolCalls.length) {
    incomplete.push("tooling: missing commandsOrToolCalls");
  }
  if (!Array.isArray(report.matrix) || !report.matrix.length) {
    incomplete.push("matrix: at least one captured state is required");
  }
  if (report.waivers !== undefined) {
    incomplete.push("report.waivers is not supported by native-qa-report; use notApplicableProfiles for profile exceptions and keep design waivers in the human report");
  }
  incomplete.push(...runMetadata.problems);

  const treeField = matrixTreeField(platform);
  for (const [index, entry] of (report.matrix || []).entries()) {
    const label = entry.state || `matrix[${index}]`;
    const required = platform === "native-ios"
      ? ["state", "appearance", "contentSize", "orientation", "screenshot", treeField, "result"]
      : ["state", "theme", "fontScale", "displaySize", "screenshot", treeField, "result"];
    addMissingFields(incomplete, entry, required, label);
    if (platform === "native-ios" && entry.appearance === "both") {
      incomplete.push(`${label}: appearance must be light or dark; capture separate entries instead of both`);
    }
    if (platform === "native-android" && entry.theme === "both") {
      incomplete.push(`${label}: theme must be light or dark; capture separate entries instead of both`);
    }

    let image = null;
    let tree = null;
    if (entry.screenshot) {
      image = await inspectImage(entry.screenshot, outDir);
      evidence.screenshots.push(artifactPublic(image));
      if (!image.valid) incomplete.push(`${label}: screenshot ${artifactPath(outDir, entry.screenshot)} ${image.reason}`);
      incomplete.push(...artifactFreshnessProblems(`${label}: screenshot ${artifactPath(outDir, entry.screenshot)}`, image, runMetadata, maxEvidenceAgeMs));
    }
    if (entry[treeField]) {
      tree = await inspectTextArtifact(entry[treeField], outDir);
      evidence.trees.push(artifactPublic(tree));
      if (!tree.valid) incomplete.push(`${label}: ${treeField} ${artifactPath(outDir, entry[treeField])} ${tree.reason}`);
      incomplete.push(...artifactFreshnessProblems(`${label}: ${treeField} ${artifactPath(outDir, entry[treeField])}`, tree, runMetadata, maxEvidenceAgeMs));
      if (tree.valid) {
        treeTexts.push(await fs.readFile(tree._absolutePath, "utf8"));
      }
    }
    if (["fail", "blocked"].includes(entry.result)) blockers.push(`${label}: result is ${entry.result}`);
    if (entry.result === "needs-review") {
      if (args.partial) warnings.push(`${label}: result needs review`);
      else incomplete.push(`${label}: result needs review`);
    }
    const inferred = entryProfiles(entry, platform);
    const declared = declaredProfiles(entry);
    for (const profile of declared) {
      claimedProfiles.add(profile);
      if (!inferred.has(profile)) warnings.push(`${label}: declared profile ${profile} is not supported by state metadata and does not count toward required coverage`);
    }
    for (const profile of inferred) {
      coveredProfiles.add(profile);
      if (!profileEvidence.has(profile)) profileEvidence.set(profile, []);
      profileEvidence.get(profile).push({
        label,
        screenshot: entry.screenshot ? artifactPath(outDir, entry.screenshot) : null,
        tree: entry[treeField] ? artifactPath(outDir, entry[treeField]) : null,
        screenshotHash: image?.sha256 || null,
        treeHash: tree?.sha256 || null,
      });
    }
  }

  const requiredProfiles = requiredProfilesFor(platform, args.profile);
  if (!requiredProfiles) {
    incomplete.push("profile coverage can only be checked for native-ios or native-android");
  } else {
    const usedProfileScreenshots = new Set();
    const usedProfileTrees = new Set();
    const usedProfileScreenshotHashes = new Set();
    const usedProfileTreeHashes = new Set();
    for (const profile of requiredProfiles) {
      if (coveredProfiles.has(profile)) continue;
      const notApplicable = notApplicableProfiles.get(profile);
      if (notApplicable) {
        const reason = String(notApplicable.reason || "").trim();
        const evidenceFile = notApplicable.evidence;
        if (notApplicable.invalidType === "string") {
          incomplete.push(`required profile not applicable record must include reason and evidence object: ${profile}`);
        }
        if (!reason) incomplete.push(`required profile not applicable record is missing a reason: ${profile}`);
        if (!evidenceFile) {
          incomplete.push(`required profile not applicable record is missing evidence: ${profile}`);
        } else {
          const evidenceArtifact = await inspectTextArtifact(evidenceFile, outDir);
          evidence.trees.push(artifactPublic({ ...evidenceArtifact, notApplicableProfile: profile }));
          if (!evidenceArtifact.valid) incomplete.push(`required profile not applicable evidence invalid for ${profile}: ${artifactPath(outDir, evidenceFile)} ${evidenceArtifact.reason}`);
          else if (["keyboard-focused", "ime-focused"].includes(profile)) {
            const evidenceText = await fs.readFile(evidenceArtifact._absolutePath, "utf8");
            if (treeSuggestsEditable(evidenceText) || treeTexts.some(treeSuggestsEditable)) {
              incomplete.push(`required profile ${profile} cannot be marked not applicable because hierarchy evidence contains editable fields`);
            } else {
              warnings.push(`required profile marked not applicable: ${profile} (${reason})`);
            }
          } else {
            warnings.push(`required profile marked not applicable: ${profile} (${reason})`);
          }
        }
      } else {
        incomplete.push(`required profile not covered: ${profile}`);
      }
    }
    for (const profile of requiredProfiles) {
      if (!coveredProfiles.has(profile)) continue;
      const candidates = profileEvidence.get(profile) || [];
      const unique = candidates.find((candidate) =>
        candidate.screenshot &&
        candidate.tree &&
        candidate.screenshotHash &&
        candidate.treeHash &&
        !usedProfileScreenshots.has(candidate.screenshot) &&
        !usedProfileTrees.has(candidate.tree) &&
        !usedProfileScreenshotHashes.has(candidate.screenshotHash) &&
        !usedProfileTreeHashes.has(candidate.treeHash)
      );
      if (!unique) {
        incomplete.push(`required profile lacks unique screenshot/tree evidence and artifact hashes: ${profile}`);
      } else {
        usedProfileScreenshots.add(unique.screenshot);
        usedProfileTrees.add(unique.tree);
        usedProfileScreenshotHashes.add(unique.screenshotHash);
        usedProfileTreeHashes.add(unique.treeHash);
      }
    }
  }

  if (report.checks?.logsReviewed !== "checked") {
    incomplete.push("checks.logsReviewed must be checked");
  }
  const logPaths = asArray(report.logs);
  if (!logPaths.length) incomplete.push("logs: at least one log artifact path is required");
  for (const logPath of logPaths) {
    const log = await inspectLogArtifact(logPath, outDir);
    evidence.logs.push(artifactPublic(log));
    if (!log.exists) {
      incomplete.push(`logs: ${artifactPath(outDir, logPath)} ${log.reason}`);
    } else if (log.crashSignature) {
      blockers.push(`logs: ${artifactPath(outDir, logPath)} contains crash signature`);
    }
    incomplete.push(...artifactFreshnessProblems(`logs: ${artifactPath(outDir, logPath)}`, log, runMetadata, maxEvidenceAgeMs));
  }

  for (const blocker of report.blockers || []) blockers.push(sanitizeStringForOutput(String(blocker), outDir));
  for (const warning of report.warnings || []) warnings.push(sanitizeStringForOutput(String(warning), outDir));

  const status = blockers.length ? "fail" : incomplete.length ? "incomplete" : "pass";
  const nativeEvidenceHash = stableHash(stableStringify({
    platform,
    run: {
      qaRunId: runMetadata.qaRunId,
      appBuildId: runMetadata.appBuildId,
      startedAt: runMetadata.startedAt,
      finishedAt: runMetadata.finishedAt,
      toolingHash: runMetadata.toolingHash,
    },
    evidence,
  }), 16);
  const qa = {
    generatedAt: new Date().toISOString(),
    tool: "native-qa-report",
    reportPath: artifactPath(outDir, reportPath),
    platform,
    status,
    blockers,
    incomplete,
    warnings,
    profile: args.profile,
    requiredProfiles: requiredProfiles || [],
    coveredProfiles: [...coveredProfiles].sort(),
    claimedProfiles: [...claimedProfiles].sort(),
    notApplicableProfiles: [...notApplicableProfiles.keys()].sort(),
    runMetadata: artifactPublic(runMetadata),
    nativeEvidenceHash,
    evidence,
    acceptanceReady: status === "pass" && !args.partial,
  };

  const publicQa = sanitizeForOutput(qa, outDir);
  const publicBlockers = publicQa.blockers || [];
  const publicIncomplete = publicQa.incomplete || [];
  const publicWarnings = publicQa.warnings || [];
  await fs.writeFile(path.join(outDir, "native-design-qa.json"), `${JSON.stringify(publicQa, null, 2)}\n`);
  await fs.writeFile(path.join(outDir, "native-design-qa.md"), sanitizeStringForOutput(`# Native Design QA

Status: ${status}
Acceptance ready: ${qa.acceptanceReady ? "yes" : "no"}

## Blockers

${bullet(publicBlockers)}

## Incomplete Evidence

${bullet(publicIncomplete)}

## Warnings

${bullet(publicWarnings)}
`, outDir));

  console.log(`native-qa-report: wrote ${path.join(outDir, "native-design-qa.json")} (${status})`);
  if (blockers.length) process.exitCode = 1;
  else if (incomplete.length && args.partial && !args.allowPartialExitZero) process.exitCode = 2;
  else if (incomplete.length && !args.partial) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`native-qa-report: ${error.message}`);
  process.exit(1);
});
