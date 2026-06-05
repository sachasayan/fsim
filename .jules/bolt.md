## 2024-06-05 - Optimize Noise Fractal
**Learning:** Noise implementation in `Noise.noise` was unoptimized due to manual function calls and calculations that could be simplified and un-nested.
**Action:** Un-nested `this.fade`, `this.lerp`, and `this.grad` calls and manual lookup for gradients inside `Noise.noise` yields measurable speedups for fractal generation, critical for deterministic procedural geometry.
