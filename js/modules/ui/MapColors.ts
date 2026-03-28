import { getSurfaceMapSrgb } from '../world/terrain/TerrainPalette.js';

type RgbColor = [number, number, number];

function clampByte(v: number): number {
    return Math.max(0, Math.min(255, Math.round(v)));
}

function rgbToHex([r, g, b]: RgbColor): string {
    return `#${[r, g, b].map(v => clampByte(v).toString(16).padStart(2, '0')).join('')}`;
}

export const MAP_COLORS = {
    terrain: (h: number): string => rgbToHex(getSurfaceMapSrgb(h) as RgbColor),

    _baseRGB: (h: number): RgbColor => getSurfaceMapSrgb(h) as RgbColor,

    /**
     * Returns [r, g, b] array for ImageData rendering.
     */
    getTerrainColorArray: (h: number, slopeX = 0, slopeZ = 0): RgbColor => {
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

    getTerrainColorRGB: (h: number, slopeX = 0, slopeZ = 0): string => {
        const [r, g, b] = MAP_COLORS.getTerrainColorArray(h, slopeX, slopeZ);
        return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    }
};
