## 2024-03-26 - Initial

## 2025-03-26 - Accessible Canvas & Complex Dashboards
**Learning:** Canvas elements are inherently opaque to screen readers, meaning any interactive visuals rendered inside them (like 3D flight paths or 2D minimaps) are invisible. Wrapping them in standard `div`s doesn't inherently fix this without semantic landmarks.
**Action:** Always apply `role="img"` and a descriptive `aria-label` directly to `<canvas>` elements for assistive technologies. Additionally, for complex UI dashboards with multiple sections (like flight simulator overlays), apply `role="group"` combined with descriptive `aria-label`s to the parent containers to establish semantic navigation landmarks.
