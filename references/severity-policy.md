# Severity Policy

Use severity to separate automated evidence from final design judgment.

## Blocker

Use only when the failure is high-impact and low-false-positive:

- page/runtime error
- mobile horizontal overflow
- essential clipped text/control
- inaccessible essential control or focus path
- open overlay clipped/offscreen/occluded
- chart/data mismatch
- missing required caveat/source label
- screenshots generated but not inspected
- essential content unusable in required platform state

## Warning

Use when the issue is likely visible or risky but may be intentional:

- peer typography mismatch
- repeated slot alignment drift
- spacing rhythm outlier
- media/title anchoring concern
- camouflaged but still labeled controls
- small tap target candidate
- tiny nonessential text
- hover-only candidate
- possible contrast issue without measurement

## Info

Use for context that should guide review but not fail a pass:

- discovered interactive state candidate
- reference survey observation
- skipped optional viewport with reason
- platform tooling unavailable with fallback named

## Promotion Rule

Promote a warning to blocker only when the finding affects essential content,
was confirmed in a focused screenshot/crop, or matches a user complaint or
acceptance gate.
