## 2026-06-08 - Add ARIA Labels to Inputs in FieldRow
**Learning:** The `FieldRow` layout component lacks `htmlFor`/`id` bindings for its child inputs, resulting in missing context for screen reader users when interacting with form controls. Since the `FieldRow` wraps various components (`<Input>`, `<SelectTrigger>`), explicit `aria-label` attributes must be passed to the interactive child components.
**Action:** When creating composite form field rows without explicit `id` linkages, always ensure the inner interactive control receives an `aria-label` matching the row's label text.
