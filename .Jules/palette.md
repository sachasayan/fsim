## 2025-02-23 - Add ARIA Labels to Main View Canvases
**Learning:** WebGL canvases are inherently opaque to screen readers. For users navigating complex 3D scenes or HUDs in a browser, wrapper divs are insufficient if the canvas lacks semantic meaning.
**Action:** Always apply `role="img"` and a descriptive `aria-label` directly to primary `<canvas>` elements such as the main Three.js domElement or any HUD canvases (like a Minimap).
