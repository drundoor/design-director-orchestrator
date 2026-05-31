# Local Intake

Read local truth before outside references. External sources are never the first source of truth.

Prefer:

- `PRODUCT.md`
- `DESIGN.md`
- `AGENTS.md`
- `README.md`
- `package.json`
- App/page entry points
- CSS, tokens, theme, Tailwind, component library files
- Existing screenshots
- Data, rules, schemas, domain files
- User complaints and anti-goals

Output a compact intake note before routing:

```md
## Design Intake

- Intent: audit | repair | revamp | concept | study | implement | qa
- Platform/surface: web-app | marketing-web | dashboard | data-viz | game-canvas | native-ios | native-android | cross-platform | other
- Files/screenshots read:
- Missing local truth:
- Source-of-truth ranking:
- Constraints that block visual invention:
- User anti-goals:
- State discovery needed: yes | no | waived because ...
- Initial acceptance gates:
```

If local truth is enough, skip external reference intake. If local truth conflicts with an external reference, local truth wins unless the user explicitly asks to redesign away from it.
