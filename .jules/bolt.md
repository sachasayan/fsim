## 2024-05-24 - Hoisting Arrays & Inlining Gradients in Hot Loops
**Learning:** In extreme performance math loops like `Noise.noise` or `fbm2D`, heavily inlining gradient math and hoisting flat permutation arrays out of object scopes (e.g. from `this.permutation` to a module-scoped constant `P`) avoids `this.` lookup overhead and function call overhead. Pre-calculating repetitive coordinate math significantly boosts V8 execution.
**Action:** Always inline nested lerp/grad operations into explicit primitives and remove object property lookup in performance-critical per-vertex generators.
