## 2024-04-05 - Hoisting arrays avoids context binding penalty in V8
**Learning:** In highly executed math functions like Perlin Noise, even reading a property like `this.permutation` adds up due to implicit `this` context binding overhead and property lookups.
**Action:** Always prefer hoisting static look-up arrays (like permutations or gradients) to the module scope instead of object properties to remove context lookup overhead, which can net ~15-20% speedups in hot loops without sacrificing readability.
