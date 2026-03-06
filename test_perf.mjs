import { hash2, cityHubInfluence } from './js/modules/world/terrain/TerrainUtils.js';

const start = performance.now();
let total = 0;
for (let i = 0; i < 100000; i++) {
    const vx = Math.random() * 40000 - 20000;
    const vz = Math.random() * 40000 - 20000;
    total += cityHubInfluence(vx, vz);
}
const end = performance.now();
console.log(`Original: ${end - start} ms (total ${total})`);
