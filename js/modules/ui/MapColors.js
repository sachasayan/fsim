export const MAP_COLORS = {
    terrain: (h) => {
        if (h < -25) return '#1d4f88'; // Deep Water
        if (h < -5) return '#2d72a8';  // Shallow Water
        if (h < 8) return '#d6d2b0';   // Sand/Beach
        if (h < 45) return '#6f9a59';  // Light Grass
        if (h < 130) return '#4f7e42'; // Dark Grass
        if (h < 240) return '#7a8c58'; // Hills
        if (h < 380) return '#7a736a'; // Mountain Base
        if (h < 560) return '#9d9890'; // High Peaks
        return '#f2f2f2';             // Snow
    },

    _baseRGB: (h) => {
        if (h < 5) return [29, 79, 136];      // water
        if (h < 15) return [214, 210, 176];   // sand
        if (h < 100) return [79, 126, 66];    // grass
        if (h < 300) return [122, 140, 88];   // hills
        return [242, 242, 242];               // snow
    },

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
            Math.max(0, Math.min(255, base[0] + scale)),
            Math.max(0, Math.min(255, base[1] + scale)),
            Math.max(0, Math.min(255, base[2] + scale))
        ];
    },

    getTerrainColorRGB: (h, slopeX = 0, slopeZ = 0) => {
        const [r, g, b] = MAP_COLORS.getTerrainColorArray(h, slopeX, slopeZ);
        return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    }
};
