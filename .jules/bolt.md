## 2024-05-18 - Optimized Perlin Noise function

**Learning:** Optimized Perlin Noise generation by precalculating `fade`, `lerp`, and `grad` values as module-scoped variables instead of passing them as methods which require `this.` context overhead. Inlining the `fade` math inside the hot loop also reduced function call overhead.
**Action:** Always prefer module-scoped precalculated values over `this.` context lookups for hot loops in Math calculations.