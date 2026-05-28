## 2026-05-28 - Added canvas ARIA attributes
**Learning:** In WebGL/Three.js applications, canvas elements are inherently opaque to screen readers. Applying `role="img"` and a descriptive `aria-label` directly to the `<canvas>` element itself (e.g., `renderer.domElement` in Three.js or statically in HTML) improves accessibility.
**Action:** When working with canvas elements, always consider if they convey visual information and add appropriate ARIA attributes directly to the canvas element rather than wrapper divs.
