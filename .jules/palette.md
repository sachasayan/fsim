## 2024-05-09 - Added A11y to WebGL Canvases
**Learning:** Three.js and plain React canvases are inherently opaque to screen readers, meaning the primary interfaces of both the flight simulator and the world editor were inaccessible out-of-the-box.
**Action:** Always ensure `<canvas>` elements have `role="img"` and a descriptive `aria-label` applied directly to them, either dynamically where they are injected (e.g. `RendererManager.ts` for Three.js) or statically in the React templates (e.g. `app.tsx` for the editor).
