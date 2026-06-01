# Native Android QA Report

Use this when the selected surface is `native-android`. The goal is operational
evidence across emulator/device states, not a checklist claim.

## Required Metadata

- project module and variant
- emulator or device name
- API level
- density, display size, and font scale
- theme: light or dark; capture separate entries instead of using `both`
- navigation mode when relevant
- command or tool call used to build/run/capture

## Preferred Tool Flow

1. Build and install the target variant.
2. Launch the activity or deep link under test.
3. Capture screenshots for each required state.
4. Capture UIAutomator XML, Compose semantics, or accessibility hierarchy where available.
5. Exercise font scale, display size, dark theme, IME, sheets/dialogs/menus, lists, and permission/error states when relevant.
6. Review logcat/runtime logs for errors.

## Shell Fallback Examples

```sh
./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.example/.MainActivity
adb exec-out screencap -p > .design-director/android-home.png
adb shell uiautomator dump /sdcard/window.xml
adb pull /sdcard/window.xml .design-director/window.xml
adb logcat -d '*:E' > .design-director/logcat-errors.txt
```

## Report Shape

Use `examples/native-android-qa.example.json` as the minimum structure and
`schemas/native-android-qa.schema.json` when your editor or CI supports JSON
Schema. Then run `scripts/native-qa-report.mjs --report <report> --out
.design-director`. Missing screenshots, UI tree captures, logs, or tooling
metadata are not acceptance evidence.

Required profile coverage is inferred from concrete metadata, not from
`profile` or `profiles` labels alone. For standard QA, light, dark, large font
scale, and IME-focused states must be backed by matching fields such as
`theme`, `fontScale`, and `ime`. Each required profile needs unique screenshot
and UI tree evidence. Use `notApplicableProfiles` only with a reason and UI tree
evidence that proves a profile is irrelevant, such as a read-only screen with no
editable fields.
