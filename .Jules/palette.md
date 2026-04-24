## 2024-05-24 - Canvas Accessibility
**Learning:** WebGL `<canvas>` elements are inherently opaque to screen readers, missing out on semantic meaning if they lack ARIA attributes or roles.
**Action:** Apply `role="img"` and a descriptive `aria-label` directly to the `<canvas>` element itself, not just on wrapper `div`s.
