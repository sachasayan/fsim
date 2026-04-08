# Palette's UX Journal

## 2024-05-23 - Flight Sim Dashboard Accessibility
**Learning:** For complex dashboard interfaces with multiple screen regions (like flight simulator panels such as ND or EICAS), using `role="group"` combined with descriptive `aria-label`s provides semantic navigation landmarks for assistive technologies. Additionally, canvas elements are inherently opaque to screen readers, so they require `role="img"` and a descriptive `aria-label` applied directly to the `<canvas>` element itself.
**Action:** When working on similar complex web applications or WebGL dashboards, always ensure logical grouping of UI panels with `role="group"` and label opaque elements like canvases with `role="img"`.
