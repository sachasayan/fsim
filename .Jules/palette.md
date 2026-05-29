## 2024-05-14 - Disconnected Labels in FieldRow
**Learning:** The custom `FieldRow` component visually groups a `<label>` element with child form controls, but it doesn't use `htmlFor` and child inputs don't have unique `id`s. This causes form fields across the app to lack accessible names for screen readers.
**Action:** When creating new custom form components (like `NumberInputField` or `RangeNumberField`), always pass the string `label` as an `aria-label` to the underlying `<Input>` or `<SelectTrigger>` to ensure accessibility without needing to generate unique IDs.
