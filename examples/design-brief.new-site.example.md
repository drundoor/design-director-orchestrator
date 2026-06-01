# Design Brief: New Site Example

## Intent

`concept -> implement -> qa`

## Platform Surface

`marketing-web`

## Local Truth

- No existing codebase yet.
- Source content, product offer, audience, and conversion goal must be supplied
  or drafted before implementation.
- Missing local truth is recorded here rather than silently inferred.

## Audience

Time-constrained professional buyers who need a credible first impression and a
clear path to contact.

## Desired Style

Confident, restrained, modern editorial. Avoid generic SaaS gradients, oversized
decorative cards, and stock-like imagery.

## Inspirations

- User-supplied URLs or screenshots go here.
- Each inspiration must also appear in the research ledger with `do_not_copy`.

## Design System And Libraries

- Prefer plain HTML/CSS or the project's selected framework.
- Research OSS UI libraries only when they solve behavior or accessibility.
- Do not import assets, templates, or fonts until the license is recorded.

## Anti-Goals

- Do not create a generic landing page if the user asked for a product tool.
- Do not copy reference layouts, copy, or imagery.
- Do not hide primary actions behind mobile-only navigation.

## Acceptance Gates

- Mobile, tablet, and desktop rendered screenshots.
- Open navigation/menu states verified.
- No horizontal overflow, clipped controls, or camouflaged inputs.
- Screenshot notes inspected.
- `.design-director/design-qa.json` has `status: "pass"` and
  `acceptanceReady: true`.
