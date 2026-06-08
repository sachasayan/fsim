## 2024-06-08 - Fast Noise Refactor

**Learning:** In hot loops like procedural terrain generation (`Noise.fractal`), keeping utility functions (like `fade`, `lerp`, `grad`) and arrays (`permutation`) on a shared `this` object (`this.fade()`, etc.) incurs measurable lookup overhead. Additionally, simple functions like `fade` and `lerp` can be manually inlined, and nested function calls can be unrolled.
**Action:** Extract these into module-scoped functions/constants, and inline simple math functions to improve performance in deterministic algorithms. Do not replace `Math.floor` with bitwise truncation for coordinates, as it breaks mathematical determinism for negative values in strict tests.
