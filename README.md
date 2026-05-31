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
- `scripts/qa-report.mjs`: merges audit artifacts into `.design-director/design-qa.json` and `.design-director/design-qa.md`.
- `SOURCES.md`: local source paths used to create this repository.
- `REFERENCED_SKILLS.md`: referenced skills and license status notes.
- `REFERENCE_LICENSE_POLICY.md`: external website, asset, component, and implementation-reference license policy.

## Installation

Clone the repository and copy or symlink it into your Codex skills directory:

```sh
git clone https://github.com/drundoor/design-director-orchestrator.git
mkdir -p ~/.codex/skills
ln -s "$(pwd)/design-director-orchestrator" ~/.codex/skills/design-director
```

If you prefer copying instead of symlinking:

```sh
cp -R design-director-orchestrator ~/.codex/skills/design-director
```

## When To Use It

Use Design Director when a UI/design task has any of these characteristics:

- Multiple screens, breakpoints, or surfaces.
- Dense dashboards, data tables, visualizations, catalogs, maps, boards, or reference apps.
- Conflicting sources of truth such as existing code, accessibility, data semantics, screenshots, or user complaints.
- Repeated visual regressions or “AI slop” complaints.
- Final rendered QA before shipping or deployment.

For narrow CSS fixes, simple icon swaps, or one obvious single-specialist task, use the direct specialist instead.

## Rendered QA Workflow

1. Start the local app or point the config at a deployed URL.
2. Create `.design-director/render.config.json`.
3. Run the render, DOM, and visual-consistency audits.
4. Inspect screenshots, including focused active states.
5. Generate the QA report.
6. Do not accept the design pass while unwaived blockers remain.

Example:

```sh
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
  --out .design-director
```

## Active State Config

The QA scripts support state actions so the design pass can inspect UI while it is actually being used. This is required for interactive surfaces.

```json
{
  "url": "http://127.0.0.1:5173",
  "waitForSelector": "main",
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
  ]
}
```

Supported action types include `click`, `fill`, `type`, `focus`, `hover`, `press`, `select`, `check`, `uncheck`, `wait`, `waitForSelector`, `scrollIntoView`, `scrollBy`, and `scrollTo`.

## Browser Tool Rule

The skill requires interactive browser evidence, not just static screenshots.

- Use the Browser plugin for local web targets such as `localhost`, `127.0.0.1`, and local static files.
- Use the Chrome plugin for deployed URLs, existing authenticated/profile-dependent tabs, or when Chrome is explicitly requested.
- Use Computer Use only when Browser or Chrome cannot exercise the surface.

## License Status

This repository includes only the Design Director skill files copied from the local Codex skill directory. Other locally referenced skills are listed in `REFERENCED_SKILLS.md` and are not bundled unless an explicit license/source was found.

No legal advice is provided here. Verify license terms before redistributing third-party skill content.
