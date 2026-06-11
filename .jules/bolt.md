## 2024-06-11 - Initial Bolt Journal Entry\n**Learning:** Started performance optimization.\n**Action:** Profile application to find bottlenecks.
## 2024-06-11 - Precalculating Noise Gradients
**Learning:** In highly mathematical hot loops (like Perlin noise generation), replacing branching logic (if/else on bitwise hashes) with precalculated typed array (Float32Array) gradient lookups and inlining simple math (fade/lerp) yields nearly 2x performance improvements, without violating strict floating-point determinism.
**Action:** For performance bottlenecks in procedural generation, prioritize flattening logic into flat array lookups and inline operations over generic helper functions.
