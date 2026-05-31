# Native iOS Contract

Use this for `native-ios` surfaces: SwiftUI, UIKit, hybrid iOS shells, widgets, and iPad/iPhone flows.

## Tool Route

- Prefer XcodeBuildMCP when available.
- Before simulator build/run/test actions, call `session_show_defaults` to verify project/workspace, scheme, and simulator.
- If XcodeBuildMCP is unavailable, fall back to `xcodebuild`, `xcrun simctl`, XCTest/XCUITest, simulator screenshots, and logs when the local environment supports them.

## Evidence

Record:

- project/workspace, scheme, simulator/device, OS version
- build/run/test command or tool evidence
- screenshots for key states
- UI hierarchy or accessibility tree for key states
- logs reviewed for runtime errors
- any skipped checks with reason

## Checks

- Dynamic Type/content size categories.
- Light and dark appearance.
- Safe areas, notches, home indicator, iPad split/fullscreen behavior when relevant.
- Keyboard avoidance and focused-field scroll behavior.
- Navigation bars, tab bars, sheets, popovers, dialogs, and back navigation.
- VoiceOver labels, traits, focus order, and accessibility identifiers for essential controls.
- Touch targets and gesture alternatives.
- Empty, loading, error, disabled, permission, and offline states.
- Localization expansion and truncation risk.
- Reduced motion when animation exists.

## Acceptance

Do not accept if essential content is clipped, inaccessible, blocked by keyboard/system chrome, unusable at common Dynamic Type sizes, missing labels, or contradicts the app's established iOS design system.
