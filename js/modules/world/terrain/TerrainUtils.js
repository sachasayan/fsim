import { applyTerrainEdits } from './TerrainEdits.js';

export function hash2(x, z, seed = 0) {
    const n = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453123;
    return n - Math.floor(n);
}

export function hash2Local(seed, k, p) {
    const n = Math.sin(seed * 127.1 + k * 311.7 + p * 74.7) * 43758.5453123;
    return n - Math.floor(n);
}

export function pickWeighted(value01, weights) {
    let sum = 0;
    for (const w of Object.values(weights)) sum += w;
    if (sum <= 0) return Object.keys(weights)[0];
    let t = value01 * sum;
    for (const [key, weight] of Object.entries(weights)) {
        t -= weight;
        if (t <= 0) return key;
    }
    return Object.keys(weights)[Object.keys(weights).length - 1];
}

export function cityHubInfluence(vx, vz) {
    const cellSize = 14000;
    const gx = Math.floor(vx / cellSize);
    const gz = Math.floor(vz / cellSize);
    let influence = 0;

    for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
            const cx = gx + ox;
            const cz = gz + oz;
            const hubChance = hash2(cx, cz, 1);
            if (hubChance < 0.35) continue;

            const centerX = (cx + 0.15 + hash2(cx, cz, 2) * 0.7) * cellSize;
            const centerZ = (cz + 0.15 + hash2(cx, cz, 3) * 0.7) * cellSize;
            const radius = 2600 + hash2(cx, cz, 4) * 5200;
            const intensity = 0.45 + hash2(cx, cz, 5) * 0.55;

            const d = Math.hypot(vx - centerX, vz - centerZ);
            const local = Math.max(0, 1 - d / radius) * intensity;
            influence = Math.max(influence, local);
        }
    }

    return influence;
}

export function getDistrictProfile(vx, vz, urbanScore, height) {
    const dx = Math.floor(vx / 3200);
    const dz = Math.floor(vz / 3200);
    const districtNoise = hash2(dx, dz, 40);
    const nearWater = height < 35;

    if (urbanScore > 0.78) {
        return {
            kind: 'financial_core',
            lotDensity: 0.22,
            classWeights: { supertall: 0.22, highrise: 0.44, office: 0.27, apartment: 0.07 }
        };
    }
    if (nearWater && urbanScore > 0.5) {
        return {
            kind: 'waterfront_mixed',
            lotDensity: 0.16,
            classWeights: { highrise: 0.2, office: 0.23, apartment: 0.33, townhouse: 0.2, industrial: 0.04 }
        };
    }
    if (districtNoise > 0.72 && urbanScore > 0.42) {
        return {
            kind: 'industrial_belt',
            lotDensity: 0.14,
            classWeights: { industrial: 0.54, office: 0.22, apartment: 0.1, townhouse: 0.14 }
        };
    }
    if (urbanScore > 0.52) {
        return {
            kind: 'mixed_use',
            lotDensity: 0.15,
            classWeights: { highrise: 0.18, office: 0.3, apartment: 0.34, townhouse: 0.14, industrial: 0.04 }
        };
    }
    return {
        kind: 'residential_ring',
        lotDensity: 0.12,
        classWeights: { apartment: 0.26, townhouse: 0.56, industrial: 0.18 }
    };
}

export function getForestProfile(vx, vz, height, forestNoise, urbanScore, Noise) {
    const moisture = (Noise.fractal(vx + 9000, vz - 7000, 3, 0.5, 0.0018) + 1) * 0.5;
    const heat = (Noise.fractal(vx - 12000, vz + 6000, 3, 0.5, 0.0012) + 1) * 0.5 - Math.max(0, height - 220) / 520;

    if (urbanScore > 0.35) {
        return {
            kind: 'parkland',
            density: 0.06,
            typeWeights: { broadleaf: 0.55, poplar: 0.35, conifer: 0.1 }
        };
    }
    if (height > 280 || heat < 0.28) {
        return {
            kind: 'alpine',
            density: 0.08 + forestNoise * 0.08,
            typeWeights: { conifer: 0.72, dry: 0.2, poplar: 0.08 }
        };
    }
    if (moisture > 0.66) {
        return {
            kind: 'dense_mixed',
            density: 0.16 + forestNoise * 0.1,
            typeWeights: { conifer: 0.46, broadleaf: 0.34, poplar: 0.2 }
        };
    }
    if (moisture < 0.35) {
        return {
            kind: 'dry_scrub',
            density: 0.05 + forestNoise * 0.05,
            typeWeights: { dry: 0.52, poplar: 0.18, broadleaf: 0.16, conifer: 0.14 }
        };
    }
    return {
        kind: 'temperate_mixed',
        density: 0.1 + forestNoise * 0.07,
        typeWeights: { broadleaf: 0.42, conifer: 0.35, poplar: 0.2, dry: 0.03 }
    };
}

/**
 * Sampler for the Adaptive Quadtree Map (world.bin)
 */
export class QuadtreeMapSampler {
    constructor(buffer) {
        this.buffer = buffer;
        this.view = new DataView(buffer);
        this.magic = this.view.getUint32(0, true);
        if (this.magic !== 0x51545245) throw new Error("Invalid QTRE magic");

        this.version = this.view.getUint32(4, true);
        this.worldSize = this.view.getFloat32(8, true);
        this.numNodes = this.view.getUint32(12, true);
        this.metaOff = this.view.getUint32(16, true);
        this.metaSize = this.view.getUint32(20, true);

        this.HEADER_SIZE = 32;
        this.NODE_SIZE = 32;
    }

    getMetadata() {
        if (this.metaSize === 0) return null;
        const decoder = new TextDecoder();
        const metaBuf = new Uint8Array(this.buffer, this.metaOff, this.metaSize);
        try {
            return JSON.parse(decoder.decode(metaBuf));
        } catch (e) {
            console.error("Failed to parse baked metadata", e);
            return null;
        }
    }

    getAltitudeAt(wx, wz) {
        const halfSize = this.worldSize / 2;
        if (wx < -halfSize || wx > halfSize || wz < -halfSize || wz > halfSize) return -100;

        // Start traversal from Root (Index 0)
        return this._sampleRecursive(0, wx, wz);
    }

    _sampleRecursive(nodeIdx, wx, wz) {
        const off = this.HEADER_SIZE + nodeIdx * this.NODE_SIZE;
        const type = this.view.getUint32(off, true);
        const nx = this.view.getFloat32(off + 4, true);
        const nz = this.view.getFloat32(off + 8, true);
        const size = this.view.getFloat32(off + 12, true);

        if (type === 0) { // NODE_BRANCH
            // Determine which quadrant based on wx, wz
            const half = size / 2;
            const right = wx >= nx + half;
            const bottom = wz >= nz + half;
            const childIdx = (bottom ? 2 : 0) + (right ? 1 : 0);
            const ptr = this.view.getUint32(off + 16 + childIdx * 4, true);
            return this._sampleRecursive(ptr, wx, wz);
        }

        if (type === 2) { // NODE_EMPTY
            return this.view.getFloat32(off + 16, true);
        }

        // NODE_LEAF
        const dataOff = this.view.getUint32(off + 16, true);
        const LEAF_RES = 32; // Hardcoded to match baker
        const stride = LEAF_RES + 1;

        // Local relative coord [0, 1]
        const lx = (wx - nx) / size;
        const lz = (wz - nz) / size;

        const px = lx * LEAF_RES;
        const pz = lz * LEAF_RES;
        const x0 = Math.floor(px);
        const z0 = Math.floor(pz);
        const x1 = Math.min(LEAF_RES, x0 + 1);
        const z1 = Math.min(LEAF_RES, z0 + 1);
        const fx = px - x0;
        const fz = pz - z0;

        const data = new Uint16Array(this.buffer, dataOff, stride * stride);

        const h00 = data[z0 * stride + x0];
        const h10 = data[z0 * stride + x1];
        const h01 = data[z1 * stride + x0];
        const h11 = data[z1 * stride + x1];

        // Bilinear mix
        const h0 = h00 * (1 - fx) + h10 * fx;
        const h1 = h01 * (1 - fx) + h11 * fx;
        const h = h0 * (1 - fz) + h1 * fz;

        // Denormalize (Map 0-65535 to -200 to 1800)
        return (h / 65535) * 2000 - 200;
    }
}

let _staticSampler = null;
let _staticWorldMetadata = null;
export function setStaticSampler(sampler) {
    _staticSampler = sampler;
    _staticWorldMetadata = sampler?.getMetadata?.() || null;
}

export function getStaticWorldMetadata() {
    return _staticWorldMetadata;
}

export function getTerrainHeight(x, z, Noise, octaves = 6) {
    if (_staticSampler) {
        return _staticSampler.getAltitudeAt(x, z);
    }

    // Fallback to noise if sampler isn't loaded yet
    let distFromRunwayZ = Math.abs(z);
    let distFromRunwayX = Math.abs(x);
    let noiseVal = Noise.fractal(x, z, octaves, 0.5, 0.0003) * 600 + 100;
    let baseHeight;

    if (distFromRunwayX < 150 && distFromRunwayZ < 2500) {
        baseHeight = 0;
    } else if (distFromRunwayX < 600 && distFromRunwayZ < 3500) {
        let blendX = Math.max(0, (distFromRunwayX - 150) / 450);
        let blendZ = Math.max(0, (distFromRunwayZ - 2500) / 1000);
        let runwayMask = Math.min(1.0, Math.max(blendX, blendZ));
        baseHeight = noiseVal * runwayMask;
    } else {
        baseHeight = noiseVal;
    }
    const fsimWorld = (typeof window !== 'undefined' && window?.fsimWorld) ? window.fsimWorld : null;
    return applyTerrainEdits(baseHeight, x, z, fsimWorld?.terrainEdits || []);
}

export function getLodForRingDistance(ringDistance, currentLod = null) {
    // Hysteresis band to avoid rapid LOD toggling near ring boundaries.
    if (currentLod === 0) {
        if (ringDistance <= 1) return 0;
        if (ringDistance <= 3) return 1;
        if (ringDistance <= 6) return 2;
        return 3;
    }
    if (currentLod === 1) {
        if (ringDistance <= 1) return 0;
        if (ringDistance <= 4) return 1;
        if (ringDistance <= 7) return 2;
        return 3;
    }
    if (currentLod === 2) {
        if (ringDistance <= 2) return 1;
        if (ringDistance <= 7) return 2;
        return 3;
    }
    if (currentLod === 3) {
        if (ringDistance <= 6) return 2;
        return 3;
    }

    if (ringDistance <= 1) return 0;
    if (ringDistance <= 3) return 1;
    if (ringDistance <= 6) return 2;
    return 3;
}
