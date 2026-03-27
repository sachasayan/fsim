/**
 * bake-map.mjs — Recursive Quadtree World Baker
 * 
 * Generates an adaptive quadtree from procedural noise for the authored world area.
 * Areas with high complexity subdivide to capture detail, while flat areas are simplified.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_PATH = path.join(ROOT, 'world', 'world.bin');
const MAP_JSON_PATH = path.join(ROOT, 'tools', 'map.json');

import { readFileSync as readFileSyncSync } from 'node:fs';
import { applyTerrainEdits } from '../js/modules/world/terrain/TerrainEdits.js';
import { DEFAULT_WORLD_SIZE } from '../js/modules/world/WorldConfig.js';
import { createTerrainSynthesizer, normalizeTerrainGeneratorConfig } from '../js/modules/world/terrain/TerrainSynthesis.js';
import { createRegionalTerrainSampler } from '../js/modules/world/terrain/TerrainRegions.js';
import { buildDistrictRecords, normalizeMapData } from '../js/modules/world/MapDataUtils.js';
import { loadExistingTerrainSampler } from './lib/ExistingTerrainSampler.mjs';
let mapData = null;
try {
    mapData = normalizeMapData(JSON.parse(readFileSyncSync(MAP_JSON_PATH, 'utf8')));
    console.log(`📖 Loaded ${MAP_JSON_PATH} (${mapData.districts.length} districts)`);
} catch (e) {
    console.error(`⚠️ Could not load ${MAP_JSON_PATH}, using defaults.`);
}

const useExistingTerrain = process.env.FSIM_USE_EXISTING_TERRAIN === '1';
const clearTerrainEdits = process.env.FSIM_CLEAR_TERRAIN_EDITS === '1';
const existingTerrainSampler = useExistingTerrain ? loadExistingTerrainSampler(OUT_PATH) : null;
if (existingTerrainSampler) {
    console.log(`🗺️ Using existing baked terrain from ${OUT_PATH} as base`);
}

// ---------------------------------------------------------------------------
// Noise Implementation (Consistent with Engine)
// ---------------------------------------------------------------------------
const Noise = {
    permutation: new Uint8Array(512),
    init(seed = 12345) {
        let p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;
        let s = seed;
        for (let i = 255; i > 0; i--) {
            s = Math.imul(1664525, s) + 1013904223 | 0;
            let rand = Math.floor((((s >>> 8) & 0xfffff) / 0x100000) * (i + 1));
            let temp = p[i]; p[i] = p[rand]; p[rand] = temp;
        }
        for (let i = 0; i < 512; i++) this.permutation[i] = p[i & 255];
    },
    fade: (t) => t * t * t * (t * (t * 6 - 15) + 10),
    lerp: (t, a, b) => a + t * (b - a),
    grad(hash, x, y, z) {
        let h = hash & 15;
        let u = h < 8 ? x : y;
        let v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    },
    noise(x, y, z) {
        let X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
        x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
        let u = this.fade(x), v = this.fade(y), w = this.fade(z);
        let A = this.permutation[X] + Y, AA = this.permutation[A] + Z, AB = this.permutation[A + 1] + Z;
        let B = this.permutation[X + 1] + Y, BA = this.permutation[B] + Z, BB = this.permutation[B + 1] + Z;
        return this.lerp(w,
            this.lerp(v,
                this.lerp(u, this.grad(this.permutation[AA], x, y, z), this.grad(this.permutation[BA], x - 1, y, z)),
                this.lerp(u, this.grad(this.permutation[AB], x, y - 1, z), this.grad(this.permutation[BB], x - 1, y - 1, z))
            ),
            this.lerp(v,
                this.lerp(u, this.grad(this.permutation[AA + 1], x, y, z - 1), this.grad(this.permutation[BA + 1], x - 1, y, z - 1)),
                this.lerp(u, this.grad(this.permutation[AB + 1], x, y - 1, z - 1), this.grad(this.permutation[BB + 1], x - 1, y - 1, z - 1))
            )
        );
    },
    fractal(x, z, octaves, persistence, scale) {
        let total = 0, frequency = scale, amplitude = 1, maxValue = 0;
        for (let i = 0; i < octaves; i++) {
            total += this.noise(x * frequency, 0, z * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= 2;
        }
        return total / maxValue;
    }
};
Noise.init(12345);
const terrainSynthConfig = normalizeTerrainGeneratorConfig(mapData?.terrainGenerator);
const terrainSynthesizer = createTerrainSynthesizer({
    Noise,
    worldSize: DEFAULT_WORLD_SIZE,
    config: terrainSynthConfig
});
const terrainRegionSampler = createRegionalTerrainSampler({
    Noise,
    worldSize: DEFAULT_WORLD_SIZE,
    regions: mapData?.terrainRegions || []
});
const terrainMetadata = (mapData?.terrainRegions?.length || 0) > 0
    ? terrainRegionSampler.getMetadata()
    : terrainSynthesizer.getMetadata();

function getTerrainHeight(x, z) {
    if (existingTerrainSampler) {
        const baseHeight = existingTerrainSampler.getAltitudeAt(x, z);
        return applyTerrainEdits(baseHeight, x, z, mapData?.terrainEdits || []);
    }

    const baseHeight = terrainRegionSampler.sampleHeight(x, z);
    return applyTerrainEdits(baseHeight, x, z, mapData?.terrainEdits || []);
}

// ---------------------------------------------------------------------------
// Quadtree Configuration
// ---------------------------------------------------------------------------
const WORLD_SIZE = DEFAULT_WORLD_SIZE; // 100km
const MAX_DEPTH = 7;           // Keeps leaf nodes near the prior ~780m resolution
const LEAF_RES = 64;           // 65x65 grid
const VARIANCE_THRESHOLD = 8.0; // Subdivide if peak-to-valley > 8m
const MIN_ALTITUDE = -200;
const ALTITUDE_RANGE = 2000;

// Node Types
const NODE_BRANCH = 0;
const NODE_LEAF = 1;
const NODE_EMPTY = 2; // Flat or water (no data block)

class QuadNode {
    constructor(x, z, size, depth) {
        this.x = x;
        this.z = z;
        this.size = size;
        this.depth = depth;
        this.type = NODE_LEAF;
        this.children = null;
        this.data = null;
        this.avgHeight = 0;
    }
}

const allNodes = [];

function buildTreeRecursive(node) {
    allNodes.push(node);

    // 1. Sample corners and middle to check entropy
    let minH = Infinity;
    let maxH = -Infinity;
    let sumH = 0;
    const samples = 8;
    for (let sz = 0; sz <= samples; sz++) {
        for (let sx = 0; sx <= samples; sx++) {
            const wx = node.x + (sx / samples) * node.size;
            const wz = node.z + (sz / samples) * node.size;
            const h = getTerrainHeight(wx, wz);
            minH = Math.min(minH, h);
            maxH = Math.max(maxH, h);
            sumH += h;
        }
    }
    node.avgHeight = sumH / ((samples + 1) * (samples + 1));
    const variance = maxH - minH;

    // 2. Decide if we should subdivide
    if (node.depth < MAX_DEPTH && variance > VARIANCE_THRESHOLD) {
        node.type = NODE_BRANCH;
        const subSize = node.size / 2;
        node.children = [
            new QuadNode(node.x, node.z, subSize, node.depth + 1),
            new QuadNode(node.x + subSize, node.z, subSize, node.depth + 1),
            new QuadNode(node.x, node.z + subSize, subSize, node.depth + 1),
            new QuadNode(node.x + subSize, node.z + subSize, subSize, node.depth + 1)
        ];
        for (const child of node.children) buildTreeRecursive(child);
    }
    // 3. If it's a leaf, check if it can be NODE_EMPTY (extreme optimization)
    else if (variance < 0.2) {
        node.type = NODE_EMPTY;
    }
    // 4. Otherwise, bake the data block
    else {
        node.type = NODE_LEAF;
        const stride = LEAF_RES + 1;
        node.data = new Uint16Array(stride * stride);
        for (let sz = 0; sz <= LEAF_RES; sz++) {
            for (let sx = 0; sx <= LEAF_RES; sx++) {
                const wx = node.x + (sx / LEAF_RES) * node.size;
                const wz = node.z + (sz / LEAF_RES) * node.size;
                const h = getTerrainHeight(wx, wz);
                const normalized = (h - MIN_ALTITUDE) / ALTITUDE_RANGE;
                node.data[sz * stride + sx] = Math.max(0, Math.min(65535, Math.floor(normalized * 65535)));
            }
        }
    }
}

/**
 * Adaptive Quadtree Binary Format (QTRE v1)
 * ----------------------------------------
 * 
 * [Section 1: Header (32 bytes)]
 * 00-03: Magic Number 0x51545245 ("QTRE")
 * 04-07: Version (Uint32)
 * 08-11: World Size in Meters (Float32)
 * 12-15: Total Nodes in Tree (Uint32)
 * 16-19: Metadata Offset (Uint32) - Points to JSON block at end
 * 20-23: Metadata Size (Uint32)
 * 24-31: Reserved / Padding
 * 
 * [Section 2: Nodes Table (numNodes * 32 bytes)]
 * Each Node entry:
 * 00-03: Type (Uint32: 0=Branch, 1=Leaf, 2=Empty)
 * 04-11: World X, Z (2x Float32) - Center position
 * 12-15: World Size (Float32) - Size of this node's square
 * 16-31: Children or Data (depends on Type):
 *    Branch: indices of 4 children (4x Uint32)
 *    Leaf: Data Offset (Uint32) + Avg Height (Float32) + Pad(8)
 *    Empty: Avg Height (Float32) + Pad(12)
 * 
 * [Section 3: Leaf Data (Uint16 Blocks)]
 * Each Leaf node points to a 65x65 grid of Uint16 height values.
 * Values are normalized to [0, 65535] mapping from MIN_ALTITUDE to MAX_ALTITUDE.
 * 
 * [Section 4: Metadata (JSON String)]
 * UTF-8 encoded JSON string containing city data, seeds, and procedural zones.
 */
function serializeQuadtree(root) {
    const totalNodes = allNodes.length;
    // Serialization of Map JSON (Metadata)
    const metadataMap = mapData
        ? {
            ...mapData,
            worldSize: WORLD_SIZE,
            ...terrainMetadata,
            terrainEdits: clearTerrainEdits ? [] : (mapData.terrainEdits || []),
            terrainRegions: mapData.terrainRegions || [],
            districts: mapData.districts,
            districtRecords: buildDistrictRecords(mapData)
        }
        : {
            worldSize: WORLD_SIZE,
            ...terrainMetadata,
            terrainEdits: [],
            terrainRegions: [],
            districts: [],
            districtRecords: []
        };
    const metaStr = JSON.stringify(metadataMap);
    const metaBuffer = Buffer.from(metaStr, 'utf8');

    // NEW HEADER:
    // 0: Magic (4)
    // 4: Version (4)
    // 8: WorldSize (4)
    // 12: NumNodes (4)
    // 16: MetadataOffset (4)
    // 20: MetadataSize (4)
    // 24: Reserved/Padding (8)
    // Total Header = 32 bytes

    const NODE_ENTRY_SIZE = 32; // type(4), x(4), z(4), size(4), children[4](16) -- or dataOffset(4) + pad(12)
    const HEADER_SIZE = 32;
    const NODES_TABLE_OFF = HEADER_SIZE;
    const NODES_TABLE_SIZE = totalNodes * NODE_ENTRY_SIZE;
    const DATA_BLOCKS_OFF = NODES_TABLE_OFF + NODES_TABLE_SIZE;

    let leafCount = 0;
    for (const n of allNodes) if (n.type === NODE_LEAF) leafCount++;
    const dataSize = leafCount * (LEAF_RES + 1) * (LEAF_RES + 1) * 2;

    const METADATA_OFF = DATA_BLOCKS_OFF + dataSize;
    const TOTAL_SIZE = METADATA_OFF + metaBuffer.length;

    const buffer = new ArrayBuffer(TOTAL_SIZE);
    const view = new DataView(buffer);

    view.setUint32(0, 0x51545245, true); // "QTRE"
    view.setUint32(4, 1, true);
    view.setFloat32(8, WORLD_SIZE, true);
    view.setUint32(12, totalNodes, true);
    view.setUint32(16, METADATA_OFF, true);
    view.setUint32(20, metaBuffer.length, true);
    // Bytes 24-31 are reserved/padding, left as 0 by default in new ArrayBuffer

    let dataOff = DATA_BLOCKS_OFF;

    // To link nodes, we need their indices in the flat table
    const nodeToIndex = new Map();
    for (let i = 0; i < allNodes.length; i++) nodeToIndex.set(allNodes[i], i);

    for (let i = 0; i < allNodes.length; i++) {
        const node = allNodes[i];
        const off = HEADER_SIZE + i * NODE_ENTRY_SIZE;

        view.setUint32(off, node.type, true);
        view.setFloat32(off + 4, node.x, true);
        view.setFloat32(off + 8, node.z, true);
        view.setFloat32(off + 12, node.size, true);

        if (node.type === NODE_BRANCH) {
            for (let c = 0; c < 4; c++) {
                view.setUint32(off + 16 + c * 4, nodeToIndex.get(node.children[c]), true);
            }
        } else if (node.type === NODE_LEAF) {
            view.setUint32(off + 16, dataOff, true);
            view.setFloat32(off + 20, node.avgHeight, true); // Fallback for low detail

            const block = new Uint16Array(buffer, dataOff, node.data.length);
            block.set(node.data);
            dataOff += node.data.byteLength;
        } else {
            // NODE_EMPTY
            view.setFloat32(off + 16, node.avgHeight, true);
        }
    }

    // Write Metadata at the end
    const metaDest = new Uint8Array(buffer, METADATA_OFF, metaBuffer.length);
    metaDest.set(metaBuffer);

    return Buffer.from(buffer);
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------
console.log(`\n🌲 Baking Quadtree World: ${WORLD_SIZE}m x ${WORLD_SIZE}m`);
console.log(`   Threshold: ${VARIANCE_THRESHOLD}m, Max Depth: ${MAX_DEPTH}\n`);

const root = new QuadNode(-WORLD_SIZE / 2, -WORLD_SIZE / 2, WORLD_SIZE, 0);
buildTreeRecursive(root);

console.log(`✅ Tree built: ${allNodes.length} nodes total.`);
const leaves = allNodes.filter(n => n.type === NODE_LEAF).length;
const empty = allNodes.filter(n => n.type === NODE_EMPTY).length;
console.log(`   - Leaf Nodes (w/ Data): ${leaves}`);
console.log(`   - Empty Nodes (Flat): ${empty}`);

const binBuffer = serializeQuadtree(root);
mkdirSync(path.dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, binBuffer);

console.log(`\n💾 Wrote world.bin: ${(binBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`);
