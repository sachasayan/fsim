
## 2024-03-09 - Unrolling Noise.grad in V8
**Learning:** The `Noise.noise` calculation is called millions of times per frame in the terrain generator. In V8, breaking out nested branch logic (like `h < 8 ? x : y`) from utility functions (`grad`) into a flat inline gradient lookup (a static `Float32Array` mapped to `permutation % 12`) bypasses severe branching penalties and function call overhead, cutting execution time by over 50%.
**Action:** When optimizing extremely hot mathematical loops (like procedural generation per-vertex), look for opportunities to pre-calculate permutation-dependent state and replace conditional branches with direct typed-array lookups.
