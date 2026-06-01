# Research And Inspiration

Use this workflow when the user supplies inspiration, asks for a style, or asks
the agent to research reputable design systems, UI libraries, websites, or
GitHub design skills/components.

## Workflows

### User-Supplied Inspiration

1. Record each URL, screenshot, or named product in the brief.
2. Extract transferable principles only: hierarchy, density, rhythm, navigation,
   motion role, component behavior, information architecture, or tone.
3. Record what must not be copied: assets, screenshots, brand skin, exact layout,
   copy, source code, animation choreography, or proprietary interaction.
4. Map each useful principle to local product constraints and a verification gate.

### Agent-Researched Inspiration Websites

1. Ask whether web research is allowed when the user did not explicitly ask for it.
2. Prefer official sites, portfolios with clear source URLs, respected design
   galleries, public design-system docs, and primary product pages.
3. Use reputation signals, not popularity alone: designer/operator credibility,
   official documentation, visible production usage, accessibility maturity,
   maintained code, and clear licensing.
4. Treat most inspiration sites as read-only. Summarize principles; do not copy
   visuals, copy, screenshots, assets, or layouts.

### OSS Design Libraries

1. Prefer official docs, GitHub repositories, npm/package metadata, and license
   files over blog summaries.
2. Record the package name, source URL, license, license source, checked date,
   package version or commit, maintenance signal, and allowed use before
   recommending dependency, code reference, or component adoption.
3. If the license is missing, unclear, copyleft for the target use, or asset-only,
   mark it `link only` or `do not use`.
4. Keep design direction separate from component mechanics. A dependency can be
   useful for behavior without becoming the visual style.

### GitHub Design Skills Or Agent Workflows

1. Inspect the README, license file, source provenance, and examples.
2. Confirm whether the repository is intended for reuse as a skill, prompt,
   package, template, or read-only reference.
3. Do not bundle or vendor another skill unless the license permits redistribution
   and the maintenance/provenance cost is acceptable.
4. Prefer a referenced optional peer skill when licensing, versioning, or
   ownership is uncertain.

## Research Ledger

Every researched source gets one ledger row:

```yaml
- source: "official URL or GitHub repository"
  type: "design system | component library | inspiration site | GitHub skill | asset/template"
  reputation_signal: "why designers/builders should trust it"
  checked_at: "YYYY-MM-DD"
  license: "MIT | Apache-2.0 | OFL | custom | not found"
  license_source: "repo LICENSE | package metadata | official docs | not found"
  package_version_or_commit: "version, release tag, commit SHA, or n/a"
  maintenance_signal: "recent release, active issues, production use, docs freshness, or unknown"
  maintenance_signal_checked_at: "YYYY-MM-DD"
  allowed_use: "link only | dependency | code reference | asset allowed | do not use"
  why_relevant: "brief question it answers"
  extract: "transferable principle or mechanic"
  do_not_copy: "specific visual/code/asset boundaries"
  local_mapping: "how it maps to this product"
  verification_gate: "how QA will prove the adaptation works"
```

Use primary sources for license checks: repository `LICENSE` files, package
metadata, or official documentation. Re-check sources before an implementation
lock if `checked_at` or `maintenance_signal_checked_at` is stale for the task.

## Curated Starting Sources

`references/curated-research-ledger.yaml` records a dedicated 2026-06-01
curation pass across reputable GitHub component libraries, design systems,
design skills, accessibility references, and inspiration sites. Treat it as a
starting map only. Before a source influences implementation, copy the relevant
row into the project ledger, re-check freshness, and keep any `link only` or
`do not use` boundaries intact.

Allowed-use defaults:

- `link only`: inspiration, learning, or non-permissive/unclear license.
- `dependency`: package can be installed under a compatible license.
- `code reference`: implementation can be studied, but copied code still needs
  license compatibility and attribution.
- `asset allowed`: exact asset/font/template use is allowed under a recorded
  license and terms.
- `do not use`: license, provenance, safety, or quality is unacceptable.

## Hard Stops

- Do not copy from screenshots, galleries, or live sites.
- Do not import assets, templates, or fonts without a recorded license.
- Do not bundle third-party skills or packages without redistribution permission.
- Do not let a reference override accessibility, platform conventions, data
  semantics, local design-system rules, or user anti-goals.
- If the result could reasonably be mistaken for a source, it fails.
