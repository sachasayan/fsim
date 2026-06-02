## 2024-05-18 - Tooltip Trigger Nested Button
**Learning:** In Radix UI, the `TooltipTrigger` by default renders a `<button>`. If a custom button component (like `<Toggle>` or `<Button>`) is wrapped inside it, it creates invalid nested `<button><button>...</button></button>` HTML. This causes accessibility issues and breaks expected button behaviors.
**Action:** When wrapping a button-like component in a Radix `<TooltipTrigger>`, pass the `asChild` prop to `TooltipTrigger` to merge its props into the child and prevent the extra DOM element.

## 2024-05-18 - Canvas Accessibility
**Learning:** `canvas` elements are inherently opaque to screen readers. They need a semantic role and label.
**Action:** Always add `role="img"` and an `aria-label` to `<canvas>` elements to describe their content for screen readers.
