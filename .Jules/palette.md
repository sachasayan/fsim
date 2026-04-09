## 2024-05-14 - Radix Tooltips on Disabled Buttons
**Learning:** Radix UI Tooltips do not trigger on elements that have `pointer-events: none`, which is often applied to disabled buttons for styling/interaction purposes. This completely hides the tooltip content (often containing crucial state explanation, like "Saving 1/10") from screen readers.
**Action:** Always ensure the underlying native button element explicitly receives an `aria-label` (falling back to the `title` prop if available) so icon-only or dynamic-state buttons remain accessible to screen readers even when disabled.
