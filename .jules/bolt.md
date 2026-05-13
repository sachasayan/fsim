## 2025-05-13 - [Precalculate noise variables]
**Learning:** Noise functions can be heavily optimized by substituting property access with module-scoped references and manually expanding math operations.
**Action:** Extract P to module scope, use manual expansion for operations like `grad` rather than nested helper calls where possible, maintaining exactly bit-for-bit mathematical output.
