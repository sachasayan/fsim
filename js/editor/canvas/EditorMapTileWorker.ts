import { applyTerrainEdits } from '../../modules/world/terrain/TerrainEdits.js';
import { createRegionalTerrainSampler } from '../../modules/world/terrain/TerrainRegions.js';
import { DEFAULT_WORLD_SIZE } from '../../modules/world/WorldConfig';
import { MAP_COLORS } from '../../modules/ui/MapColors';
import { Noise } from '../../modules/noise.js';

type RenderTilePayload = {
    terrainRegions?: unknown[];
    terrainEdits?: unknown[];
    canvasW: number;
    canvasH: number;
    tileSize: number;
    lod: number;
    tx: number;
    tz: number;
    pixelRatio: number;
    useHillshading: boolean;
};

type RenderTileMessage = {
    type: 'renderTile';
    jobId: number;
    payload: RenderTilePayload;
};

function sampleTerrainHeight(synthesizer: ReturnType<typeof createRegionalTerrainSampler>, terrainEdits: unknown[], x: number, z: number) {
    const baseHeight = synthesizer.sampleHeight(x, z);
    return applyTerrainEdits(baseHeight, x, z, terrainEdits);
}

self.onmessage = function (event: MessageEvent<RenderTileMessage>) {
    const { type, jobId, payload } = event.data || {};
    if (type !== 'renderTile' || !payload) return;

    try {
        const synthesizer = createRegionalTerrainSampler({
            Noise,
            worldSize: DEFAULT_WORLD_SIZE,
            regions: Array.isArray(payload.terrainRegions) ? payload.terrainRegions : []
        });
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
                const color = payload.useHillshading
                    ? MAP_COLORS.getTerrainColorArray(h, (sampleTerrainHeight(synthesizer, terrainEdits, wx + slopeDist, wz) - h) / slopeDist, (sampleTerrainHeight(synthesizer, terrainEdits, wx, wz + slopeDist) - h) / slopeDist)
                    : MAP_COLORS.getTerrainColorArray(h, 0, 0);

                /*
                 * JS inference currently exposes this as a generic array even though the
                 * runtime always returns exactly three channels.
                 */
                const [r, g, b] = color as [number, number, number];

                const index = (py * payload.canvasW + px) * 4;
                pixels[index] = r;
                pixels[index + 1] = g;
                pixels[index + 2] = b;
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
