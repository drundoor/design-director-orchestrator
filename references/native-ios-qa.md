# Native iOS QA Report

Use this when the selected surface is `native-ios`. The goal is operational
evidence, not a checklist claim.

## Required Metadata

- project or workspace
- scheme and configuration
- simulator or device name
- iOS version
- appearance: light or dark; capture separate entries instead of using `both`
- content size category
- orientation and windowing mode when relevant
- command or tool call used to build/run/capture
- `qaRunId`, `startedAt`, `finishedAt`, `toolingHash`, and optional `appBuildId`

## Preferred Tool Flow

1. Verify project, scheme, and simulator defaults with the available iOS tooling.
2. Build and launch the app.
3. Capture screenshots for each required state.
4. Capture UI hierarchy or accessibility output for key states.
5. Exercise Dynamic Type, dark mode, keyboard, sheet/popover, tab/nav, and permission/error states when relevant.
6. Review logs for runtime errors.

## Shell Fallback Examples

```sh
xcodebuild -workspace App.xcworkspace -scheme App -destination 'platform=iOS Simulator,name=iPhone 16' build
xcrun simctl boot 'iPhone 16'
xcrun simctl launch booted com.example.app
xcrun simctl io booted screenshot .design-director/ios-home.png
xcrun simctl ui booted appearance dark
```

## Report Shape

Use `examples/native-ios-qa.example.json` as the minimum structure and
`schemas/native-ios-qa.schema.json` when your editor or CI supports JSON Schema.
Then run `scripts/native-qa-report.mjs --report <report> --out
.design-director` or `npm run qa:native:ios -- --report <report>`. Missing
screenshots, UI hierarchy captures, logs, run metadata, artifact hashes, or
tooling metadata are not acceptance evidence.

Minimal passing lifecycle:

1. Capture screenshots, UI hierarchy files, and logs.
2. Set `qaRunId`, `startedAt`, and `finishedAt` after capture.
3. Run `npm run qa:native:ios -- --print-tooling-hash --report <report>` and
   copy the printed value into `toolingHash`.
4. Validate with `npm run qa:native:ios -- --report <report>`.
5. Inspect `.design-director/native-design-qa.md`.

Required profile coverage is inferred from concrete metadata, not from
`profile` or `profiles` labels alone. For standard QA, light, dark, large text,
and keyboard-focused states must be backed by matching fields such as
`appearance`, `contentSize`, `keyboard`, and `focusedEditable`. Each required
profile needs unique screenshot and UI hierarchy evidence. Use
`notApplicableProfiles` only
with a reason and hierarchy evidence that proves a profile is irrelevant, such
as a read-only screen with no editable fields.

The validator hashes screenshots, hierarchy captures, and logs, records
`nativeEvidenceHash`, rejects stale artifacts, and rejects files modified after
the report `finishedAt`. Capture evidence first, set `finishedAt` after capture,
then run the validator.
