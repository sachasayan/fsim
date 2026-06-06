## 2024-06-06 - Unlinked Form Labels in Inspector
**Learning:** The `FieldRow` component provides visual labels for form inputs but lacks `htmlFor`/`id` bindings, causing inputs like `NumberInputField` and `SelectField` to be completely unlabelled for screen readers.
**Action:** Always provide an explicit `aria-label` to interactive inputs (Input, SelectTrigger) when they are wrapped in custom layout components that don't enforce programmatic label association.
