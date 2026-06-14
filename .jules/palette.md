## 2023-10-25 - [FieldRow Form Input Accessibility]
**Learning:** `FieldRow` layout wrapper lacks `htmlFor`/`id` bindings, rendering generic child inputs (like `<Input>` or `<SelectTrigger>`) inaccessible to screen readers. Since the `label` prop may be a `ReactNode`, blind attribute assignment can cause invalid HTML.
**Action:** When placing interactive components inside `<FieldRow>`, explicitly pass `aria-label={label}` (or conditionally `typeof label === 'string' ? label : undefined` if it's a `ReactNode`) to the interactive element to ensure proper screen reader association.
