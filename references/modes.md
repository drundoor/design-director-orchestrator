# Modes And Platforms

Classify every Design Director job by one intent and one platform/surface.

## Intent Modes

| Intent | Use When | Code Changes |
|---|---|---|
| `audit` | Inspect design, interaction, or QA risk and report findings only. | No |
| `repair` | Fix a known concrete issue with focused verification. | Yes |
| `revamp` | Redesign a surface broadly while preserving product constraints. | Yes |
| `concept` | Produce directions, wireframes, or visual strategy before implementation. | No by default |
| `study` | Research references and extract transferable patterns. | No |
| `implement` | Build or modify UI from an approved direction. | Yes |
| `qa` | Run rendered/native QA and produce evidence without design changes. | No unless bugs are explicitly fixed |

Do not model native platforms as modes. Use `qa + native-ios`, `repair + native-android`, or `revamp + dashboard/web` rather than inventing combined modes.

## Plain-Language Aliases

Map common user language to the smallest useful mode:

| User Says | Route |
|---|---|
| "check this UI", "review the design", "find issues" | `audit` |
| "fix this visual bug", "repair this mobile issue" | `repair` |
| "make it look better", "redesign this page", "give it a makeover" | `revamp` unless code changes are forbidden |
| "give me options", "design directions", "what style should this use" | `concept` |
| "research inspiration", "find references", "look for design libraries" | `study` |
| "build this design", "implement the chosen direction" | `implement` |
| "prove it is ready", "run final QA", "acceptance check" | `qa` |
| "create a new site/app" | `concept -> implement -> qa` |
| "static mockup", "benchmark", "sample dashboard", "show me a result" | `concept -> implement -> draft qa` in isolated output unless final QA is requested |

If the user says redesign, revamp, makeover, or make it better, default to
`revamp` unless they explicitly say "no code changes", "audit only", or
"concept only".

## Platforms And Surfaces

| Platform/Surface | Typical Route |
|---|---|
| `web-app` | Browser/Chrome rendered QA, DOM audit, visual audit. |
| `marketing-web` | Brand/editorial direction plus responsive screenshot QA. |
| `dashboard` | Dense web QA plus `data-viz-contract.md`. |
| `data-viz` | Data truth, chart interaction, responsive labels, export/tooltip checks. |
| `game-canvas` | Canvas bounds, input parity, motion/performance evidence. |
| `native-ios` | `platforms-ios.md`, simulator screenshots, UI hierarchy, accessibility. |
| `native-android` | `platforms-android.md`, emulator screenshots, UI tree, accessibility. |
| `cross-platform` | Validate each native/web runtime separately; do not assume parity. |

## Greenfield Composite Flows

- New marketing site: `concept + marketing-web -> implement -> qa`.
- New web app or SaaS tool: `concept + web-app/dashboard -> implement -> qa`.
- New dashboard or report: `concept + dashboard/data-viz -> implement -> qa` with data truth and chart-state verification.
- New iPhone screen: `concept + native-ios -> implement -> qa + native-ios`.
- New Android screen: `concept + native-android -> implement -> qa + native-android`.
- New game/canvas interface: `concept + game-canvas -> implement -> qa` with canvas bounds, input, and motion checks.

For a new build with no existing code, the brief must explicitly mark local
truth as missing and capture the target audience, content/data availability,
style request, inspirations, constraints, anti-goals, design thesis, style
posture, signature move, domain-specific artifact, interaction/dynamism plan,
conventionality risk, Impeccable route, peer-skill execution evidence,
reference discovery plan, and surface quality bar before implementation. Use
`references/design-quality-gates.md`.

For `revamp`, `makeover`, `make it better`, and greenfield `create` requests,
do not accept "functional but bland" as success. The output needs a named design
thesis, style posture, signature move, and surface-specific quality bar even
when the user did not supply a style direction. Broad frontend/web work also
needs an Impeccable command selection and a reference discovery pass unless the
user explicitly opts out.

Default to lean design-element exploration, not a large research project:
choose one strong style commitment, use a compact reference mix, and implement.
Use `standard` or `deep` only when the user asks for broader inspiration,
multiple directions, lawful source curation, or a larger exploration pass.

## Standalone Mockup Isolation

If the user asks for a standalone static mockup, benchmark, sample screen, or
new exploratory artifact and does not name an existing route/page/component to
modify, isolate the work:

- Create a scoped folder such as `.design-director/mockups/<slug>/`.
- Put the mockup HTML/CSS/assets, design brief, research ledger, screenshots,
  and QA artifacts inside that folder.
- Do not overwrite the repo-level `.design-director/design-brief.md` or
  unrelated QA artifacts.
- Read local truth only to understand environment constraints and available
  tooling. Do not treat unrelated existing product pages, prior generated
  mockups, or old QA artifacts as product requirements unless the user names
  them.
- If a real app/page is named, modify that target instead and record why the
  isolated-output rule did not apply.

## Static Mockup Fast Path

For repeatable benchmark/static-mockup runs, optimize for design signal first:

- Use `npm run mockup:init` to create the isolated run context.
- Use `npm run reference:seed` to add compact local reference packs before
  implementation.
- Use `npm run mockup:assert` before QA so placeholder files and escaped output
  roots fail early.
- Build the isolated mockup and run draft QA at 3 representative viewports:
  mobile, tablet, and desktop.
- Inspect those screenshots and fix obvious design defects.
- Do not claim final acceptance from the fast path.
- Run the full default viewport matrix and final QA only when the user asks for
  final acceptance, deployment, or production readiness.

## Prompt Patterns

- "Audit this dashboard and report design/interaction risks only. Do not change code." -> `audit + dashboard`
- "Repair the mobile filter drawer clipping behind the chart and verify it." -> `repair + dashboard/web-app`
- "Revamp the homepage, preserve product constraints, and verify at mobile/tablet/desktop." -> `revamp + marketing-web`
- "Study these eight onboarding sites and extract transferable patterns only." -> `study + web-app`
- "Create three visual directions for the settings screen, no implementation yet." -> `concept + product-ui`
- "Implement the chosen direction and run rendered QA on active states." -> `implement + inferred platform`
- "Run native iOS QA on the SwiftUI app in Simulator, including Dynamic Type and dark mode." -> `qa + native-ios`
- "Run Android visual/accessibility QA on the Compose screen in emulator." -> `qa + native-android`
- "Create a new site for this consulting studio in a calm editorial style and run final QA." -> `concept -> implement -> qa + marketing-web`
- "Create a static dashboard mockup for a support queue manager." -> isolated `concept -> implement -> draft qa + dashboard`
- "Research design systems and GitHub UI skills we can lawfully reference for this dashboard." -> `study + dashboard`
- "Run a deep design exploration before building this dashboard." -> `study -> concept + dashboard`, then implement only after direction selection if requested
- "Use these screenshots as inspiration, but preserve our product data model and do not copy assets." -> `study -> concept`

## Style Intake

Capture style in ordinary words, then translate it into constraints:

- desired feel: quiet, premium, playful, editorial, utilitarian, cinematic, arcade, clinical, etc.
- audience and usage frequency
- user-provided inspirations or reference URLs
- design system/library preferences
- forbidden tropes and anti-goals
- accessibility and platform constraints
- content, data, imagery, and copy availability
- target platforms and breakpoints
- design thesis, visual signature, and anti-generic checks when the work is a
  revamp or new build
- style posture and signature move, inferred and stated when the user did not
  provide them
- compact style commitment with first-viewport, layout, typography,
  color/material, and generic-pattern consequences
- design exploration depth: `lean`, `standard`, or `deep`
- Impeccable route and reference discovery plan for broad design work
- peer-skill execution evidence for Impeccable and Hallmark/fallback

## Required Brief Fields

Record:

- `intent`
- `platform_surface`
- `source_of_truth_ranking`
- `anti_goals`
- `reference_strategy`
- `design_thesis`
- `style_posture`
- `signature_move`
- `domain_specific_artifact`
- `interaction_or_dynamism_plan`
- `conventionality_risk`
- `impeccable_route`
- `impeccable_execution`
- `hallmark_execution`
- `reference_discovery_plan`
- `surface_quality_bar`
- `design_exploration_depth`
- `state_discovery_status`
- `style_commitment`
- `first_viewport_consequence`
- `layout_consequence`
- `typography_consequence`
- `color_material_consequence`
- `generic_pattern_rejected`
- `validation_contract`
- `acceptance_gates`
