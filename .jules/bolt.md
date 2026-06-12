## 2024-05-18 - Math.floor Replacement

**Learning:** Replaced `Math.floor` calls with explicit `Math.floor` caching inside the noise generator, combined with manually expanding loop array reads, instead of function-based property lookups (`this.*`). This successfully decreased Perlin noise overhead across terrain tests.
**Action:** When working on noise generation algorithms that operate tightly with Perlin hashes, extract array lookups and bitwise math inline to avoid function calls and context `this.` lookups.
