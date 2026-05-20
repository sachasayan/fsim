## 2023-10-25 - Inlining inner loops for V8 execution
**Learning:** Extracting variables out of `this` context to module scope and inlining `fade`, `lerp`, `grad` mathematical functions into the inner `noise` evaluation yields significant performance improvements by bypassing V8 context lookup overhead during hot paths.
**Action:** Always identify instances where objects are used as namespaces holding helper methods in extremely hot paths, and hoist them out or inline them.
