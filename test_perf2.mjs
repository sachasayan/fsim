import { hash2 } from './js/modules/world/terrain/TerrainUtils.js';

export function cityHubInfluenceFast(vx, vz) {
    const cellSize = 14000;
    const gx = Math.floor(vx / cellSize);
    const gz = Math.floor(vz / cellSize);
    let influence = 0;

    for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
            const cx = gx + ox;
            const cz = gz + oz;
            const hubChance = hash2(cx, cz, 1);
            if (hubChance < 0.35) continue;

            const centerX = (cx + 0.15 + hash2(cx, cz, 2) * 0.7) * cellSize;
            const centerZ = (cz + 0.15 + hash2(cx, cz, 3) * 0.7) * cellSize;

            const dx = vx - centerX;
            const dz = vz - centerZ;
            // Early out using squared distance
            const radius = 2600 + hash2(cx, cz, 4) * 5200;
            const distSq = dx * dx + dz * dz;
            if (distSq >= radius * radius) continue;

            const d = Math.sqrt(distSq);
            const intensity = 0.45 + hash2(cx, cz, 5) * 0.55;
            const local = (1 - d / radius) * intensity;
            if (local > influence) influence = local;
        }
    }

    return influence;
}

const start = performance.now();
let total = 0;
for (let i = 0; i < 100000; i++) {
    const vx = Math.random() * 40000 - 20000;
    const vz = Math.random() * 40000 - 20000;
    total += cityHubInfluenceFast(vx, vz);
}
const end = performance.now();
console.log(`Optimized: ${end - start} ms (total ${total})`);
