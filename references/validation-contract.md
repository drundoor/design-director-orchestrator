# Validation Contract

Rendered design work needs durable evidence. A build passing is not enough.

## Required Artifacts

- `.design-director/design-brief.md`
- `.design-director/design-qa.json`
- `.design-director/design-qa.md`
- `.design-director/screenshots/` manifest
- Design thesis, style posture, signature move, and surface quality bar in the
  brief for `concept`, `revamp`, and greenfield `concept -> implement -> QA`
  work.
- Compact style commitment, design exploration depth, and visible consequence
  fields in the brief for broad design work.
- Impeccable route and reference discovery plan in the brief for broad
  frontend/web, dashboard, marketing, revamp, and greenfield work.
- Impeccable execution evidence in the brief or QA notes for broad
  frontend/web, dashboard, marketing, revamp, and greenfield work.
- Hallmark or equivalent anti-slop review notes for broad design work.
- `.design-director/design-quality.json` for broad final design QA. It records
  whether the design-quality gate applies, the structured aesthetic verdict,
  peer-skill availability/fallback status, reference-discovery outcome, and
  deep-exploration artifact status when relevant.

The brief may be omitted only for a short routing answer.
`design-qa.json.status` must be `pass` and `acceptanceReady` must be `true`
for acceptance. `incomplete` means evidence is missing or uninspected; `fail`
means a blocker was found.

Final web acceptance also requires the render, DOM, and visual audit artifacts
to be fresh, produced from the same effective config/base URL, and tied to the
same configured `qaRunId`. Generated run IDs, stale artifacts, broad final-URL
mismatch allowances, future-dated timestamps beyond normal clock skew,
evidence-only reports, and partial reports are not final acceptance. Static
pages may use `qaMode: "final-static"` only when the DOM audit proves there are
no visible interactive controls.

Final native acceptance requires `native-design-qa.json.status` to be `pass`
and `acceptanceReady` to be `true`, with `qaRunId`, `startedAt`, `finishedAt`,
`toolingHash`, fresh screenshots, UI hierarchy/tree captures, logs, unique
profile evidence, and `nativeEvidenceHash` recorded by the validator.

Standalone static mockups and benchmark artifacts may use a draft fast path:
an isolated output folder, scoped brief, scoped research ledger, and 3
representative screenshots. That path is for comparison and iteration only; it
is not final acceptance unless the full final QA contract is run.

## Default Viewports

- 320
- 375
- 414
- 768
- 1024
- 1280
- 1440

Use fewer only when the surface clearly does not need them, and record why.

## Required Evidence

- Console and page errors.
- Horizontal overflow.
- Clipped text/control candidates.
- Text-on-text overlap and pseudo-element collisions. Screenshot inspection must check generated labels, counters, bullets, chips, markers, and badges against adjacent text, not just DOM overflow.
- Map/board overlay stacking. Semantic pins, posts, route labels, callout anchors, and marker numbers must remain visible and clickable above the substrate that needs them; connector lines should not cover essential text.
- Local contrast review for badges, markers, rows, overlays, and dense panels. Specifically reject white/light text on pale gray, tan, cream, or translucent fills unless measured contrast is acceptable.
- Marker and badge inset review: counters/range labels need visible padding from the container edge and enough gap from the adjacent text to remain readable at focused screenshot scale.
- Badge typography alignment review: square badges, tier labels, counters, and one-character markers must use explicit flex centering, `line-height: 1`, and optical screenshot inspection. Reject labels that sit visibly high/low inside their container even when the CSS says they are centered.
- Small text candidates.
- Tap target candidates.
- Keyboard/focus path for interactive surfaces.
- Touch path or non-hover access.
- Active dropdown, combobox, autocomplete, picker, popover, dialog, tooltip, menu, accordion/details, tab, mobile navigation, and chart-control states. Closed-state screenshots are not enough when these surfaces exist.
- Reduced motion check when animation exists.
- Animation lifecycle check when motion exists: animations pause/kill/cleanup on unmount or route change, do not fight user input, and do not leave transformed elements in broken intermediate states.
- Motion performance check when animation exists: no obvious scroll jank, layout thrash, flashing, text blur, or repeated long tasks from animation loops.
- Screenshot inspection notes. Every generated page screenshot and element
  screenshot needs its own note section with viewport, state, URL, observation,
  pass/fail, issues, and waiver/evidence fields filled in.
- Focused-state screenshots for any component or section with recent user complaints, dense generated labels, popovers, overlays, charts, counters, markers, or small repeated controls. Full-page screenshots alone are not sufficient for those areas.
- Focused chart, table, or decision-area screenshots for clear dashboard,
  data-visualization, analytics, report, chart, or table surfaces. This is
  required final evidence, not a warning, when the surface is clearly data
  heavy. The focused screenshot must identify the relevant chart, table, grid,
  visualization, metric, KPI, report, or decision area through
  `focusedEvidenceKind` metadata or a meaningful selector/path.
- State discovery output or a recorded waiver. For rendered web targets, run `scripts/discover-states.mjs` before final QA unless the page is static or the user explicitly limited scope. Discovery must be fresh, share the configured run identity, and include `discoveryHash`. Use `qa-report.mjs --static` only when the page has no relevant interactive states; use `--partial` only for draft reports, never acceptance.
- State coverage dispositions for discovered but unrendered candidates. Non-rendered dispositions require a reason; `waived`, `duplicate`, and `low-value` also require evidence. High-confidence safe candidates rejected as `not-relevant` also require evidence inside `.design-director`; only destructive or sensitive rejections may be evidence-free, and they still need a reason. The state-coverage file must be fresh and bind to the current discovery via `discoveryHash` or same-run metadata.
- Visual consistency audit for repeated components: peer typography, slot alignment, local spacing rhythm, media/title anchoring, attached-control width, and affordance clarity.
- Overlay stacking audit for open dropdown/listbox/popover states: sampled points inside the overlay must resolve to the overlay or its descendants with `elementFromPoint`, and the overlay must not be clipped by the viewport.
- Interaction tool evidence: use the Browser plugin for local web targets, Chrome plugin for deployed/authenticated/profile-dependent pages or explicit Chrome requests, and Computer Use only when browser tools cannot exercise the surface. Record the tool and active states used in screenshot notes or QA notes.
- Data/board checks when relevant.
- Aesthetic judgment for `concept`, `revamp`, and greenfield work: the
  screenshot notes or QA notes must state whether the result expresses the
  design thesis, style posture, signature move, style commitment, and avoids a
  generic scaffold, including whether Impeccable and Hallmark or an equivalent
  anti-slop checklist were used.
- Structured aesthetic verdict for broad final QA: `design-quality.json` must
  mark `thesisExpressed`, `stylePostureExpressed`, `signatureMoveVisible`,
  `styleCommitmentHonored`, and `genericScaffoldAvoided` as `pass`. Each
  verdict needs its own evidence pointer to a current screenshot-note section,
  and the artifact must record the same `qaRunId`, current
  `screenshotNotesHash`, and current `reviewedScreenshotHashes`.
  `design-quality.json.generatedAt` must be current and not future-dated.
- Reference discovery evidence for broad design work: the brief, research
  ledger, or QA notes must record which external standards, design systems,
  product/design references, assets, fonts, or motion sources were checked,
  accepted, or rejected. "No external references used" is not acceptance-ready
  unless the user forbade browsing or the environment was offline.
- Lean broad design work needs a reference mix, not a large research project:
  one correctness/behavior source, one domain/product mechanics source, and one
  taste/art-direction source when available. Deeper exploration is opt-in.
- Lean broad design work may also use `local-system-sufficient` when a mature
  local design system, screenshots, tokens, or brand system are stronger than
  live browsing. Record resolvable local design-system evidence and the taste
  decision; absolute developer-machine paths are not valid evidence.
- Peer-skill execution evidence: `design-quality.json` must record structured
  `executionEvidence` for available Impeccable/Hallmark runs. The evidence must
  point to a resolvable markdown section in the QA evidence folder and record
  what was loaded, run, checked, or applied for each listed command/check.
  Naming a route or writing a free text "loaded skill" sentence is not enough.
- Peer-skill availability evidence: if Impeccable or Hallmark is unavailable,
  `design-quality.json` may record `unavailable-fallback-used` only when the
  built-in fallback checklist is completed. If a peer skill is available but
  skipped, final acceptance fails unless the user waived it.

## Blocking Failures

- Relevant console error or framework overlay.
- Horizontal mobile overflow.
- Clipped essential control or text.
- Tiny essential text.
- Low-contrast essential text, including white/light copy on light neutral rows or badges.
- Counters, bullets, chips, or range labels cramped against an edge or adjacent body copy.
- Hover-only explanation.
- Inaccessible focus path.
- Dropdowns, autocomplete suggestions, listboxes, picker menus, popovers, dialogs, tooltips, chart controls, and mobile navigation are clipped, offscreen, or visually hidden behind cards, charts, tables, sticky UI, or later stacking contexts in their open state.
- Board/map hotspot popover offscreen.
- Board/map marker or post is present in the DOM but visually covered, clipped, or unable to receive click/tap/focus.
- Chart/data mismatch.
- Missing caveat/source label.
- Banned visual trope in core UI.
- Generic decorative pills, chips, capsules, or badges when the brief bans
  them or when they do not serve a real component/status role.
- Essential content depends on animation without a reduced-motion or no-motion path.
- Animation blocks interaction, steals focus unexpectedly, or continues after the relevant surface is dismissed.
- Peer metric values, labels, repeated slots, or same-role controls inside one component use inconsistent font size, weight, line-height, or spacing without an explicit hierarchy reason.
- Repeated grid/card columns or attached details/actions drift out of alignment without an explicit hierarchy reason.
- A non-disabled interactive control blends into its surrounding surface so strongly that its affordance depends on hover, focus, or prior knowledge.
- Screenshots generated but not inspected.
- `design-quality.json` is missing, has no screenshot-anchored aesthetic
  verdict, has stale/future-dated/mismatched run or screenshot hashes, or marks
  any final broad design verdict as `fail` or `unclear`.
- Rendered interactive states were not discovered, configured, inspected, or explicitly waived.
- User-complained component inspected only in full-page context when a focused crop/state was needed.
- `concept`, `revamp`, or greenfield output has no named design thesis, no named
  style posture, no signature move, no surface quality bar, no design
  exploration depth, no compact style commitment with visible consequences, no
  Impeccable route, no Impeccable execution evidence, no reference discovery
  plan, or is only a functional generic scaffold for its surface.
- Broad design work accepted without Impeccable, reference discovery, and
  Hallmark or an equivalent anti-slop review.
- Standalone static mockup writes into an unrelated product route, shared CSS,
  or root QA artifact when the user did not name an existing target.

## Acceptance Contract

A design pass is accepted only when:

1. `.design-director/design-brief.md` exists or was updated. An `--evidence-only` run can validate artifacts, but it is not final acceptance.
2. The brief names source of truth, surface, owners, anti-goals, and acceptance gates.
3. For `concept`, `revamp`, and greenfield work, the brief names the design
   thesis, style posture, signature move, surface quality bar, visual signature,
   composition proof, design exploration depth, compact style commitment,
   visible first-viewport/layout/typography/color consequences, Impeccable
   route, Impeccable execution, Hallmark execution, reference discovery plan, and
   anti-generic checks.
4. `.design-director/design-quality.json` records the applicable gate,
   same-run screenshot-anchored design verdicts, peer-skill status, and
   reference discovery outcome for broad final design work.
   `.design-director/render.config.json` may also set
   `designQualityRequired` and `designQualityReason` to make applicability
   explicit.
5. Every external reference has a role, tier, extract, `do_not_copy`, and verification gate.
6. Implementation changes map back to the brief.
7. `scripts/discover-states.mjs` was run or explicitly waived with a reason when a rendered web surface exists.
8. Render, DOM, and visual audit artifacts are fresh and share a configured `qaRunId`.
9. Rendered screenshots exist for required viewports and key states.
10. Screenshots were inspected, not merely generated.
11. `.design-director/design-qa.json` records automated evidence from render, DOM, and visual-consistency audits.
12. `.design-director/design-qa.md` records pass/fail, residual risk, and waivers.
13. `.design-director/design-qa.json` has `status: "pass"` and `acceptanceReady: true`.
14. No blocker remains unwaived.
15. Any waiver includes evidence and reason, and no valid waiver is stale or unused.
16. Native QA, when applicable, has fresh run metadata, artifact hashes, and unique screenshot/tree evidence per required profile.
