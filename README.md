# Design Director Orchestrator

Design Director is a Codex skill for governing UI design work that needs more than a single visual pass. It routes design tasks, records source-of-truth decisions, controls reference usage, and requires rendered QA with interactive state checks before design work is accepted.

## What It Does

- Routes high-risk or multi-surface UI work to the right design owner.
- Creates a design brief with source priorities, anti-goals, references, owners, and acceptance gates.
- Limits external references to named brief questions and records what must not be copied.
- Requires rendered QA across mobile, tablet, and desktop viewports.
- Exercises active UI states such as search suggestions, dropdowns, comboboxes, popovers, dialogs, chart controls, details panels, tabs, and mobile navigation.
- Flags technical design failures: console errors, horizontal overflow, clipped text, tiny text, tap-target issues, inaccessible focus paths, hover-only content, and missing reduced-motion paths.
- Flags visual consistency failures: peer typography mismatches, grid alignment drift, spacing outliers, media/title anchoring problems, related-width mismatches, camouflaged controls, and occluded or clipped overlays.

## Repository Layout

- `SKILL.md`: main Design Director orchestration instructions.
- `agents/openai.yaml`: skill display metadata.
- `references/`: governance references for intake, routing, handoffs, external references, dense apps, motion, and validation.
- `scripts/render-check.mjs`: Playwright screenshot and console/page-error capture.
- `scripts/dom-audit.mjs`: DOM-level audit for overflow, clipping, text size, tap targets, labels, and hover-only candidates.
- `scripts/visual-consistency-audit.mjs`: visual consistency and overlay stacking audit.
- `scripts/discover-states.mjs`: active-state discovery for controls, overlays, scroll containers, charts, canvas/SVG, and form surfaces.
- `scripts/qa-report.mjs`: merges web audit artifacts into `.design-director/design-qa.json` and `.design-director/design-qa.md`.
- `scripts/native-qa-report.mjs`: validates native iOS/Android QA reports and evidence files.
- `scripts/lib/`: shared Playwright/browser/action/finding helpers.
- `schemas/`: JSON Schemas for native QA reports; the web render config schema lives at `scripts/render.config.schema.json`.
- `fixtures/`: generic paired good/bad fixtures for audit regression checks.
- `examples/`: reusable example configs and QA note templates.
- `references/native-ios-qa.md` and `references/native-android-qa.md`: operational report contracts for native app QA.
- `PROVENANCE.md`: public-safe provenance for bundled files.
- `REFERENCED_SKILLS.md`: referenced skills and license status notes.
- `REFERENCE_LICENSE_POLICY.md`: external website, asset, component, and implementation-reference license policy.

## Installation

Clone the repository, install dependencies, and run the smoke tests:

```sh
git clone https://github.com/drundoor/design-director-orchestrator.git
cd design-director-orchestrator
npm install
npx playwright install chromium
npm test
npm run smoke:web
npm run smoke:native
npm run smoke:native:fail
```

Copy or symlink it into your Codex skills directory:

```sh
mkdir -p ~/.codex/skills
ln -s "$(pwd)" ~/.codex/skills/design-director
```

Or run the local installer from the cloned repo:

```sh
node scripts/install-local.mjs --dry-run --symlink
node scripts/install-local.mjs --symlink
```

Use `--copy` instead of `--symlink` if your environment does not support symlinks; the installer excludes `.git`, `node_modules`, local QA output, screenshots, reports, logs, and scratch files. Use `--name <skill-name>` for non-Codex skill directories or `--target <path>` for a custom install path. Use `--force` only when replacing an existing install is intended.

If you must copy manually, avoid raw `cp -R .` because it can include generated reports or local scratch data. Prefer:

```sh
rsync -a --exclude='.git' --exclude='node_modules' --exclude='.design-director' --exclude='test-results' --exclude='playwright-report' --exclude='.codex-scratch-*' ./ ~/.codex/skills/design-director/
```

Expected verification output:

```sh
npm test
# all tests pass
node scripts/install-local.mjs --dry-run
# prints repository, target, and mode without changing files
npm run smoke:native:fail
# exits successfully only when intentionally missing native evidence is rejected
```

Troubleshooting:

- If Playwright cannot launch a browser, run `npx playwright install chromium` or set `DESIGN_DIRECTOR_NODE_MODULES` to a `node_modules` folder containing Playwright.
- If `~/.codex/skills/design-director` already exists, use a symlink to this clone, remove the old install yourself, or run `node scripts/install-local.mjs --force` after verifying the target.
- If `qa-report.mjs` exits with `status: incomplete`, inspect `design-qa.md`; missing artifacts, generated screenshot-note templates, or missing discovery are acceptance failures unless `--static`, `--partial`, or a scoped waiver is explicitly appropriate.

## AI-Assisted Install Prompts

For Codex:

```text
Install https://github.com/drundoor/design-director-orchestrator as a local Codex skill named design-director. Clone the repo, run `npm install`, run `npx playwright install chromium`, run `node scripts/install-local.mjs --dry-run --symlink`, install with `node scripts/install-local.mjs --symlink`, then verify that `SKILL.md` is valid and that `npm test` passes.
```

For Claude or another coding agent:

```text
Clone https://github.com/drundoor/design-director-orchestrator. Run `npm install`, `npx playwright install chromium`, and `npm test`. If your environment supports Codex-style skills, install it as a skill folder named design-director. Otherwise, use SKILL.md as the entrypoint instructions and load files from references/ only when the task needs them.
```

Generic manual install:

```text
Put this repository at <AI skills directory>/design-director or add SKILL.md as the agent instruction entrypoint. Keep references/ and scripts/ next to SKILL.md so the agent can load them progressively.
```

## When To Use It

Use Design Director when a UI/design task has any of these characteristics:

- Multiple screens, breakpoints, or surfaces.
- Dense dashboards, data tables, visualizations, catalogs, maps, boards, or reference apps.
- Conflicting sources of truth such as existing code, accessibility, data semantics, screenshots, or user complaints.
- Repeated visual regressions or “AI slop” complaints.
- Final rendered QA before shipping or deployment.

For narrow CSS fixes, simple icon swaps, or one obvious single-specialist task, use the direct specialist instead.

## Prompt Patterns

Use intent plus platform/surface:

- `audit + dashboard`: "Audit this dashboard and report design/interaction risks only. Do not change code."
- `repair + web-app`: "Repair the mobile filter drawer clipping behind the chart and verify it."
- `revamp + marketing-web`: "Revamp the homepage, preserve product constraints, and verify at mobile/tablet/desktop."
- `study + web-app`: "Study these eight onboarding sites and extract transferable patterns only."
- `concept + product-ui`: "Create three visual directions for the settings screen, no implementation yet."
- `implement`: "Implement the chosen direction and run rendered QA on active states."
- `qa + native-ios`: "Run native iOS QA on the SwiftUI app in Simulator, including Dynamic Type and dark mode."
- `qa + native-android`: "Run Android visual/accessibility QA on the Compose screen in emulator."

The intent is separate from the platform. Use `repair + native-ios` or `qa + native-android`; do not invent combined modes.

## Rendered QA Workflow

1. Start the local app or point the config at a deployed URL.
2. Run state discovery or explicitly waive it for static pages.
3. Create or update `.design-director/render.config.json`.
4. Run the render, DOM, and visual-consistency audits.
5. Generate screenshot notes and inspect screenshots, including focused active states.
6. Generate the QA report.
7. Do not accept the design pass while unwaived blockers remain.

Example:

```sh
node ~/.codex/skills/design-director/scripts/discover-states.mjs \
  --url http://127.0.0.1:5173 \
  --depth 2 \
  --out .design-director

node ~/.codex/skills/design-director/scripts/render-check.mjs \
  --config .design-director/render.config.json \
  --out .design-director

node ~/.codex/skills/design-director/scripts/dom-audit.mjs \
  --config .design-director/render.config.json \
  --out .design-director

node ~/.codex/skills/design-director/scripts/visual-consistency-audit.mjs \
  --config .design-director/render.config.json \
  --out .design-director

node ~/.codex/skills/design-director/scripts/qa-report.mjs \
  --init-notes \
  --out .design-director
```

Final web acceptance means `.design-director/design-qa.json` has `status: "pass"` and `acceptanceReady: true`.

For non-interactive static pages only, add `--static` to waive state discovery. Static mode still fails if the DOM audit finds visible interactive controls. For draft reports that intentionally do not yet have all evidence, add `--partial`; partial reports are not acceptance evidence and exit nonzero unless `--allow-partial-exit-zero` is explicitly supplied.

Minimum successful web QA artifact tree:

```text
.design-director/
  render-results.json
  dom-audit.json
  visual-consistency-audit.json
  screenshot-notes.md
  design-qa.json
  design-qa.md
  screenshots/
```

For native apps, collect the platform report and validate it:

```sh
node ~/.codex/skills/design-director/scripts/native-qa-report.mjs \
  --report .design-director/native-ios-qa.json \
  --profile standard \
  --out .design-director
```

Native final QA defaults to the `standard` profile. Standard iOS requires default-light, dark, large-text, and keyboard-focused coverage. Standard Android requires default-light, dark, font-scale-large, and IME-focused coverage. Use `--profile minimal` only for quick audits, and `--profile deep` when orientation/display-size variants are in scope.

Minimum successful native QA artifact tree:

```text
.design-director/
  native-ios-qa.json or native-android-qa.json
  native-design-qa.json
  native-design-qa.md
  screenshots or platform-named image files
  UI hierarchy/tree captures
  runtime log capture
```

Native smoke samples:

```sh
npm run smoke:native
# builds a lightweight passing native QA fixture
npm run smoke:native:fail
# builds a missing-evidence fixture and verifies the validator rejects it
```

## Active State Config

The QA scripts support state actions so the design pass can inspect UI while it is actually being used. This is required for interactive surfaces.

```json
{
  "url": "http://127.0.0.1:5173",
  "waitForSelector": "main",
  "qaProfile": "final-qa",
  "surface": "dashboard",
  "states": [
    {
      "name": "default",
      "path": "/",
      "waitMs": 500
    },
    {
      "name": "search-open",
      "path": "/",
      "actions": [
        { "type": "fill", "selector": "#searchInput", "value": "ark" },
        { "type": "waitForSelector", "selector": "#searchSuggestions" },
        { "type": "wait", "ms": 300 }
      ]
    },
    {
      "name": "theme-filter-open",
      "path": "/",
      "actions": [
        { "type": "click", "selector": "#advancedFiltersToggle" },
        { "type": "fill", "selector": "#themeInput", "value": "space" },
        { "type": "waitForSelector", "selector": "#themeOptions" },
        { "type": "wait", "ms": 300 }
      ]
    }
  ],
  "viewports": [
    { "width": 320, "height": 900 },
    { "width": 375, "height": 900 },
    { "width": 768, "height": 1024 },
    { "width": 1440, "height": 1000 }
  ],
  "visualAudit": {
    "componentSelectors": [".card", "[data-card]"],
    "peerValueSelectors": [".metric-value"],
    "overlaySelectors": ["[role='listbox'][data-state='open']"],
    "ignoreSelectors": [".visually-hidden"]
  }
}
```

Supported action types include `click`, `fill`, `type`, `focus`, `blur`, `hover`, `press`, `keyboardShortcut`, `select`, `check`, `uncheck`, `wait`, `waitForSelector`, `waitForNetworkIdle`, `waitForStableLayout`, `reload`, `scrollIntoView`, `scrollBy`, `scrollTo`, `wheel`, `drag`, `resizeViewport`, `setViewport`, `setLocalStorage`, `setSessionStorage`, `clearStorage`, `assertVisible`, `assertHidden`, `assertText`, `assertNoHorizontalOverflow`, `screenshotElement`, and `scrollBoundaryCheck`.

Validate config shape with `scripts/render.config.schema.json` when your editor or CI supports JSON Schema.

Waivers live in `.design-director/waivers.json`; see `examples/waivers.example.json`. Every final-QA waiver needs a check, reason, evidence, owner, and expiry date. Scope waivers to a state, selector, route, or viewport whenever possible; unused valid waivers fail the QA report so stale waivers do not accumulate.

## Reference Depth

External references have three depths:

- `reference_survey`: 4-12 sources for broad pattern discovery only.
- `active_references`: 1-5 sources shaping a direction.
- `implementation_locks`: 1-3 sources for concrete details.

No reference may override local truth, accessibility, data semantics, design-system constraints, or user anti-goals.

## Browser Tool Rule

The skill requires interactive browser evidence, not just static screenshots.

- Use the Browser plugin for local web targets such as `localhost`, `127.0.0.1`, and local static files.
- Use the Chrome plugin for deployed URLs, existing authenticated/profile-dependent tabs, or when Chrome is explicitly requested.
- Use Computer Use only when Browser or Chrome cannot exercise the surface.

## License Status

This repository includes the Design Director skill files, public-safe references, generic fixtures, and supporting scripts. Other locally referenced skills are listed in `REFERENCED_SKILLS.md` and are not bundled unless an explicit license/source was found.

No legal advice is provided here. Verify license terms before redistributing third-party skill content.
