## 2024-10-25 - Lack of semantic grouping in multi-screen simulator panels
**Learning:** For complex dashboard interfaces with multiple screen regions (e.g., flight simulator panels like ND or EICAS), there's a lack of semantic grouping making it difficult for screen readers to navigate between screens.
**Action:** Use `role="group"` combined with descriptive `aria-label`s to provide semantic navigation landmarks for assistive technologies.
