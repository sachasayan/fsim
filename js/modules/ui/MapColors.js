import { getSurfaceMapSrgb } from '../world/terrain/TerrainPalette.js';

function clampByte(v) {
    return Math.max(0, Math.min(255, Math.round(v)));
}

function rgbToHex([r, g, b]) {
    return `#${[r, g, b].map(v => clampByte(v).toString(16).padStart(2, '0')).join('')}`;
}

export const MAP_COLORS = {
    terrain: (h) => rgbToHex(getSurfaceMapSrgb(h)),

    _baseRGB: (h) => getSurfaceMapSrgb(h),

    /**
     * Returns [r, g, b] array — fast path for ImageData rendering.
     * hillshading applied if slopeX/slopeZ are non-zero.
     */
    getTerrainColorArray: (h, slopeX = 0, slopeZ = 0) => {
        const base = MAP_COLORS._baseRGB(h);
        if (slopeX === 0 && slopeZ === 0) return base;

        const shadow = (slopeX * -0.707 + slopeZ * -0.707) * 0.5;
        const scale = shadow * 100;
        return [
            clampByte(base[0] + scale),
            clampByte(base[1] + scale),
            clampByte(base[2] + scale)
        ];
    },

    getTerrainColorRGB: (h, slopeX = 0, slopeZ = 0) => {
        const [r, g, b] = MAP_COLORS.getTerrainColorArray(h, slopeX, slopeZ);
        return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    }
};
