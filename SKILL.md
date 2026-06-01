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

## Default Fast Craft Path For Standalone Static Mockups

When the user asks for a standalone static mockup, benchmark screen, sample
dashboard, or exploratory new artifact and does not name an existing route/page
to modify, use the fast static mockup path before the general protocol.

1. Create an isolated output folder with
   `npm run mockup:init -- --target-root <absolute-target-root> --slug <slug> --surface <surface>`.
2. Seed the research ledger with one or more local packs using
   `npm run reference:seed -- --context <run-context.json> --pack <pack>`.
3. Before implementation, fill the compact brief with a visible
   domain-specific artifact, signature move, interaction/dynamism plan, and
   conventionality risk. The fast path must still reject tidy generic layouts.
4. Implement only inside the initialized mockup folder.
5. Run `npm run mockup:assert -- --context <run-context.json>` before draft QA.
6. Run draft QA with
   `npm run qa:web:draft -- --context <run-context.json> --viewport-preset mockup --recipe <recipe>`.
7. Treat `design-quality.draft.json` as draft evidence only. Do not claim final
   acceptance until the normal final QA contract passes with screenshot-backed
   distinctiveness, domain-specificity, and interaction/dynamism verdicts.

Use `references/fast-static-mockup-path.md` only when this path applies.

## Protocol

1. Classify intent and platform/surface. See `references/modes.md`.
   For new site/app creation, treat the job as `concept -> implement -> QA` unless the user asks for only one phase. Map ordinary words such as check, fix, redesign, build, inspiration, style, and final QA through `references/modes.md`.
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
6. For standalone mockups, benchmarks, or exploratory static artifacts where the user did not name an existing app/page to modify, create an isolated output folder before implementation. See `references/modes.md`.
7. For `concept`, `revamp`, and greenfield `concept -> implement -> QA` work, define a design thesis, style posture, compact style commitment, visible consequence fields, signature move, domain-specific artifact, interaction/dynamism plan, conventionality risk, surface quality bar, design exploration depth, Impeccable route, peer-skill execution evidence, and reference discovery plan before implementation, then run Impeccable plus Hallmark/anti-slop review before acceptance. See `references/design-quality-gates.md`.
8. Choose design exploration depth, only after the brief exists. Default to lean design-element exploration; use standard/deep only when the user asks for broader inspiration, multiple directions, or lawful source curation. See `references/reference-tiers.md`.
9. For broad final acceptance, write `.design-director/design-quality.json` with the structured gate, peer-skill status, reference-discovery outcome, and screenshot-anchored aesthetic verdict from the same QA run as the screenshots. Single-component repairs and deliberately plain utility can mark the gate not applicable with a reason; `.design-director/render.config.json` may also set `designQualityRequired` and `designQualityReason`.
10. Assign exactly one owner for direction, implementation, and validation. See `references/handoff-conflicts.md`.
11. After visual implementation, rendered QA is mandatory. See `references/validation-contract.md`.

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
- Final acceptance means `design-qa.json` has `status: "pass"` and `acceptanceReady: true`, with fresh discovery/render/DOM/visual artifacts sharing one configured `qaRunId`; state-coverage dispositions must bind to the current `discoveryHash`. Evidence-only, partial, stale, mixed-run, generated-run-ID, and screenshot-hash-mismatch reports are not final acceptance. `status: "incomplete"` means evidence is missing or uninspected and is not acceptable for shipping.
- Broad final acceptance also needs `design-quality.json` with all aesthetic verdicts marked `pass`, tied to inspected screenshot evidence from the same `qaRunId`, and hash-bound to the current screenshot notes/screenshots. Clear dashboard, report, table, chart, analytics, and data-viz surfaces need focused chart/table/decision-area screenshot evidence. Prose in the brief is not enough.

Load focused references only when relevant:

- Concept, revamp, or greenfield build quality, including Impeccable command selection: `references/design-quality-gates.md`.
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

Do not call design work accepted if any relevant blocker remains unwaived. Core blockers include:

- Console error or framework overlay.
- Mobile horizontal page overflow.
- Essential text/control is clipped, tiny, low-contrast, hidden, or inaccessible.
- Hover-only or mouse-only essential content.
- Open overlays, menus, popovers, chart controls, or mobile navigation are clipped, offscreen, or behind other UI.
- Board/map/canvas/chart semantics are visually covered, unclickable, or contradicted by the data.
- Chart/data display contradicts source data.
- Required caveat/source label is absent.
- Screenshots, active states, or state discovery were generated/skipped without inspection notes or waiver.
- Untested active states or uninspected generated screenshots.
- Visual consistency failures that contradict the intended hierarchy, including visibly camouflaged controls.
- For `concept`, `revamp`, or greenfield work: no named design thesis, no named style posture, no signature move, no surface quality bar, no Impeccable route, no Impeccable execution evidence, no reference discovery plan, or a result that is merely a generic functional scaffold.
- For broad design work: no compact style commitment with visible first-viewport, layout, typography, color/material, and generic-pattern consequences.
- For broad design work: no visible domain-specific artifact, no interaction/dynamism plan or static-dynamic substitute, no conventionality-risk check, or screenshots that are competent but conventional.
- For broad final design work: no structured `design-quality.json`, no screenshot-anchored aesthetic verdict, no peer-skill availability/fallback record, or any verdict marked `fail` or `unclear`.
- For broad design work: skipped Impeccable execution, skipped reference discovery, or skipped Hallmark/anti-slop review when the output is being accepted as final.

Use `references/validation-contract.md` and `references/severity-policy.md` for the full acceptance contract.

## Scripts

Use scripts only when there is a real rendered target:

- `scripts/render-check.mjs`: captures screenshots and console/page errors, including configured active states.
- `scripts/dom-audit.mjs`: collects overflow, text, tap target, focus, and hover-only candidates after configured active-state actions.
- `scripts/visual-consistency-audit.mjs`: collects peer typography, spacing, alignment, media-card anchoring, related-width, camouflaged-control, and overlay stacking candidates after configured active-state actions.
- `scripts/discover-states.mjs`: scans a rendered page and emits a draft active-state config with confidence and mutation-risk labels.
- `scripts/qa-report.mjs`: merges evidence into `.design-director/design-qa.json` and `.design-director/design-qa.md`.
- `scripts/run-web-qa.mjs`: one-command web QA wrapper for draft or final runs.
- `scripts/init-mockup.mjs` and `scripts/assert-output-root.mjs`: initialize and verify isolated fast-path static mockup folders.
- `scripts/seed-reference-ledger.mjs`: seed a research ledger from local reference packs.
- `scripts/check-peer-skills.mjs` and `scripts/validate-peer-evidence.mjs`: compact peer-skill availability/evidence helpers.
- `scripts/source-caveat-audit.mjs`: checks source/data caveat proportionality.
- `scripts/run-native-qa.mjs`: one-command native report validator wrapper.
- For user-facing wrapper commands, see README "Draft Vs Final QA"; use `npm run qa:web:draft`, `npm run qa:web:final`, `npm run qa:web:ci`, and `npm run qa:native:ios|android`.

These scripts are evidence collectors. They do not replace judgment or specialist skills.
