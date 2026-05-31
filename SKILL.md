---
name: design-director
description: Use when a UI/design task needs routing across design skills, source-of-truth decisions, external reference discipline, conflict resolution, or rendered QA planning. Do not use for obvious single-skill tasks, narrow CSS fixes, simple icon swaps, or one-off visual polish.
---

# Design Director

You are not the visual designer of record. You are the routing, governance, and QA owner for design work.

## Run Only When Useful

Use this skill when the task involves one or more:

- Multi-surface UI work.
- Conflict between local code, data, board/map substrate, brand direction, accessibility, or user preference.
- Selecting external design references.
- Dense product/reference UI where hierarchy, typography, data, or interaction correctness matter.
- Final rendered design QA.
- Repeated visual failures or user complaints about AI-slop.

Exit and use a specialist directly when:

- One obvious specialist owns the task.
- The user explicitly requested a specialist and no routing conflict exists.
- The task is a narrow CSS/component repair.
- The task is only icon search/replacement.
- There is no runnable/renderable surface yet and the user only needs implementation advice.

## Protocol

1. Classify intent and platform/surface. See `references/modes.md`.
2. Read local truth before outside references. See `references/intake.md`.
3. Classify source of truth in priority order:
   1. Accessibility, keyboard, touch, reduced motion, legal/safety constraints.
   2. Established design system.
   3. Domain/data/board/map semantics.
   4. Existing product code, CSS, tokens, screenshots.
   5. User complaints and anti-goals.
   6. External references.
4. Classify surface and specialist owner. See `references/routing.md`.
5. Produce or update `.design-director/design-brief.md` unless the user requested a quick routing answer.
6. Choose reference depth, only after the brief exists. See `references/reference-tiers.md`.
7. Assign exactly one owner for direction, implementation, and validation. See `references/handoff-conflicts.md`.
8. After visual implementation, rendered QA is mandatory. See `references/validation-contract.md`.

## Token Discipline

Load only the references needed for the current intent and platform. Do not read every reference file by default. For quick routing, stop after `modes`, `intake`, and `routing` unless the answer needs validation or platform detail.

## Interactive QA Rule

Rendered QA must exercise the interface the way a user will use it. Static default-state screenshots are not enough for interactive UI.

- Prefer the Browser plugin for local web targets such as `localhost`, `127.0.0.1`, or local static files.
- Prefer the Chrome plugin for existing authenticated/profile-dependent tabs, deployed production pages, or when the user specifically asks for Chrome.
- Use Computer Use only as a last resort for desktop-only interactions that Browser or Chrome cannot reach.
- Before acceptance, configure and inspect active states for every relevant interactive surface: search suggestions, dropdowns, comboboxes, filter pickers, popovers, dialogs, menus, details/accordions, tabs, chart controls, hover/focus states, mobile navigation, and form validation.
- Open overlays and menus in both mobile and desktop viewports when they exist. Verify they are visible, usable, above neighboring containers/charts/tables, not clipped, and reachable by keyboard/touch as applicable.
- Run state discovery or explicitly waive it before final QA when a rendered web surface exists. A manually named default state is not enough for interfaces with controls, overlays, charts, forms, tabs, filters, or nested scroll.
- Final QA must produce `design-qa.json` with `status: "pass"`. `status: "incomplete"` means evidence is missing or uninspected and is not acceptable for shipping.

Load focused references only when relevant:

- Dense apps/manuals/catalogs: `references/dense-reference-apps.md`.
- Motion/animation: `references/animation-motion.md`.
- Dashboards/charts/maps/reports: `references/data-viz-contract.md`.
- Games/canvas/WebGL: `references/game-canvas-contract.md`.
- Native iOS: `references/platforms-ios.md`; use `references/native-ios-qa.md` for operational report shape.
- Native Android: `references/platforms-android.md`; use `references/native-android-qa.md` for operational report shape.

## Reference Rule

Every external reference must answer a named brief question and record:

- `source`
- `tier`
- `role`
- `chosen_for`
- `extract`
- `do_not_copy`
- `local_mapping`
- `verification_gate`

Do not admit a reference just because it looks good. A result that could be mistaken for the reference fails.

## Blocking Failure Rule

Do not call design work accepted if any relevant blocker remains unwaived:

- Console error or framework overlay.
- Mobile horizontal page overflow.
- Essential text/control is clipped, tiny, low-contrast, hidden, or inaccessible.
- Hover-only or mouse-only essential content.
- Open overlays, menus, popovers, chart controls, or mobile navigation are clipped, offscreen, or behind other UI.
- Board/map/canvas/chart semantics are visually covered, unclickable, or contradicted by the data.
- Chart/data display contradicts source data.
- Required caveat/source label is absent.
- Screenshots, active states, or state discovery were generated/skipped without inspection notes or waiver.
- Repeated same-role values, labels, slots, columns, media/title groups, or attached controls visibly drift without a named hierarchy reason.
- An interactive control is visually camouflaged against its surrounding surface.

Use `references/validation-contract.md` and `references/severity-policy.md` for the full acceptance contract.

## Scripts

Use scripts only when there is a real rendered target:

- `scripts/render-check.mjs`: captures screenshots and console/page errors, including configured active states.
- `scripts/dom-audit.mjs`: collects overflow, text, tap target, focus, and hover-only candidates after configured active-state actions.
- `scripts/visual-consistency-audit.mjs`: collects peer typography, spacing, alignment, media-card anchoring, related-width, camouflaged-control, and overlay stacking candidates after configured active-state actions.
- `scripts/discover-states.mjs`: scans a rendered page and emits a draft active-state config with confidence and mutation-risk labels.
- `scripts/qa-report.mjs`: merges evidence into `.design-director/design-qa.json` and `.design-director/design-qa.md`.

These scripts are evidence collectors. They do not replace judgment or specialist skills.
