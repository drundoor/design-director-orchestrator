# Routing

Run `design-director` only for multi-skill, high-risk, or validation-heavy design tasks.

## Source Priority

1. Accessibility, legal, safety, keyboard, touch, reduced motion.
2. Established design system.
3. Domain, data, board, map, or diagram semantics.
4. Existing code, screenshots, CSS, tokens.
5. User complaints and anti-goals.
6. External references.

## Surface Routes

| Surface | Direction Owner | Implementation Owner | Validation Owner |
|---|---|---|---|
| Web product UI | `impeccable craft/polish` plus this brief | Codex/frontend code | rendered QA plus state discovery |
| Dense reference app | `impeccable layout/typeset/clarify` plus this brief | Codex/frontend code | rendered QA plus DOM audit |
| Dashboard/data visualization | `data-visualization` plus `impeccable craft/layout/typeset` plus `references/data-viz-contract.md` | Codex/frontend code | viz correctness plus screenshots plus active chart states |
| Board/map/diagram | `data-visualization` plus domain brief plus `impeccable layout/adapt` | Codex/frontend code | hotspot/label/popover QA |
| Component behavior | WAI APG, React Aria, Radix, then `impeccable harden/craft` | Codex/frontend code | keyboard/focus/touch checks |
| Marketing/editorial | `hallmark` plus `impeccable craft/typeset/colorize` | Codex/frontend code | screenshots plus anti-slop review |
| Iconography | local icon system first, then `better-icons` | Codex | metaphor/readability check |
| Animation/motion | local brief plus `references/animation-motion.md`; GSAP docs/repo when timelines or scroll choreography are needed | Codex/frontend code | reduced-motion, interruption, performance, and screenshot/video QA |
| Game/canvas/WebGL | game UI specialist or product interface designer plus `references/game-canvas-contract.md` | Codex/frontend code | canvas/DPR/input/performance QA |
| Native iOS | iOS/HIG specialist or local iOS design owner plus `references/platforms-ios.md` | Codex/iOS code | simulator screenshots, UI hierarchy, Dynamic Type, accessibility |
| Native Android | Android/Material/Compose owner plus `references/platforms-android.md` | Codex/Android code | emulator screenshots, UI tree, font scale, accessibility |
| Cross-platform app | platform-specific owner per runtime | Codex code per runtime | separate QA contract per platform |
| New site/app build | Design Director owns brief, style, reference discipline, Impeccable route, and QA gates | `impeccable craft` plus `frontend-app-builder`, Codex, native builder, or platform specialist | platform-specific rendered/native QA |
| Final QA only | `frontend-testing-debugging` | none unless bugs found | QA ledger |

For `concept`, `revamp`, and greenfield `concept -> implement -> qa`, Design
Director also owns the design thesis, style posture, signature move, surface quality bar, Impeccable route, and reference discovery plan from
`references/design-quality-gates.md`. The specialist can execute the direction,
but the orchestrator must reject a merely functional generic scaffold.

Use `impeccable` for every broad frontend/web design build, revamp, or final
polish pass unless the user explicitly opts out. For native iOS/Android,
platform conventions still win, but use Impeccable as a secondary hierarchy,
copy, density, and anti-generic review when it can evaluate the surface without
overriding HIG, Material, or product code truth.

An Impeccable route is not satisfied by naming commands in the brief. The agent
must load/use the Impeccable skill and the relevant command reference(s), then
record `Impeccable execution` with the loaded command references and the checks
applied. If Impeccable is unavailable, record that as a non-final limitation
unless the user explicitly waived it.

Use `hallmark` as the anti-slop reviewer for broad design work when available.
Hallmark may own macrostructure and expressive redesign, but Design Director
owns source-truth conflicts and final acceptance.

Likewise, `Hallmark` is not satisfied by a manual vibe check when the skill is
available. Load/use Hallmark, record `Hallmark execution`, and only fall back to
the Design Quality Gates checklist when Hallmark is unavailable or the user
waives it.

## Impeccable Command Selection

Pick and record one primary Impeccable command before implementation. Add a
secondary command only when the brief has a clear need.

- New web app, dashboard, tool, or marketing surface: `impeccable craft`.
- Existing page/screen broad redesign: `impeccable polish`; use `bolder` when
  the complaint is bland/generic and `quieter` when the complaint is loud or
  overdecorated.
- Dashboard or dense tool: `impeccable layout` plus `typeset`; add `clarify`
  when labels, status language, or decision copy are weak.
- Open-ended greenfield dashboard, tool, app, or marketing build with no strong
  user-supplied style: add `bolder` as a taste check.
- Responsive/mobile failure: `impeccable adapt`.
- Production state, error, edge-case, or accessibility hardening:
  `impeccable harden`.
- Typography-specific work: `impeccable typeset`.
- Color/palette weakness: `impeccable colorize`.
- Motion or microinteraction request: `impeccable animate`, with
  `references/animation-motion.md` when motion is substantial.
- Component-level build or repair: `impeccable craft` or `harden`, with WAI APG,
  React Aria, or Radix for behavior truth.

If the user names a different Impeccable command, use the user's command unless
it conflicts with source truth. If Impeccable is unavailable, record the fallback
review used and treat that as a non-final limitation for broad design work.

## Secondary Command Trigger Rules

These are requirements, not suggestions. If a trigger applies, include the
secondary command in the brief's `Impeccable route`, run it when available, or
record an explicit waiver and reason.

- Greenfield web/front-end work: include `craft`.
- Existing broad redesign, makeover, or revamp: include `polish`.
- Open-ended greenfield work without a strong user-supplied style, or any result
  that risks being merely functional: include `bolder`.
- Dashboard, data-heavy tool, dense reference UI, catalog, or admin surface:
  include `layout` and `typeset`.
- Bland, generic, AI-slop, or merely functional output: include `bolder`.
- Loud, gimmicky, overdecorated, or visually noisy output: include `quieter`.
- Mobile, responsive, breakpoint, viewport, Dynamic Type, font-scale, or IME
  fit problem: include `adapt`.
- Production states, error handling, accessibility, keyboard/touch, i18n,
  loading, empty, validation, or edge-case risk: include `harden`.
- Weak labels, statuses, instructions, empty/error copy, or decision language:
  include `clarify`.
- Typography, font pairing, hierarchy, scan rhythm, or text-density problem:
  include `typeset`.
- Palette, contrast, color semantics, or one-note color problem: include
  `colorize`.
- Motion, animation, reveal, transition, or microinteraction request: include
  `animate`.

## Standalone Output Routing

For standalone static mockups, benchmarks, and sample screens without a named
existing target, implementation ownership is scoped to an isolated output folder
under `.design-director/mockups/<slug>/`. Do not write into the host product's
routes, shared CSS, or root QA artifacts unless the user explicitly asks to
modify the product.

## Exit Routes

- Single component polish: use `impeccable` directly unless Design Director is needed for QA or source-truth conflict.
- Data chart correctness: use `data-visualization` directly.
- Icon search/replacement: use `better-icons` directly.
- Rendered bug/debug: use `frontend-testing-debugging` directly.
- Greenfield implementation after brief: use `frontend-app-builder` or the platform builder for code, while Design Director keeps ownership of the style brief, references, and final QA gates.

## Native QA Contract Boundary

Native iOS and Android evidence is not a web QA fallback. Use the native report
contracts, simulator/emulator screenshots, hierarchy/tree captures, logs, run
metadata, and artifact hashes. Validate with `npm run qa:native:ios` or
`npm run qa:native:android`.
