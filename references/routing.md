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
| Web product UI | `interface-design` or `impeccable` | Codex/frontend code | rendered QA plus state discovery |
| Dense reference app | `impeccable layout/typeset/clarify` plus this brief | Codex/frontend code | rendered QA plus DOM audit |
| Dashboard/data visualization | `data-visualization` plus `references/data-viz-contract.md` | Codex/frontend code | viz correctness plus screenshots plus active chart states |
| Board/map/diagram | `data-visualization` plus domain brief | Codex/frontend code | hotspot/label/popover QA |
| Component behavior | WAI APG, React Aria, Radix, then `impeccable harden/craft` | Codex/frontend code | keyboard/focus/touch checks |
| Marketing/editorial | `hallmark` or `frontend-app-builder` | Codex/frontend code | screenshots plus anti-slop review |
| Iconography | local icon system first, then `better-icons` | Codex | metaphor/readability check |
| Animation/motion | local brief plus `references/animation-motion.md`; GSAP docs/repo when timelines or scroll choreography are needed | Codex/frontend code | reduced-motion, interruption, performance, and screenshot/video QA |
| Game/canvas/WebGL | game UI specialist or product interface designer plus `references/game-canvas-contract.md` | Codex/frontend code | canvas/DPR/input/performance QA |
| Native iOS | iOS/HIG specialist or local iOS design owner plus `references/platforms-ios.md` | Codex/iOS code | simulator screenshots, UI hierarchy, Dynamic Type, accessibility |
| Native Android | Android/Material/Compose owner plus `references/platforms-android.md` | Codex/Android code | emulator screenshots, UI tree, font scale, accessibility |
| Cross-platform app | platform-specific owner per runtime | Codex code per runtime | separate QA contract per platform |
| New site/app build | Design Director owns brief, style, reference discipline, and QA gates | `frontend-app-builder`, Codex, native builder, or platform specialist | platform-specific rendered/native QA |
| Final QA only | `frontend-testing-debugging` | none unless bugs found | QA ledger |

## Exit Routes

- Single component polish: use `impeccable` directly.
- Data chart correctness: use `data-visualization` directly.
- Icon search/replacement: use `better-icons` directly.
- Rendered bug/debug: use `frontend-testing-debugging` directly.
- Greenfield implementation after brief: use `frontend-app-builder` or the platform builder for code, while Design Director keeps ownership of the style brief, references, and final QA gates.

## Native QA Contract Boundary

Native iOS and Android evidence is not a web QA fallback. Use the native report
contracts, simulator/emulator screenshots, hierarchy/tree captures, logs, run
metadata, and artifact hashes. Validate with `npm run qa:native:ios` or
`npm run qa:native:android`.
