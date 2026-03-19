## 2024-03-14 - Semantic Grouping in Flight Simulator Dashboards
**Learning:** Complex dashboard interfaces with multiple screen regions (e.g., flight simulator panels like ND or EICAS) require explicit semantic navigation landmarks for assistive technologies. Without these landmarks, screen reader users cannot quickly skip to specific groups of related instruments.
**Action:** Use `role="group"` combined with descriptive `aria-label`s to define semantic sections in complex, multi-pane UI layouts.
