# Design Director Orchestrator

Design Director is a Codex skill for UI work that needs more than a quick
style pass. It keeps the work grounded in a brief, checks references before
using them, opens the app, exercises real UI states, and refuses final approval
when evidence is stale or incomplete.

Use it when a design bug made it to review, when a page needs a real revamp, or
when you want a new interface built with QA baked in from the start.

## What It Does

- Audits web, iOS, Android, game/canvas, dashboard, and data-viz surfaces.
- Creates a brief with source truth, anti-goals, references, owners, and gates.
- Checks active states: dropdowns, search suggestions, popovers, dialogs,
  drawers, charts, tabs, mobile nav, and details panels.
- Catches practical UI failures: clipped overlays, hidden controls, tiny text,
  horizontal overflow, weak focus paths, stale screenshots, inconsistent fonts,
  spacing drift, and missing reduced-motion paths.
- Records outside inspiration with license, allowed use, and do-not-copy rules
  before it can shape implementation.

For a tiny CSS fix, use the normal coding flow. For anything visual that can
break across states, screens, or platforms, use this.

## Ask It Like This

Plain language is enough. Useful prompts:

- "Check this UI for design problems. Do not change code."
- "Fix this visual bug and verify it on mobile and desktop."
- "Make this page look much better, but preserve the product behavior."
- "Give me three design directions before writing code."
- "Build a new marketing site for this product and guide the visual direction."
- "Create a new dashboard from this data and make it feel like a polished SaaS tool."
- "Use these screenshots as inspiration, but do not copy their layout or assets."
- "Research reputable open-source UI libraries and design skills we can lawfully reference for this app; do not copy assets."
- "Redesign this iPhone screen and run native iOS QA with dark mode and Dynamic Type."
- "Audit this Android Compose screen with font scale, dark theme, and IME states."
- "Improve this game/canvas UI and verify input, overlays, and canvas bounds."
- "Run final design QA and tell me whether it is acceptance ready."

You can also name the flow directly:

- `audit`: inspect and report, no code changes.
- `repair`: fix a specific visual or interaction bug.
- `revamp`: redesign an existing surface while preserving behavior.
- `concept`: produce directions before implementation.
- `study`: research references and extract principles only.
- `create`: build a new site, app screen, dashboard, or tool.
- `qa`: run evidence-backed final design checks.

The intent is separate from the platform. Say `repair + native-ios`,
`qa + native-android`, `create + dashboard`, or `revamp + marketing-web`.

## AI-Assisted Install

If you want another coding agent to install it for you, paste one of these.

For Codex:

```text
Install https://github.com/drundoor/design-director-orchestrator as a local Codex skill named design-director. Clone the repo, run `npm run setup`, run `npm run verify`, run `node scripts/install-local.mjs --dry-run --symlink`, then install with `node scripts/install-local.mjs --symlink`. After install, verify that `SKILL.md` is valid and that `npm run verify` passes.
```

For Claude or another coding agent:

```text
Clone https://github.com/drundoor/design-director-orchestrator. Run `npm run setup` and `npm run verify`. If your environment supports Codex-style skills, install it as a skill folder named design-director. Otherwise, use SKILL.md as the entrypoint instructions and load files from references/ only when the task needs them.
```

## Terminal Install

For most Codex users:

```sh
git clone https://github.com/drundoor/design-director-orchestrator.git
cd design-director-orchestrator
npm run setup
npm run verify
node scripts/install-local.mjs --dry-run --symlink
node scripts/install-local.mjs --symlink
```

Use `--copy` instead of `--symlink` if your environment does not handle
symlinks well. Use `--name <skill-name>` for a custom skill name or
`--target <path>` for a custom skills directory.

Restart Codex after installing a new skill.

## Quick Start

For a new build, start with a brief and research ledger:

```sh
npm run brief:new -- --surface marketing-web
npm run research:ledger
```

For a web app draft QA run:

```sh
npm run qa:web:draft -- --url http://127.0.0.1:5173
```

For a static page:

```sh
npm run qa:web:draft -- --url file:///absolute/path/page.html --static
```

For final web QA:

```sh
npm run qa:web:final -- --config .design-director/render.config.json
```

For CI:

```sh
npm run qa:web:ci -- --config .design-director/render.config.json
```

For native apps:

```sh
npm run qa:native:ios -- --report .design-director/native-ios-qa.json
npm run qa:native:android -- --report .design-director/native-android-qa.json
```

## Draft Vs Final QA

Draft QA is for collecting evidence and finding problems. It may create
screenshots, initialize notes, and write `ACCEPTANCE_READY=false`.

Final QA is stricter. It passes only when:

- `.design-director/design-brief.md` exists.
- Discovery, render, DOM, visual audit, screenshot notes, and coverage all refer
  to the same configured `qaRunId`.
- `design-qa.json` has `status: "pass"` and `acceptanceReady: true`.
- Every relevant active state has been rendered or explicitly covered.
- No unwaived blockers remain.

Use `--static` only for non-interactive pages. Use `--partial` only for draft
reports that are not acceptance evidence.

Minimum successful web QA output:

```text
.design-director/
  design-brief.md
  render-results.json
  dom-audit.json
  visual-consistency-audit.json
  discovered-states.json
  state-coverage.json
  screenshot-notes.md
  design-qa.json
  design-qa.md
  screenshots/
```

## Active State Config

The scripts can click, type, focus, hover, scroll, resize, wait, assert, and
capture element screenshots. That matters because many design failures only
appear after the UI is opened or used.

Example:

```json
{
  "url": "http://127.0.0.1:5173",
  "waitForSelector": "main",
  "qaProfile": "final-qa",
  "surface": "dashboard",
  "states": [
    { "name": "default", "path": "/" },
    {
      "name": "search-open",
      "path": "/",
      "actions": [
        { "type": "fill", "selector": "#searchInput", "value": "ark" },
        { "type": "waitForSelector", "selector": "#searchSuggestions" }
      ]
    }
  ],
  "viewports": [
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

The full schema is in `scripts/render.config.schema.json`.

## Native QA

Native final QA validates screenshots, UI hierarchy/tree files, logs, timestamps,
and tooling metadata.

Standard iOS coverage includes:

- Default light appearance.
- Dark appearance.
- Large text.
- Keyboard-focused editable state.

Standard Android coverage includes:

- Default light theme.
- Dark theme.
- Large font scale.
- IME-focused editable state.

Each required profile needs its own screenshot and hierarchy/tree evidence
unless the report explains why that profile does not apply.

Useful commands:

```sh
npm run qa:native:ios -- --init
npm run qa:native:ios -- --print-tooling-hash --report .design-director/native-ios-qa.json
npm run smoke:native
npm run smoke:native:fail
```

## References

External references are allowed, but they are bounded.

- Record source, license, checked date, allowed use, and do-not-copy rules.
- Extract principles, not layouts, copy, assets, screenshots, or brand skins.
- Re-check stale source records before implementation.
- Keep local truth, accessibility, data semantics, and user anti-goals above any
  reference.

`references/curated-research-ledger.yaml` contains a source-backed starter list
of UI libraries, design systems, design skills, and inspiration sites. Copy a
row into the project ledger before using it on a real task.

## Browser Rule

Rendered evidence is required.

- Use the Browser plugin for local targets such as `localhost`, `127.0.0.1`, and
  local files.
- Use the Chrome plugin for deployed sites, authenticated tabs, profile-specific
  state, or when Chrome is requested.
- Use Computer Use only when Browser or Chrome cannot exercise the surface.

## Repository Map

- `SKILL.md`: main orchestration instructions.
- `references/`: routing, intake, validation, research, platform, and QA rules.
- `scripts/`: Playwright audits, report validators, setup, install, and smoke tests.
- `schemas/`: native QA schemas.
- `fixtures/`: regression fixtures for visual and interaction checks.
- `examples/`: brief, ledger, config, waiver, and QA report examples.
- `REFERENCED_SKILLS.md`: optional peer skills and license notes.
- `REFERENCE_LICENSE_POLICY.md`: rules for websites, assets, libraries, and examples.
- `PROVENANCE.md`: what is bundled and where it came from.

## License

This repo includes the Design Director skill, public-safe references, generic
fixtures, and supporting scripts. Optional peer skills are listed separately and
are not bundled unless their license allows it.

This is not legal advice. Check third-party terms before redistributing their
content.
