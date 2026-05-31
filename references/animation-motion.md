# Animation And Motion

Use this reference only when animation is part of the design brief or when existing motion is causing usability, performance, or polish problems.

## Source Order

1. Local product intent, user preference, accessibility, and reduced-motion requirements.
2. Existing app motion tokens, framework conventions, and component lifecycle.
3. Platform behavior: CSS transitions/animations, Web Animations API, `prefers-reduced-motion`, focus, and scroll behavior.
4. GSAP when timeline control, scroll choreography, interruption, sequencing, SVG/canvas transforms, or game-like feel justify a motion library.
5. Motion inspiration, such as 60fps.design or Design Spells, only after usability and source-of-truth constraints are clear.

## GSAP Reference

- Official site and docs: https://gsap.com/
- GitHub repo: https://github.com/greensock/GSAP

Use GSAP as an implementation reference for:

- Multi-step timelines.
- Scroll-triggered or scrubbed animation.
- Coordinated transforms across several elements.
- SVG/canvas/DOM choreography.
- Interactive motion that must be interruptible, reversible, or precisely sequenced.

Prefer plain CSS for:

- Simple hover/focus affordances.
- One-step opacity, color, or transform transitions.
- Basic entrance/exit motion where the framework already has a good primitive.

## Motion Design Rules

- Motion must clarify state, spatial relationship, causality, progress, or priority.
- Avoid motion that exists only to make a static layout feel generated or flashy.
- Keep dense tools calm. In strategy guides, dashboards, editors, and reference surfaces, motion should usually be short, direct, and user-triggered.
- Do not animate essential text in a way that makes it hard to read.
- Do not rely on animation to reveal necessary information unless keyboard, touch, and reduced-motion paths exist.
- Avoid gratuitous gradients, glow trails, parallax, springy cards, and scroll-jacking unless the brief explicitly calls for an expressive editorial surface.

## Implementation Guardrails

- Gate substantial motion behind `prefers-reduced-motion`.
- Store and clean up GSAP timelines/triggers on unmount, route changes, or component teardown.
- Avoid animating layout properties when transforms or opacity can achieve the same effect.
- Define initial and final states explicitly so interrupted animations recover cleanly.
- Avoid starting animations before fonts/images/layout measurements are stable.
- Keep focus order and pointer targets stable during motion.

## Validation Gates

- Reduced-motion mode preserves the same content and task path.
- Animations do not create horizontal overflow, clipped text, or hidden focus states.
- Interaction remains responsive while animation is running.
- Repeated open/close or route transitions do not leave stale transforms, duplicate timelines, or active scroll triggers.
- Screenshot or video inspection covers the active motion state, not only the static final frame.
