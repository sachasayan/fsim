## 2024-06-01 - WebGL Canvas Accessibility
**Learning:** Canvas elements are inherently opaque to screen readers in WebGL/Three.js applications.
**Action:** Apply `role="img"` and a descriptive `aria-label` directly to the `<canvas>` element itself rather than relying on wrapper `div`s.
