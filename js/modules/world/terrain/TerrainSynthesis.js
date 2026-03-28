import { DEFAULT_WORLD_SIZE } from '../WorldConfig.js';
import { applyAirportRunwayFlattening } from '../AirportLayout.js';
import { SEA_LEVEL } from './TerrainPalette.js';

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function inverseLerp(a, b, value) {
    if (Math.abs(b - a) < 1e-6) return 0;
    return clamp01((value - a) / (b - a));
}

function smoothstep(edge0, edge1, value) {
    const t = inverseLerp(edge0, edge1, value);
    return t * t * (3 - 2 * t);
}

function smootherstep(edge0, edge1, value) {
    const t = inverseLerp(edge0, edge1, value);
    return t * t * t * (t * (t * 6 - 15) + 10);
}

function mixColors(a, b, t) {
    return [
        Math.round(lerp(a[0], b[0], t)),
        Math.round(lerp(a[1], b[1], t)),
        Math.round(lerp(a[2], b[2], t))
    ];
}

function colorRamp(stops, t) {
    const clamped = clamp01(t);
    for (let index = 0; index < stops.length - 1; index += 1) {
        const current = stops[index];
        const next = stops[index + 1];
        if (clamped > next.stop) continue;
        const localT = inverseLerp(current.stop, next.stop, clamped);
        return mixColors(current.color, next.color, localT);
    }
    return stops[stops.length - 1].color.slice();
}

function normalizeNumber(value, min, max, fallback) {
    if (!Number.isFinite(value)) return fallback;
    return clamp(value, min, max);
}

function fract(value) {
    return value - Math.floor(value);
}

function seeded01(seed, a, b = 0) {
    const n = Math.sin(seed * 12.9898 + a * 78.233 + b * 37.719) * 43758.5453123;
    return n - Math.floor(n);
}

function normalizeTerrainExtent(worldSize, authoredBounds = null) {
    const width = authoredBounds
        ? Math.max(1, authoredBounds.maxX - authoredBounds.minX)
        : Math.max(1, worldSize);
    const height = authoredBounds
        ? Math.max(1, authoredBounds.maxZ - authoredBounds.minZ)
        : Math.max(1, worldSize);
    return {
        width,
        height,
        halfWidth: width * 0.5,
        halfHeight: height * 0.5,
        maxDimension: Math.max(width, height),
        minDimension: Math.min(width, height)
    };
}

function createRasterCoordinates(index, resolution, terrainExtent) {
    const x = index % resolution;
    const z = Math.floor(index / resolution);
    const stepX = terrainExtent.width / (resolution - 1);
    const stepZ = terrainExtent.height / (resolution - 1);
    return {
        gx: x,
        gz: z,
        wx: -terrainExtent.halfWidth + x * stepX,
        wz: -terrainExtent.halfHeight + z * stepZ,
        stepX,
        stepZ,
        step: Math.max(stepX, stepZ)
    };
}

function sampleRasterBilinear(field, terrainExtent, resolution, x, z) {
    if (x < -terrainExtent.halfWidth || x > terrainExtent.halfWidth || z < -terrainExtent.halfHeight || z > terrainExtent.halfHeight) return 0;
    const nx = inverseLerp(-terrainExtent.halfWidth, terrainExtent.halfWidth, x) * (resolution - 1);
    const nz = inverseLerp(-terrainExtent.halfHeight, terrainExtent.halfHeight, z) * (resolution - 1);
    const x0 = Math.max(0, Math.floor(nx));
    const z0 = Math.max(0, Math.floor(nz));
    const x1 = Math.min(resolution - 1, x0 + 1);
    const z1 = Math.min(resolution - 1, z0 + 1);
    const fx = nx - x0;
    const fz = nz - z0;

    const i00 = z0 * resolution + x0;
    const i10 = z0 * resolution + x1;
    const i01 = z1 * resolution + x0;
    const i11 = z1 * resolution + x1;

    const a = lerp(field[i00], field[i10], fx);
    const b = lerp(field[i01], field[i11], fx);
    return lerp(a, b, fz);
}

export function createSeededNoise(seed = 12345) {
    const localNoise = {
        permutation: new Uint8Array(512),
        init(initSeed = 12345) {
            const p = new Uint8Array(256);
            for (let i = 0; i < 256; i += 1) p[i] = i;

            let s = initSeed;
            for (let i = 255; i > 0; i -= 1) {
                s = Math.imul(1664525, s) + 1013904223 | 0;
                const rand = Math.floor((((s >>> 8) & 0xfffff) / 0x100000) * (i + 1));
                const temp = p[i];
                p[i] = p[rand];
                p[rand] = temp;
            }
            for (let i = 0; i < 512; i += 1) this.permutation[i] = p[i & 255];
        },
        fade: (t) => t * t * t * (t * (t * 6 - 15) + 10),
        lerp: (t, a, b) => a + t * (b - a),
        grad(hash, x, y, z) {
            const h = hash & 15;
            const u = h < 8 ? x : y;
            const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
            return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
        },
        noise(x, y, z) {
            let X = Math.floor(x) & 255;
            let Y = Math.floor(y) & 255;
            let Z = Math.floor(z) & 255;
            x -= Math.floor(x);
            y -= Math.floor(y);
            z -= Math.floor(z);
            const u = this.fade(x);
            const v = this.fade(y);
            const w = this.fade(z);
            const A = this.permutation[X] + Y;
            const AA = this.permutation[A] + Z;
            const AB = this.permutation[A + 1] + Z;
            const B = this.permutation[X + 1] + Y;
            const BA = this.permutation[B] + Z;
            const BB = this.permutation[B + 1] + Z;

            return this.lerp(
                w,
                this.lerp(
                    v,
                    this.lerp(u, this.grad(this.permutation[AA], x, y, z), this.grad(this.permutation[BA], x - 1, y, z)),
                    this.lerp(u, this.grad(this.permutation[AB], x, y - 1, z), this.grad(this.permutation[BB], x - 1, y - 1, z))
                ),
                this.lerp(
                    v,
                    this.lerp(u, this.grad(this.permutation[AA + 1], x, y, z - 1), this.grad(this.permutation[BA + 1], x - 1, y, z - 1)),
                    this.lerp(u, this.grad(this.permutation[AB + 1], x, y - 1, z - 1), this.grad(this.permutation[BB + 1], x - 1, y - 1, z - 1))
                )
            );
        },
        fractal(x, z, octaves, persistence, scale) {
            let total = 0;
            let frequency = scale;
            let amplitude = 1;
            let maxValue = 0;
            for (let i = 0; i < octaves; i += 1) {
                total += this.noise(x * frequency, 0, z * frequency) * amplitude;
                maxValue += amplitude;
                amplitude *= persistence;
                frequency *= 2;
            }
            return maxValue > 0 ? total / maxValue : 0;
        }
    };
    localNoise.init(seed);
    return localNoise;
}

function paintDisc(field, resolution, cx, cz, radiusCells, value) {
    const radiusSq = radiusCells * radiusCells;
    const minX = Math.max(0, Math.floor(cx - radiusCells));
    const maxX = Math.min(resolution - 1, Math.ceil(cx + radiusCells));
    const minZ = Math.max(0, Math.floor(cz - radiusCells));
    const maxZ = Math.min(resolution - 1, Math.ceil(cz + radiusCells));

    for (let z = minZ; z <= maxZ; z += 1) {
        for (let x = minX; x <= maxX; x += 1) {
            const dx = x - cx;
            const dz = z - cz;
            const distSq = dx * dx + dz * dz;
            if (distSq > radiusSq) continue;
            const falloff = 1.0 - Math.sqrt(distSq) / Math.max(1e-6, radiusCells);
            const index = z * resolution + x;
            field[index] = Math.max(field[index], value * Math.max(0, falloff));
        }
    }
}

function sampleRidgedNoise(Noise, x, z, { octaves = 5, persistence = 0.55, scale = 0.00055 } = {}) {
    let total = 0;
    let amplitude = 1;
    let frequency = scale;
    let maxValue = 0;
    for (let i = 0; i < octaves; i += 1) {
        const n = 1.0 - Math.abs(Noise.noise(x * frequency, 0, z * frequency));
        total += n * n * amplitude;
        maxValue += amplitude;
        amplitude *= persistence;
        frequency *= 2.0;
    }
    return maxValue > 0 ? total / maxValue : 0;
}

function sampleBillowNoise(Noise, x, z, { octaves = 4, persistence = 0.55, scale = 0.00035 } = {}) {
    let total = 0;
    let amplitude = 1;
    let frequency = scale;
    let maxValue = 0;
    for (let i = 0; i < octaves; i += 1) {
        const n = Math.abs(Noise.noise(x * frequency, 0, z * frequency)) * 2 - 1;
        total += n * amplitude;
        maxValue += amplitude;
        amplitude *= persistence;
        frequency *= 2.0;
    }
    return maxValue > 0 ? total / maxValue : 0;
}

export const TERRAIN_PREVIEW_OVERLAYS = Object.freeze([
    'height',
    'rivers',
    'lakes',
    'moisture',
    'flow',
    'erosion',
    'gorge',
    'cliff',
    'floodplain',
    'talus'
]);

const DEFAULT_TERRAIN_GENERATOR = Object.freeze({
    version: 2,
    preset: 'balanced',
    seed: 12345,
    macro: {
        baseOffset: -70,
        continentalAmplitude: 170,
        ridgeAmplitude: 760,
        foothillAmplitude: 110,
        valleyAmplitude: 85,
        warpAmplitude: 2200,
        rangeCount: 5,
        rangeLength: 0.58,
        rangeWidth: 0.34,
        upliftStrength: 0.72,
        massifStrength: 0.55,
        escarpmentStrength: 0.42,
        plateauHeight: 190,
        shelfCount: 4,
        shelfSharpness: 0.52,
        summitFrequency: 0.46,
        summitSharpness: 0.54,
        ridgeSerration: 0.46,
        cirqueStrength: 0.34
    },
    landforms: {
        glacialValleyStrength: 0.42,
        canyonDepth: 0.44,
        canyonWidth: 0.36,
        basinDepth: 0.4,
        basinBreadth: 0.55
    },
    hydrology: {
        resolution: 129,
        riverCount: 18,
        riverStrength: 1,
        lakeCount: 6,
        lakeStrength: 0.6,
        erosionStrength: 1,
        gorgeStrength: 0.7,
        incisionBias: 0.55,
        floodplainWidth: 0.55,
        cliffThreshold: 0.46
    },
    preview: {
        overlay: 'height',
        opacity: 1,
        resolution: 96,
        showContours: true,
        enabled: true
    }
});

export const TERRAIN_GENERATOR_PRESETS = Object.freeze({
    balanced: Object.freeze({
        preset: 'balanced',
        macro: {
            baseOffset: -70,
            continentalAmplitude: 170,
            ridgeAmplitude: 760,
            foothillAmplitude: 110,
            valleyAmplitude: 85,
            warpAmplitude: 2200,
            rangeCount: 5,
            rangeLength: 0.58,
            rangeWidth: 0.34,
            upliftStrength: 0.72,
            massifStrength: 0.55,
            escarpmentStrength: 0.42,
            plateauHeight: 190,
            shelfCount: 4,
            shelfSharpness: 0.52,
            summitFrequency: 0.46,
            summitSharpness: 0.54,
            ridgeSerration: 0.46,
            cirqueStrength: 0.34
        },
        landforms: {
            glacialValleyStrength: 0.42,
            canyonDepth: 0.44,
            canyonWidth: 0.36,
            basinDepth: 0.4,
            basinBreadth: 0.55
        },
        hydrology: {
            riverCount: 18,
            riverStrength: 1,
            lakeCount: 6,
            lakeStrength: 0.6,
            erosionStrength: 1,
            gorgeStrength: 0.7,
            incisionBias: 0.55,
            floodplainWidth: 0.55,
            cliffThreshold: 0.46
        }
    }),
    alpine: Object.freeze({
        preset: 'alpine',
        macro: {
            baseOffset: -40,
            continentalAmplitude: 210,
            ridgeAmplitude: 1240,
            foothillAmplitude: 170,
            valleyAmplitude: 64,
            warpAmplitude: 2700,
            rangeCount: 7,
            rangeLength: 0.72,
            rangeWidth: 0.4,
            upliftStrength: 0.9,
            massifStrength: 0.72,
            escarpmentStrength: 0.54,
            plateauHeight: 220,
            shelfCount: 5,
            shelfSharpness: 0.58,
            summitFrequency: 0.62,
            summitSharpness: 0.72,
            ridgeSerration: 0.62,
            cirqueStrength: 0.52
        },
        landforms: {
            glacialValleyStrength: 0.68,
            canyonDepth: 0.42,
            canyonWidth: 0.34,
            basinDepth: 0.3,
            basinBreadth: 0.48
        },
        hydrology: {
            riverCount: 20,
            riverStrength: 1.15,
            lakeCount: 4,
            lakeStrength: 0.45,
            erosionStrength: 1.15,
            gorgeStrength: 0.8,
            incisionBias: 0.68,
            floodplainWidth: 0.35,
            cliffThreshold: 0.43
        }
    }),
    coastal: Object.freeze({
        preset: 'coastal',
        macro: {
            baseOffset: -92,
            continentalAmplitude: 125,
            ridgeAmplitude: 560,
            foothillAmplitude: 92,
            valleyAmplitude: 94,
            warpAmplitude: 2800,
            rangeCount: 4,
            rangeLength: 0.46,
            rangeWidth: 0.3,
            upliftStrength: 0.48,
            massifStrength: 0.28,
            escarpmentStrength: 0.48,
            plateauHeight: 160,
            shelfCount: 4,
            shelfSharpness: 0.48,
            summitFrequency: 0.28,
            summitSharpness: 0.34,
            ridgeSerration: 0.28,
            cirqueStrength: 0.16
        },
        landforms: {
            glacialValleyStrength: 0.24,
            canyonDepth: 0.48,
            canyonWidth: 0.42,
            basinDepth: 0.45,
            basinBreadth: 0.7
        },
        hydrology: {
            riverCount: 16,
            riverStrength: 1.1,
            lakeCount: 8,
            lakeStrength: 0.85,
            erosionStrength: 0.9,
            gorgeStrength: 0.5,
            incisionBias: 0.46,
            floodplainWidth: 0.72,
            cliffThreshold: 0.48
        }
    }),
    cinematic: Object.freeze({
        preset: 'cinematic',
        macro: {
            baseOffset: -28,
            continentalAmplitude: 235,
            ridgeAmplitude: 1360,
            foothillAmplitude: 190,
            valleyAmplitude: 126,
            warpAmplitude: 3100,
            rangeCount: 8,
            rangeLength: 0.82,
            rangeWidth: 0.46,
            upliftStrength: 1,
            massifStrength: 0.84,
            escarpmentStrength: 0.74,
            plateauHeight: 280,
            shelfCount: 6,
            shelfSharpness: 0.68,
            summitFrequency: 0.76,
            summitSharpness: 0.82,
            ridgeSerration: 0.76,
            cirqueStrength: 0.64
        },
        landforms: {
            glacialValleyStrength: 0.62,
            canyonDepth: 0.82,
            canyonWidth: 0.34,
            basinDepth: 0.64,
            basinBreadth: 0.62
        },
        hydrology: {
            riverCount: 22,
            riverStrength: 1.2,
            lakeCount: 5,
            lakeStrength: 0.5,
            erosionStrength: 1.25,
            gorgeStrength: 0.95,
            incisionBias: 0.82,
            floodplainWidth: 0.5,
            cliffThreshold: 0.42
        }
    })
});

export function getDefaultTerrainGeneratorConfig() {
    return structuredClone(DEFAULT_TERRAIN_GENERATOR);
}

export function applyTerrainGeneratorPreset(rawConfig, presetName) {
    const config = normalizeTerrainGeneratorConfig(rawConfig);
    const preset = TERRAIN_GENERATOR_PRESETS[presetName] || TERRAIN_GENERATOR_PRESETS.balanced;
    return normalizeTerrainGeneratorConfig({
        ...config,
        preset: preset.preset,
        macro: {
            ...config.macro,
            ...preset.macro
        },
        landforms: {
            ...config.landforms,
            ...preset.landforms
        },
        hydrology: {
            ...config.hydrology,
            ...preset.hydrology
        }
    });
}

export function normalizeTerrainGeneratorConfig(rawConfig = null) {
    const defaults = getDefaultTerrainGeneratorConfig();
    const source = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
    const presetName = typeof source.preset === 'string' && source.preset ? source.preset : defaults.preset;
    const preset = TERRAIN_GENERATOR_PRESETS[presetName] || TERRAIN_GENERATOR_PRESETS.balanced;
    const macro = { ...(preset.macro || {}), ...(source.macro && typeof source.macro === 'object' ? source.macro : {}) };
    const landforms = { ...(preset.landforms || {}), ...(source.landforms && typeof source.landforms === 'object' ? source.landforms : {}) };
    const hydrology = { ...(preset.hydrology || {}), ...(source.hydrology && typeof source.hydrology === 'object' ? source.hydrology : {}) };
    const preview = source.preview && typeof source.preview === 'object' ? source.preview : {};

    return {
        version: 2,
        preset: presetName,
        seed: normalizeNumber(source.seed, 1, 999999, defaults.seed),
        macro: {
            baseOffset: normalizeNumber(macro.baseOffset, -220, 220, defaults.macro.baseOffset),
            continentalAmplitude: normalizeNumber(macro.continentalAmplitude, 40, 360, defaults.macro.continentalAmplitude),
            ridgeAmplitude: normalizeNumber(macro.ridgeAmplitude, 120, 1600, defaults.macro.ridgeAmplitude),
            foothillAmplitude: normalizeNumber(macro.foothillAmplitude, 0, 340, defaults.macro.foothillAmplitude),
            valleyAmplitude: normalizeNumber(macro.valleyAmplitude, 0, 260, defaults.macro.valleyAmplitude),
            warpAmplitude: normalizeNumber(macro.warpAmplitude, 0, 5200, defaults.macro.warpAmplitude),
            rangeCount: Math.round(normalizeNumber(macro.rangeCount, 1, 10, defaults.macro.rangeCount)),
            rangeLength: normalizeNumber(macro.rangeLength, 0.15, 1.0, defaults.macro.rangeLength),
            rangeWidth: normalizeNumber(macro.rangeWidth, 0.15, 1.0, defaults.macro.rangeWidth),
            upliftStrength: normalizeNumber(macro.upliftStrength, 0, 1.2, defaults.macro.upliftStrength),
            massifStrength: normalizeNumber(macro.massifStrength, 0, 1.2, defaults.macro.massifStrength),
            escarpmentStrength: normalizeNumber(macro.escarpmentStrength, 0, 1.2, defaults.macro.escarpmentStrength),
            plateauHeight: normalizeNumber(macro.plateauHeight, 0, 420, defaults.macro.plateauHeight),
            shelfCount: Math.round(normalizeNumber(macro.shelfCount, 1, 8, defaults.macro.shelfCount)),
            shelfSharpness: normalizeNumber(macro.shelfSharpness, 0, 1, defaults.macro.shelfSharpness),
            summitFrequency: normalizeNumber(macro.summitFrequency, 0, 1, defaults.macro.summitFrequency),
            summitSharpness: normalizeNumber(macro.summitSharpness, 0, 1, defaults.macro.summitSharpness),
            ridgeSerration: normalizeNumber(macro.ridgeSerration, 0, 1, defaults.macro.ridgeSerration),
            cirqueStrength: normalizeNumber(macro.cirqueStrength, 0, 1, defaults.macro.cirqueStrength)
        },
        landforms: {
            glacialValleyStrength: normalizeNumber(landforms.glacialValleyStrength, 0, 1, defaults.landforms.glacialValleyStrength),
            canyonDepth: normalizeNumber(landforms.canyonDepth, 0, 1, defaults.landforms.canyonDepth),
            canyonWidth: normalizeNumber(landforms.canyonWidth, 0.15, 1, defaults.landforms.canyonWidth),
            basinDepth: normalizeNumber(landforms.basinDepth, 0, 1, defaults.landforms.basinDepth),
            basinBreadth: normalizeNumber(landforms.basinBreadth, 0.15, 1, defaults.landforms.basinBreadth)
        },
        hydrology: {
            resolution: Math.round(normalizeNumber(hydrology.resolution, 33, 257, defaults.hydrology.resolution)),
            riverCount: Math.round(normalizeNumber(hydrology.riverCount, 0, 32, defaults.hydrology.riverCount)),
            riverStrength: normalizeNumber(hydrology.riverStrength, 0, 2.5, defaults.hydrology.riverStrength),
            lakeCount: Math.round(normalizeNumber(hydrology.lakeCount, 0, 16, defaults.hydrology.lakeCount)),
            lakeStrength: normalizeNumber(hydrology.lakeStrength, 0, 2, defaults.hydrology.lakeStrength),
            erosionStrength: normalizeNumber(hydrology.erosionStrength, 0, 2, defaults.hydrology.erosionStrength),
            gorgeStrength: normalizeNumber(hydrology.gorgeStrength, 0, 1.2, defaults.hydrology.gorgeStrength),
            incisionBias: normalizeNumber(hydrology.incisionBias, 0, 1, defaults.hydrology.incisionBias),
            floodplainWidth: normalizeNumber(hydrology.floodplainWidth, 0, 1, defaults.hydrology.floodplainWidth),
            cliffThreshold: normalizeNumber(hydrology.cliffThreshold, 0.12, 0.9, defaults.hydrology.cliffThreshold)
        },
        preview: {
            overlay: TERRAIN_PREVIEW_OVERLAYS.includes(preview.overlay) ? preview.overlay : defaults.preview.overlay,
            opacity: normalizeNumber(preview.opacity, 0, 1, defaults.preview.opacity),
            resolution: Math.round(normalizeNumber(preview.resolution, 32, 192, defaults.preview.resolution)),
            showContours: preview.showContours !== false,
            enabled: preview.enabled !== false
        }
    };
}

function createSeedOffsets(seed = 0) {
    return {
        continentalX: seed * 127.31 + 13000,
        continentalZ: seed * -91.17 - 7000,
        warpX: seed * 41.73 + 1700,
        warpZ: seed * -38.12 + 2600,
        ridgeMaskX: seed * 67.91 - 9200,
        ridgeMaskZ: seed * 73.44 + 11400,
        ridgeX: seed * -51.37 + 4100,
        ridgeZ: seed * 58.81 - 8600,
        hillX: seed * 13.17 - 2000,
        hillZ: seed * 21.93 + 3200,
        escarpmentX: seed * 31.17 + 8300,
        escarpmentZ: seed * -24.61 - 5100,
        basinX: seed * -19.33 + 1440,
        basinZ: seed * 28.41 - 2680,
        exposureX: seed * 11.7 - 4800,
        exposureZ: seed * -16.4 + 3900
    };
}

function createRangeDefinitions(config, terrainExtent) {
    const ranges = [];
    const count = config.macro.rangeCount;
    const radialX = terrainExtent.halfWidth * 0.72;
    const radialZ = terrainExtent.halfHeight * 0.72;
    const maxDimension = terrainExtent.maxDimension;
    for (let index = 0; index < count; index += 1) {
        const angle = seeded01(config.seed, index, 1) * Math.PI * 2;
        const radial = seeded01(config.seed, index, 2) * 0.55 + 0.12;
        const cx = Math.cos(angle) * radialX * radial * 0.78;
        const cz = Math.sin(angle) * radialZ * radial * 0.78;
        const orientation = angle + (seeded01(config.seed, index, 3) - 0.5) * Math.PI * 0.75;
        const halfLength = (maxDimension * 0.16) + config.macro.rangeLength * maxDimension * (0.14 + seeded01(config.seed, index, 4) * 0.08);
        const width = (maxDimension * 0.02) + config.macro.rangeWidth * maxDimension * (0.025 + seeded01(config.seed, index, 5) * 0.02);
        const uplift = (0.6 + seeded01(config.seed, index, 6) * 0.7) * config.macro.upliftStrength;
        const massifCount = 1 + Math.floor(seeded01(config.seed, index, 7) * 3);
        const massifs = [];
        for (let massifIndex = 0; massifIndex < massifCount; massifIndex += 1) {
            const t = lerp(-0.78, 0.78, seeded01(config.seed, index, 10 + massifIndex));
            const offsetAngle = orientation + Math.PI * 0.5;
            const offset = (seeded01(config.seed, index, 20 + massifIndex) - 0.5) * width * 0.55;
            massifs.push({
                x: cx + Math.cos(orientation) * halfLength * t + Math.cos(offsetAngle) * offset,
                z: cz + Math.sin(orientation) * halfLength * t + Math.sin(offsetAngle) * offset,
                radius: width * (0.5 + seeded01(config.seed, index, 30 + massifIndex) * 0.7),
                strength: 0.65 + seeded01(config.seed, index, 40 + massifIndex) * 0.8
            });
        }
        ranges.push({
            cx,
            cz,
            dirX: Math.cos(orientation),
            dirZ: Math.sin(orientation),
            halfLength,
            width,
            uplift,
            massifs
        });
    }
    return ranges;
}

function createIslandProfile(config, terrainExtent) {
    const seed = config.seed;
    const centerX = (seeded01(seed, 700, 1) - 0.5) * terrainExtent.width * 0.26;
    const centerZ = (seeded01(seed, 700, 2) - 0.5) * terrainExtent.height * 0.26;
    const rotation = seeded01(seed, 700, 3) * Math.PI * 2;
    const axisX = 0.84 + seeded01(seed, 700, 4) * 0.42;
    const axisZ = 0.84 + seeded01(seed, 700, 5) * 0.42;
    const innerRadius = 0.56 + seeded01(seed, 700, 6) * 0.14;
    const outerRadius = innerRadius + 0.3 + seeded01(seed, 700, 7) * 0.12;
    const coastScale = 1 / Math.max(terrainExtent.maxDimension * 0.85, 1);
    return {
        centerX,
        centerZ,
        rotation,
        axisX,
        axisZ,
        innerRadius,
        outerRadius,
        coastScale
    };
}

function sampleIslandMask(x, z, Noise, offsets, terrainExtent, islandProfile) {
    if (!islandProfile) return 1;
    const dx = (x - islandProfile.centerX) / Math.max(1, terrainExtent.halfWidth);
    const dz = (z - islandProfile.centerZ) / Math.max(1, terrainExtent.halfHeight);
    const cosR = Math.cos(islandProfile.rotation);
    const sinR = Math.sin(islandProfile.rotation);
    const rx = dx * cosR - dz * sinR;
    const rz = dx * sinR + dz * cosR;
    const px = rx / islandProfile.axisX;
    const pz = rz / islandProfile.axisZ;
    const radial = Math.hypot(px, pz);
    const coastNoise = Noise.fractal(
        x + offsets.continentalX * 0.11,
        z + offsets.continentalZ * 0.11,
        3,
        0.5,
        islandProfile.coastScale
    );
    const coastBias = coastNoise * 0.16;
    return clamp01(1 - smoothstep(
        islandProfile.innerRadius + coastBias * 0.35,
        islandProfile.outerRadius + coastBias * 0.55,
        radial
    ));
}

function sampleRangeComposer(x, z, Noise, config, offsets, ranges) {
    let rangeMask = 0;
    let uplift = 0;
    let massifMask = 0;
    for (const range of ranges) {
        const rx = x - range.cx;
        const rz = z - range.cz;
        const along = rx * range.dirX + rz * range.dirZ;
        const perp = -rx * range.dirZ + rz * range.dirX;
        const alongMask = 1.0 - smoothstep(range.halfLength * 0.72, range.halfLength * 1.08, Math.abs(along));
        const spine = 1.0 - smoothstep(range.width * 0.7, range.width * 1.45, Math.abs(perp));
        const localMask = clamp01(alongMask * spine);
        rangeMask = Math.max(rangeMask, localMask);

        const ridgeNoise = sampleRidgedNoise(Noise, x + offsets.ridgeX + along * 0.12, z + offsets.ridgeZ + perp * 0.12, {
            octaves: 5,
            persistence: 0.58,
            scale: 0.00052 + config.macro.ridgeSerration * 0.00022
        });
        uplift += localMask * range.uplift * (0.7 + ridgeNoise * 0.9);

        for (const massif of range.massifs) {
            const dx = x - massif.x;
            const dz = z - massif.z;
            const radiusSq = massif.radius * massif.radius;
            const distSq = dx * dx + dz * dz;
            if (distSq > radiusSq * 2.3) continue;
            const local = Math.exp(-distSq / Math.max(1e-6, radiusSq));
            massifMask = Math.max(massifMask, local * massif.strength);
        }
    }

    return {
        rangeMask: clamp01(rangeMask),
        uplift,
        massifMask: clamp01(massifMask * config.macro.massifStrength)
    };
}

function sampleStructuralFields(x, z, Noise, config, offsets, continentalShelf, rangeMask) {
    const escarpmentNoise = Noise.fractal(x + offsets.escarpmentX, z + offsets.escarpmentZ, 4, 0.5, 0.00011);
    const escarpmentSigned = escarpmentNoise + Noise.fractal(x - offsets.escarpmentZ, z + offsets.escarpmentX, 2, 0.5, 0.00023) * 0.35;
    const escarpmentMask = clamp01(1.0 - smoothstep(0.06, 0.34 + config.macro.escarpmentStrength * 0.22, Math.abs(escarpmentSigned)));
    const plateauNoise = (Noise.fractal(x - offsets.basinX, z - offsets.basinZ, 3, 0.5, 0.00008) + 1) * 0.5;
    const plateauMask = smoothstep(0.56, 0.82, plateauNoise) * smoothstep(0.18, 0.72, continentalShelf) * (0.35 + rangeMask * 0.65);
    const shelfWave = (Noise.fractal(x + offsets.exposureX, z + offsets.exposureZ, 3, 0.5, 0.00022) + 1) * 0.5;
    const shelfJitter = Noise.noise(x * 0.002, 0, z * 0.002) * 0.15;
    const shelfBands = fract(shelfWave * Math.max(1, config.macro.shelfCount) + shelfJitter);
    const shelfWidth = 0.38 - config.macro.shelfSharpness * 0.12;
    const shelfMask = clamp01(1.0 - smoothstep(shelfWidth, 1.0 - shelfWidth, Math.abs(shelfBands - 0.5) * 2.0));

    return {
        escarpmentMask: escarpmentMask * config.macro.escarpmentStrength,
        plateauMask,
        shelfMask
    };
}

function sampleTerrainStage(x, z, Noise, config, offsets, ranges, terrainExtent, islandProfile = null) {
    const continental = (Noise.fractal(x + offsets.continentalX, z + offsets.continentalZ, 4, 0.5, 0.000045) + 1) * 0.5;
    const continentalShelf = smoothstep(0.16, 0.84, continental);

    const warpX = Noise.fractal(x + offsets.warpX, z + offsets.warpZ, 3, 0.5, 0.00016) * config.macro.warpAmplitude;
    const warpZ = Noise.fractal(x - offsets.warpZ, z - offsets.warpX, 3, 0.5, 0.00016) * config.macro.warpAmplitude;
    const wx = x + warpX;
    const wz = z + warpZ;

    const range = sampleRangeComposer(wx, wz, Noise, config, offsets, ranges);
    const foothills = Noise.fractal(wx + offsets.hillX, wz + offsets.hillZ, 5, 0.5, 0.00022) * config.macro.foothillAmplitude;
    const ridges = sampleRidgedNoise(Noise, wx + offsets.ridgeX, wz + offsets.ridgeZ, {
        octaves: 5,
        persistence: 0.58,
        scale: 0.00058 + config.macro.ridgeSerration * 0.00014
    }) * config.macro.ridgeAmplitude * clamp01(range.rangeMask * 0.85 + range.massifMask * 0.45 + 0.18);
    const structural = sampleStructuralFields(wx, wz, Noise, config, offsets, continentalShelf, range.rangeMask);

    const valleyNoise = (sampleBillowNoise(Noise, wx - offsets.hillZ, wz + offsets.hillX, {
        octaves: 4,
        persistence: 0.55,
        scale: 0.00024
    }) + 1) * 0.5;
    const canyonNoise = sampleRidgedNoise(Noise, wx + offsets.basinX, wz - offsets.basinZ, {
        octaves: 4,
        persistence: 0.6,
        scale: 0.00033 + (1 - config.landforms.canyonWidth) * 0.00018
    });
    const basinNoise = (Noise.fractal(wx + offsets.basinX, wz + offsets.basinZ, 3, 0.5, 0.00007) + 1) * 0.5;
    const glacialMask = smoothstep(0.42, 0.86, valleyNoise) * clamp01(range.rangeMask * 1.08) * config.landforms.glacialValleyStrength;
    const canyonMask = smoothstep(0.58, 0.92, canyonNoise) * clamp01(range.rangeMask * 0.7 + structural.escarpmentMask * 0.55) * config.landforms.canyonDepth;
    const basinMask = smoothstep(0.48, 0.86, basinNoise) * (0.4 + continentalShelf * 0.6) * config.landforms.basinDepth;

    const glacialCarve = glacialMask * (config.macro.valleyAmplitude * 1.6 + 42);
    const canyonCarve = canyonMask * (40 + config.macro.ridgeAmplitude * 0.18);
    const basinCarve = basinMask * config.landforms.basinBreadth * (55 + config.macro.continentalAmplitude * 0.6);

    const escarpmentLift = structural.escarpmentMask * (40 + config.macro.escarpmentStrength * 120);
    const plateauLift = structural.plateauMask * config.macro.plateauHeight;
    const shelfLift = structural.plateauMask * structural.shelfMask * config.macro.plateauHeight * 0.28;

    const summitNoise = sampleRidgedNoise(Noise, wx - offsets.exposureX, wz + offsets.exposureZ, {
        octaves: 4,
        persistence: 0.65,
        scale: 0.00092
    });
    const summitMask = smoothstep(0.62 - config.macro.summitFrequency * 0.22, 0.94, summitNoise)
        * clamp01(range.rangeMask * 0.75 + range.massifMask * 0.85);
    const summitLift = summitMask * config.macro.summitSharpness * (65 + config.macro.ridgeAmplitude * 0.08);
    const cirqueMask = summitMask * config.macro.cirqueStrength * smoothstep(0.35, 0.82, valleyNoise);
    const cirqueCarve = cirqueMask * 24;

    const baseHeight = config.macro.baseOffset
        + continentalShelf * config.macro.continentalAmplitude
        + foothills
        + ridges
        + range.uplift * (config.macro.ridgeAmplitude * 0.24)
        + range.massifMask * (config.macro.ridgeAmplitude * 0.26 + config.macro.massifStrength * 120)
        + escarpmentLift
        + plateauLift
        + shelfLift
        + summitLift
        - glacialCarve
        - canyonCarve
        - basinCarve
        - cirqueCarve;

    const islandMask = sampleIslandMask(x, z, Noise, offsets, terrainExtent, islandProfile);
    const oceanFloor = SEA_LEVEL - 140 + continentalShelf * 24 - basinMask * 16;
    const shapedBaseHeight = islandProfile
        ? lerp(oceanFloor, baseHeight, islandMask)
        : baseHeight;

    const exposure = (Noise.fractal(wx + offsets.exposureX, wz + offsets.exposureZ, 3, 0.5, 0.0002) + 1) * 0.5;

    return {
        baseHeight: shapedBaseHeight,
        continentalShelf,
        rangeMask: clamp01(range.rangeMask),
        massifMask: clamp01(range.massifMask),
        glacialMask: clamp01(glacialMask),
        canyonMask: clamp01(canyonMask),
        basinMask: clamp01(basinMask),
        escarpmentMask: clamp01(structural.escarpmentMask),
        plateauMask: clamp01(structural.plateauMask),
        shelfMask: clamp01(structural.shelfMask),
        summitMask: clamp01(summitMask),
        exposure
    };
}

function fillDepressions(heights, resolution) {
    const effective = new Float32Array(heights);
    const sinkMask = new Float32Array(heights.length);
    const neighbors = [
        [-1, -1], [0, -1], [1, -1],
        [-1, 0], [1, 0],
        [-1, 1], [0, 1], [1, 1]
    ];

    for (let pass = 0; pass < 2; pass += 1) {
        for (let z = 1; z < resolution - 1; z += 1) {
            for (let x = 1; x < resolution - 1; x += 1) {
                const index = z * resolution + x;
                let bestNeighbor = Infinity;
                let hasLowerNeighbor = false;
                for (const [dx, dz] of neighbors) {
                    const nx = x + dx;
                    const nz = z + dz;
                    const neighbor = effective[nz * resolution + nx];
                    bestNeighbor = Math.min(bestNeighbor, neighbor);
                    if (neighbor < effective[index]) {
                        hasLowerNeighbor = true;
                    }
                }
                if (!hasLowerNeighbor && Number.isFinite(bestNeighbor)) {
                    sinkMask[index] = 1;
                    effective[index] = bestNeighbor + 0.35;
                }
            }
        }
    }

    return { effective, sinkMask };
}

function computeSlopeAndRelief(heights, resolution, step) {
    const slope = new Float32Array(heights.length);
    const relief = new Float32Array(heights.length);
    for (let z = 0; z < resolution; z += 1) {
        for (let x = 0; x < resolution; x += 1) {
            const index = z * resolution + x;
            const center = heights[index];
            let minNeighbor = center;
            let maxNeighbor = center;
            const left = heights[z * resolution + Math.max(0, x - 1)];
            const right = heights[z * resolution + Math.min(resolution - 1, x + 1)];
            const up = heights[Math.max(0, z - 1) * resolution + x];
            const down = heights[Math.min(resolution - 1, z + 1) * resolution + x];
            minNeighbor = Math.min(minNeighbor, left, right, up, down);
            maxNeighbor = Math.max(maxNeighbor, left, right, up, down);
            slope[index] = Math.max(Math.abs(right - left), Math.abs(down - up)) / Math.max(1e-6, step * 2);
            relief[index] = maxNeighbor - minNeighbor;
        }
    }
    return { slope, relief };
}

function isBoundaryCell(index, resolution) {
    const x = index % resolution;
    const z = Math.floor(index / resolution);
    return x === 0 || z === 0 || x === resolution - 1 || z === resolution - 1;
}

function cleanupRiverPath(points, widths, step) {
    if (!Array.isArray(points) || !Array.isArray(widths) || points.length !== widths.length) {
        return { points: [], widths: [] };
    }

    const cleanedPoints = [];
    const cleanedWidths = [];
    const minSpacing = Math.max(1, step * 0.2);
    const minSpacingSq = minSpacing * minSpacing;

    for (let index = 0; index < points.length; index += 1) {
        const point = points[index];
        const width = widths[index];
        if (!Array.isArray(point) || point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
        if (!Number.isFinite(width)) continue;

        const roundedPoint = [Math.round(point[0]), Math.round(point[1])];
        const lastPoint = cleanedPoints[cleanedPoints.length - 1];
        if (lastPoint) {
            const dx = roundedPoint[0] - lastPoint[0];
            const dz = roundedPoint[1] - lastPoint[1];
            const distSq = dx * dx + dz * dz;
            if (distSq <= minSpacingSq) {
                cleanedWidths[cleanedWidths.length - 1] = Math.max(cleanedWidths[cleanedWidths.length - 1], Math.round(width));
                continue;
            }
        }

        cleanedPoints.push(roundedPoint);
        cleanedWidths.push(Math.round(width));
    }

    return { points: cleanedPoints, widths: cleanedWidths };
}

function buildHydrologyModel({ Noise, terrainExtent, config, ranges, offsets, islandProfile = null }) {
    const resolution = config.hydrology.resolution;
    const cellCount = resolution * resolution;
    const heights = new Float32Array(cellCount);
    const rangeMaskField = new Float32Array(cellCount);
    const glacialField = new Float32Array(cellCount);
    const canyonField = new Float32Array(cellCount);
    const basinField = new Float32Array(cellCount);
    const escarpmentField = new Float32Array(cellCount);
    const plateauField = new Float32Array(cellCount);
    const summitField = new Float32Array(cellCount);
    const exposureField = new Float32Array(cellCount);

    for (let index = 0; index < cellCount; index += 1) {
        const { wx, wz } = createRasterCoordinates(index, resolution, terrainExtent);
        const stage = sampleTerrainStage(wx, wz, Noise, config, offsets, ranges, terrainExtent, islandProfile);
        heights[index] = stage.baseHeight;
        rangeMaskField[index] = stage.rangeMask;
        glacialField[index] = stage.glacialMask;
        canyonField[index] = stage.canyonMask;
        basinField[index] = stage.basinMask;
        escarpmentField[index] = stage.escarpmentMask;
        plateauField[index] = stage.plateauMask;
        summitField[index] = stage.summitMask;
        exposureField[index] = stage.exposure;
    }

    const step = terrainExtent.maxDimension / (resolution - 1);
    const { slope, relief } = computeSlopeAndRelief(heights, resolution, step);
    const { effective, sinkMask } = fillDepressions(heights, resolution);

    const recipients = new Int32Array(cellCount).fill(-1);
    const accumulation = new Float32Array(cellCount).fill(1);
    const riverMask = new Float32Array(cellCount);
    const lakeMask = new Float32Array(cellCount);
    const moistureMask = new Float32Array(cellCount);
    const flowMask = new Float32Array(cellCount);
    const erosionMask = new Float32Array(cellCount);
    const gorgeMask = new Float32Array(cellCount);
    const floodplainMask = new Float32Array(cellCount);
    const cliffMask = new Float32Array(cellCount);
    const talusMask = new Float32Array(cellCount);
    const alpineMask = new Float32Array(cellCount);
    const wetlandMask = new Float32Array(cellCount);
    const terraceMask = new Float32Array(cellCount);
    const neighbors = [
        [-1, -1], [0, -1], [1, -1],
        [-1, 0], [1, 0],
        [-1, 1], [0, 1], [1, 1]
    ];

    for (let z = 0; z < resolution; z += 1) {
        for (let x = 0; x < resolution; x += 1) {
            const index = z * resolution + x;
            let bestIndex = -1;
            let bestHeight = effective[index];
            for (const [dx, dz] of neighbors) {
                const nx = x + dx;
                const nz = z + dz;
                if (nx < 0 || nx >= resolution || nz < 0 || nz >= resolution) continue;
                const nIndex = nz * resolution + nx;
                const nHeight = effective[nIndex];
                if (nHeight < bestHeight) {
                    bestHeight = nHeight;
                    bestIndex = nIndex;
                }
            }
            recipients[index] = bestIndex;
        }
    }

    const order = Array.from({ length: cellCount }, (_, index) => index)
        .sort((a, b) => effective[b] - effective[a]);

    for (const index of order) {
        const recipient = recipients[index];
        if (recipient >= 0) accumulation[recipient] += accumulation[index];
    }

    const peakAccumulation = order.reduce((best, index) => Math.max(best, accumulation[index]), 1);
    const peakHeight = order.reduce((best, index) => Math.max(best, heights[index]), -Infinity);
    const peakRelief = relief.reduce((best, value) => Math.max(best, value), 1);
    const rivers = [];
    const lakes = [];
    const maxRiverCount = config.hydrology.riverCount;
    const maxLakeCount = config.hydrology.lakeCount;
    const minRiverSourceHeight = 120;
    const minRiverAccumulation = 12;
    const minLakeAccumulation = 30;
    const maxRiverSteps = cellCount;
    const minRiverPoints = 4;
    const acceptedRiverByCell = new Int32Array(cellCount).fill(-1);
    const acceptedRiverPointIndexByCell = new Int32Array(cellCount).fill(-1);
    const riverSourceCandidates = order
        .filter(index => heights[index] >= minRiverSourceHeight && accumulation[index] >= minRiverAccumulation)
        .map(index => {
            const heightScore = clamp01(inverseLerp(minRiverSourceHeight, peakHeight, heights[index]));
            const flowScore = clamp01(accumulation[index] / peakAccumulation);
            const reliefScore = clamp01(relief[index] / Math.max(1, peakRelief));
            return {
                index,
                score: heightScore * 0.28 + flowScore * 0.5 + reliefScore * 0.22
            };
        })
        .sort((a, b) => b.score - a.score);

    for (const candidate of riverSourceCandidates) {
        if (rivers.length >= maxRiverCount) break;
        const index = candidate.index;
        if (acceptedRiverByCell[index] >= 0) continue;

        const points = [];
        const widths = [];
        const pathCells = [];
        const visited = new Set();
        let current = index;
        let steps = 0;
        let mergeRiverIndex = -1;
        let mergePointIndex = -1;
        let outlet = 'edge';

        while (current >= 0 && steps < maxRiverSteps) {
            if (visited.has(current)) {
                outlet = 'loop';
                break;
            }
            visited.add(current);

            const { gx, gz, wx, wz } = createRasterCoordinates(current, resolution, terrainExtent);
            const flow = clamp01(accumulation[current] / peakAccumulation);
            const width = Math.round(10 + Math.sqrt(accumulation[current]) * 2.6 * config.hydrology.riverStrength + flow * 20);
            points.push([wx, wz]);
            widths.push(width);
            pathCells.push(current);

            if (sinkMask[current] > 0) {
                outlet = 'lake';
                break;
            }

            if (acceptedRiverByCell[current] >= 0 && current !== index) {
                mergeRiverIndex = acceptedRiverByCell[current];
                mergePointIndex = acceptedRiverPointIndexByCell[current];
                outlet = 'merge';
                break;
            }

            if (heights[current] <= SEA_LEVEL + 6) {
                outlet = 'coast';
                break;
            }

            if (isBoundaryCell(current, resolution)) {
                outlet = 'edge';
                break;
            }

            const next = recipients[current];
            if (next < 0) {
                outlet = 'edge';
                break;
            }

            if (acceptedRiverByCell[next] >= 0) {
                const { wx: nx, wz: nz } = createRasterCoordinates(next, resolution, terrainExtent);
                const nextFlow = clamp01(accumulation[next] / peakAccumulation);
                const nextWidth = Math.round(10 + Math.sqrt(accumulation[next]) * 2.6 * config.hydrology.riverStrength + nextFlow * 20);
                points.push([nx, nz]);
                widths.push(nextWidth);
                mergeRiverIndex = acceptedRiverByCell[next];
                mergePointIndex = acceptedRiverPointIndexByCell[next];
                outlet = 'merge';
                break;
            }

            current = next;
            steps += 1;
        }

        if (steps >= maxRiverSteps && outlet === 'edge') {
            outlet = 'limit';
        }

        if (mergeRiverIndex >= 0 && mergePointIndex >= 0) {
            const mergedRiver = rivers[mergeRiverIndex];
            for (let tailIndex = mergePointIndex; tailIndex < mergedRiver.points.length; tailIndex += 1) {
                points.push(mergedRiver.points[tailIndex]);
                widths.push(mergedRiver.widths[tailIndex] ?? mergedRiver.width);
            }
        }

        const cleaned = cleanupRiverPath(points, widths, step);
        if (cleaned.points.length >= minRiverPoints) {
            const riverIndex = rivers.length;
            for (const cell of pathCells) {
                const { gx, gz } = createRasterCoordinates(cell, resolution, terrainExtent);
                const flow = clamp01(accumulation[cell] / peakAccumulation);
                const localSlope = slope[cell];
                const gorgeBias = clamp01(flow * smoothstep(0.08, 0.42, localSlope) * config.hydrology.gorgeStrength);
                paintDisc(riverMask, resolution, gx, gz, 1.15 + flow * 2.8, (0.3 + flow * 0.7) * config.hydrology.riverStrength);
                paintDisc(gorgeMask, resolution, gx, gz, 0.9 + flow * 1.6, gorgeBias);
                acceptedRiverByCell[cell] = riverIndex;
            }

            rivers.push({
                points: cleaned.points,
                widths: cleaned.widths,
                width: Math.max(...cleaned.widths),
                sourceHeight: Math.round(heights[index]),
                accumulation: Math.round(accumulation[index]),
                outlet
            });

            const river = rivers[riverIndex];
            for (let pointIndex = 0; pointIndex < river.points.length; pointIndex += 1) {
                const point = river.points[pointIndex];
                const gridX = Math.round((point[0] + terrainExtent.halfWidth) / Math.max(terrainExtent.width / (resolution - 1), 1e-6));
                const gridZ = Math.round((point[1] + terrainExtent.halfHeight) / Math.max(terrainExtent.height / (resolution - 1), 1e-6));
                if (gridX < 0 || gridX >= resolution || gridZ < 0 || gridZ >= resolution) continue;
                const cellIndex = gridZ * resolution + gridX;
                acceptedRiverByCell[cellIndex] = riverIndex;
                acceptedRiverPointIndexByCell[cellIndex] = pointIndex;
            }
        }
    }

    for (const index of order) {
        if (lakes.length >= maxLakeCount) break;
        if (!sinkMask[index]) continue;
        if (accumulation[index] < minLakeAccumulation) continue;
        const { gx, gz, wx, wz, step: cellStep } = createRasterCoordinates(index, resolution, terrainExtent);
        const radiusMeters = Math.round(cellStep * (1.3 + Math.sqrt(accumulation[index] / minLakeAccumulation)) * Math.max(0.35, config.hydrology.lakeStrength));
        const intensity = clamp01(accumulation[index] / peakAccumulation) * config.hydrology.lakeStrength;
        const filledLevel = Math.max(heights[index] + 1.5, effective[index] + 0.75 + intensity * 2.5);
        paintDisc(lakeMask, resolution, gx, gz, Math.max(1.6, radiusMeters / cellStep), intensity);
        lakes.push({
            x: Math.round(wx),
            z: Math.round(wz),
            radius: radiusMeters,
            level: Math.round(Math.max(SEA_LEVEL + 2, filledLevel)),
            accumulation: Math.round(accumulation[index])
        });
    }

    let cliffCoverage = 0;
    let gorgeCoverage = 0;
    let talusCoverage = 0;
    let floodplainCoverage = 0;

    for (let index = 0; index < cellCount; index += 1) {
        const flow = clamp01(accumulation[index] / peakAccumulation);
        const slopeNorm = clamp01(slope[index]);
        const reliefNorm = clamp01(relief[index] / 260);
        const erosion = clamp01(
            (flow * (0.65 + config.hydrology.incisionBias * 0.55)
                + slopeNorm * 0.35
                + rangeMaskField[index] * 0.18
                + canyonField[index] * 0.3)
            * config.hydrology.erosionStrength
        );
        erosionMask[index] = erosion;
        flowMask[index] = flow;

        const gorge = clamp01(
            Math.max(gorgeMask[index], flow * smoothstep(0.1, 0.44, slopeNorm) * reliefNorm * config.hydrology.gorgeStrength * (0.45 + canyonField[index] * 0.7))
        );
        gorgeMask[index] = gorge;

        const floodplain = clamp01(
            flow * (1 - smoothstep(0.06, 0.18, slopeNorm)) * (0.4 + basinField[index] * 0.25) * (0.35 + config.hydrology.floodplainWidth * 0.9)
        );
        floodplainMask[index] = floodplain;

        const moisture = clamp01(flow * 0.72 + lakeMask[index] * 0.82 + riverMask[index] * 0.55 + basinField[index] * 0.12);
        moistureMask[index] = moisture;

        const cliff = clamp01(
            Math.max(
                gorge * 0.85,
                smoothstep(config.hydrology.cliffThreshold, config.hydrology.cliffThreshold + 0.2, slopeNorm) * (0.45 + escarpmentField[index] * 0.75)
            )
        );
        cliffMask[index] = cliff;

        const talus = clamp01(
            smoothstep(config.hydrology.cliffThreshold * 0.65, config.hydrology.cliffThreshold + 0.08, slopeNorm)
            * (1 - cliff * 0.72)
            * (0.45 + reliefNorm * 0.55)
        );
        talusMask[index] = talus;

        const alpine = clamp01(smoothstep(280, 1100, heights[index]) * (0.5 + exposureField[index] * 0.5) + summitField[index] * 0.22);
        alpineMask[index] = alpine;

        const wetland = clamp01((moisture * 0.8 + floodplain * 0.65 + lakeMask[index] * 0.45) * (1 - smoothstep(0.08, 0.22, slopeNorm)));
        wetlandMask[index] = wetland;

        const terrace = clamp01(plateauField[index] * (1 - smoothstep(0.18, 0.38, slopeNorm)) * (0.35 + floodplain * 0.45));
        terraceMask[index] = terrace;

        cliffCoverage += cliff;
        gorgeCoverage += gorge;
        talusCoverage += talus;
        floodplainCoverage += floodplain;
    }

    return {
        resolution,
        heights,
        rangeMaskField,
        glacialField,
        canyonField,
        basinField,
        escarpmentField,
        plateauField,
        summitField,
        riverMask,
        lakeMask,
        moistureMask,
        flowMask,
        erosionMask,
        gorgeMask,
        floodplainMask,
        cliffMask,
        talusMask,
        alpineMask,
        wetlandMask,
        terraceMask,
        peakAccumulation,
        rivers,
        lakes,
        summary: {
            cliffCoverage: cliffCoverage / cellCount,
            gorgeCoverage: gorgeCoverage / cellCount,
            talusCoverage: talusCoverage / cellCount,
            floodplainCoverage: floodplainCoverage / cellCount,
            peakRelief: order.reduce((best, index) => Math.max(best, relief[index]), 0)
        }
    };
}

function getOverlayColor(overlayKind, value, heightValue, showContours) {
    if (overlayKind === 'rivers') {
        return [76, 177, 255, Math.round(180 * clamp01(value))];
    }
    if (overlayKind === 'lakes') {
        return [60, 132, 220, Math.round(190 * clamp01(value))];
    }
    if (overlayKind === 'moisture') {
        const rgb = colorRamp([
            { stop: 0, color: [124, 90, 68] },
            { stop: 0.4, color: [113, 142, 81] },
            { stop: 0.7, color: [65, 149, 121] },
            { stop: 1, color: [76, 177, 255] }
        ], value);
        return [rgb[0], rgb[1], rgb[2], 170];
    }
    if (overlayKind === 'flow') {
        const rgb = colorRamp([
            { stop: 0, color: [56, 58, 65] },
            { stop: 0.25, color: [88, 100, 120] },
            { stop: 0.6, color: [232, 170, 70] },
            { stop: 1, color: [255, 244, 214] }
        ], value);
        return [rgb[0], rgb[1], rgb[2], 170];
    }
    if (overlayKind === 'erosion') {
        const rgb = colorRamp([
            { stop: 0, color: [66, 67, 79] },
            { stop: 0.4, color: [135, 109, 74] },
            { stop: 0.75, color: [209, 137, 64] },
            { stop: 1, color: [255, 227, 164] }
        ], value);
        return [rgb[0], rgb[1], rgb[2], 180];
    }
    if (overlayKind === 'gorge') {
        const rgb = colorRamp([
            { stop: 0, color: [50, 60, 82] },
            { stop: 0.5, color: [90, 126, 170] },
            { stop: 1, color: [201, 234, 255] }
        ], value);
        return [rgb[0], rgb[1], rgb[2], 185];
    }
    if (overlayKind === 'cliff') {
        const rgb = colorRamp([
            { stop: 0, color: [70, 62, 56] },
            { stop: 0.5, color: [135, 116, 96] },
            { stop: 1, color: [230, 220, 200] }
        ], value);
        return [rgb[0], rgb[1], rgb[2], 185];
    }
    if (overlayKind === 'floodplain') {
        const rgb = colorRamp([
            { stop: 0, color: [88, 84, 70] },
            { stop: 0.5, color: [95, 138, 83] },
            { stop: 1, color: [186, 220, 126] }
        ], value);
        return [rgb[0], rgb[1], rgb[2], 175];
    }
    if (overlayKind === 'talus') {
        const rgb = colorRamp([
            { stop: 0, color: [77, 73, 67] },
            { stop: 0.6, color: [142, 130, 112] },
            { stop: 1, color: [222, 214, 202] }
        ], value);
        return [rgb[0], rgb[1], rgb[2], 175];
    }

    const heightT = clamp01((heightValue + 160) / 1450);
    let rgb = colorRamp([
        { stop: 0, color: [39, 77, 138] },
        { stop: 0.1, color: [79, 126, 89] },
        { stop: 0.32, color: [118, 150, 79] },
        { stop: 0.62, color: [120, 101, 74] },
        { stop: 0.82, color: [164, 154, 136] },
        { stop: 1, color: [250, 249, 245] }
    ], heightT);
    if (showContours) {
        const contour = Math.abs((heightValue % 120 + 120) % 120 - 60) < 4 ? 0.76 : 1;
        rgb = rgb.map(channel => Math.round(channel * contour));
    }
    return [rgb[0], rgb[1], rgb[2], 170];
}

export function createTerrainSynthesizer({
    Noise,
    worldSize = DEFAULT_WORLD_SIZE,
    config = {},
    authoredBounds = null,
    worldData = null,
    applyRunwayFlattening: shouldApplyRunwayFlattening = true
} = {}) {
    if (!Noise) {
        throw new Error('createTerrainSynthesizer requires a Noise implementation');
    }

    const resolvedConfig = normalizeTerrainGeneratorConfig({ ...config, preview: config.preview });
    const terrainExtent = normalizeTerrainExtent(worldSize, authoredBounds);
    const offsets = createSeedOffsets(resolvedConfig.seed);
    const islandProfile = authoredBounds ? createIslandProfile(resolvedConfig, terrainExtent) : null;
    const ranges = createRangeDefinitions(resolvedConfig, terrainExtent);
    const hydrology = buildHydrologyModel({
        Noise,
        terrainExtent,
        config: resolvedConfig,
        ranges,
        offsets,
        islandProfile
    });

    const authoredCenterX = authoredBounds ? (authoredBounds.minX + authoredBounds.maxX) * 0.5 : 0;
    const authoredCenterZ = authoredBounds ? (authoredBounds.minZ + authoredBounds.maxZ) * 0.5 : 0;

    function toLocalCoordinates(x, z) {
        if (!authoredBounds) return { x, z };
        return {
            x: x - authoredCenterX,
            z: z - authoredCenterZ
        };
    }

    function isWithinWorldBounds(localX, localZ) {
        return localX >= -terrainExtent.halfWidth
            && localX <= terrainExtent.halfWidth
            && localZ >= -terrainExtent.halfHeight
            && localZ <= terrainExtent.halfHeight;
    }

    function sampleMask(fieldName, x, z) {
        const field = hydrology[fieldName];
        if (!field) return 0;
        const local = toLocalCoordinates(x, z);
        return sampleRasterBilinear(field, terrainExtent, hydrology.resolution, local.x, local.z);
    }

    function sampleMasks(x, z) {
        return {
            river: sampleMask('riverMask', x, z),
            lake: sampleMask('lakeMask', x, z),
            moisture: sampleMask('moistureMask', x, z),
            flow: sampleMask('flowMask', x, z),
            erosion: sampleMask('erosionMask', x, z),
            gorge: sampleMask('gorgeMask', x, z),
            floodplain: sampleMask('floodplainMask', x, z),
            cliff: sampleMask('cliffMask', x, z),
            talus: sampleMask('talusMask', x, z),
            alpine: sampleMask('alpineMask', x, z),
            wetland: sampleMask('wetlandMask', x, z),
            terrace: sampleMask('terraceMask', x, z)
        };
    }

    function sampleBaseTerrain(x, z) {
        const local = toLocalCoordinates(x, z);
        if (!isWithinWorldBounds(local.x, local.z)) {
            return {
                baseHeight: -100,
                continentalShelf: 0,
                rangeMask: 0,
                massifMask: 0,
                glacialMask: 0,
                canyonMask: 0,
                basinMask: 0,
                escarpmentMask: 0,
                plateauMask: 0,
                shelfMask: 0,
                summitMask: 0,
                exposure: 0
            };
        }
        return sampleTerrainStage(local.x, local.z, Noise, resolvedConfig, offsets, ranges, terrainExtent, islandProfile);
    }

    function sampleHeight(x, z) {
        const stage = sampleBaseTerrain(x, z);
        const masks = sampleMasks(x, z);
        const riverCarve = masks.river * (12 + 36 * smoothstep(60, 760, stage.baseHeight)) * resolvedConfig.hydrology.erosionStrength;
        const gorgeCarve = masks.gorge * (18 + 54 * resolvedConfig.hydrology.gorgeStrength) * (0.65 + resolvedConfig.hydrology.incisionBias * 0.55);
        const floodplainCarve = masks.floodplain * 10 * (0.45 + resolvedConfig.hydrology.floodplainWidth);
        const wetlandSoftening = masks.wetland * 3;
        const height = stage.baseHeight - riverCarve - gorgeCarve - floodplainCarve - wetlandSoftening;
        if (!shouldApplyRunwayFlattening) return height;
        return applyAirportRunwayFlattening(height, x, z, worldData);
    }

    function sampleOverlay(x, z, overlayKind = resolvedConfig.preview.overlay) {
        if (overlayKind === 'height') {
            return clamp01((sampleHeight(x, z) + 160) / 1450);
        }
        if (overlayKind === 'rivers') return sampleMask('riverMask', x, z);
        if (overlayKind === 'lakes') return sampleMask('lakeMask', x, z);
        if (overlayKind === 'moisture') return sampleMask('moistureMask', x, z);
        if (overlayKind === 'flow') return sampleMask('flowMask', x, z);
        if (overlayKind === 'erosion') return sampleMask('erosionMask', x, z);
        if (overlayKind === 'gorge') return sampleMask('gorgeMask', x, z);
        if (overlayKind === 'cliff') return sampleMask('cliffMask', x, z);
        if (overlayKind === 'floodplain') return sampleMask('floodplainMask', x, z);
        if (overlayKind === 'talus') return sampleMask('talusMask', x, z);
        return clamp01((sampleHeight(x, z) + 160) / 1450);
    }

    function buildViewportPreview(bounds, {
        overlayKind = resolvedConfig.preview.overlay,
        resolution = resolvedConfig.preview.resolution,
        showContours = resolvedConfig.preview.showContours
    } = {}) {
        const width = Math.max(8, Math.round(resolution));
        const height = Math.max(8, Math.round(resolution));
        const pixels = new Uint8ClampedArray(width * height * 4);
        const metrics = {
            minHeight: Infinity,
            maxHeight: -Infinity,
            maxRelief: 0,
            riverCount: hydrology.rivers.length,
            lakeCount: hydrology.lakes.length,
            cliffCoverage: 0,
            gorgeCoverage: 0
        };

        for (let py = 0; py < height; py += 1) {
            for (let px = 0; px < width; px += 1) {
                const x = lerp(bounds.minX, bounds.maxX, width === 1 ? 0 : px / (width - 1));
                const z = lerp(bounds.minZ, bounds.maxZ, height === 1 ? 0 : py / (height - 1));
                const heightValue = sampleHeight(x, z);
                const overlayValue = sampleOverlay(x, z, overlayKind);
                const masks = sampleMasks(x, z);
                metrics.minHeight = Math.min(metrics.minHeight, heightValue);
                metrics.maxHeight = Math.max(metrics.maxHeight, heightValue);
                metrics.cliffCoverage += masks.cliff;
                metrics.gorgeCoverage += masks.gorge;
                const [r, g, b, a] = getOverlayColor(overlayKind, overlayValue, heightValue, showContours);
                const index = (py * width + px) * 4;
                pixels[index] = r;
                pixels[index + 1] = g;
                pixels[index + 2] = b;
                pixels[index + 3] = Math.round(a * 255);
            }
        }

        metrics.maxRelief = metrics.maxHeight - metrics.minHeight;
        metrics.cliffCoverage = metrics.cliffCoverage / (width * height);
        metrics.gorgeCoverage = metrics.gorgeCoverage / (width * height);

        return {
            width,
            height,
            pixels,
            metrics,
            bounds: { ...bounds },
            overlayKind
        };
    }

    function getMetadata() {
        return {
            worldSize,
            terrainExtent: {
                width: Math.round(terrainExtent.width),
                height: Math.round(terrainExtent.height)
            },
            terrainModel: {
                version: 2,
                kind: 'offline-synth-v2',
                preset: resolvedConfig.preset,
                seed: resolvedConfig.seed,
                hydrologyResolution: hydrology.resolution,
                rangeCount: resolvedConfig.macro.rangeCount
            },
            hydrology: {
                riverCount: hydrology.rivers.length,
                lakeCount: hydrology.lakes.length,
                rivers: hydrology.rivers,
                lakes: hydrology.lakes,
                lakeRenderingRequiresRuntimeSupport: hydrology.lakes.length > 0,
                summary: {
                    cliffCoverage: Number(hydrology.summary.cliffCoverage.toFixed(4)),
                    gorgeCoverage: Number(hydrology.summary.gorgeCoverage.toFixed(4)),
                    talusCoverage: Number(hydrology.summary.talusCoverage.toFixed(4)),
                    floodplainCoverage: Number(hydrology.summary.floodplainCoverage.toFixed(4)),
                    peakRelief: Math.round(hydrology.summary.peakRelief)
                }
            }
        };
    }

    return {
        config: resolvedConfig,
        hydrology,
        sampleBaseTerrain,
        sampleMasks,
        sampleHeight,
        sampleOverlay,
        buildViewportPreview,
        getMetadata
    };
}
