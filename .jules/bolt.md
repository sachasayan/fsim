## 2024-05-18 - Safe Object Method Hoisting
**Learning:** When manually inlining object methods (e.g., in procedural generation modules like `Noise`) to optimize performance and remove `this` context bindings, simply removing the methods from the exported object can cause silent breaking changes if other files rely on that interface.
**Action:** Ensure the original helper methods (e.g., `fade`, `lerp`, `grad`, `noise`) are still included in the exported object (e.g., `noise: noise`), even if internally the code uses the module-scoped versions to avoid breaking external callers.
