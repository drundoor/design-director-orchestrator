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
style request, inspirations, constraints, and anti-goals before implementation.

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
- "Research design systems and GitHub UI skills we can lawfully reference for this dashboard." -> `study + dashboard`
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

## Required Brief Fields

Record:

- `intent`
- `platform_surface`
- `source_of_truth_ranking`
- `anti_goals`
- `reference_strategy`
- `state_discovery_status`
- `validation_contract`
- `acceptance_gates`
