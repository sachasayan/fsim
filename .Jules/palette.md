## YYYY-MM-DD - [Title]
**Learning:** [UX/a11y insight]
**Action:** [How to apply next time]
## 2024-04-17 - WebGL Canvas Accessibility
**Learning:** Canvas elements are inherently opaque to screen readers, and wrapping container `div`s lack the necessary semantic meaning to resolve this out-of-the-box.
**Action:** When adding accessibility to WebGL/Three.js applications, apply `role="img"` and a descriptive `aria-label` directly to the `<canvas>` element itself.
