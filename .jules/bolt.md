## 2025-06-14 - Noise Optimization
**Learning:** Replacing function calls with inline local expressions in `Noise.noise` significantly improves performance, dropping the time per 100k calls from ~75ms down to ~53ms. Bitwise operators instead of `Math.floor` should not be used here due to determinism constraints for negative numbers.
**Action:** Extract nested grad and lerp methods into local variable assignments to reduce V8 context lookup overhead.
