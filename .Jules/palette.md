## 2024-05-27 - Canvas Accessibility
**Learning:** Canvas elements are opaque to screen readers, meaning visually rich interactive areas are completely invisible to visually impaired users unless explicitly annotated.
**Action:** Always apply `role="img"` and a descriptive `aria-label` directly to `<canvas>` elements to ensure screen readers can announce their purpose.
