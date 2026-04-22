## 2024-04-22 - O(1) Array Lookups for Perlin Noise
**Learning:** In highly called inner loops like `Noise.grad`, V8 performance degrades when using branching logic and bitwise operations.
**Action:** Replace bitwise logic and branching with O(1) lookups into pre-allocated flattened typed arrays (e.g., `Float64Array`) for significant performance gains without changing correctness.
