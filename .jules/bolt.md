## 2025-05-16 - Precalculating Noise Operations
**Learning:** Extracting constants, caching array lookups, and un-nesting operations into localized variables in the `noise.ts` hot loop significantly improved the `Noise.fractal` performance loop, beating the budget.
**Action:** When working on hot calculation loops, extract localized variables for better cache hits. Ensure the final PR adheres to all limits (like LOC < 50).
