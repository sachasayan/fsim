## 2025-02-20 - Inlining Noise Math
**Learning:** Inlining the `fade`, `lerp`, and `grad` operations directly into `Noise.noise` using O(1) typed array lookups for gradients and hoisting permutation array lookups improves perlin noise performance significantly (by about ~50%) by reducing function call overhead in tight inner loops, which is crucial for procedural terrain generation.
**Action:** When working on tight mathematical loops like Perlin noise, hoist constant arrays to module scope and flatten/inline math directly rather than relying on abstract helper methods on objects.
