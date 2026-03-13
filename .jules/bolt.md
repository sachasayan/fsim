
## 2024-03-13 - Flat Array Lookups over Function Overheads in Hot Loops
**Learning:** In heavily accessed math loops like `Noise.noise()` generated from `Noise.fractal`, V8 execution overhead is dominated by deeply nested function calls (e.g. `fade`, `lerp`, `grad`) and complex bitwise/ternary branch conditions for gradients.
**Action:** Inline nested math operations and precompute complex conditionals (like 3D gradients `grad3`) into a single flat `Float32Array`. Replacing branch logic with O(1) array index lookups drastically drops execution time and allows V8 to optimize the loop aggressively.
