# Game And Canvas Contract

Use this for games, canvas-heavy tools, WebGL/Three.js scenes, drawing surfaces, and custom-rendered interactive areas.

## Evidence

DOM audits do not prove canvas correctness. Capture:

- screenshots or video/GIF of key states
- canvas dimensions, DPR/devicePixelRatio behavior, and viewport fit
- input tests for pointer, touch, keyboard, and gamepad when relevant
- logs for asset loading and runtime errors
- performance/frame-timing notes for animation-heavy scenes

## Checks

- Canvas is nonblank and framed correctly at target viewports.
- Hit zones match visible targets.
- Touch, mouse, keyboard, and gamepad paths have parity where expected.
- Orientation changes and resize behavior.
- Pause/resume and route/unmount cleanup.
- Asset loading, fallback, and missing texture/font behavior.
- Reduced motion, flashing, and readability for animated text.
- UI overlays do not hide essential play/tool areas.

## Blockers

- Blank canvas.
- Click/tap zones do not match visuals.
- Required controls are hidden, clipped, or unreachable.
- Animation continues after the scene is dismissed.
- Severe frame drops or input lag in the primary interaction.
