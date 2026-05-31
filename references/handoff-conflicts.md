# Handoff And Conflicts

Assign exactly one owner for each phase:

- Brief/direction.
- Implementation.
- Validation.

No two specialists may redefine the same direction in one pass.

## Conflict Rule

Highest-authority source wins. Lower-authority sources may only influence details that do not violate higher authority.

Examples:

- If Awwwards suggests tiny type and the app needs fast scanning, ignore Awwwards.
- If shadcn/ui suggests badge-heavy dashboard chrome and the user banned generic pills, ignore the visual style.
- If a board hotspot looks prettier but hides the selected space, the board/domain oracle wins.
- If two specialists disagree, the one owning the source of truth wins.

## Specialist Boundaries

- `impeccable`: critique, layout, type, polish, clarity, hardening, adaptation.
- `hallmark`: anti-slop audit, macrostructure, expressive redesign, study.
- `interface-design`: product/tool/dashboard concept, information architecture, domain signature.
- `data-visualization`: charts, rankings, matrices, diagrams, maps, analytical claims.
- `frontend-testing-debugging`: rendered validation and interaction proof.
- `better-icons`: icon search and intake.
- `frontend-app-builder`: greenfield or concept-approved frontend creation.

If the user explicitly invoked a specialist and there is no conflict, let that specialist own the work.
