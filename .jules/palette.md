## 2024-05-21 - Canvas Accessibility
**Learning:** Canvas elements in WebGL applications are completely opaque to screen readers by default. Adding `role="img"` and a descriptive `aria-label` makes the canvas perceivable and helps users understand what it represents.
**Action:** Always add an aria-label and role to <canvas> elements, especially those created dynamically by Three.js.
