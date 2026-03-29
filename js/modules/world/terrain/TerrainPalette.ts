// @ts-check

export const SEA_LEVEL = -10;

export const TERRAIN_HEIGHT_BANDS = {
    shore: -5,
    lowland: 25,
    forest: 150,
    rock: 400,
    snow: 600,
    snowBlendEnd: 700
};

export const WATER_DEPTH_BANDS = {
    foam: 1,
    shallowStart: 2,
    shallowEnd: 10,
    deepEnd: 25
};

const TERRAIN_COLORS = {
    sand: [194, 178, 128],
    lowland: [53, 94, 59],
    forest: [42, 75, 42],
    rock: [85, 85, 85],
    snow: [255, 255, 255]
};

const WATER_COLORS = {
    foam: [255, 255, 255],
    blue: [48, 79, 107],
    deep: [5, 13, 32]
};

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function lerpColor(c1, c2, t) {
    return [
        lerp(c1[0], c2[0], t),
        lerp(c1[1], c2[1], t),
        lerp(c1[2], c2[2], t)
    ];
}

export function getTerrainBaseSrgb(height) {
    if (height < TERRAIN_HEIGHT_BANDS.shore) return TERRAIN_COLORS.sand;
    if (height < TERRAIN_HEIGHT_BANDS.lowland) return TERRAIN_COLORS.lowland;
    if (height < TERRAIN_HEIGHT_BANDS.forest) return TERRAIN_COLORS.forest;
    if (height < TERRAIN_HEIGHT_BANDS.rock) {
        return lerpColor(
            TERRAIN_COLORS.forest,
            TERRAIN_COLORS.rock,
            (height - TERRAIN_HEIGHT_BANDS.forest) / (TERRAIN_HEIGHT_BANDS.rock - TERRAIN_HEIGHT_BANDS.forest)
        );
    }
    if (height < TERRAIN_HEIGHT_BANDS.snow) return TERRAIN_COLORS.rock;
    return lerpColor(
        TERRAIN_COLORS.rock,
        TERRAIN_COLORS.snow,
        Math.min(1, (height - TERRAIN_HEIGHT_BANDS.snow) / (TERRAIN_HEIGHT_BANDS.snowBlendEnd - TERRAIN_HEIGHT_BANDS.snow))
    );
}

export function getWaterDepthSrgb(depth) {
    if (depth < WATER_DEPTH_BANDS.foam) return WATER_COLORS.foam;
    if (depth < WATER_DEPTH_BANDS.shallowStart) {
        return lerpColor(
            WATER_COLORS.foam,
            WATER_COLORS.blue,
            Math.pow((depth - WATER_DEPTH_BANDS.foam) / (WATER_DEPTH_BANDS.shallowStart - WATER_DEPTH_BANDS.foam), 0.6)
        );
    }
    if (depth < WATER_DEPTH_BANDS.shallowEnd) return WATER_COLORS.blue;
    if (depth < WATER_DEPTH_BANDS.deepEnd) {
        return lerpColor(
            WATER_COLORS.blue,
            WATER_COLORS.deep,
            Math.pow((depth - WATER_DEPTH_BANDS.shallowEnd) / (WATER_DEPTH_BANDS.deepEnd - WATER_DEPTH_BANDS.shallowEnd), 0.7)
        );
    }
    return WATER_COLORS.deep;
}

export function getSurfaceMapSrgb(height) {
    return height < SEA_LEVEL ? getWaterDepthSrgb(SEA_LEVEL - height) : getTerrainBaseSrgb(height);
}
