## 2024-05-14 - Optimized Perlin Noise Generation

**Learning:** Optimizing the inner loop math operations in hot paths like Perlin Noise (e.g. `Noise.noise`) can result in significant performance speedups. Specifically, by manually inlining small functions like `grad` into explicit conditions, caching permutation array references locally, and avoiding `this.*` context lookups, we reduced the execution time for `Noise.fractal` below its strict 110ms budget without breaking correctness. Bitwise floor (`| 0`) cannot be used for `Math.floor` because it truncates towards zero which changes the mathematical output for negative coordinates.

**Action:** When a loop is executed heavily, manually expand out small math calculations and array references into explicit variables, and favor extracting methods/arrays into local scope over `this` context binding.
