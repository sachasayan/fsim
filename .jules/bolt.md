## 2023-10-27 - Fast Noise Gradient Lookups
**Learning:** In extreme performance math loops (like per-vertex noise generation), replacing `grad` method call and ternary branches with a pre-calculated `Float64Array` lookup table saves significant V8 execution overhead and drastically cuts down runtime (e.g. 135ms to 61ms).
**Action:** When working on procedural generation (FBM/Value Noise/Perlin), flatten the algorithm into explicit primitives, replace branches with lookup tables where possible, and avoid intermediate function calls for gradients.
