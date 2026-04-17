## 2024-04-17 - Fast 3D Noise Gradients
**Learning:** Math.floor, bitwise logic, and branching inside hot inner loops (like 3D Perlin Noise gradients) significantly degrade V8's optimization capabilities.
**Action:** Replace bitwise logic and branching inside 3D Perlin Noise with an O(1) flattened Float64Array lookup for gradients, and inline math like \`fade\` out of function calls to maximize performance, then use \`npm run test:perf\` or \`npx tsx scripts/perf.mjs\` to verify.

## 2024-04-17 - Avoid "this." Context in Hot Loops
**Learning:** Repeated "this." property lookups in deeply nested Object methods like \`Noise.noise\` incur measurable property resolution overhead.
**Action:** Hoist frequently accessed instance properties like static arrays (e.g. \`Uint8Array\`) out of the object and into module-scoped constants to eliminate the "this." context overhead completely in hot performance loops.
