## 2024-06-04 - Accessible Canvas Elements
**Learning:** When making WebGL/Three.js applications accessible, canvas elements are inherently opaque to screen readers. Relying on wrapper divs lacks necessary semantic meaning.
**Action:** Apply `role="img"` and a descriptive `aria-label` directly to the `<canvas>` element itself.
