## 2026-04-30 - Accessible Canvas Elements
**Learning:** WebGL and standard `<canvas>` elements are inherently opaque to screen readers. They do not expose their visual content or interactive nature by default.
**Action:** Always apply `role="img"` and a descriptive `aria-label` directly to the `<canvas>` element itself (e.g., dynamically on `renderer.domElement` in Three.js or statically in HTML) rather than relying on wrapper `div`s which lack necessary semantic meaning.
