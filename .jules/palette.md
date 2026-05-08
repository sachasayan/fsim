## 2024-05-08 - Added Tooltip to icon-only buttons

## 2024-05-08 - Added htmlFor and id to form fields
**Learning:** Form fields inside a container like `FieldRow` need an explicit `htmlFor` and `id` linkage for screen readers to associate the label with the input.
**Action:** Always verify custom form field wrappers pass `htmlFor` down to the label and generate `id`s for inputs.
