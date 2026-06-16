## 2025-06-16 - Module-scoped variables and loop unrolling for Perlin Noise
**Learning:** In tight math inner loops (like Perlin `noise()`), removing `this.*` context lookups, macro-unrolling gradient interpolations, and extracting functions to module-scope variables provides significant (~20ms out of 130ms) speedup in V8 because engine doesn't have to resolve function scopes and object properties dynamically.
**Action:** Extract heavy math functions into module scope out of exported objects to avoid `this` lookups. Try to inline and unroll small helper functions inside extreme hot loops.
