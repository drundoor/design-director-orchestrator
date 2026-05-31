# Reference Tiers

Use external references only after a local brief exists. Use at most three active external references in one pass, each with a distinct role.

## S0: Local Truth

Mandatory before outside references:

- Repo docs and design docs.
- Existing screenshots and UI code.
- CSS/tokens/component library.
- Data files and domain rules.
- User complaints and anti-goals.

## S1: Standards And Behavior Authority

Use for accessibility, semantics, keyboard behavior, task patterns, and robust component behavior.

- WAI APG
- WCAG/WAI resources
- GOV.UK Design System
- USWDS
- Inclusive Components
- MDN HTML/CSS/ARIA docs
- React Aria for accessible unstyled behavior patterns

## S2: Reusable OSS Design Systems And Component Code

Use for mechanics, component APIs, layout patterns, and implementation examples after license check. Do not copy brand styling.

- Carbon
- Cloudscape
- Primer
- PatternFly
- Fluent UI
- MUI
- Ant Design
- Radix
- React Aria
- shadcn/ui as code scaffold only, not aesthetic direction

## S3: Visualization, Board, Map, And Diagram Mechanics

Use for encodings, interaction mechanics, scales, labels, legends, zoom/pan, node graphs, and layout algorithms.

- Observable Plot
- Vega-Lite
- D3
- ECharts
- Recharts
- Nivo
- visx
- MapLibre
- Leaflet
- OpenLayers
- deck.gl
- React Flow
- Cytoscape.js
- Mermaid
- D2

Grafana is read-only operational inspiration by default because AGPL changes reuse risk. Mapbox GL JS is not the default map choice unless the project accepts Mapbox terms.

## S3M: Motion And Animation Mechanics

Use only when the brief names an animation job: state transitions, guided attention, scroll-driven storytelling, timeline choreography, game feel, or motion prototypes. Motion references should answer "what behavior clarifies the interface?" before answering "what looks cool?"

- GSAP official site/docs: https://gsap.com/
- GSAP GitHub repo: https://github.com/greensock/GSAP
- 60fps.design for motion vocabulary and critique, not code authority.
- MDN Web Animations, CSS transitions/animations, and reduced-motion docs for platform behavior.

Treat GSAP as the default reference implementation when the interaction needs precise timelines, scroll-driven animation, sequencing, interruption control, or complex transform choreography. Prefer CSS transitions/animations for simple hover, focus, opacity, and one-step state changes.

## S4: Read-Only Inspiration

Extract principles only. Do not copy screens, brand skins, animation, layouts, copy, screenshots, or assets.

- Practical Typography: typography judgment, line length, dense reading, hierarchy.
- Design Spells: microinteraction and delight principles after usability works.
- 60fps.design: motion vocabulary, gesture patterns, mobile/iOS animation references.
- UXSnaps: product-flow teardown patterns from real apps.
- Awwwards: marketing/editorial art-direction challenge, not dense tools.
- Bento Grids: only when bento layout is justified by heterogeneous content priority.
- Detail: UI polish and small design decisions, not structural direction.
- Craftwork curated websites: mood/reference only unless exact asset or template license is recorded.
- UI Playbook: component decision checklist unless code/license is specifically checked.

## S5: Assets, Fonts, And Templates Requiring Explicit License Record

Use only when the brief names an asset need and the exact license is recorded.

- Fontshare fonts.
- Resource Boy assets.
- Craftwork assets/templates.
- Paid UI kits.
- Icon packs outside the repo's normal icon system.

## Record Format

```yaml
references:
  - source: "WAI APG dialog pattern"
    tier: "S1 standards"
    role: "component behavior"
    chosen_for: "keyboard, focus return, Escape behavior"
    extract: "modal opens from trigger, traps focus, closes on Escape, returns focus"
    do_not_copy: "example styling and layout"
    local_mapping: "card detail popover/dialog"
    verification_gate: "keyboard-only open/read/close test"
```

Hard rules:

- No references before brief.
- Max three active references per pass.
- Each reference needs a distinct role.
- Each reference needs `do_not_copy`.
- At least one local signature must be named.
- A result that could be mistaken for the reference fails.
