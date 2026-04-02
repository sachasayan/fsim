## 2026-04-02 - CommandButton tooltips
**Learning:** Radix UI tooltips don't show on disabled buttons. When disabled, standard buttons receive pointer-events: none, meaning hover events are not captured to trigger the tooltip. The underlying native button element must explicitly receive an `aria-label` (falling back to the `title` prop if available) so icon-only buttons remain accessible to screen readers even when disabled.
**Action:** When creating accessible buttons that may be disabled, ensure `aria-label` is set.
