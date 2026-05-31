# Native Android Contract

Use this for `native-android` surfaces: Jetpack Compose, View-based Android, hybrid shells, foldables, and tablet/phone flows.

## Tool Route

- Prefer available Android emulator/device tooling.
- Capture screenshots and UI hierarchy evidence with emulator, adb, UI Automator, or project test tooling.
- Review logcat/runtime logs when possible.
- If emulator/device tooling is unavailable, record the limitation and fall back to code/layout review only after naming the missing evidence.

## Evidence

Record:

- device or emulator, API level, density, display size, font scale, theme, navigation mode
- build/run/test command or tool evidence
- screenshots for key states
- UI tree/semantics evidence for key states
- log review
- skipped checks with reason

## Checks

- 48dp minimum touch target intent for essential controls.
- Font scale and display size behavior.
- Light/dark theme.
- Edge-to-edge, status/navigation bars, gesture navigation, and insets.
- TalkBack labels/content descriptions, roles, focus order, and Compose semantics.
- RecyclerView/lazy-list virtualization and sticky headers.
- Bottom sheets, dialogs, menus, snackbars, toasts, and IME keyboard behavior.
- Disabled, permission, loading, error, empty, offline, and long-data states.
- RTL and localization expansion when relevant.
- Reduced motion/animation interruption when motion exists.

## Acceptance

Do not accept if essential controls are too small, unlabeled, clipped by system bars/IME, unusable at larger font scales, hidden behind sheets/snackbars, or inconsistent with the app's Material/design-system conventions.

For an operational report shape and command examples, use `references/native-android-qa.md` and `examples/native-android-qa.example.json`.
