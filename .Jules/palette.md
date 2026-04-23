## 2025-02-26 - Add aria-label fallback for disabled custom buttons wrapped in tooltips
**Learning:** When using Radix UI Tooltips around custom buttons, disabled buttons with pointer-events-none will not trigger tooltips to show.
**Action:** Ensure the underlying native button element explicitly receives an aria-label (falling back to the title prop if available) so icon-only buttons remain accessible to screen readers even when disabled.
