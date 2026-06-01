# Design Quality Gates

Use this for `concept`, `revamp`, and greenfield `concept -> implement -> QA`
work. The goal is to prevent functional but generic output from passing as
finished design.

## Universal Gate

Before implementation, the brief must name:

- Design thesis: the product-specific point of view in one or two sentences.
- Primary workflow: what the first screen helps the user decide or do.
- Style posture: the named visual stance. If the user did not provide a style,
  infer one and state it before implementation. Do not default to "clean and
  modern."
- Why this posture fits: one sentence tying the visual stance to the audience,
  primary workflow, content/data, usage frequency, and platform. A posture name
  without a product-specific reason is not enough.
- Surface quality bar: the surface-specific bar from this file.
- Design exploration depth: `lean`, `standard`, or `deep`. This means
  design-element exploration, not market/user research. Use `lean` by default
  unless the user asks for broad inspiration, multiple concepts, or a large
  reference pass.
- Visual signature: the concrete typography, composition, color, spacing,
  motion, imagery, or interaction choices that make the interface distinct.
- Signature move: the one concrete design decision that makes this output
  recognizable, such as an unusual composition, evidence treatment, type system,
  motion pattern, media treatment, domain metaphor, or interaction model.
- Style commitment: a compact pre-build commitment, 5-8 lines maximum, naming
  visible consequences for the first viewport, layout, typography,
  color/material, and the generic pattern being rejected.
- Composition proof: how the first viewport, hierarchy, and responsive layout
  serve the primary workflow.
- Impeccable route: the Impeccable command that will own craft, polish,
  hierarchy, typography, adaptation, or hardening for this request.
- Impeccable execution: the actual Impeccable skill/command references loaded
  or run, and the checks applied to the result.
- Reference discovery plan: the external standards, design systems,
  visualization references, product-flow sources, fonts/assets, or inspiration
  sources that will be checked before implementation, plus what would make each
  one relevant or rejected.
- Anti-generic checks: the defaults this work must avoid, including decorative
  generic pills, chips, capsules, badges, card grids, fake chrome, and
  placeholder visual motifs that do not serve a component role.
- Hallmark / anti-slop review: whether Hallmark will run, or the equivalent
  anti-slop checklist that will be used if Hallmark is unavailable.
- Hallmark execution: the actual Hallmark skill/review used, or the recorded
  unavailable/waived fallback.

Do not implement from a bare scaffold such as "header, cards, chart, table" or
"hero, feature cards, CTA" unless the brief explains why that exact structure is
the best expression of the design thesis. If the first viewport could belong to
any SaaS product after swapping labels, the work fails the gate even when the
brief contains the right words.

## Style Direction Gate

The user should not need to ask for a strong style. For broad design work, the
orchestrator must make or preserve a strong style choice unless the user asks
for deliberately plain utility.

If the user provides a style, translate it into constraints and a signature
move. If the user does not provide a style, infer a posture from the domain,
audience, usage frequency, data/content, platform, and references, then state it
before implementation.

Reject vague postures:

- clean
- modern
- polished
- professional
- premium
- beautiful
- sleek

Those words can describe quality, but they are not style directions. Pair them
with a specific posture instead.

Useful style-posture examples:

- Dashboard: dispatch wall, executive brief, incident room, portfolio cockpit,
  analyst notebook, forecast room, trading desk, clinical command board.
- Web app/product UI: quiet workbench, technical console, editorial tool,
  spatial planner, field notebook, creator studio, compliance desk.
- Marketing/editorial: museum label, cinematic launch, field guide, atelier
  sheet, newspaper feature, product dossier, luxury catalog.
- Native iOS/Android: native utility, media-rich collection, calm assistant,
  pro control surface, glanceable daily brief.
- Game/canvas: arcade cabinet, tactical map, cockpit HUD, tabletop rules desk,
  workshop editor, storybook stage.

The signature move must be visible in the first meaningful screen. A subtle
color tweak is not enough. At least one of these should be intentionally strong:

- composition or macrostructure
- type scale or type pairing
- color system or material language
- chart/table/evidence treatment
- imagery or generated media treatment
- motion and interaction choreography
- domain metaphor or spatial model
- navigation/information architecture pattern

## Efficient Style Commitment

The default path should improve taste without turning every job into a long
research project. Before implementation, write one compact style commitment:

- Posture: the named visual stance.
- Visual signature: the distinct visible move.
- First-viewport consequence: what changes above the fold.
- Layout consequence: what is structurally different from a generic scaffold.
- Typography consequence: what type scale, density, or pairing does.
- Color/material consequence: what color, contrast, texture, or surface language
  does beyond decoration.
- Generic pattern rejected: the specific default pattern this will not use.

Keep this commitment to 5-8 lines. It is not a moodboard. It is a cheap
decision lock. QA then checks whether the screenshots visibly honor it. If the
commitment is only a sentence in the brief and has no visual consequence, the
design is not accepted.

## Impeccable Craft Gate

For broad frontend/web work, the user should not need to ask for Impeccable.
Design Director must route through Impeccable by default and record the selected
command in the brief.

Default command choices:

- Build from scratch: `impeccable craft`.
- Redesign or broad polish of an existing surface: `impeccable polish`.
- Bland or generic result, or an open-ended new build with no strong
  user-supplied style: `impeccable bolder`.
- Overdecorated result: `impeccable quieter`.
- Dashboard, dense tool, catalog, or reference UI: `impeccable layout` plus
  `impeccable typeset`.
- Mobile or responsive failure: `impeccable adapt`.
- Production states, errors, accessibility, i18n, or edge cases:
  `impeccable harden`.
- Weak copy, labels, statuses, or empty/error states: `impeccable clarify`.
- Weak color system: `impeccable colorize`.
- Purposeful motion: `impeccable animate`.

When more than one trigger applies, list more than one command. For example, a
new dashboard normally routes to `impeccable craft`, `impeccable bolder`,
`impeccable layout`, and `impeccable typeset`; a mobile dashboard with weak
labels adds `adapt` and `clarify`. Do not collapse the route to the primary
command just because one command could technically touch the whole surface.

Execution evidence is required. "Impeccable route: craft/layout/typeset" is not
enough. The brief or QA notes must say which Impeccable command reference(s)
were loaded or run and what changed because of them. If Impeccable is
unavailable or skipped, the work is not final acceptance-ready unless the user
explicitly waived the peer-skill requirement.

If Impeccable is unavailable for a public install, record that as
`peerSkills.impeccable: unavailable-fallback-used` in `design-quality.json` and
complete the built-in fallback checklist. If Impeccable is available but simply
skipped, final acceptance fails unless the user explicitly waived it.

For native iOS/Android, use the platform specialist as the implementation owner,
then apply Impeccable as a secondary critique for hierarchy, density, copy,
specificity, and anti-generic choices when it does not conflict with platform
guidelines.

## Hallmark / Anti-Slop Review

For `concept`, `revamp`, greenfield builds, and final aesthetic acceptance,
run Hallmark when it is installed. Use:

- `hallmark audit` for a no-edit critique.
- `hallmark redesign` when the user asked for a broad redesign and the file
  boundaries are clear.
- Hallmark's pre-emit critique as the final self-check when building a fresh
  page or surface.

If Hallmark is unavailable, run the same anti-slop review manually from this
file and record that substitution in the brief or QA notes.

If Hallmark is available, use it rather than replacing it with a manual
checklist. A manual checklist is a fallback, not the normal path.

If Hallmark is unavailable for a public install, record
`peerSkills.hallmark: unavailable-fallback-used` in `design-quality.json` and
complete the anti-slop fallback checklist. If Hallmark is available but skipped,
final acceptance fails unless the user explicitly waived it.

Do not let Hallmark override higher source truth. Accessibility, data truth,
platform conventions, established design systems, and explicit user anti-goals
still win. Hallmark is the taste/slop reviewer; Design Director remains the
orchestrator.

## Design Exploration Depth

This is design-element exploration: references for visual language, component
mechanics, interaction patterns, typography, motion, data display, assets, and
style. It is not market research, user research, or competitive strategy unless
the user asks for those separately.

Default to `lean`:

- Use 2-3 high-signal references: one correctness/behavior source, one
  domain/product mechanics source, and one taste/art-direction source.
- Prefer the curated ledger and known reputable sources before live browsing.
- Do not generate multiple full directions unless the user asks.
- Keep the style commitment compact, then implement.

Use `standard` when the user asks for inspiration, a style, or alternatives:

- Use roughly 4-7 sources across correctness, domain, design system, and taste.
- Produce 2 lightweight directions only if useful.
- Recommend one direction before implementation.

Use `deep` only when the user explicitly asks for a broad design exploration,
large reference pass, multiple directions, or lawful source curation:

- Use as many references as the brief needs. Three is not a cap.
- Record accepted and rejected buckets.
- Produce 2-3 distinct directions before implementation unless the user asks to
  keep it study-only.
- Expect higher time and token cost, and say so.

Every reference still needs a reason, transferable principle, do-not-copy
boundary, and verification gate. Prefer a few high-signal references over a
large moodboard unless the user chose `deep`.

Deep exploration must produce a concrete artifact, either
`deep-design-exploration.md` or a research-ledger section, with:

- brief question
- source buckets checked
- accepted sources
- rejected sources and why
- 2-3 distinct directions unless the task is study-only
- recommendation
- do-not-copy constraints
- implementation risk
- QA implications

For `concept`, `revamp`, and greenfield work, design-element reference
discovery is required. At minimum, check whether each relevant bucket has a
useful source:

- standards/behavior authority
- reusable design system or component mechanics
- visualization, map, board, diagram, or domain mechanics
- product-flow or high-reputation design inspiration
- taste/art-direction source that can affect composition, typography, material,
  motion, or interaction
- typography, icon, image, motion, font, or asset source when the brief would
  benefit from it

It is acceptable to reject every candidate in a bucket, but the ledger must say
what was checked and why it was not used. "No external references used" is not
acceptable for broad design work unless the user explicitly forbids browsing or
the environment is offline; record that as a constraint. Correctness references
prevent mistakes; taste references prevent generic output. Do not let the former
stand in for the latter.

`local-system-sufficient` is allowed when a mature local design system,
existing screenshots, tokens, or brand system already supply enough source
truth. Record the local design-system evidence and the taste decision derived
from it. Do not browse merely to satisfy ceremony when local truth is stronger,
but do record why local truth is enough. Local evidence must be a resolvable
`.design-director` or repo-relative reference, not an absolute path from a
developer machine. Do not use `../` parent-directory traversal in local-system or deep
exploration evidence; evidence paths must stay inside the QA output folder or
the repository root.

## Structured Final Verdict

For broad final QA, add `.design-director/design-quality.json`. This is a small
machine-readable contract that keeps the brief from passing on prose alone:

```json
{
  "qaRunId": "configured-run-id-from-render-dom-visual-artifacts",
  "generatedAt": "2026-06-01T17:00:00.000Z",
  "screenshotNotesHash": "sha256-of-current-screenshot-notes-md",
  "reviewedScreenshotHashes": {
    "screenshots/default-375x700.png": "sha256-of-current-mobile-screenshot",
    "screenshots/default-1440x1000.png": "sha256-of-current-desktop-screenshot",
    "screenshots/primary-chart-375x220.png": "sha256-of-current-focused-chart-screenshot"
  },
  "design_quality_gate": {
    "applies": true,
    "reason": "greenfield dashboard",
    "depth": "lean",
    "final_required": true
  },
  "designQuality": {
    "required": true,
    "thesisExpressed": {
      "verdict": "pass",
      "evidence": [
        "screenshot-notes.md#screenshots/default-375x700.png",
        "screenshot-notes.md#screenshots/default-1440x1000.png",
        "screenshot-notes.md#screenshots/primary-chart-375x220.png"
      ]
    },
    "stylePostureExpressed": {
      "verdict": "pass",
      "evidence": [
        "screenshot-notes.md#screenshots/default-375x700.png",
        "screenshot-notes.md#screenshots/default-1440x1000.png",
        "screenshot-notes.md#screenshots/primary-chart-375x220.png"
      ]
    },
    "signatureMoveVisible": {
      "verdict": "pass",
      "evidence": [
        "screenshot-notes.md#screenshots/default-375x700.png",
        "screenshot-notes.md#screenshots/default-1440x1000.png",
        "screenshot-notes.md#screenshots/primary-chart-375x220.png"
      ]
    },
    "styleCommitmentHonored": {
      "verdict": "pass",
      "evidence": [
        "screenshot-notes.md#screenshots/default-375x700.png",
        "screenshot-notes.md#screenshots/default-1440x1000.png",
        "screenshot-notes.md#screenshots/primary-chart-375x220.png"
      ]
    },
    "genericScaffoldAvoided": {
      "verdict": "pass",
      "evidence": [
        "screenshot-notes.md#screenshots/default-375x700.png",
        "screenshot-notes.md#screenshots/default-1440x1000.png",
        "screenshot-notes.md#screenshots/primary-chart-375x220.png"
      ]
    },
    "reviewerNotes": "Current mobile and desktop screenshots show the incident-room posture and signature move."
  },
  "peerSkills": {
    "impeccable": {
      "status": "available",
      "executionEvidence": {
        "path": "peer-execution.md#impeccable-execution",
        "commands": ["craft", "bolder", "layout", "typeset"],
        "summary": "Loaded craft, bolder, layout, and typeset references."
      }
    },
    "hallmark": {
      "status": "unavailable-fallback-used",
      "fallbackChecklistCompleted": true,
      "fallbackEvidence": {
        "path": "peer-fallback.md#hallmark-fallback",
        "requiredChecks": [
          "genericScaffold",
          "decorativePills",
          "fakeChrome",
          "stockHero",
          "weakHierarchy"
        ]
      }
    }
  },
  "referenceDiscovery": {
    "outcome": "lean-complete",
    "sources": [
      { "bucket": "correctness", "source": "WAI behavior reference" },
      { "bucket": "domain", "source": "domain/product mechanics source" },
      { "bucket": "taste", "source": "art-direction source" }
    ]
  }
}
```

All five `designQuality` verdicts must be `pass` for final acceptance. Each
verdict must carry its own evidence array, every pointer must resolve to a
current screenshot-note section, and `reviewedScreenshotHashes` must match the
current screenshot files. `generatedAt` must be current, parseable, and not in
the future beyond normal clock skew. Broad final web work needs at least one
mobile/narrow and one desktop/wide screenshot. Dashboard, report, table, chart,
analytics, and data-visualization work must also include focused chart, table,
grid, visualization, metric, KPI, report, or decision-area evidence. A generic
element crop is not enough: the action artifact or `design-quality.json` should
record `focusedEvidenceKind`, or the selector/path must clearly identify the
chart, table, grid, visualization, metric, KPI, report, or decision area. Use
`applies: false` only for a small component repair, deliberately plain utility,
or other narrow task, and record the reason.

You can force the design-quality gate from `.design-director/render.config.json`
with `designQualityRequired: true` and `designQualityReason`. Use
`designQualityRequired: false` only for narrow repairs or deliberately plain
utility, and include a reason.

Peer-skill execution evidence must also be structured and resolvable:
`executionEvidence.path` must point to a markdown section in the QA evidence
folder that records what was loaded, run, checked, or applied for each listed
command or check. Negative or pending wording such as "not run", "skipped", or
"pending" near a required command/check is not acceptance evidence. Plain text
like `"Loaded Impeccable"` is not final acceptance evidence.

## Surface Quality Bars

### Dashboard / Data Visualization

Must feel like a real operational tool, not a generic analytics mockup.

- Establish a named operating model, such as command center, triage desk,
  forecast room, portfolio cockpit, investigation board, or executive brief.
- Pick a visible dashboard posture that changes the first viewport. "Triage
  desk" is not enough if the screen still reads as ordinary metric cards,
  generic bars, and a default table.
- Give each metric a role: headline health, diagnostic driver, risk, or action
  cue. Repeated metric cards are acceptable only when their hierarchy and
  grouping are intentional.
- Charts need source/caveat labels, direct labels where possible, truthful
  scales, responsive label checks, and a clear relationship to the surrounding
  decisions.
- Caveats should be integrated into chart captions, source rows, footnotes, or
  local annotations. Do not turn a simulated-data caveat into the visual
  signature or a dominant warning banner unless legal, safety, or user
  instructions require that prominence.
- Tables need density, row rhythm, status language, and scanning behavior that
  match the dashboard's usage frequency.
- Avoid fake dashboard chrome, decorative sidebars, equal-weight card grids,
  generic pill/chip badges, gratuitous gradients, and unlabeled charts.

### Web App / Product UI

Must make the target workflow faster, clearer, or more trustworthy.

- Name the primary task and make the first viewport organize around it.
- Use controls that match the action: menus for option sets, toggles for binary
  settings, segmented controls for modes, tabs for sibling views, icon buttons
  for common tools, and text buttons for clear commands.
- Verify empty, loading, error, validation, focus, hover, active, and touch
  states where they affect the task.
- Avoid marketing-page hero logic, decorative card grids, hidden primary
  actions, generic pills/chips as decoration, and controls that only look
  interactive after hover.

### Marketing / Editorial Web

Must create a memorable first impression tied to the actual product, place,
person, or offer.

- Make the product, brand, object, venue, or literal offer a first-viewport
  signal.
- Use meaningful real or generated media when visual inspection matters.
- Let the layout, copy rhythm, and imagery express a specific position instead
  of a generic SaaS template.
- Avoid stock-like cropped atmospherics, gradient-only heroes, decorative
  feature-card walls, generic pills/chips, and vague value-prop headlines.

### Native iOS

Must feel native before it feels styled.

- Use Apple platform hierarchy, navigation, typography, controls, gestures, and
  Dynamic Type behavior as source truth.
- State the design thesis in platform terms: information density, navigation
  depth, primary gesture, and how the screen behaves in light, dark, large text,
  keyboard, and error states.
- Avoid web-card transplants, custom controls that break platform expectation,
  and layouts that only work at default text size.

### Native Android

Must feel native before it feels styled.

- Use Material/Compose conventions for layout, motion, surfaces, navigation,
  typography scale, and system state handling.
- State the design thesis in platform terms: user journey, density, component
  choices, font-scale behavior, IME behavior, dark theme, and touch states.
- Avoid iOS/web visual transplants, nonstandard touch targets, and layouts that
  collapse under larger font scale.

### Game / Canvas / WebGL

Must support play, readability, and world feel at the same time.

- Name the gameplay promise and the UI fantasy: arcade cabinet, tactical map,
  tabletop rules desk, cinematic cockpit, editor workbench, etc.
- HUD, menus, overlays, and motion must reinforce the game state without hiding
  inputs or canvas content.
- Verify canvas bounds, DPR, input parity, pause/settings overlays, reduced
  motion where relevant, and mobile framing.
- Avoid static app chrome over a game, illegible decorative type, and motion
  that fights input.

### Dense Reference / Catalog / Manual

Must help repeated study.

- Prioritize scanning, direct labels, stable filters, durable search, readable
  type, and domain-shaped layout.
- Use visual hierarchy to reduce cognitive load instead of adding decorative
  chips, badges, counters, or pseudo-labels.
- Verify focused crops of dense rows, badges, counters, overlays, and active
  states.
- Avoid one-note palettes, low-contrast badges, detached legends, and card
  grids where table/list structure would scan faster.

## Aesthetic Acceptance

Automated QA can prove that a page is not broken. It cannot prove that the
design is good.

For `concept`, `revamp`, and greenfield work, final review must include a short
aesthetic judgment:

- Does the output clearly express the design thesis?
- Does it clearly express the named style posture?
- Is the signature move visible in the first meaningful screen?
- Is the first viewport stronger than a generic scaffold?
- Are typography, spacing, color, and imagery doing product-specific work?
- Do mobile and desktop both look intentionally composed?
- Would the target user understand the hierarchy without explanation?
- Did Hallmark or the equivalent anti-slop checklist reject generic pills,
  fake chrome, decorative card grids, stock heroes, and other AI-default tropes?

If the honest answer is "functional but bland," the design is not accepted.
