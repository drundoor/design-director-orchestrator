# Referenced Skills And License Notes

Design Director routes work to other skills by name, but those skills are optional integrations. They are not bundled in this repository unless explicitly copied into the repo.

## License Review Result

- `hallmark`
  - Local installation checked: Codex skill bundle named `hallmark`
  - Upstream checked: `https://github.com/Nutlope/hallmark`
  - Local metadata found: `version: 1.0.0` in `SKILL.md`; `license: MIT` in `package.json`; `LICENSE` file present.
  - Upstream metadata found: GitHub reports MIT License; upstream `package.json` lists `license: MIT`.
  - Packaging status: packageable under MIT, provided the bundled copy preserves the MIT license and copyright notice.
- `impeccable`
  - Local installation checked: Codex skill bundle named `impeccable`
  - Upstream checked: `https://github.com/pbakaus/impeccable`
  - Local metadata found: no top-level local `LICENSE`, `README`, `package.json`, or frontmatter version in the installed bundle; detector entry files include `SPDX-License-Identifier: Apache-2.0`.
  - Upstream metadata found: GitHub reports Apache License 2.0; upstream `package.json` lists `license: Apache-2.0`; release `skill-v3.5.0` is published as `Skill 3.5.0`.
  - Packaging status: packageable under Apache-2.0, provided the bundled copy preserves the Apache license, copyright notices, attribution notices if any are added upstream later, and records local modifications.
- `frontend-design`
  - Local installation checked: Codex skill bundle named `frontend-design`
  - Upstream checked: `https://github.com/anthropics/skills/tree/main/skills/frontend-design`
  - Local metadata found: `license: Apache 2.0. Based on Anthropic's frontend-design skill. See NOTICE.md for attribution.`
  - Upstream metadata found: `LICENSE.txt` contains Apache-2.0; upstream `SKILL.md` points to that license file.
  - Packaging status: packageable under Apache-2.0, but prefer vendoring from upstream so `LICENSE.txt` is included. The current local copy does not include the license file referenced by its frontmatter.
- `interface-design`
  - Local installation checked: Codex skill bundle named `interface-design`
  - Upstream checked: `https://github.com/Dammyjay93/interface-design`
  - Local metadata found: no `LICENSE`, `NOTICE`, `README`, or frontmatter license metadata found in the checked bundle.
  - Upstream metadata found: GitHub reports MIT License; upstream `LICENSE` file is present.
  - Packaging status: packageable under MIT, but vendor from upstream or add the upstream MIT license file with the local copy.
- `better-icons`
  - Local installation checked: Codex skill bundle named `better-icons`
  - Upstream checked: `https://github.com/better-auth/better-icons`
  - Local metadata found: no local license file in the skill folder.
  - Upstream metadata found: GitHub and npm package metadata report MIT License; upstream `LICENSE` file is present.
  - Packaging status: packageable under MIT, but include the upstream MIT license file. Icons retrieved through Iconify still carry their source icon-set licenses and should be treated separately from this skill wrapper.
- `data-visualization`
  - Local installation checked: OpenAI curated plugin skill named `data-visualization`
  - Local plugin metadata found: `build-web-data-visualization` version `0.1.19`, `license: MIT`.
  - Upstream checked: `https://github.com/openai/plugins`; GitHub did not report a repository-level license file during review.
  - Packaging status: packageable from the local plugin package metadata under MIT, with the caveat that the exact plugin package metadata should be preserved because the upstream repo did not expose a repo-level license to GitHub.
- `frontend-app-builder` and `frontend-testing-debugging`
  - Local installations checked: OpenAI curated plugin skills named `frontend-app-builder` and `frontend-testing-debugging`
  - Local plugin metadata found: `build-web-apps` version `0.1.0`, `license: MIT`.
  - Upstream checked: `https://github.com/openai/plugins`; GitHub did not report a repository-level license file during review.
  - Packaging status: packageable from the local plugin package metadata under MIT, with the caveat that the exact plugin package metadata should be preserved because the upstream repo did not expose a repo-level license to GitHub.
- Other referenced routing targets, including related plugin skills:
  - Status: referenced by routing documentation only, not bundled.

## Policy For This Repository

- Include the Design Director orchestrator itself.
- List optional peer skills by name and expected role.
- Do not copy third-party or separately installed skill contents unless an explicit license/source has been verified.
- If a referenced skill is added later, include its license and attribution files with it.

## Packaging Recommendation

- Prefer keeping `hallmark` and `impeccable` as optional peer skills unless there is a concrete reason to vendor them.
- If vendoring `hallmark`, copy its `LICENSE` file into the vendored directory and retain the MIT copyright notice.
- If vendoring `impeccable`, copy the upstream `LICENSE` file into the vendored directory, preserve existing copyright and SPDX notices, and add a short modification notice for any local changes.
- Use the upstream release artifact for Impeccable skill packaging when possible: `https://github.com/pbakaus/impeccable/releases/tag/skill-v3.5.0`.
- If vendoring `frontend-design`, copy from `anthropics/skills/skills/frontend-design` rather than the current local folder so the Apache `LICENSE.txt` is present.
- If vendoring local plugin skills from OpenAI curated plugin caches, preserve the `.codex-plugin/plugin.json` file alongside the copied skill files because that is where the license metadata was found.
- Keep external website/reference links separate from bundled skill source. See `REFERENCE_LICENSE_POLICY.md`.
