## 2024-05-10 - Math expression expansion in procedural noise
**Learning:** Expanding math expressions in procedural noise generation (e.g. `x * x * x * (x * (x * 6 - 15) + 10)` vs `x * x * x * (x * x * 6 - x * 15 + 10)`) may cause slight floating-point precision loss, which leads to failing strict deterministic output checks.
**Action:** When manually inlining math expressions to eliminate object method calls overhead, ensure to retain the exact mathematical formulation. Use local variables to hold the values. Do not expand or factor out terms.
