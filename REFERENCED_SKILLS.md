# Referenced Skills And License Notes

Design Director routes work to other skills by name, but those skills are optional integrations. They are not required to use this repository and are not bundled unless explicitly copied into the repo.

## License Review Result

- `hallmark`
  - Optional peer skill metadata reviewed: Codex skill bundle named `hallmark`
  - Upstream checked: `https://github.com/Nutlope/hallmark`
  - Review metadata observed during packaging review: `version: 1.0.0` in `SKILL.md`; `license: MIT` in `package.json`; `LICENSE` file present.
  - Upstream metadata found: GitHub reports MIT License; upstream `package.json` lists `license: MIT`.
  - Packaging status: packageable under MIT, provided the bundled copy preserves the MIT license and copyright notice.
- `impeccable`
  - Optional peer skill metadata reviewed: Codex skill bundle named `impeccable`
  - Upstream checked: `https://github.com/pbakaus/impeccable`
  - Review metadata observed during packaging review: no top-level `LICENSE`, `README`, `package.json`, or frontmatter version in the reviewed bundle; detector entry files include `SPDX-License-Identifier: Apache-2.0`.
  - Upstream metadata found: GitHub reports Apache License 2.0; upstream `package.json` lists `license: Apache-2.0`; release `skill-v3.5.0` is published as `Skill 3.5.0`.
  - Packaging status: packageable under Apache-2.0, provided the bundled copy preserves the Apache license, copyright notices, attribution notices if any are added upstream later, and records local modifications.
- `frontend-design`
  - Optional peer skill metadata reviewed: Codex skill bundle named `frontend-design`
  - Upstream checked: `https://github.com/anthropics/skills/tree/main/skills/frontend-design`
  - Review metadata observed during packaging review: `license: Apache 2.0. Based on Anthropic's frontend-design skill. See NOTICE.md for attribution.`
  - Upstream metadata found: `LICENSE.txt` contains Apache-2.0; upstream `SKILL.md` points to that license file.
  - Packaging status: packageable under Apache-2.0, but prefer vendoring from upstream so `LICENSE.txt` is included. Any reviewed copy must include the license file referenced by its frontmatter.
- `interface-design`
  - Optional peer skill metadata reviewed: Codex skill bundle named `interface-design`
  - Upstream checked: `https://github.com/Dammyjay93/interface-design`
  - Review metadata observed during packaging review: no `LICENSE`, `NOTICE`, `README`, or frontmatter license metadata found in the reviewed bundle.
  - Upstream metadata found: GitHub reports MIT License; upstream `LICENSE` file is present.
  - Packaging status: packageable under MIT, but vendor from upstream or include the upstream MIT license file with any bundled copy.
- `better-icons`
  - Optional peer skill metadata reviewed: Codex skill bundle named `better-icons`
  - Upstream checked: `https://github.com/better-auth/better-icons`
  - Review metadata observed during packaging review: no license file in the reviewed skill folder.
  - Upstream metadata found: GitHub and npm package metadata report MIT License; upstream `LICENSE` file is present.
  - Packaging status: packageable under MIT, but include the upstream MIT license file. Icons retrieved through Iconify still carry their source icon-set licenses and should be treated separately from this skill wrapper.
- `data-visualization`
  - Optional peer skill metadata reviewed: OpenAI curated plugin skill named `data-visualization`
  - Review metadata observed during packaging review: `build-web-data-visualization` version `0.1.19`, `license: MIT`.
  - Upstream checked: `https://github.com/openai/plugins`; GitHub did not report a repository-level license file during review.
  - Packaging status: packageable from reviewed plugin package metadata under MIT, with the caveat that the exact package metadata should be preserved because the upstream repo did not expose a repo-level license to GitHub.
- `frontend-app-builder` and `frontend-testing-debugging`
  - Optional peer skill metadata reviewed: OpenAI curated plugin skills named `frontend-app-builder` and `frontend-testing-debugging`
  - Review metadata observed during packaging review: `build-web-apps` version `0.1.0`, `license: MIT`.
  - Upstream checked: `https://github.com/openai/plugins`; GitHub did not report a repository-level license file during review.
  - Packaging status: packageable from reviewed plugin package metadata under MIT, with the caveat that the exact package metadata should be preserved because the upstream repo did not expose a repo-level license to GitHub.
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
- If vendoring `frontend-design`, copy from `anthropics/skills/skills/frontend-design` so the Apache `LICENSE.txt` is present.
- If vendoring plugin skills, preserve the package metadata file alongside copied skill files when that is where license metadata was found.
- Keep external website/reference links separate from bundled skill source. See `REFERENCE_LICENSE_POLICY.md`.
