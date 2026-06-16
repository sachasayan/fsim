## 2024-11-20 - Adding ARIA labels to FieldRow inner inputs
**Learning:** The \`FieldRow\` layout component does not connect its label to its child inputs via \`htmlFor\`/\`id\`, meaning interactive components inside it like \`Input\` or \`SelectTrigger\` lack accessible names for screen readers.
**Action:** When placing components inside \`FieldRow\`, explicitly pass an \`aria-label\` (conditionally avoiding non-string ReactNodes) so the control remains accessible.
