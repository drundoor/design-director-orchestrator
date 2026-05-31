# Sources

This repository was created from a local Codex skill bundle and sanitized for public reuse.

## Bundled Files

- `SKILL.md`
  - Source: local Design Director skill bundle.
- `agents/openai.yaml`
  - Source: local Design Director skill bundle.
- `references/*.md`
  - Source: local Design Director skill bundle.
- `scripts/*.mjs`
  - Source: local Design Director skill bundle.

## Current Notable Additions

- `scripts/visual-consistency-audit.mjs`
  - Adds peer typography, grid alignment, spacing rhythm, media anchoring, related-width, camouflaged-control, and overlay stacking checks.
- Active-state action support in:
  - `scripts/render-check.mjs`
  - `scripts/dom-audit.mjs`
  - `scripts/visual-consistency-audit.mjs`
- `scripts/qa-report.mjs`
  - Merges visual consistency audit output into the QA report.

## Not Bundled

The Design Director skill references other local or plugin-provided skills as routing targets. Their contents are not copied into this repository unless explicitly listed as bundled above.
