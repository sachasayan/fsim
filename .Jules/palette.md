## 2024-05-18 - Accessibility for WebGL Overlays
**Learning:** For WebGL/Canvas interfaces (like the simulator), communicate critical states (e.g., stalls, crashes) to assistive technologies by placing standard ARIA attributes (`role="alert"`, `aria-live="assertive"`, `role="status"`) on DOM overlays positioned above the canvas. In our case, `#warning-overlay` and `#crash-screen` are perfect candidates to improve accessibility since they show sudden warnings and important state changes.
**Action:** Always add ARIA roles like `alert` or `status` to dynamic DOM overlays over WebGL elements.
