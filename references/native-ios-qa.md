# Native iOS QA Report

Use this when the selected surface is `native-ios`. The goal is operational
evidence, not a checklist claim.

## Required Metadata

- project or workspace
- scheme and configuration
- simulator or device name
- iOS version
- appearance: light, dark, or both
- content size category
- orientation and windowing mode when relevant
- command or tool call used to build/run/capture

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
Then run `scripts/native-qa-report.mjs --report <report> --out .design-director`.
Missing screenshots, UI hierarchy captures, logs, or tooling metadata are not
acceptance evidence.

Required profile coverage is inferred from concrete metadata, not from
`profile` or `profiles` labels alone. For standard QA, light, dark, large text,
and keyboard-focused states must be backed by matching fields such as
`appearance`, `contentSize`, and `keyboard`. Use `notApplicableProfiles` only
with a reason and hierarchy evidence that proves a profile is irrelevant, such
as a read-only screen with no editable fields.
