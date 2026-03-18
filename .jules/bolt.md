## 2026-03-18 - Inline Noise functions for performance
**Learning:** In hot loops like Perlin noise generation, inlining math functions such as fade, lerp, and grad avoids V8 function call overhead and can yield significant performance improvements (~25% speedup observed).
**Action:** Identify and manually inline heavily used auxiliary functions in math-heavy hotspots.
