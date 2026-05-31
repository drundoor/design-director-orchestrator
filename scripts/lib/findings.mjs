export const SEVERITY = {
  BLOCKER: "blocker",
  WARNING: "warning",
  INFO: "info",
};

export const LOW_FALSE_POSITIVE_BLOCKERS = new Set([
  "page-error",
  "horizontal-overflow",
  "overlay-viewport-clipped",
  "overlay-occluded",
  "chart-data-mismatch",
  "missing-screenshot-notes",
  "state-discovery-missing",
]);

export function createFindingCollector({ maxBlockers = 80, maxWarnings = 80, maxInfo = 120 } = {}) {
  const seen = new Set();
  const blockers = [];
  const warnings = [];
  const info = [];
  const add = (severity, finding) => {
    const key = `${finding.type}|${finding.selector || ""}|${finding.message || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (severity === SEVERITY.BLOCKER && blockers.length < maxBlockers) blockers.push(finding);
    else if (severity === SEVERITY.WARNING && warnings.length < maxWarnings) warnings.push(finding);
    else if (info.length < maxInfo) info.push(finding);
  };
  return { blockers, warnings, info, add };
}
