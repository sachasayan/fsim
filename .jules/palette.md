## 2026-04-28 - Disabled Icon Button Accessibility
**Learning:** Found that disabled Radix tooltips wrapping buttons won't trigger if the button uses pointer-events-none, meaning icon-only disabled buttons become completely inaccessible.
**Action:** Ensure native `aria-label` fallback is applied directly to the button element when wrapping icon buttons in tooltips.
