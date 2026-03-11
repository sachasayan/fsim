## 2025-02-12 - Assistive Tech on WebGL/Canvas Interfaces
**Learning:** WebGL/Canvas interfaces require standard ARIA attributes (`role="alert"`, `aria-live="assertive"`, `role="status"`, `aria-live="polite"`) on DOM overlays positioned above the canvas to properly communicate critical game/simulator states (like stalls or crashes) to screen readers.
**Action:** When adding or updating DOM overlays for critical states in WebGL apps, ensure they use standard ARIA roles and live regions to announce the state changes to assistive technologies.
