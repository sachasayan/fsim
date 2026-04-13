## 2025-04-13 - Add ARIA attributes to dynamically created WebGL canvas
**Learning:** WebGL/Three.js `<canvas>` elements are inherently opaque to screen readers. Adding attributes like `role="img"` and a descriptive `aria-label` to wrapper container `div`s is often insufficient because the screen reader will still not identify the canvas.
**Action:** When adding accessibility to WebGL/Three.js applications, apply `role="img"` and a descriptive `aria-label` directly to the `<canvas>` element itself (e.g. `renderer.domElement.setAttribute('role', 'img');`) before appending it to the DOM.
