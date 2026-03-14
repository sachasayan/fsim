import { TERRAIN_HEIGHT_BANDS } from './TerrainPalette.js';

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

export function normalizeSurfaceWeights(weights) {
    const total = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
    if (total <= 0) return [0, 1, 0, 0];
    return weights.map((value) => Math.max(0, value) / total);
}

export function getTerrainSurfaceWeights(height, slope, masks = null) {
    const cliff = clamp01(masks?.cliff || 0);
    const talus = clamp01(masks?.talus || 0);
    const alpine = clamp01(masks?.alpine || 0);
    const wetland = clamp01(masks?.wetland || 0);
    const terrace = clamp01(masks?.terrace || 0);
    const shoreBlend = 1.0 - smoothBand(height, TERRAIN_HEIGHT_BANDS.shore - 14, TERRAIN_HEIGHT_BANDS.lowland + 10);
    const snowBlend = smoothBand(height, TERRAIN_HEIGHT_BANDS.snow - 35, TERRAIN_HEIGHT_BANDS.snowBlendEnd);
    const steepRock = smoothBand(slope, 0.22, 0.68);
    const highRock = smoothBand(height, TERRAIN_HEIGHT_BANDS.forest, TERRAIN_HEIGHT_BANDS.rock + 70);

    let sand = shoreBlend * (1.0 - snowBlend);
    let grass = (1.0 - sand) * (1.0 - snowBlend);
    let rock = Math.max(steepRock, highRock * 0.82) * (1.0 - snowBlend * 0.55);
    let snow = snowBlend;

    rock = Math.max(rock, cliff * 0.95, talus * 0.55);
    snow = Math.max(snow, alpine * 0.35 + cliff * alpine * 0.18);
    grass *= 1.0 - cliff * 0.9;
    grass *= 1.0 + wetland * 0.35;
    grass *= 1.0 + terrace * 0.15;
    sand *= 1.0 + wetland * 0.12;
    grass *= 1.0 - rock * 0.7;
    sand *= 1.0 - rock * 0.5;
    rock = Math.max(rock, snowBlend * 0.18);

    return normalizeSurfaceWeights([sand, grass, rock, snow]);
}

function smoothBand(value, start, end) {
    if (start === end) return value >= end ? 1 : 0;
    return clamp01((value - start) / (end - start)) ** 2 * (3 - 2 * clamp01((value - start) / (end - start)));
}
