## 2025-02-09 - FieldRow Accessibility Pattern
**Learning:** The `FieldRow` layout component lacks `htmlFor`/`id` bindings for its child inputs, causing missing label associations for screen readers.
**Action:** When placing interactive components (like `<Input>` or `<SelectTrigger>`) inside `<FieldRow>`, explicitly pass an `aria-label` to the input to ensure screen reader accessibility. Conditionally pass `aria-label={typeof label === 'string' ? label : undefined}` if the label is a `ReactNode`.
