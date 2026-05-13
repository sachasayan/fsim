## 2026-05-13 - Form Label Accessibility
**Learning:** Creating generic wrapper components like `FieldRow` without explicitly forwarding `id`/`htmlFor` pairs breaks screen reader accessibility for form inputs.
**Action:** Always generate unique IDs using `React.useId()` and plumb them through to both the label's `htmlFor` and the input's `id` attributes.
