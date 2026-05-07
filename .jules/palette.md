## 2025-05-07 - Added ARIA roles to WebGL canvas elements
**Learning:** Three.js `<canvas>` elements are inherently opaque to screen readers. Applying `role="img"` and descriptive `aria-label` directly to the `renderer.domElement` or static `<canvas>` elements ensures they are properly identified as visual content by assistive technologies.
**Action:** Always add ARIA roles and labels to WebGL canvases created programmatically by Three.js or statically defined in HTML.
