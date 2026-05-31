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

## Prompt Patterns

- "Audit this dashboard and report design/interaction risks only. Do not change code." -> `audit + dashboard`
- "Repair the mobile filter drawer clipping behind the chart and verify it." -> `repair + dashboard/web-app`
- "Revamp the homepage, preserve product constraints, and verify at mobile/tablet/desktop." -> `revamp + marketing-web`
- "Study these eight onboarding sites and extract transferable patterns only." -> `study + web-app`
- "Create three visual directions for the settings screen, no implementation yet." -> `concept + product-ui`
- "Implement the chosen direction and run rendered QA on active states." -> `implement + inferred platform`
- "Run native iOS QA on the SwiftUI app in Simulator, including Dynamic Type and dark mode." -> `qa + native-ios`
- "Run Android visual/accessibility QA on the Compose screen in emulator." -> `qa + native-android`

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
