# Validation Contract

Rendered design work needs durable evidence. A build passing is not enough.

## Required Artifacts

- `.design-director/design-brief.md`
- `.design-director/design-qa.json`
- `.design-director/design-qa.md`
- `.design-director/screenshots/` manifest

The brief may be omitted only for a short routing answer.
`design-qa.json.status` must be `pass` for acceptance. `incomplete` means
evidence is missing or uninspected; `fail` means a blocker was found.

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
- State discovery output or a recorded waiver. For rendered web targets, run `scripts/discover-states.mjs` before final QA unless the page is static or the user explicitly limited scope. Use `qa-report.mjs --static` only when the page has no relevant interactive states; use `--partial` only for draft reports, never acceptance.
- Visual consistency audit for repeated components: peer typography, slot alignment, local spacing rhythm, media/title anchoring, attached-control width, and affordance clarity.
- Overlay stacking audit for open dropdown/listbox/popover states: sampled points inside the overlay must resolve to the overlay or its descendants with `elementFromPoint`, and the overlay must not be clipped by the viewport.
- Interaction tool evidence: use the Browser plugin for local web targets, Chrome plugin for deployed/authenticated/profile-dependent pages or explicit Chrome requests, and Computer Use only when browser tools cannot exercise the surface. Record the tool and active states used in screenshot notes or QA notes.
- Data/board checks when relevant.

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
- Essential content depends on animation without a reduced-motion or no-motion path.
- Animation blocks interaction, steals focus unexpectedly, or continues after the relevant surface is dismissed.
- Peer metric values, labels, repeated slots, or same-role controls inside one component use inconsistent font size, weight, line-height, or spacing without an explicit hierarchy reason.
- Repeated grid/card columns or attached details/actions drift out of alignment without an explicit hierarchy reason.
- A non-disabled interactive control blends into its surrounding surface so strongly that its affordance depends on hover, focus, or prior knowledge.
- Screenshots generated but not inspected.
- Rendered interactive states were not discovered, configured, inspected, or explicitly waived.
- User-complained component inspected only in full-page context when a focused crop/state was needed.

## Acceptance Contract

A design pass is accepted only when:

1. `.design-director/design-brief.md` exists or was updated.
2. The brief names source of truth, surface, owners, anti-goals, and acceptance gates.
3. Every external reference has a role, tier, extract, `do_not_copy`, and verification gate.
4. Implementation changes map back to the brief.
5. `scripts/discover-states.mjs` was run or explicitly waived with a reason when a rendered web surface exists.
6. Rendered screenshots exist for required viewports and key states.
7. Screenshots were inspected, not merely generated.
8. `.design-director/design-qa.json` records automated evidence from render, DOM, and visual-consistency audits.
9. `.design-director/design-qa.md` records pass/fail, residual risk, and waivers.
10. No blocker remains unwaived.
11. Any waiver includes evidence and reason.
