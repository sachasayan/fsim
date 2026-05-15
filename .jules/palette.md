## 2024-05-15 - Make canvas elements accessible
**Learning:** Canvas elements are inherently opaque to screen readers and lack necessary semantic meaning.
**Action:** Apply `role="img"` and a descriptive `aria-label` directly to the `<canvas>` element itself to provide accessibility context without relying on wrapper elements.
