# Dense Reference Apps

Use for strategy guides, manuals, catalogs, technical references, rule explorers, and dense dashboards.

## Priorities

- Fast scanning.
- Stable hierarchy.
- Readable text.
- Direct labels.
- Durable filters/search.
- Keyboard/touch access.
- Mobile no-overflow.
- Domain-shaped layout.
- Data and rules honesty.

## Avoid

- Generic pills or capsules as decorative defaults.
- Equal-weight card grids unless each card needs equal comparison weight.
- Fake dashboard chrome.
- Decorative side stripes.
- Tiny metadata.
- Hover-only explanations.
- Detached legends where direct labels work.
- Board overlays that fight the substrate.
- Board or map pins without direct endpoint anchors when a marker connects to more than one target. If the reader must infer where a post, route, or callout points, add small local sockets, endpoint labels, or active-state connectors.
- Gratuitous gradients, especially on dense controls, cards, heat maps, and dashboard blocks. Use solid color, direct labels, borders, or measured ramps unless a gradient encodes continuous data and remains readable.
- Decorative counters, bullets, chips, and pseudo-labels that sit on top of real text or require pixel-perfect luck. If a marker has semantic value, give it its own grid column or remove it.
- Low-contrast badge rows, especially white text on pale gray/cream/tan. Dense reference UI needs local contrast checks on every badge, marker, and row, not just page-level contrast.
- Edge-cramped markers. Counters and range labels need internal padding and a real gap from adjacent explanation text.
- Optically uncentered badge text. Tier letters, counters, and compact labels need explicit line-height and focused screenshot review; reject any label that appears pinned to the top or bottom of its square.
- Motion that slows repeated study.
- Marketing-page hero logic when the product is a tool.

## Dense Strategy Route

For dense strategy tools:

- Data and board semantics outrank aesthetics.
- `data-visualization` owns rankings, leaderboards, board overlays, labels, and analytical claims.
- `impeccable layout/typeset/clarify/adapt/harden` owns hierarchy, readability, copy clarity, responsive fit, and edge cases.
- Standards/behavior references own popovers, focus, keyboard, touch, and non-hover access.
- Practical Typography can inform dense reading, but not visual skin.
- Detail, Design Spells, and 60fps are final-polish references only after usability works.

The local signature should be named in the brief, for example:

```text
A dense strategy desk: calm, fast to scan, spatially honest to the board,
and domain-rich through icons, hierarchy, and data labels rather than badges,
chrome, or decorative card grids.
```

## Focused QA Rule

For any dense section with counters, markers, chips, generated labels, overlays, or recent user complaints:

- Capture a focused screenshot of the section or active state.
- Inspect at the actual target width, not only in a scaled full-page screenshot.
- Check text-on-text collisions, marker spacing, line-height, label wrapping, and touch/click dismissal behavior.
- If a pseudo-element label overlaps once, remove that decorative label or move it into real layout.
