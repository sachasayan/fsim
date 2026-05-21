## 2024-05-21 - Optimization of Perlin Noise Generator
**Learning:** In procedural generation code, manually expanding basic mathematical expressions and avoiding nested function calls inside hot loops provides a measurable speedup. Extracting helper arrays to module scope reduces `this` context lookup overhead.
**Action:** Always manually inline tight mathematical expressions instead of helper functions, and extract module-level helpers instead of class-level methods inside hot loops to reduce execution time overhead.
