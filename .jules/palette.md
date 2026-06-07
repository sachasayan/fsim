## 2024-06-07 - Unlinked Labels in FieldRow
**Learning:** The layout component `FieldRow` renders a `<label>` but lacks `htmlFor` bindings to its nested inputs, causing fields like `NumberInputField`, `SelectField`, and `RangeNumberField` to be read as unlabeled by screen readers.
**Action:** Always explicitly pass `aria-label` directly to nested interactive elements (like `<Input>` or `<SelectTrigger>`) when using the `FieldRow` wrapper to guarantee screen reader accessibility.
