## 2024-03-27 - Fast local lambda for hot loops
**Learning:** In V8, while manually unrolling math operations in tight, multi-nested logic (like 3D Perlin Gradient calculations) is fast, extracting a tightly scoped local arrow function (e.g. `const g = (hash, x, y, z) => ...`) that replaces inline repetitive blocks can sometimes perform *faster* or identically well due to better JIT compilation boundaries than a massive inline block with complex logic operators (`(h&1)===0?(...)...`), while keeping code cleaner.
**Action:** For heavily unrolled multi-nested math logic inside single functions, test if a localized fat arrow function compiles better on V8 compared to a raw flattened block before settling on raw expansion.

## 2024-03-27 - Object context `this` access on Hot Loops
**Learning:** During heavy iterative loops (like Perlin fractal algorithms), constantly accessing class/object state properties like `this.permutation` causes significant lookup latency.
**Action:** Extract deeply accessed object properties out to file/module scope (e.g. `const P = ...`) and map `this.permutation: P` inside the object, allowing internal loop functions to directly target the global `P` array instead of doing a `this.` lookup on every tick.
