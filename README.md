# Design Director Orchestrator

Design Director is a Codex skill for UI work that needs more than a quick
style pass. It keeps the work grounded in a brief, checks references before
using them, opens the app, exercises real UI states, and refuses final approval
when evidence is stale or incomplete.

Use it when a design bug made it to review, when a page needs a real revamp, or
when you want a new interface built with QA baked in from the start.
It is for work where "functional but bland" is not good enough.

## What It Does

### Directs The Work

- Turns visual requests into a brief with source truth, anti-goals, a design
  thesis, a surface quality bar, and acceptance gates.
- Chooses the right flow: `audit`, `repair`, `revamp`, `concept`, `study`,
  `create`, or `qa`.

### Raises Visual Quality

- Routes broad web/front-end work through Impeccable by default, then records
  what actually ran or what the user explicitly waived.
- Requires a style posture, signature move, domain-specific artifact,
  interaction/dynamism plan, first-viewport consequence, and rejected generic
  pattern before broad implementation starts.

### Builds From References

- Runs lean design-element exploration by default: one correctness source, one
  domain source, and one taste/art-direction source.
- Captures what to learn from each reference and what not to copy before outside
  inspiration shapes the implementation. Larger source-curation passes are
  opt-in with `deep design exploration`.

### Verifies Real UI States

- Opens the app and checks active states like dropdowns, search suggestions,
  popovers, dialogs, drawers, tabs, charts, and mobile navigation.
- Fails final QA for stale evidence, hidden overlays, clipped text, font drift,
  spacing drift, overflow, focus issues, and missing responsive coverage.

For a tiny CSS fix, use the normal coding flow. For anything visual that can
break across states, screens, or platforms, use this.

## Prompt With Plain Language Or Specific Skills

Plain language is enough:

- "Audit this UI. Do not change code."
- "Repair this visual bug and verify it on mobile and desktop."
- "Revamp this dashboard, preserve behavior, and make a strong style choice."
- "Build a new marketing page from this brief and run final design QA."
- "Run deep design exploration first, then recommend one direction."

You can also name the flow directly:

- `audit`: inspect and report, no code changes.
- `repair`: fix a specific visual or interaction bug.
- `revamp`: redesign an existing surface while preserving behavior.
- `concept`: produce directions before implementation.
- `study`: research references and extract principles only.
- `create`: build a new site, app screen, dashboard, or tool.
- `qa`: run evidence-backed final design checks.

The intent is separate from the platform. Say `repair + native-ios`,
`qa + native-android`, `create + dashboard`, or `revamp + marketing-web`.
Platform examples: "Audit this Android Compose screen with IME states,"
"Redesign this iPhone screen with Dynamic Type," "Improve this game/canvas UI,"
or "Use these screenshots as inspiration without copying assets."

| User asks | Default path | Weight |
| --- | --- | --- |
| "Check this UI" | audit | light |
| "Fix this visual bug" | repair plus draft/final QA | medium |
| "Make this page much better" | revamp plus lean design exploration | medium |
| "Build a new dashboard/site/app" | concept -> implement -> QA | medium |
| "Run deep design exploration" | study/concept with deep source curation | heavy |
| "Run final design QA" | strict evidence gate | strict |

For broad front-end design work, Design Director routes through Impeccable by
default. The brief's `Impeccable route` line must list the primary command and
every secondary command triggered by the request. Final QA rejects blank routes
and mechanically checks the highest-signal combinations: greenfield web work
needs `craft`, open-ended greenfield work adds `bolder`, broad redesigns need
`polish`, and dashboard/data-heavy/dense surfaces need `layout` plus `typeset`.
For a new web build, the route usually starts with `impeccable craft`.
The brief must also include
`Impeccable execution` evidence. The full routing rules live in
`references/routing.md`.

For standalone static mockups or benchmark runs, Design Director should use an
isolated output folder and a lighter draft QA pass first. Full final QA is for
acceptance, deployment, or production-readiness requests.

Design exploration depth controls how much outside design material the agent
uses:

- `lean` is the default. It uses 2-3 high-signal design-element references and
  one compact style commitment before building.
- `standard` is for requested inspiration or a couple of lightweight directions.
- `deep` is opt-in for larger reference passes, source curation, and
  multiple distinct directions. It is slower and uses more tokens by design.

## How To Install With AI-Assisted Prompts

If you want another coding agent to install it for you, paste one of these.

Choose the bundle for the best design critique, because it installs the
orchestrator plus the recommended peer skills. Choose orchestrator-only for
offline, corporate-network, or low-dependency environments; broad final design
QA will then record peer-skill fallbacks instead of pretending those skills ran.

Option 1, Codex with the recommended peer-skill bundle:

```text
Install https://github.com/drundoor/design-director-orchestrator plus its recommended peer skills. Clone the repo, run `npm run setup`, run `npm run verify`, run `npm run install:codex:bundle -- --dry-run`, then run `npm run install:codex:bundle`. The bundle installer must check peer-skill licenses and record source metadata; do not vendor third-party skill files into this repo.
```

Option 2, Codex orchestrator only:

```text
Install https://github.com/drundoor/design-director-orchestrator as a local Codex skill named design-director. Clone the repo, run `npm run setup`, run `npm run verify`, run `node scripts/install-local.mjs --dry-run --symlink`, then install with `node scripts/install-local.mjs --symlink`. After install, verify that `SKILL.md` is valid and that `npm run verify` passes.
```

Option 3, Claude or another coding agent:

```text
Clone https://github.com/drundoor/design-director-orchestrator. Run `npm run setup` and `npm run verify`. If your environment supports Codex-style skills, install it as a skill folder named design-director. Otherwise, use SKILL.md as the entrypoint instructions and load files from references/ only when the task needs them.
```

## More Technical Install Path

Option 1, full bundle for most Codex users:

```sh
git clone https://github.com/drundoor/design-director-orchestrator.git
cd design-director-orchestrator
npm run setup
npm run verify
npm run install:codex:bundle -- --dry-run
npm run install:codex:bundle
```

The bundle installer fetches allowlisted peer skills from upstream GitHub
repositories, checks their licenses, copies their upstream license into the
installed skill folder, and records source/ref/commit metadata. It does not
vendor those third-party skills into this repository. Use
`npm run install:codex:bundle -- --peers impeccable` to install only one peer,
or `--force-peers` to update an existing peer install.

Bundle install troubleshooting:

- If `git` is unavailable or GitHub is blocked, use the orchestrator-only path.
- If a peer repo changes license or structure, the bundle install fails closed.
- If a peer skill already exists, it is left unchanged unless you pass
  `--force-peers`.
- Default peer refs are pinned so repeated installs resolve to the same audited
  upstream commit or tag.

Option 2, orchestrator only:

```sh
node scripts/install-local.mjs --dry-run --symlink
node scripts/install-local.mjs --symlink
```

Use `--copy` instead of `--symlink` if your environment does not handle
symlinks well. Use `--name <skill-name>` for a custom skill name or
`--target <path>` for a custom skills directory.

Restart Codex after installing a new skill.

## Quick Start

For a new build, start with a brief and research ledger:

```sh
npm run brief:new -- --surface marketing-web
npm run research:ledger
```

For a standalone static mockup or benchmark screen, use the isolated fast path:

```sh
npm run mockup:init -- --target-root /absolute/work/folder --slug support-queue-dashboard --surface dashboard
npm run reference:seed -- --context /absolute/work/folder/.design-director/mockups/support-queue-dashboard/run-context.json --pack dashboard
npm run mockup:assert -- --context /absolute/work/folder/.design-director/mockups/support-queue-dashboard/run-context.json
npm run qa:web:draft -- --context /absolute/work/folder/.design-director/mockups/support-queue-dashboard/run-context.json --viewport-preset mockup --recipe dashboard-basic
```

That path writes `design-quality.draft.json`, not final acceptance evidence.
Use it to move quickly, then run final QA when the artifact is meant to ship.

For revamps and new builds, fill in the `Design Quality Bar` section before
implementation. It asks for the design thesis, primary workflow, visual
signature, style posture, signature move, domain-specific artifact,
interaction/dynamism plan, conventionality risk, Impeccable route, Impeccable
execution, design exploration depth, style commitment, visible consequences,
reference discovery plan, composition proof, and anti-generic checks. That is
the part that prevents a dashboard from becoming "metric cards plus a chart," a
tool from becoming plain panels, or a marketing site from becoming a generic
hero, feature grid, or pile of decorative pills.

For ordinary demo or simulated data, label the caveat in a source row, chart
caption, footnote, or local annotation. Do not make a giant warning banner or
visual badge unless the user's domain, legal risk, safety risk, or instructions
call for that level of prominence.

Useful support commands:

```sh
npm run peer:check -- --write-markdown
npm run peer:validate -- --design-quality .design-director/design-quality.json
npm run source:caveat -- --config .design-director/render.config.json
npm run reference:seed -- --pack dashboard --pack mobile-card
```

For a web app draft QA run:

```sh
npm run qa:web:draft -- --url http://127.0.0.1:5173
```

For a static page:

```sh
npm run qa:web:draft -- --url file:///absolute/path/page.html --static
```

For final web QA:

```sh
npm run qa:web:final -- --config .design-director/render.config.json
```

For CI:

```sh
npm run qa:web:ci -- --config .design-director/render.config.json
```

For native apps:

```sh
npm run qa:native:ios -- --report .design-director/native-ios-qa.json
npm run qa:native:android -- --report .design-director/native-android-qa.json
```

## Draft Vs Final QA

Draft QA is for collecting evidence and finding problems. It may create
screenshots, initialize notes, and write `ACCEPTANCE_READY=false`.

Final QA is stricter. It passes only when:

- `.design-director/design-brief.md` exists.
- Discovery, render, DOM, visual audit, screenshot notes, and coverage all refer
  to the same configured `qaRunId`.
- `design-qa.json` has `status: "pass"` and `acceptanceReady: true`.
- Every relevant active state has been rendered or explicitly covered.
- No unwaived blockers remain.

Use `--static` only for non-interactive pages. Use `--partial` only for draft
reports that are not acceptance evidence.

Minimum successful web QA output:

```text
.design-director/
  design-brief.md
  render-results.json
  dom-audit.json
  visual-consistency-audit.json
  discovered-states.json
  state-coverage.json
  design-quality.json
  screenshot-notes.md
  design-qa.json
  design-qa.md
  screenshots/
```

## Active State Config

The scripts can click, type, focus, hover, scroll, resize, wait, assert, and
capture element screenshots. That matters because many design failures only
appear after the UI is opened or used.

Example:

```json
{
  "url": "http://127.0.0.1:5173",
  "waitForSelector": "main",
  "qaProfile": "final-qa",
  "surface": "dashboard",
  "states": [
    { "name": "default", "path": "/" },
    {
      "name": "search-open",
      "path": "/",
      "actions": [
        { "type": "fill", "selector": "#searchInput", "value": "ark" },
        { "type": "waitForSelector", "selector": "#searchSuggestions" }
      ]
    }
  ],
  "viewports": [
    { "width": 375, "height": 900 },
    { "width": 768, "height": 1024 },
    { "width": 1440, "height": 1000 }
  ],
  "visualAudit": {
    "componentSelectors": [".card", "[data-card]"],
    "peerValueSelectors": [".metric-value"],
    "overlaySelectors": ["[role='listbox'][data-state='open']"],
    "ignoreSelectors": [".visually-hidden"]
  }
}
```

The full schema is in `scripts/render.config.schema.json`.

## Native QA

Native final QA validates screenshots, UI hierarchy/tree files, logs, timestamps,
and tooling metadata.

Standard iOS coverage includes:

- Default light appearance.
- Dark appearance.
- Large text.
- Keyboard-focused editable state.

Standard Android coverage includes:

- Default light theme.
- Dark theme.
- Large font scale.
- IME-focused editable state.

Each required profile needs its own screenshot and hierarchy/tree evidence
unless the report explains why that profile does not apply.

Useful commands:

```sh
npm run qa:native:ios -- --init
npm run qa:native:ios -- --print-tooling-hash --report .design-director/native-ios-qa.json
npm run smoke:native
npm run smoke:native:fail
```

## References

External references are allowed, but they are bounded.

- Record source, license, checked date, allowed use, and do-not-copy rules.
- Extract principles, not layouts, copy, assets, screenshots, or brand skins.
- Re-check stale source records before implementation.
- Keep local truth, accessibility, data semantics, and user anti-goals above any
  reference.

`references/curated-research-ledger.yaml` contains a source-backed starter list
of UI libraries, design systems, design skills, and inspiration sites. Copy a
row into the project ledger before using it on a real task.

## Browser Rule

Rendered evidence is required.

- Use the Browser plugin for local targets such as `localhost`, `127.0.0.1`, and
  local files.
- Use the Chrome plugin for deployed sites, authenticated tabs, profile-specific
  state, or when Chrome is requested.
- Use Computer Use only when Browser or Chrome cannot exercise the surface.

## Repository Map

- `SKILL.md`: main orchestration instructions.
- `references/`: routing, intake, validation, research, platform, and QA rules.
- `scripts/`: Playwright audits, report validators, setup, install, and smoke tests.
- `schemas/`: native QA schemas.
- `fixtures/`: regression fixtures for visual and interaction checks.
- `examples/`: brief, ledger, config, waiver, and QA report examples.
- `REFERENCED_SKILLS.md`: optional peer skills and license notes.
- `REFERENCE_LICENSE_POLICY.md`: rules for websites, assets, libraries, and examples.
- `PROVENANCE.md`: what is bundled and where it came from.

## License

This repo includes the Design Director skill, public-safe references, generic
fixtures, and supporting scripts. Optional peer skills are listed separately and
are not bundled unless their license allows it.

This is not legal advice. Check third-party terms before redistributing their
content.
