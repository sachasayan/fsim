
## 2025-02-09 - Procedural Generation Optimization: Manual Inlining
**Learning:** In procedural generation code, manually inlining helper methods (like `grad` and `lerp` for `Noise.noise` calculation) dramatically avoids the call overhead allowing the procedural generation functions that are hit very frequently in hot inner loops to improve their running time in standard javascript configurations.
**Action:** In procedural generation hot loop algorithms, expand simple math functions manually, precalculate operations natively, and replace property lookups out of objects/instances by hosting arrays to module-scoped constants to shave off execution overhead.
