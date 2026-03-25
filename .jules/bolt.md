
## 2023-10-25 - Extreme micro-optimizations for Perlin Noise
**Learning:** In highly repetitive loops like per-vertex procedural noise generation, removing simple bitwise ternary branching logic (e.g., `hash & 15` gradient calculations) and inlining it into pre-allocated `Float64Array` lookups reduces V8 execution time by over 50%.
**Action:** When working on tight mathematical loops called thousands of times per frame, prioritize data-oriented array lookups and heavy function inlining over algorithmic cleanliness.
