## 2026-03-04 - Adding ARIA attributes to canvas/WebGL overlays
**Learning:** Screen readers cannot parse WebGL/Canvas content natively. Adding standard ARIA attributes like `role="alert"` and `aria-live` to DOM overlays above the canvas is essential for communicating critical simulation states (like stalls or crashes) to assistive technologies.
**Action:** When building canvas-based interfaces, always ensure critical status updates have accessible HTML overlays with proper ARIA live regions.
