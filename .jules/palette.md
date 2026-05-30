## 2024-05-30 - Canvas Accessibility
**Learning:** HTML `<canvas>` elements are inherently opaque to screen readers, making interactive visual components inaccessible by default.
**Action:** Always apply `role="img"` and a descriptive `aria-label` directly to the `<canvas>` element itself (statically or via `renderer.domElement` in Three.js) to provide basic semantic meaning to assistive technologies.
