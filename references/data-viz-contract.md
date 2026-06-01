# Data Visualization Contract

Use this for dashboards, charts, maps, rankings, matrices, reports, and analytical UI.

## Source Truth

Data correctness outranks visual polish. A beautiful misleading chart fails.

Record:

- source data files/API/query used
- transformation, aggregation, timezone, rounding, filtering, and sorting logic
- expected totals or spot-check rows
- caveats and source labels required in the UI

Caveats and source labels must be visible, but they should be proportional to
the risk. For ordinary simulated/demo data, use an integrated caption, source
row, or footnote. Do not make the caveat the dominant visual element unless
legal, safety, financial, medical, or explicit user constraints require it.

## Checks

- Axis labels, units, scale type, domains, zero baselines, and truncation.
- Tooltip values match source data and visible mark/row.
- Legend/filter state matches chart state.
- Sort order and rank/tie behavior.
- Null, missing, loading, stale, empty, and error states.
- Responsive resizing, label collision, axis overlap, and chart controls.
- Color encoding, contrast, palette semantics, and colorblind risk.
- Export/download/share output matches visible state when relevant.
- Drilldown, hover, keyboard, touch, and screen-reader paths for essential claims.

## Blockers

- Chart/data mismatch.
- Hidden caveat or missing source label.
- Axis/scale/unit misrepresentation.
- Tooltip/filter/legend contradiction.
- Essential labels collide or disappear at required viewport sizes.
- Color encodes critical categories without a non-color fallback.
