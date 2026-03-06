
## 2024-05-24 - Canvas Critical State Overlays
**Learning:** For WebGL/Canvas interfaces (like the simulator), assistive technologies cannot read the canvas context.
**Action:** Communicate critical states (e.g., stalls, crashes, loading) by placing standard ARIA attributes (`role="alert"`, `aria-live="assertive"`, `role="status"`) on DOM overlays positioned above the canvas.
