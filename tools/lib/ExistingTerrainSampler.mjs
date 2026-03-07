import { existsSync, readFileSync } from 'node:fs';

import { QuadtreeMapSampler } from '../../js/modules/world/terrain/TerrainUtils.js';

function toArrayBuffer(buffer) {
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

export function loadExistingTerrainSampler(worldBinPath) {
    if (!existsSync(worldBinPath)) return null;

    try {
        const file = readFileSync(worldBinPath);
        return new QuadtreeMapSampler(toArrayBuffer(file));
    } catch (error) {
        console.warn(`⚠️ Failed to load existing terrain from ${worldBinPath}: ${error.message}`);
        return null;
    }
}
