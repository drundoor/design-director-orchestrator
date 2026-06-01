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

## Design Quality Bar

- Design thesis: A concise consulting site that feels editorial and specific,
  with a first viewport that makes the offer clear before any feature grid.
- Primary workflow: Help a time-constrained buyer understand the offer and move
  toward contact.
- Style posture: Product dossier with an editorial consulting voice.
- Why this posture fits: The buyer is evaluating credibility quickly, so the
  page should organize proof and offer details like a concise evidence dossier
  rather than a promotional template.
- Surface quality bar: Marketing/editorial web. The product or offer must be a
  first-viewport signal, supported by meaningful media and specific copy.
- Design exploration depth: Lean. Use one behavior/source-truth reference, one
  domain/product reference, and one editorial art-direction reference unless the
  user asks for a broader design exploration.
- Visual signature: Strong editorial type, restrained color, real product or
  context imagery, and a layout that avoids generic SaaS card walls.
- Signature move: The first viewport reads like a concise dossier page: offer,
  proof point, and contact path share one editorial composition instead of a
  split hero or feature grid.
- Style commitment: Product dossier, not SaaS homepage. The first viewport
  should feel like an editorial evidence page with a visible offer, proof, and
  action path.
- First-viewport consequence: No split hero or centered slogan; offer, proof,
  and contact path are composed together.
- Layout consequence: Evidence-led dossier sections replace a feature-card wall.
- Typography consequence: Editorial hierarchy carries the design instead of
  decorative pills or oversized slogans.
- Color/material consequence: Restrained palette and real media do credibility
  work; no gradient-only surfaces.
- Generic pattern rejected: Generic SaaS hero plus feature grid.
- Composition proof: The first viewport carries the name/offer, proof point, and
  contact path; follow-up sections show evidence and process without burying the
  primary action.
- Impeccable route: `impeccable craft` and `bolder` for the build, with
  `typeset` as the secondary review because the direction depends on editorial
  hierarchy.
- Impeccable execution: Load the Impeccable skill plus `craft`, `bolder`, and
  `typeset` command references; record craft completeness, anti-generic checks,
  and editorial typography checks.
- Reference discovery plan: Check one standards/behavior source for navigation
  and focus, one reusable design system for component mechanics, two to four
  high-reputation editorial/product references for transferable composition
  ideas, and font/media sources only after licenses are recorded.
- Anti-generic checks: No gradient-only hero, no decorative feature-card grid,
  no generic pills/chips, no vague value-prop headline, and no stock-like
  atmosphere as the main visual.
- Hallmark / anti-slop review: Run Hallmark pre-emit critique before final
  acceptance; if unavailable, record an equivalent anti-slop checklist result.
- Hallmark execution: Load Hallmark and record the pre-emit critique, or record
  the unavailable fallback and why it was allowed.

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
