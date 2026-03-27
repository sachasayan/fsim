## 2024-05-18 - First entry\n**Learning:** Created journal\n**Action:** Started working

## 2024-05-18 - Dashboard Canvas and Overlay Accessibility
**Learning:** Canvas elements and absolute positioned dashboard overlays lack semantic meaning out-of-the-box, making them completely invisible to screen readers.
**Action:** When adding accessibility to WebGL/Three.js applications or complex dashboard interfaces, apply `role="group"` and descriptive `aria-label`s to container regions (like `#nd` and `#eicas`) and apply `role="img"` with an `aria-label` directly to the `<canvas>` element itself to provide semantic navigation landmarks for assistive technologies.
