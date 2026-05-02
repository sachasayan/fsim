## 2024-05-02 - Object.property array mapping
**Learning:** For `Noise.fractal`, manually extracting static arrays (e.g., `permutation`) out of objects (`this.permutation`) avoids multiple property resolution overheads during `fractal` math inner loops, yielding noticeable speedups, saving around 5-10%.
**Action:** Extract frequently used object array lookups into module scope constants when in hot loops.

## 2024-05-02 - Pre-calculated `smoothstep` execution
**Learning:** Fully substituting logic with custom operations rather than manually inlining `Math` operators to replace external function calls (e.g. `tx = x - x0; t_tx = tx * tx * (3 - 2 * tx);` vs `tx = smoothstep(x - x0);`) provides significant speed improvements, reducing execution time of `fbm2D` over 25-30% within intense iterations. However, inlining completely to remove the separate helper functions within the module is overly verbose, decreases readability, and hurts modularity. Just manually inline simple functions that take parameters dynamically without extracting the module export.
**Action:** Inline simplistic math helper function bodies if they are constantly being invoked within tightly iterated nested loops.
