#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

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
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function usage() {
  return `Usage: native-qa-report.mjs --report .design-director/native-ios-qa.json [--out .design-director] [--profile minimal|standard|deep] [--partial] [--allow-partial-exit-zero]

Validates native iOS/Android QA report evidence and writes:
- native-design-qa.json
- native-design-qa.md

Missing screenshots, UI hierarchy/tree captures, logs, required profile coverage,
or target/tool metadata make the report incomplete. Failed/blocked matrix states
are blockers; needs-review is incomplete unless --partial is supplied.`;
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
  }
  return null;
}

async function inspectImage(file, outDir) {
  const absolute = evidencePath(outDir, file);
  if (!absolute) return { path: file, exists: false, valid: false, reason: "path missing" };
  try {
    const data = await fs.readFile(absolute);
    const isPng = data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a;
    const isJpeg = data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    const isWebp = data.length >= 12 && data.slice(0, 4).toString("ascii") === "RIFF" && data.slice(8, 12).toString("ascii") === "WEBP";
    const dimensions = imageDimensions(data, { isPng, isJpeg, isWebp });
    const valid = data.length > 16 && (isPng || isJpeg || isWebp) && dimensions && dimensions.width >= 24 && dimensions.height >= 24;
    return { path: artifactPath(outDir, file), _absolutePath: absolute, exists: true, valid, size: data.length, width: dimensions?.width || null, height: dimensions?.height || null, reason: valid ? null : "not a valid or meaningful PNG, JPEG, or WebP image with readable dimensions" };
  } catch (error) {
    if (error.code === "ENOENT") return { path: artifactPath(outDir, file), _absolutePath: absolute, exists: false, valid: false, reason: "file is missing" };
    throw error;
  }
}

async function inspectTextArtifact(file, outDir) {
  const absolute = evidencePath(outDir, file);
  if (!absolute) return { path: file, exists: false, valid: false, reason: "path missing" };
  try {
    const stat = await fs.stat(absolute);
    return { path: artifactPath(outDir, file), _absolutePath: absolute, exists: true, valid: stat.size > 0, size: stat.size, reason: stat.size > 0 ? null : "file is empty" };
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

function entryProfiles(entry, platform) {
  const profiles = new Set();
  const stateText = String(entry.state || "").toLowerCase();
  if (platform === "native-ios") {
    if (entry.appearance === "light") profiles.add("default-light");
    if (entry.appearance === "dark") profiles.add("dark");
    if (/large|accessibility/i.test(String(entry.contentSize || ""))) profiles.add("large-text");
    if (entry.keyboard || /keyboard|focused|form/.test(stateText)) profiles.add("keyboard-focused");
    if (/landscape/i.test(String(entry.orientation || ""))) profiles.add("landscape");
  } else if (platform === "native-android") {
    if (entry.theme === "light") profiles.add("default-light");
    if (entry.theme === "dark") profiles.add("dark");
    if (Number(entry.fontScale || 1) > 1.1) profiles.add("font-scale-large");
    if (entry.ime || /ime|keyboard|focused|form/.test(stateText)) profiles.add("ime-focused");
    if (/large/i.test(String(entry.displaySize || ""))) profiles.add("display-large");
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
    typeof entry === "string" ? { profile, reason: entry } : { profile, ...entry },
  ]));
}

function artifactPublic(entry) {
  if (!entry || typeof entry !== "object") return entry;
  const { _absolutePath, ...publicEntry } = entry;
  return publicEntry;
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

  const blockers = [];
  const incomplete = [];
  const warnings = [];
  const evidence = { screenshots: [], trees: [], logs: [] };
  const platform = report.platform;
  const coveredProfiles = new Set();
  const claimedProfiles = new Set();
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

  const treeField = matrixTreeField(platform);
  for (const [index, entry] of (report.matrix || []).entries()) {
    const label = entry.state || `matrix[${index}]`;
    const required = platform === "native-ios"
      ? ["state", "appearance", "contentSize", "orientation", "screenshot", treeField, "result"]
      : ["state", "theme", "fontScale", "displaySize", "screenshot", treeField, "result"];
    addMissingFields(incomplete, entry, required, label);

    if (entry.screenshot) {
      const image = await inspectImage(entry.screenshot, outDir);
      evidence.screenshots.push(artifactPublic(image));
      if (!image.valid) incomplete.push(`${label}: screenshot ${artifactPath(outDir, entry.screenshot)} ${image.reason}`);
    }
    if (entry[treeField]) {
      const tree = await inspectTextArtifact(entry[treeField], outDir);
      evidence.trees.push(artifactPublic(tree));
      if (!tree.valid) incomplete.push(`${label}: ${treeField} ${artifactPath(outDir, entry[treeField])} ${tree.reason}`);
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
    for (const profile of inferred) coveredProfiles.add(profile);
  }

  const requiredProfiles = requiredProfilesFor(platform, args.profile);
  if (!requiredProfiles) {
    incomplete.push("profile coverage can only be checked for native-ios or native-android");
  } else {
    for (const profile of requiredProfiles) {
      if (coveredProfiles.has(profile)) continue;
      const notApplicable = notApplicableProfiles.get(profile);
      if (notApplicable) {
        const reason = String(notApplicable.reason || "").trim();
        const evidenceFile = notApplicable.evidence;
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
  }

  if (report.checks?.logsReviewed !== "checked") {
    incomplete.push("checks.logsReviewed must be checked");
  }
  const logPaths = asArray(report.logs);
  if (!logPaths.length) incomplete.push("logs: at least one log artifact path is required");
  for (const logPath of logPaths) {
    const log = await inspectLogArtifact(logPath, outDir);
    evidence.logs.push(artifactPublic(log));
    if (!log.exists) incomplete.push(`logs: ${artifactPath(outDir, logPath)} ${log.reason}`);
    else if (log.crashSignature) blockers.push(`logs: ${artifactPath(outDir, logPath)} contains crash signature`);
  }

  for (const blocker of report.blockers || []) blockers.push(String(blocker));
  for (const warning of report.warnings || []) warnings.push(String(warning));

  const status = blockers.length ? "fail" : incomplete.length ? "incomplete" : "pass";
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
    evidence,
    acceptanceReady: status === "pass" && !args.partial,
  };

  await fs.writeFile(path.join(outDir, "native-design-qa.json"), `${JSON.stringify(qa, null, 2)}\n`);
  await fs.writeFile(path.join(outDir, "native-design-qa.md"), `# Native Design QA

Status: ${status}
Acceptance ready: ${qa.acceptanceReady ? "yes" : "no"}

## Blockers

${bullet(blockers)}

## Incomplete Evidence

${bullet(incomplete)}

## Warnings

${bullet(warnings)}
`);

  console.log(`native-qa-report: wrote ${path.join(outDir, "native-design-qa.json")} (${status})`);
  if (blockers.length) process.exitCode = 1;
  else if (incomplete.length && args.partial && !args.allowPartialExitZero) process.exitCode = 2;
  else if (incomplete.length && !args.partial) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`native-qa-report: ${error.message}`);
  process.exit(1);
});
