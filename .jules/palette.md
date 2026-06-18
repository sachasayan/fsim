## 2024-06-18 - FieldRow child inputs missing aria-labels
**Learning:** The FieldRow layout component lacks htmlFor/id bindings for its child inputs. As a result, interactive components placed inside FieldRow do not have accessible names.
**Action:** When placing interactive components (like Input, SelectTrigger) inside FieldRow, explicitly pass an aria-label to the input to ensure screen reader accessibility.
