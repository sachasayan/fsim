import { CLOUD_NOISE } from './cloudNoise.js';

self.onmessage = function (e) {
    const { worldHalfExtent, gridStep, layersMax, tileSize, voxelSize } = e.data;

    const tiles = new Map();
    function getTileEntry(worldX, worldZ) {
        const tx = Math.floor((worldX + worldHalfExtent) / tileSize);
        const tz = Math.floor((worldZ + worldHalfExtent) / tileSize);
        const key = `${tx},${tz}`;
        if (!tiles.has(key)) {
            const ox = -worldHalfExtent + tx * tileSize;
            const oz = -worldHalfExtent + tz * tileSize;
            tiles.set(key, { ox, oz, instances: [], colors: [] });
        }
        return tiles.get(key);
    }

    for (let x = -worldHalfExtent; x <= worldHalfExtent; x += gridStep) {
        for (let z = -worldHalfExtent; z <= worldHalfExtent; z += gridStep) {
            const nLarge = CLOUD_NOISE.fbm2D(x * 0.00018, z * 0.00018, 4, 2.0, 0.5, 11);
            const nDetail = CLOUD_NOISE.fbm2D(x * 0.00052, z * 0.00052, 3, 2.1, 0.55, 29);
            const density = nLarge * 0.78 + nDetail * 0.22;
            if (density < 0.58) continue;

            const baseY = 900 + nLarge * 3200;
            const columnLayers = 1 + Math.floor((density - 0.6) / 0.4 * layersMax);
            const cappedLayers = Math.min(layersMax, Math.max(1, columnLayers));
            const spread = 1.0 + CLOUD_NOISE.hash2D(x / gridStep, z / gridStep, 3) * 1.0;

            for (let l = 0; l < cappedLayers; l++) {
                const jitterX = (CLOUD_NOISE.hash2D(x + l, z - l, 41) - 0.5) * gridStep * 0.65;
                const jitterZ = (CLOUD_NOISE.hash2D(x - l, z + l, 53) - 0.5) * gridStep * 0.65;
                const jitterY = (CLOUD_NOISE.hash2D(x + l * 3, z + l * 5, 67) - 0.5) * 55;
                const wx = x + jitterX;
                const wz = z + jitterZ;
                const entry = getTileEntry(wx, wz);

                const shade = 0.97 + (density - 0.58) * 0.1 + l * 0.01;
                const r = Math.min(1, shade);
                const g = Math.min(1, shade);
                const b = Math.min(1, shade);

                const scaleX = voxelSize * spread * (0.86 + l * 0.08) * (1.65 + CLOUD_NOISE.hash2D(wx, wz, 81) * 0.75);
                const scaleY = voxelSize * spread * (0.86 + l * 0.08) * (1.65 + CLOUD_NOISE.hash2D(wz, wx, 82) * 0.55);
                const rotationY = CLOUD_NOISE.hash2D(wx, wz, 83) * Math.PI * 2;

                entry.instances.push({
                    x: wx - entry.ox,
                    y: baseY + l * voxelSize * 0.3 + jitterY,
                    z: wz - entry.oz,
                    sX: scaleX,
                    sY: scaleY,
                    rotY: rotationY,
                    r: r,
                    g: g,
                    b: b
                });
            }
        }
    }

    const resultTiles = [];
    for (const [key, entry] of tiles.entries()) {
        if (entry.instances.length > 0) {
            // Pack into typed arrays for fast transfer
            const count = entry.instances.length;
            const positions = new Float32Array(count * 3);
            const scales = new Float32Array(count * 2);
            const rotations = new Float32Array(count);
            const colors = new Float32Array(count * 3);

            for (let i = 0; i < count; i++) {
                const inst = entry.instances[i];
                positions[i * 3] = inst.x;
                positions[i * 3 + 1] = inst.y;
                positions[i * 3 + 2] = inst.z;
                scales[i * 2] = inst.sX;
                scales[i * 2 + 1] = inst.sY;
                rotations[i] = inst.rotY;
                colors[i * 3] = inst.r;
                colors[i * 3 + 1] = inst.g;
                colors[i * 3 + 2] = inst.b;
            }

            resultTiles.push({
                key,
                ox: entry.ox,
                oz: entry.oz,
                count,
                positions,
                scales,
                rotations,
                colors
            });
        }
    }

    // Transfer the buffers back to the main thread
    const transferables = [];
    for (const tile of resultTiles) {
        transferables.push(tile.positions.buffer, tile.scales.buffer, tile.rotations.buffer, tile.colors.buffer);
    }

    self.postMessage({ type: 'CLOUDS_GENERATED', tiles: resultTiles }, transferables);
};
