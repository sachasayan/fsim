import { applyTerrainEdits } from './TerrainEdits.js';
import { resolveTerrainRingLod } from '../LodSystem.js';
import { createTerrainSynthesizer, normalizeTerrainGeneratorConfig } from './TerrainSynthesis.js';
import { Noise } from '../../noise.js';

const NODE_BRANCH = 0;
const NODE_LEAF = 1;
const NODE_EMPTY = 2;
const LEAF_RESOLUTION = 32;
const MIN_ALTITUDE = -200;
const ALTITUDE_RANGE = 2000;

function decodeNodeType(type) {
    if (type === NODE_BRANCH) return 'branch';
    if (type === NODE_LEAF) return 'leaf';
    return 'empty';
}

function intersectsAabbBounds(a, b) {
    return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

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

            const dx = vx - centerX;
            const dz = vz - centerZ;
            const d = Math.sqrt(dx * dx + dz * dz);
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

export function getForestProfile(vx, vz, height, forestNoise, urbanScore, Noise, terrainMasks = null) {
    const moisture = (Noise.fractal(vx + 9000, vz - 7000, 3, 0.5, 0.0018) + 1) * 0.5;
    const heat = (Noise.fractal(vx - 12000, vz + 6000, 3, 0.5, 0.0012) + 1) * 0.5 - Math.max(0, height - 220) / 520;
    const wetland = clamp01(terrainMasks?.wetland || 0);
    const alpineMask = clamp01(terrainMasks?.alpine || 0);
    const talus = clamp01(terrainMasks?.talus || 0);
    const cliff = clamp01(terrainMasks?.cliff || 0);
    const moistureBoost = Math.min(1, moisture + wetland * 0.35);

    if (urbanScore > 0.35) {
        return {
            kind: 'parkland',
            density: 0.06,
            typeWeights: { broadleaf: 0.68, poplar: 0.24, dry: 0.08 }
        };
    }
    if (height > 280 || heat < 0.28 || alpineMask > 0.38) {
        return {
            kind: 'alpine',
            density: (0.05 + forestNoise * 0.05) * (1.0 - cliff * 0.65) * (1.0 - talus * 0.35),
            typeWeights: { poplar: 0.38, broadleaf: 0.2, dry: 0.42 }
        };
    }
    if (cliff > 0.55 || talus > 0.58) {
        return {
            kind: 'dry_scrub',
            density: (0.03 + forestNoise * 0.03) * (1.0 - cliff * 0.35),
            typeWeights: { dry: 0.66, broadleaf: 0.18, poplar: 0.16 }
        };
    }
    if (moistureBoost > 0.72) {
        return {
            kind: wetland > 0.4 ? 'dense_mixed' : 'dense_mixed',
            density: (0.16 + forestNoise * 0.1) * (1.0 + wetland * 0.25),
            typeWeights: wetland > 0.35
                ? { broadleaf: 0.8, poplar: 0.17, dry: 0.03 }
                : { broadleaf: 0.72, poplar: 0.2, dry: 0.08 }
        };
    }
    if (moistureBoost < 0.35) {
        return {
            kind: 'dry_scrub',
            density: 0.05 + forestNoise * 0.05,
            typeWeights: { dry: 0.58, broadleaf: 0.24, poplar: 0.18 }
        };
    }
    return {
        kind: 'temperate_mixed',
        density: (0.1 + forestNoise * 0.07) * (1.0 - cliff * 0.4),
        typeWeights: wetland > 0.25
            ? { broadleaf: 0.7, poplar: 0.24, dry: 0.06 }
            : { broadleaf: 0.62, poplar: 0.26, dry: 0.12 }
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
        this._nodeCache = new Map();
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

    getRootNode() {
        return this.getNode(0, 0);
    }

    getNode(nodeIdx, depth = null) {
        if (!Number.isInteger(nodeIdx) || nodeIdx < 0 || nodeIdx >= this.numNodes) {
            return null;
        }

        const cached = this._nodeCache.get(nodeIdx);
        if (cached) {
            if (depth !== null && cached.depth === null) {
                cached.depth = depth;
            }
            return cached;
        }

        const off = this.HEADER_SIZE + nodeIdx * this.NODE_SIZE;
        const rawType = this.view.getUint32(off, true);
        const minX = this.view.getFloat32(off + 4, true);
        const minZ = this.view.getFloat32(off + 8, true);
        const size = this.view.getFloat32(off + 12, true);
        const half = size * 0.5;
        const node = {
            id: nodeIdx,
            rawType,
            type: decodeNodeType(rawType),
            depth,
            minX,
            minZ,
            maxX: minX + size,
            maxZ: minZ + size,
            size,
            centerX: minX + half,
            centerZ: minZ + half,
            childIds: [],
            payloadOffset: null,
            avgHeight: null
        };

        if (rawType === NODE_BRANCH) {
            node.childIds = [
                this.view.getUint32(off + 16, true),
                this.view.getUint32(off + 20, true),
                this.view.getUint32(off + 24, true),
                this.view.getUint32(off + 28, true)
            ];
        } else if (rawType === NODE_LEAF) {
            node.payloadOffset = this.view.getUint32(off + 16, true);
            node.avgHeight = this.view.getFloat32(off + 20, true);
        } else {
            node.avgHeight = this.view.getFloat32(off + 16, true);
        }

        this._nodeCache.set(nodeIdx, node);
        return node;
    }

    getNodeChildren(nodeIdx, depth = null) {
        const node = this.getNode(nodeIdx, depth);
        if (!node || node.type !== 'branch') return [];
        return node.childIds.map((childId) => this.getNode(childId, node.depth === null ? null : node.depth + 1));
    }

    containsPoint(nodeIdx, wx, wz, depth = null) {
        const node = this.getNode(nodeIdx, depth);
        if (!node) return false;
        return wx >= node.minX && wx <= node.maxX && wz >= node.minZ && wz <= node.maxZ;
    }

    intersectsAabb(nodeIdx, minX, minZ, maxX, maxZ, depth = null) {
        const node = this.getNode(nodeIdx, depth);
        if (!node) return false;
        return intersectsAabbBounds(node, { minX, minZ, maxX, maxZ });
    }

    visitNodes(visitor, options = {}) {
        if (typeof visitor !== 'function') return;

        const {
            startNodeId = 0,
            maxDepth = Infinity,
            intersectsAabb = null,
            containsPoint = null,
            leavesOnly = false
        } = options;

        const stack = [startNodeId, 0];
        while (stack.length > 0) {
            const depth = stack.pop();
            const nodeId = stack.pop();
            const node = this.getNode(nodeId, depth);
            if (!node) continue;

            if (intersectsAabb && !this.intersectsAabb(nodeId, intersectsAabb.minX, intersectsAabb.minZ, intersectsAabb.maxX, intersectsAabb.maxZ, depth)) {
                continue;
            }
            if (containsPoint && !this.containsPoint(nodeId, containsPoint.x, containsPoint.z, depth)) {
                continue;
            }

            const shouldVisitNode = !leavesOnly || node.type !== 'branch' || depth >= maxDepth;
            if (shouldVisitNode) {
                const result = visitor(node, { depth });
                if (result === false) {
                    continue;
                }
            }

            if (node.type !== 'branch' || depth >= maxDepth) {
                continue;
            }

            for (let index = node.childIds.length - 1; index >= 0; index -= 1) {
                stack.push(node.childIds[index], depth + 1);
            }
        }
    }

    visitLeavesInRegion(region, visitor, options = {}) {
        if (!region || typeof visitor !== 'function') return;

        const {
            maxDepth = Infinity,
            minNodeSize = 0,
            startNodeId = 0
        } = options;
        const stack = [startNodeId, 0];

        while (stack.length > 0) {
            const depth = stack.pop();
            const nodeId = stack.pop();
            const node = this.getNode(nodeId, depth);
            if (!node || !this.intersectsAabb(nodeId, region.minX, region.minZ, region.maxX, region.maxZ, depth)) {
                continue;
            }

            const shouldStop = node.type !== 'branch'
                || depth >= maxDepth
                || node.size <= minNodeSize;

            if (shouldStop) {
                visitor(node, { depth });
                continue;
            }

            for (let index = node.childIds.length - 1; index >= 0; index -= 1) {
                stack.push(node.childIds[index], depth + 1);
            }
        }
    }

    mapNodeToChunkKeys(nodeIdx, chunkSize, depth = null) {
        const node = this.getNode(nodeIdx, depth);
        if (!node || !Number.isFinite(chunkSize) || chunkSize <= 0) return [];

        const minChunkX = Math.floor(node.minX / chunkSize);
        const maxChunkX = Math.ceil(node.maxX / chunkSize) - 1;
        const minChunkZ = Math.floor(node.minZ / chunkSize);
        const maxChunkZ = Math.ceil(node.maxZ / chunkSize) - 1;
        const keys = [];

        for (let cx = minChunkX; cx <= maxChunkX; cx += 1) {
            for (let cz = minChunkZ; cz <= maxChunkZ; cz += 1) {
                keys.push(`${cx}, ${cz}`);
            }
        }

        return keys;
    }

    getLeafHeightBlock(nodeIdx, depth = null) {
        const node = this.getNode(nodeIdx, depth);
        if (!node || node.type !== 'leaf' || !Number.isFinite(node.payloadOffset)) {
            return null;
        }

        const stride = LEAF_RESOLUTION + 1;
        return new Uint16Array(this.buffer, node.payloadOffset, stride * stride);
    }

    decodeLeafHeightSamples(nodeIdx, depth = null) {
        const node = this.getNode(nodeIdx, depth);
        if (!node) return null;

        const stride = LEAF_RESOLUTION + 1;
        if (node.type !== 'leaf') {
            return {
                resolution: 1,
                stride: 2,
                heights: new Float32Array([
                    node.avgHeight ?? 0,
                    node.avgHeight ?? 0,
                    node.avgHeight ?? 0,
                    node.avgHeight ?? 0
                ])
            };
        }

        const encoded = this.getLeafHeightBlock(nodeIdx, depth);
        if (!encoded) return null;
        const heights = new Float32Array(encoded.length);
        for (let index = 0; index < encoded.length; index += 1) {
            heights[index] = (encoded[index] / 65535) * ALTITUDE_RANGE + MIN_ALTITUDE;
        }

        return {
            resolution: LEAF_RESOLUTION,
            stride,
            heights
        };
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
        const stride = LEAF_RESOLUTION + 1;

        // Local relative coord [0, 1]
        const lx = (wx - nx) / size;
        const lz = (wz - nz) / size;

        const px = lx * LEAF_RESOLUTION;
        const pz = lz * LEAF_RESOLUTION;
        const x0 = Math.floor(px);
        const z0 = Math.floor(pz);
        const x1 = Math.min(LEAF_RESOLUTION, x0 + 1);
        const z1 = Math.min(LEAF_RESOLUTION, z0 + 1);
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
let _terrainModelSampler = null;
let _terrainModelSamplerKey = null;

function createSeededNoise(seed = 12345) {
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
        fade: Noise.fade,
        lerp: Noise.lerp,
        grad: Noise.grad,
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
        fractal: Noise.fractal
    };
    localNoise.init(seed);
    return localNoise;
}

function getRuntimeWorldMetadata() {
    return _staticWorldMetadata || ((typeof window !== 'undefined' && window?.fsimWorld) ? window.fsimWorld : null);
}

function getTerrainModelSampler() {
    const metadata = getRuntimeWorldMetadata();
    if (!metadata?.terrainGenerator) return null;
    const worldSize = _staticSampler?.worldSize || 50000;
    const config = normalizeTerrainGeneratorConfig(metadata.terrainGenerator);
    const key = JSON.stringify({
        worldSize,
        seed: config.seed,
        preset: config.preset,
        macro: config.macro,
        landforms: config.landforms,
        hydrology: config.hydrology
    });
    if (_terrainModelSampler && _terrainModelSamplerKey === key) {
        return _terrainModelSampler;
    }
    const seededNoise = createSeededNoise(config.seed);
    _terrainModelSampler = createTerrainSynthesizer({
        Noise: seededNoise,
        worldSize,
        config
    });
    _terrainModelSamplerKey = key;
    return _terrainModelSampler;
}

export function setStaticSampler(sampler) {
    _staticSampler = sampler;
    _staticWorldMetadata = sampler?.getMetadata?.() || null;
    _terrainModelSampler = null;
    _terrainModelSamplerKey = null;
}

export function getStaticSampler() {
    return _staticSampler;
}

export function getStaticWorldMetadata() {
    return _staticWorldMetadata;
}

export function getTerrainMaskSet(x, z) {
    const terrainModel = getTerrainModelSampler();
    if (terrainModel?.sampleMasks) {
        return terrainModel.sampleMasks(x, z);
    }
    const fallbackHeight = _staticSampler ? _staticSampler.getAltitudeAt(x, z) : 0;
    const alpine = fallbackHeight > 420 ? 1 : fallbackHeight > 260 ? 0.45 : 0;
    return {
        river: 0,
        lake: 0,
        moisture: 0,
        flow: 0,
        erosion: 0,
        gorge: 0,
        floodplain: 0,
        cliff: 0,
        talus: 0,
        alpine,
        wetland: 0,
        terrace: 0
    };
}

export function getTerrainHeight(x, z, Noise, octaves = 6) {
    let baseHeight;
    if (_staticSampler) {
        baseHeight = _staticSampler.getAltitudeAt(x, z);
    } else {
        // Fallback to noise if sampler isn't loaded yet
        const distFromRunwayZ = Math.abs(z);
        const distFromRunwayX = Math.abs(x);
        const noiseVal = Noise.fractal(x, z, octaves, 0.5, 0.0003) * 600 + 100;

        if (distFromRunwayX < 150 && distFromRunwayZ < 2500) {
            baseHeight = 0;
        } else if (distFromRunwayX < 600 && distFromRunwayZ < 3500) {
            const blendX = Math.max(0, (distFromRunwayX - 150) / 450);
            const blendZ = Math.max(0, (distFromRunwayZ - 2500) / 1000);
            const runwayMask = Math.min(1.0, Math.max(blendX, blendZ));
            baseHeight = noiseVal * runwayMask;
        } else {
            baseHeight = noiseVal;
        }
    }
    const fsimWorld = (typeof window !== 'undefined' && window?.fsimWorld) ? window.fsimWorld : null;
    return applyTerrainEdits(baseHeight, x, z, fsimWorld?.terrainEdits || []);
}

export function getLodForRingDistance(ringDistance, currentLod = null, terrainSettings = null) {
    return resolveTerrainRingLod(ringDistance, currentLod, terrainSettings);
}
