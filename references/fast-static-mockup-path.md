# Fast Static Mockup Path

Use this for standalone static mockups, benchmark screens, quick dashboard
drafts, and new exploratory artifacts when the user did not name an existing
page or app route to modify.

## Command Path

1. Initialize an isolated folder:

```sh
npm run mockup:init -- --target-root /absolute/work/folder --slug support-queue-dashboard --surface dashboard
```

2. Seed compact references:

```sh
npm run reference:seed -- --context /absolute/work/folder/.design-director/mockups/support-queue-dashboard/run-context.json --pack dashboard
```

3. Replace the placeholder `index.html` with the mockup.

4. Assert isolation before QA:

```sh
npm run mockup:assert -- --context /absolute/work/folder/.design-director/mockups/support-queue-dashboard/run-context.json
```

5. Run draft QA:

```sh
npm run qa:web:draft -- --context /absolute/work/folder/.design-director/mockups/support-queue-dashboard/run-context.json --viewport-preset mockup --recipe dashboard-basic --single-pass-draft
```

`--single-pass-draft` is a draft intent flag. The wrapper still uses the proven
multi-script evidence path until single-pass recipe parity is test-backed.

## Rules

- Work only inside the initialized mockup folder unless the user explicitly
  asks to modify the host project.
- `design-quality.draft.json` is draft evidence, not final acceptance.
- The fast path is not permission to be bland. Every standalone mockup needs a
  visible domain-specific artifact or static/dynamic design device: timeline,
  map, cutaway, instrument, workbench, ticket wall, product object, spatial
  model, annotated flow, meaningful interaction, or motion/state choreography.
  A tidy header plus cards/panels is draft-only until redesigned.
- If the mockup contains controls, include at least one meaningful active state
  or interaction recipe. If the user requested pure static output, record the
  static-dynamic substitute that creates energy and verify it in screenshots.
- Use `impeccable bolder` by default for open-ended greenfield mockups unless
  the user supplied a strong style or explicitly asked for plain utility.
- Keep source/data caveats local and proportional. Simulated data usually needs
  a caption, source row, footnote, or local annotation, not a warning banner.
- Do not style simulated-data caveats, source labels, nav counts, or generic
  section labels as pills/chips/badges. Status tags are acceptable only when
  they carry concrete state and do not become the main visual rhythm.
- Use local reference packs first. Browse only for standard/deep exploration,
  unfamiliar domains, or user-supplied inspiration/source requests.
- Final acceptance still requires the normal `qa:web:final` path and
  `design-quality.json`, including screenshot-backed verdicts for
  distinctiveness, domain-specificity, and interaction/dynamism.
