## 2025-05-18 - Perlin Noise Optimization
**Learning:** For maximum V8 performance in hot inner loops like Perlin noise generation, deeply nested function calls (like repeated `this.lerp` inside `this.lerp`) and context lookups (`this.fade`) cause significant overhead.
**Action:** Un-nest deeply nested function calls into explicit distinct variables, cache property references locally, and manually expand simple math expressions inline instead of calling helper functions to optimize math intensive hot loops.
