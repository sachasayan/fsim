## 2024-05-06 - Pre-calculating constants in Perlin noise functions
**Learning:** Procedural generation tests (like `tests/terrain-synthesis.test.mjs`) demand exact bit-for-bit parity. Expanding `t * t * t * (t * (t * 6 - 15) + 10)` into pre-calculated forms risks floating-point mismatch regressions.
**Action:** Inline operations literally and prioritize module scoping context lookups (e.g. `this.lerp` to `lerp`) over arithmetic adjustments for robust optimizations in noise algorithms.
