## 2024-05-29 - Inlining math and extracting variables from context
**Learning:** The hot path procedural terrain synthesis is heavily bottlenecked by perlin noise calculation overhead. Inlining helper math functions and extracting module scoped arrays reduces lookup overhead.
**Action:** For maximum V8 performance in hot inner loops, prioritize extracting methods and static arrays into module-scoped references to avoid `this.*` context lookup overhead.
