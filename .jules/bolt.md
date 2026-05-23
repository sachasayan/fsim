## 2024-05-23 - Manually inlining functions in Noise.noise speeds up generation
**Learning:** In hot loops like `Noise.noise` (used heavily for procedural terrain), inlining simple helper math functions like `fade`, `lerp`, and `grad` significantly reduces overhead and helps the V8 JIT avoid function call overhead and "this" lookup costs.
**Action:** Un-nest function calls in hot loops explicitly instead of relying on the JIT, especially for heavy math-centric generators, to reliably lower median runtimes without breaking functional determinism.
