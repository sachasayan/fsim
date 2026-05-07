## 2024-05-07 - Inlining Math Operations in Noise Generator
**Learning:** Extracting array references to module scope and manually inlining simple math functions (`fade`, `lerp`) in hot loops like Perlin Noise generation yields significant performance improvements without fundamentally altering the algorithm.
**Action:** When optimizing procedural generation or tight loops, look for opportunities to remove object property lookups (`this.*`) and inline trivial functions to reduce function call overhead, while ensuring the original interface is maintained.
