import { createTerrainSynthesizer } from '../../modules/world/terrain/TerrainSynthesis.js';
import { applyTerrainEdits } from '../../modules/world/terrain/TerrainEdits.js';
import { MAP_COLORS } from '../../modules/ui/MapColors.js';
import { Noise } from '../../modules/noise.js';

let synthCache = null;
let synthCacheKey = null;

function getSynthesizer(config) {
    const nextKey = JSON.stringify(config);
    if (synthCache && synthCacheKey === nextKey) return synthCache;
    synthCacheKey = nextKey;
    synthCache = createTerrainSynthesizer({
        Noise,
        worldSize: 50000,
        config
    });
    return synthCache;
}

function sampleTerrainHeight(synthesizer, terrainEdits, x, z) {
    const baseHeight = synthesizer.sampleHeight(x, z);
    return applyTerrainEdits(baseHeight, x, z, terrainEdits);
}

self.onmessage = function (event) {
    const { type, jobId, payload } = event.data || {};
    if (type !== 'renderTile') return;

    try {
        const synthesizer = getSynthesizer(payload.config);
        const terrainEdits = Array.isArray(payload.terrainEdits) ? payload.terrainEdits : [];
        const pixels = new Uint8ClampedArray(payload.canvasW * payload.canvasH * 4);
        const worldTileSize = payload.tileSize * payload.lod;
        const startX = payload.tx * worldTileSize;
        const startZ = payload.tz * worldTileSize;
        const slopeDist = payload.lod;

        for (let py = 0; py < payload.canvasH; py += 1) {
            for (let px = 0; px < payload.canvasW; px += 1) {
                const wx = startX + (px / payload.pixelRatio) * payload.lod;
                const wz = startZ + (py / payload.pixelRatio) * payload.lod;

                const h = sampleTerrainHeight(synthesizer, terrainEdits, wx, wz);
                let color;

                if (payload.useHillshading) {
                    const hRight = sampleTerrainHeight(synthesizer, terrainEdits, wx + slopeDist, wz);
                    const hDown = sampleTerrainHeight(synthesizer, terrainEdits, wx, wz + slopeDist);
                    color = MAP_COLORS.getTerrainColorArray(h, (hRight - h) / slopeDist, (hDown - h) / slopeDist);
                } else {
                    color = MAP_COLORS.getTerrainColorArray(h, 0, 0);
                }

                const index = (py * payload.canvasW + px) * 4;
                pixels[index] = color[0];
                pixels[index + 1] = color[1];
                pixels[index + 2] = color[2];
                pixels[index + 3] = 255;
            }
        }

        self.postMessage({
            type: 'renderTile_done',
            jobId,
            result: {
                pixels,
                width: payload.canvasW,
                height: payload.canvasH
            }
        }, [pixels.buffer]);
    } catch (error) {
        self.postMessage({
            type: 'renderTile_error',
            jobId,
            error: error instanceof Error ? error.message : String(error)
        });
    }
};
