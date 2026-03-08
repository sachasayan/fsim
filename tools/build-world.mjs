/**
 * build-world.mjs — Offline district layout compiler
 *
 * Reads tools/map.json, generates district building layouts, samples the
 * shared TerrainUtils height function, and serialises everything into compact
 * binary chunk files under world/chunks/<districtId>/.
 *
 * Usage:
 *   node tools/build-world.mjs
 */

import { readFileSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Noise } from '../js/modules/noise.js';
import { serializeChunk } from './lib/WorldBuilderSerial.mjs';
import { applyTerrainEdits } from '../js/modules/world/terrain/TerrainEdits.js';
import { buildDistrictRecords, normalizeMapData } from '../js/modules/world/MapDataUtils.js';
import { loadExistingTerrainSampler } from './lib/ExistingTerrainSampler.mjs';

Noise.init(12345);

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MAP_PATH = path.join(__dirname, 'map.json');
const OUT_DIR = path.join(ROOT, 'world', 'chunks');
const WORLD_BIN_PATH = path.join(ROOT, 'world', 'world.bin');
const existingTerrainSampler = process.env.FSIM_USE_EXISTING_TERRAIN === '1'
    ? loadExistingTerrainSampler(WORLD_BIN_PATH)
    : null;

if (existingTerrainSampler) {
    console.log(`🗺️ Using existing baked terrain from ${WORLD_BIN_PATH} as base`);
}

function getTerrainHeight(x, z) {
    if (existingTerrainSampler) {
        const baseHeight = existingTerrainSampler.getAltitudeAt(x, z);
        return applyTerrainEdits(baseHeight, x, z, mapData?.terrainEdits || []);
    }

    let distFromRunwayZ = Math.abs(z);
    let distFromRunwayX = Math.abs(x);
    let noiseVal = Noise.fractal(x, z, 6, 0.5, 0.0003) * 600 + 100;
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
    return applyTerrainEdits(baseHeight, x, z, mapData?.terrainEdits || []);
}

// ---------------------------------------------------------------------------
// Pseudo-random helpers
// ---------------------------------------------------------------------------
function seededRand(seed) {
    let s = (seed | 1) >>> 0;
    return function () {
        s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
        return (s >>> 0) / 0xFFFFFFFF;
    };
}

function hash2(x, z, seed = 0) {
    const n = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453123;
    return n - Math.floor(n);
}

function getDistrictSeed(city) {
    const [cx = 0, cz = 0] = city?.center || [0, 0];
    let h = 2166136261;
    const input = `${city?.id || 'district'}|${Math.round(cx)}|${Math.round(cz)}`;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) % 100000;
}

function getDistrictType(district) {
    return district?.district_type || district?.type || 'residential';
}

function getDistrictVertices(district) {
    if (district.points?.length >= 3) return district.points;
    if (!district.center || !district.radius) return [];
    const [cx, cz] = district.center;
    const r = district.radius;
    return [
        [cx - r, cz - r],
        [cx + r, cz - r],
        [cx + r, cz + r],
        [cx - r, cz + r]
    ];
}

function getCityBounds(city) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const district of city.districts || []) {
        for (const [x, z] of getDistrictVertices(district)) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
        }
    }
    if (!Number.isFinite(minX)) {
        const [cx, cz] = city.center;
        return { minX: cx - 600, maxX: cx + 600, minZ: cz - 600, maxZ: cz + 600 };
    }
    return { minX, maxX, minZ, maxZ };
}

function buildDistrictBlocks(city, blockSize = 260) {
    const { minX, maxX, minZ, maxZ } = getCityBounds(city);
    const blocks = [];
    for (let x = minX; x < maxX; x += blockSize) {
        for (let z = minZ; z < maxZ; z += blockSize) {
            const cx = x + blockSize * 0.5;
            const cz = z + blockSize * 0.5;
            if (distToCityFootprint(cx, cz, city) > 260) continue;
            blocks.push([
                [x, z],
                [Math.min(x + blockSize, maxX), z],
                [Math.min(x + blockSize, maxX), Math.min(z + blockSize, maxZ)],
                [x, Math.min(z + blockSize, maxZ)]
            ]);
        }
    }
    return blocks;
}

function getCityRadius(city) {
    const bounds = getCityBounds(city);
    return Math.max(
        Math.hypot(bounds.minX - city.center[0], bounds.minZ - city.center[1]),
        Math.hypot(bounds.minX - city.center[0], bounds.maxZ - city.center[1]),
        Math.hypot(bounds.maxX - city.center[0], bounds.minZ - city.center[1]),
        Math.hypot(bounds.maxX - city.center[0], bounds.maxZ - city.center[1]),
        600
    );
}

function isPointInDistrict(x, z, district) {
    if (district.points?.length >= 3) return isPointInPolygon(x, z, district.points);
    if (district.center && district.radius) return Math.hypot(x - district.center[0], z - district.center[1]) <= district.radius;
    return false;
}

function distToDistrict(x, z, district) {
    if (district.points?.length >= 3) {
        if (isPointInPolygon(x, z, district.points)) return 0;
        return distToPolygon(x, z, district.points);
    }
    if (district.center && district.radius) {
        return Math.max(0, Math.hypot(x - district.center[0], z - district.center[1]) - district.radius);
    }
    return Infinity;
}

function distToCityFootprint(x, z, city) {
    let minDist = Infinity;
    for (const district of city.districts || []) {
        minDist = Math.min(minDist, distToDistrict(x, z, district));
    }
    return minDist;
}

function getDistrictBounds(district) {
    const vertices = getDistrictVertices(district);
    if (vertices.length === 0) {
        const [cx, cz] = Array.isArray(district.center) ? district.center : [0, 0];
        const r = Number.isFinite(district.radius) ? district.radius : 0;
        return { minX: cx - r, maxX: cx + r, minZ: cz - r, maxZ: cz + r };
    }

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of vertices) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
    }
    return { minX, maxX, minZ, maxZ };
}

function buildIndustrialQuadSubdivisions(city, maxArea = 400_000) {
    const district = city.districts?.[0] || null;
    if (!district) return [];
    const bounds = getDistrictBounds(district);

    const quads = [];
    const queue = [{
        minX: bounds.minX,
        maxX: bounds.maxX,
        minZ: bounds.minZ,
        maxZ: bounds.maxZ
    }];

    while (queue.length > 0) {
        const quad = queue.pop();
        const width = quad.maxX - quad.minX;
        const depth = quad.maxZ - quad.minZ;
        const area = width * depth;

        if (area <= maxArea) {
            quads.push([
                [quad.minX, quad.minZ],
                [quad.maxX, quad.minZ],
                [quad.maxX, quad.maxZ],
                [quad.minX, quad.maxZ]
            ]);
            continue;
        }

        const midX = (quad.minX + quad.maxX) * 0.5;
        const midZ = (quad.minZ + quad.maxZ) * 0.5;
        queue.push(
            { minX: quad.minX, maxX: midX, minZ: quad.minZ, maxZ: midZ },
            { minX: midX, maxX: quad.maxX, minZ: quad.minZ, maxZ: midZ },
            { minX: quad.minX, maxX: midX, minZ: midZ, maxZ: quad.maxZ },
            { minX: midX, maxX: quad.maxX, minZ: midZ, maxZ: quad.maxZ }
        );
    }

    return quads;
}

function buildRoadSegmentsFromIndustrialQuads(quads) {
    const seen = new Set();
    const segments = [];
    const halfWidth = ROAD_WIDTHS.collector / 2;
    const classId = 1; // collector
    const roundKey = n => Math.round(n * 1000) / 1000;
    const edgeKey = (x1, z1, x2, z2) => {
        const a = `${roundKey(x1)},${roundKey(z1)}`;
        const b = `${roundKey(x2)},${roundKey(z2)}`;
        return a < b ? `${a}|${b}` : `${b}|${a}`;
    };

    for (const quad of quads) {
        const edges = [
            [quad[0][0], quad[0][1], quad[1][0], quad[1][1]],
            [quad[1][0], quad[1][1], quad[2][0], quad[2][1]],
            [quad[2][0], quad[2][1], quad[3][0], quad[3][1]],
            [quad[3][0], quad[3][1], quad[0][0], quad[0][1]],
        ];
        for (const [x1, z1, x2, z2] of edges) {
            const key = edgeKey(x1, z1, x2, z2);
            if (seen.has(key)) continue;
            seen.add(key);
            const y1 = getTerrainHeight(x1, z1);
            const y2 = getTerrainHeight(x2, z2);
            segments.push({ x1, y1, z1, x2, y2, z2, halfWidth, classId });
        }
    }

    return segments;
}

// ---------------------------------------------------------------------------
// V2 Organic Grid Generation (Perlin-warped Manhattan grid)
// ---------------------------------------------------------------------------
function generateCityGrid(city) {
    const cx = city.center[0];
    const cz = city.center[1];
    const radius = getCityRadius(city);
    const bounds = getCityBounds(city);
    const seed = getDistrictSeed(city);
    const rng = seededRand(seed * 9999 + cx * 293 + cz);
    const blockSize = 130; // 130m standard block size
    const steps = Math.ceil(radius / blockSize) + 1;

    const nodes = [];
    const edges = [];
    const arterialSegments = [];

    // 1. Generate Arterial Backbone FIRST
    if (city.districts) {
        for (const d of city.districts) {
            if (getDistrictType(d) === 'financial_core' || (d.center[0] === cx && d.center[1] === cz)) continue;

            const dx = d.center[0] - cx;
            const dz = d.center[1] - cz;
            const dist = Math.hypot(dx, dz);
            if (dist === 0) continue;

            let currX = cx;
            let currZ = cz;
            let lastNodeIdx = -1;

            const stepSize = blockSize * 1.5;
            const numSteps = Math.ceil(dist / stepSize);
            const dirX = (dx / dist) * stepSize;
            const dirZ = (dz / dist) * stepSize;

            for (let s = 0; s <= numSteps; s++) {
                nodes.push([currX, currZ]);
                const currIdx = nodes.length - 1;
                if (lastNodeIdx !== -1) {
                    const seg = [lastNodeIdx, currIdx];
                    edges.push(seg);
                    arterialSegments.push({ x1: nodes[seg[0]][0], z1: nodes[seg[0]][1], x2: nodes[seg[1]][0], z2: nodes[seg[1]][1] });
                }

                lastNodeIdx = currIdx;
                currX += dirX + (rng() - 0.5) * blockSize * 0.2; // tighter arterials
                currZ += dirZ + (rng() - 0.5) * blockSize * 0.2;
            }
        }
    }

    const grid = [];
    for (let i = 0; i <= steps * 2 + 1; i++) grid[i] = [];

    // 2. Generate Local Grid Nodes
    for (let ix = -steps; ix <= steps; ix++) {
        for (let iz = -steps; iz <= steps; iz++) {
            const ux = cx + ix * blockSize;
            const uz = cz + iz * blockSize;

            const distWeights = getDistrictWeights(ux, uz, city);
            let maxWeight = 0;
            let primaryDistrict = 'residential';
            for (const [k, w] of Object.entries(distWeights)) {
                if (w > maxWeight) { maxWeight = w; primaryDistrict = k; }
            }

            let warpFactor = 0.45;
            if (primaryDistrict === 'financial_core') warpFactor = 0.0;
            else if (primaryDistrict === 'commercial') warpFactor = 0.1;
            else if (primaryDistrict === 'industrial') warpFactor = 0.15;
            else if (primaryDistrict === 'suburban') warpFactor = 0.8; // increased suburban warp

            const warpX = (hash2(ux, uz, 1) - 0.5) * blockSize * warpFactor;
            const warpZ = (hash2(ux, uz, 2) - 0.5) * blockSize * warpFactor;

            const px = ux + warpX;
            const pz = uz + warpZ;

            if (px < bounds.minX - 450 || px > bounds.maxX + 450 || pz < bounds.minZ - 450 || pz > bounds.maxZ + 450) {
                grid[ix + steps][iz + steps] = -1;
                continue;
            }
            if (distToCityFootprint(px, pz, city) > 350) {
                grid[ix + steps][iz + steps] = -1;
                continue;
            }

            nodes.push([px, pz]);
            grid[ix + steps][iz + steps] = nodes.length - 1;
        }
    }

    const blocks = [];

    // 3. Connect Local Grid with Arterial Hierarchy
    for (let ix = -steps; ix < steps; ix++) {
        for (let iz = -steps; iz < steps; iz++) {
            const nBL = grid[ix + steps][iz + steps];
            const nBR = grid[ix + 1 + steps][iz + steps];
            const nTL = grid[ix + steps][iz + 1 + steps];
            const nTR = grid[ix + 1 + steps][iz + 1 + steps];

            const tryAdd = (i1, i2) => {
                if (i1 === -1 || i1 === undefined || i2 === -1 || i2 === undefined) return;

                const p1 = nodes[i1], p2 = nodes[i2];
                // Check if this local edge crosses any arterial
                let crossing = false;
                for (const art of arterialSegments) {
                    if (lineIntersect(p1[0], p1[1], p2[0], p2[1], art.x1, art.z1, art.x2, art.z2)) {
                        crossing = true; break;
                    }
                }

                if (!crossing) {
                    const distWeights = getDistrictWeights(p1[0], p1[1], city);
                    let primaryDistrict = 'residential';
                    let maxWeight = 0;
                    for (const [k, w] of Object.entries(distWeights)) {
                        if (w > maxWeight) { maxWeight = w; primaryDistrict = k; }
                    }

                    let dropChance = 0;
                    if (primaryDistrict === 'suburban') dropChance = 0.45;
                    else if (primaryDistrict === 'residential') dropChance = 0.2;

                    if (rng() > dropChance) edges.push([i1, i2]);
                }
            };

            tryAdd(nBL, nBR);
            tryAdd(nBL, nTL);
            if (ix === steps - 1) tryAdd(nBR, nTR);
            if (iz === steps - 1) tryAdd(nTL, nTR);

            // Add block if all 4 corners exist
            if (nBL !== -1 && nBR !== -1 && nTL !== -1 && nTR !== -1 &&
                nBL !== undefined && nBR !== undefined && nTL !== undefined && nTR !== undefined) {
                blocks.push([nodes[nBL], nodes[nBR], nodes[nTR], nodes[nTL]]);
            }
        }
    }

    return { nodes, edges, blocks };
}

// For each edge mid-point, classify road type based on urban intensity
function classifyRoad(s1, s2, city) {
    const mx = (s1[0] + s2[0]) / 2, mz = (s1[1] + s2[1]) / 2;
    const d = Math.hypot(mx - city.center[0], mz - city.center[1]);
    const ratio = d / getCityRadius(city);
    if (ratio < 0.2) return 'arterial';    // wide inner ring roads
    if (ratio < 0.55) return 'collector';  // mid-tier roads
    return 'local';                         // narrow suburban roads
}

const ROAD_WIDTHS = { arterial: 14, collector: 9, local: 5.5 };

// ---------------------------------------------------------------------------
// Geometry Helpers
// ---------------------------------------------------------------------------
function isPointInPolygon(x, z, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = points[i][0], zi = points[i][1];
        const xj = points[j][0], zj = points[j][1];
        const intersect = ((zi > z) !== (zj > z)) &&
            (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function distToSegment(px, pz, x1, z1, x2, z2) {
    const dx = x2 - x1, dz = z2 - z1;
    const l2 = dx * dx + dz * dz;
    if (l2 === 0) return Math.hypot(px - x1, pz - z1);
    let t = ((px - x1) * dx + (pz - z1) * dz) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), pz - (z1 + t * dz));
}

function distToPolygon(px, pz, points) {
    let minDist = Infinity;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const d = distToSegment(px, pz, points[i][0], points[i][1], points[j][0], points[j][1]);
        minDist = Math.min(minDist, d);
    }
    return minDist;
}

function lineIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
    if (denom === 0) return null;
    const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
    const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
    if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
        return { x: x1 + ua * (x2 - x1), y: y1 + ua * (y2 - y1) };
    }
    return null;
}

// ---------------------------------------------------------------------------
// District lookup
// ---------------------------------------------------------------------------
const DISTRICT_CLASS_WEIGHTS = {
    financial_core: { supertall: 0.22, highrise: 0.44, office: 0.27, apartment: 0.07 },
    commercial: { highrise: 0.18, office: 0.38, apartment: 0.30, townhouse: 0.14 },
    residential: { apartment: 0.25, townhouse: 0.65, industrial: 0.10 },
    industrial: { industrial: 0.65, office: 0.15, apartment: 0.08, townhouse: 0.12 },
    suburban: { townhouse: 0.75, apartment: 0.15, industrial: 0.10 },
};

// District-specific roof color palettes (mapped to 4-slot building color index)
// Financial: Whites/Grays, Commercial: Modern/Blue, Industrial: Rusty/Dark, Suburb: Earthy
const DISTRICT_PALETTES = {
    financial_core: [0, 1, 0, 1],
    commercial: [1, 2, 0, 1],
    industrial: [3, 3, 2, 3],
    residential: [2, 0, 3, 2],
    suburban: [2, 3, 2, 3],
};

const CLASS_HEIGHT = {
    supertall: [180, 380], highrise: [80, 190], office: [35, 90],
    apartment: [18, 48], townhouse: [8, 16], industrial: [10, 24],
};
const CLASS_WIDTH = {
    supertall: [24, 42], highrise: [18, 30], office: [14, 26],
    apartment: [12, 20], townhouse: [7, 12], industrial: [18, 34],
};
const CLASS_DEPTH = {
    supertall: [24, 42], highrise: [16, 28], office: [12, 24],
    apartment: [10, 18], townhouse: [8, 13], industrial: [16, 30],
};
const CLASS_IDS = ['supertall', 'highrise', 'office', 'apartment', 'townhouse', 'industrial'];

function pickWeighted(rng, weights) {
    const keys = Object.keys(weights);
    let total = keys.reduce((s, k) => s + weights[k], 0);
    let v = rng() * total;
    for (const k of keys) { v -= weights[k]; if (v <= 0) return k; }
    return keys[keys.length - 1];
}

function getDistrictWeights(x, z, city) {
    const weights = {};
    let totalWeight = 0;
    for (const d of city.districts) {
        let w = 0;
        if (d.points) {
            const inside = isPointInPolygon(x, z, d.points);
            if (inside) {
                w = 1.0;
            } else {
                const dist = distToPolygon(x, z, d.points);
                w = 1.0 / (1.0 + Math.pow(dist / 200, 2)); // 200m falloff for polygons
            }
        } else {
            const dist = Math.hypot(x - d.center[0], z - d.center[1]);
            w = 1.0 / (1.0 + Math.pow(dist / d.radius, 2));
        }
        const districtType = getDistrictType(d);
        weights[districtType] = (weights[districtType] || 0) + w;
        totalWeight += w;
    }
    // Normalize weights
    if (totalWeight > 0) {
        for (const type in weights) weights[type] /= totalWeight;
    }
    return weights || { residential: 1 };
}

function getUrbanIntensity(x, z, city) {
    // Basic city center intensity
    const dist = Math.hypot(x - city.center[0], z - city.center[1]);
    const cityBaseNorm = Math.max(0, 1.0 - dist / getCityRadius(city));

    // Add specific boosts for core districts
    let coreBoost = 0;
    for (const d of city.districts) {
        const districtType = getDistrictType(d);
        if (districtType !== 'financial_core' && districtType !== 'commercial') continue;
        let dNorm = 0;
        if (d.points) {
            const inside = isPointInPolygon(x, z, d.points);
            if (inside) {
                dNorm = 1.0;
            } else {
                const distToE = distToPolygon(x, z, d.points);
                dNorm = Math.max(0, 1.0 - distToE / 300); // 300m linear falloff
            }
        } else {
            const dDist = Math.hypot(x - d.center[0], z - d.center[1]);
            dNorm = Math.max(0, 1.0 - dDist / d.radius);
        }
        coreBoost = Math.max(coreBoost, dNorm);
    }

    return Math.min(1.0, cityBaseNorm * 0.4 + coreBoost * 0.8);
}

// ---------------------------------------------------------------------------
// Building placement — populate city blocks with buildings
function placeBuildingsInCity(city, roads, blocks) {
    const buildings = []; // {x, y, z, w, h, d, angle, classId, colorIdx}
    const { center } = city;
    const radius = getCityRadius(city);
    const rng = seededRand(getDistrictSeed(city) * 31337);

    // PASS 1: Standard Grid Infilling
    for (const block of blocks) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        let cx = 0, cz = 0;
        for (const p of block) {
            minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
            minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]);
            cx += p[0]; cz += p[1];
        }
        cx /= 4; cz /= 4;

        if (distToCityFootprint(cx, cz, city) > 220) continue;

        const cellIntensity = getUrbanIntensity(cx, cz, city);
        let lotStep = 45 - (cellIntensity * 30);
        let spawnChance = 0.5 + (cellIntensity * 0.45);

        // Skyline Clustering Hubs
        const hubs = [];
        for (const dist of city.districts) {
            if (getDistrictType(dist) === 'financial_core') hubs.push(dist.center);
        }

        const stepsX = Math.ceil((maxX - minX) / lotStep);
        const stepsZ = Math.ceil((maxZ - minZ) / lotStep);

        for (let ix = 0; ix <= stepsX; ix++) {
            for (let iz = 0; iz <= stepsZ; iz++) {
                const bx = minX + ix * lotStep + (rng() - 0.5) * (8 - cellIntensity * 6);
                const bz = minZ + iz * lotStep + (rng() - 0.5) * (8 - cellIntensity * 6);

                if (distToCityFootprint(bx, bz, city) > 180) continue;
                if (Math.abs(bx - cx) + Math.abs(bz - cz) > Math.abs(maxX - minX)) continue;

                const parkNoise = hash2(bx, bz, 777);
                if (cellIntensity > 0.4 && parkNoise > 0.88) continue;

                const distWeights = getDistrictWeights(bx, bz, city);
                const primaryDistrict = pickWeighted(rng, distWeights);
                const classWeights = DISTRICT_CLASS_WEIGHTS[primaryDistrict] || DISTRICT_CLASS_WEIGHTS.residential;
                const classIdStr = pickWeighted(rng, classWeights);
                const classId = CLASS_IDS.indexOf(classIdStr);

                const w = CLASS_WIDTH[classIdStr][0] + rng() * (CLASS_WIDTH[classIdStr][1] - CLASS_WIDTH[classIdStr][0]);
                const d = CLASS_DEPTH[classIdStr][0] + rng() * (CLASS_DEPTH[classIdStr][1] - CLASS_DEPTH[classIdStr][0]);
                let h = CLASS_HEIGHT[classIdStr][0] + rng() * (CLASS_HEIGHT[classIdStr][1] - CLASS_HEIGHT[classIdStr][0]);

                // Hub-based Skyline Clustering
                let hubBoost = 0;
                for (const hub of hubs) {
                    const dHub = Math.hypot(bx - hub[0], bz - hub[1]);
                    hubBoost = Math.max(hubBoost, Math.pow(Math.max(0, 1.0 - dHub / 1000), 2.0));
                }
                const skylineFalloff = Math.pow(Math.max(0, 1.0 - Math.hypot(bx - center[0], bz - center[1]) / (radius * 0.85)), 1.5);
                h *= (0.4 + skylineFalloff * 0.8 + hubBoost * 1.5);

                let onRoad = false;
                const buildingRadius = Math.hypot(w, d) / 2;
                const visualRoadScale = 2.5;
                const sidewalkMargin = 1.2;

                let bestRoadDist = Infinity;
                let bestRoadAngle = 0;
                let refSeg = null;

                for (const seg of roads) {
                    const { x1, z1, x2, z2, halfWidth } = seg;
                    const dx = x2 - x1, dz = z2 - z1;
                    const len2 = dx * dx + dz * dz;
                    if (len2 === 0) continue;

                    let t = ((bx - x1) * dx + (bz - z1) * dz) / len2;
                    t = Math.max(0, Math.min(1, t));
                    const nx = (x1 + t * dx) - bx, nz = (z1 + t * dz) - bz;
                    const d2 = nx * nx + nz * nz;

                    if (d2 < bestRoadDist) {
                        bestRoadDist = d2;
                        bestRoadAngle = Math.atan2(dz, dx);
                        refSeg = seg;
                    }

                    const collisionDist = (halfWidth * visualRoadScale) + buildingRadius + sidewalkMargin;
                    if (d2 < collisionDist * collisionDist) {
                        onRoad = true;
                        break;
                    }
                }

                if (onRoad) continue;
                if (rng() > spawnChance) continue;

                let lx = bx, lz = bz;
                if (primaryDistrict === 'residential' || primaryDistrict === 'suburban') {
                    const frontageOffset = 22 + rng() * 12;
                    const roadVisualRadius = refSeg ? refSeg.halfWidth * visualRoadScale : 0;
                    const pull = Math.max(0, Math.sqrt(bestRoadDist) - (frontageOffset + roadVisualRadius));
                    const actualPull = Math.min(pull * 0.8, 45.0);
                    if (refSeg) {
                        const angleToRoad = Math.atan2((refSeg.z1 + refSeg.z2) / 2 - lz, (refSeg.x1 + refSeg.x2) / 2 - lx);
                        lx += Math.cos(angleToRoad) * actualPull;
                        lz += Math.sin(angleToRoad) * actualPull;
                    }
                }

                const groundY = getTerrainHeight(lx, lz);
                if (groundY < 2.0 || groundY > 430) continue;

                const roadRelativeAngle = (primaryDistrict === 'suburban' || primaryDistrict === 'residential')
                    ? bestRoadAngle + (rng() > 0.5 ? 0 : Math.PI)
                    : bestRoadAngle + (Math.floor(rng() * 4) * (Math.PI / 2));

                const palette = DISTRICT_PALETTES[primaryDistrict] || DISTRICT_PALETTES.residential;
                const colorIdx = palette[Math.floor(rng() * 4)];

                buildings.push({ x: lx, y: groundY, z: lz, w, h, d, angle: roadRelativeAngle, classId, colorIdx });
            }
        }

        // PASS 2: Back-Lotting (fill center of block if space permits)
        if (cellIntensity < 0.3) { // Suburbs only for back-lotting
            const bx = cx, bz = cz;
            const distWeights = getDistrictWeights(bx, bz, city);
            const primaryDistrict = pickWeighted(rng, distWeights);
            if (primaryDistrict === 'suburban' || primaryDistrict === 'residential') {
                const w = 9 + rng() * 5, d = 9 + rng() * 5, h = 8 + rng() * 6;
                const groundY = getTerrainHeight(bx, bz);
                if (groundY > 2.0 && groundY < 430) {
                    buildings.push({ x: bx, y: groundY, z: bz, w, h, d, angle: rng() * Math.PI, classId: CLASS_IDS.indexOf('townhouse'), colorIdx: 2 });
                }
            }
        }
    }

    // PASS 3: Dead-End Infiller
    const nodeDegree = new Map();
    for (const [i, j] of roads.map(r => [r.x1 + "," + r.z1, r.x2 + "," + r.z2])) { // Rough hack but works for infill
        nodeDegree.set(i, (nodeDegree.get(i) || 0) + 1);
        nodeDegree.set(j, (nodeDegree.get(j) || 0) + 1);
    }

    // We actually need the road segments to find the angle for dead ends
    for (const seg of roads) {
        const p1 = seg.x1 + "," + seg.z1;
        const p2 = seg.x2 + "," + seg.z2;

        const tryFill = (x, z, angle, otherX, otherZ) => {
            const key = x + "," + z;
            if (nodeDegree.get(key) === 1) {
                const bx = x + (x - otherX) * 0.15; // push slightly past the end
                const bz = z + (z - otherZ) * 0.15;
                const groundY = getTerrainHeight(bx, bz);
                if (groundY > 2.0 && groundY < 430) {
                    buildings.push({ x: bx, y: groundY, z: bz, w: 14, h: 12, d: 14, angle: Math.atan2(z - otherZ, x - otherX), classId: CLASS_IDS.indexOf('townhouse'), colorIdx: 3 });
                }
            }
        };
        tryFill(seg.x1, seg.z1, 0, seg.x2, seg.z2);
        tryFill(seg.x2, seg.z2, 0, seg.x1, seg.z1);
    }

    return buildings;
}

function placeBuildingsInIndustrialQuads(city, roads, quads) {
    const buildings = [];
    const roadBuffer = 18;
    const rng = seededRand(getDistrictSeed(city) * 71437 + 17);
    const classId = CLASS_IDS.indexOf('industrial');
    const palette = DISTRICT_PALETTES.industrial;

    const nearestRoadAngle = (x, z) => {
        let bestD2 = Infinity;
        let bestAngle = 0;
        for (const seg of roads) {
            const dx = seg.x2 - seg.x1;
            const dz = seg.z2 - seg.z1;
            const len2 = dx * dx + dz * dz;
            if (len2 === 0) continue;
            let t = ((x - seg.x1) * dx + (z - seg.z1) * dz) / len2;
            t = Math.max(0, Math.min(1, t));
            const nx = seg.x1 + t * dx - x;
            const nz = seg.z1 + t * dz - z;
            const d2 = nx * nx + nz * nz;
            if (d2 < bestD2) {
                bestD2 = d2;
                bestAngle = Math.atan2(dz, dx);
            }
        }
        return bestAngle;
    };

    for (const quad of quads) {
        const minX = quad[0][0];
        const maxX = quad[1][0];
        const minZ = quad[0][1];
        const maxZ = quad[2][1];
        const width = maxX - minX;
        const depth = maxZ - minZ;

        const lotStep = Math.max(36, Math.min(58, Math.sqrt(width * depth) / 4.2));
        const stepsX = Math.max(1, Math.floor((width - roadBuffer * 2) / lotStep));
        const stepsZ = Math.max(1, Math.floor((depth - roadBuffer * 2) / lotStep));

        for (let ix = 0; ix <= stepsX; ix++) {
            for (let iz = 0; iz <= stepsZ; iz++) {
                const bx = minX + roadBuffer + ix * lotStep + (rng() - 0.5) * 8;
                const bz = minZ + roadBuffer + iz * lotStep + (rng() - 0.5) * 8;
                if (bx <= minX + roadBuffer || bx >= maxX - roadBuffer) continue;
                if (bz <= minZ + roadBuffer || bz >= maxZ - roadBuffer) continue;
                if (!isPointInDistrict(bx, bz, city.districts[0])) continue;
                if (rng() > 0.78) continue;

                const w = CLASS_WIDTH.industrial[0] + rng() * (CLASS_WIDTH.industrial[1] - CLASS_WIDTH.industrial[0]);
                const d = CLASS_DEPTH.industrial[0] + rng() * (CLASS_DEPTH.industrial[1] - CLASS_DEPTH.industrial[0]);
                const h = CLASS_HEIGHT.industrial[0] + rng() * (CLASS_HEIGHT.industrial[1] - CLASS_HEIGHT.industrial[0]);
                const y = getTerrainHeight(bx, bz);
                if (y < 2.0 || y > 430) continue;

                const angle = nearestRoadAngle(bx, bz) + (Math.floor(rng() * 2) * Math.PI / 2);
                const colorIdx = palette[Math.floor(rng() * palette.length)];
                buildings.push({ x: bx, y, z: bz, w, h, d, angle, classId, colorIdx });
            }
        }
    }

    return buildings;
}

// ---------------------------------------------------------------------------
// Road segment list for a city
// ---------------------------------------------------------------------------
function buildRoadSegments(nodes, edges, city) {
    const segments = [];
    for (const [i, j] of edges) {
        const s1 = nodes[i], s2 = nodes[j];
        const roadClass = classifyRoad(s1, s2, city);
        const halfWidth = ROAD_WIDTHS[roadClass] / 2;
        // Sample terrain height along the road at both endpoints
        const y1 = getTerrainHeight(s1[0], s1[1]);
        const y2 = getTerrainHeight(s2[0], s2[1]);
        // Road class encoded: 0=arterial, 1=collector, 2=local
        const classId = roadClass === 'arterial' ? 0 : roadClass === 'collector' ? 1 : 2;
        segments.push({ x1: s1[0], y1, z1: s1[1], x2: s2[0], y2, z2: s2[1], halfWidth, classId });
    }
    return segments;
}

// ---------------------------------------------------------------------------
// Binary serialization moved to WorldBuilderSerial.mjs
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const mapData = normalizeMapData(JSON.parse(readFileSync(MAP_PATH, 'utf8')));
const districtRecords = buildDistrictRecords(mapData);
const districtIds = new Set(districtRecords.map(record => record.id));

console.log(`\n🌆  build-world — processing ${districtRecords.length} districts\n`);

for (const entry of readdirSync(OUT_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const entryPath = path.join(OUT_DIR, entry.name);
    if (!districtIds.has(entry.name)) {
        rmSync(entryPath, { recursive: true, force: true });
        continue;
    }

    rmSync(path.join(entryPath, 'city.bin'), { force: true });
    rmSync(path.join(entryPath, 'city.json'), { force: true });
    rmSync(path.join(entryPath, 'mask.png'), { force: true });
}

for (const city of districtRecords) {
    const outDir = path.join(OUT_DIR, city.id);
    mkdirSync(outDir, { recursive: true });

    const districtType = getDistrictType(city.districts?.[0]);
    let buildings;

    if (districtType === 'industrial') {
        console.log(`  [${city.id}] Generating industrial district blocks…`);
        const industrialQuads = buildIndustrialQuadSubdivisions(city, 400_000);
        console.log(`  [${city.id}]   → ${industrialQuads.length} blocks`);
        console.log(`  [${city.id}] Filling industrial quads with buildings…`);
        buildings = placeBuildingsInIndustrialQuads(city, [], industrialQuads);
    } else {
        console.log(`  [${city.id}] Generating district blocks…`);
        const blocks = buildDistrictBlocks(city);
        console.log(`  [${city.id}]   → ${blocks.length} blocks`);
        console.log(`  [${city.id}] Placing buildings…`);
        buildings = placeBuildingsInCity(city, [], blocks);
    }

    console.log(`  [${city.id}]   → ${buildings.length} buildings`);

    // Write single binary chunk for the whole district
    const binPath = path.join(outDir, 'district.bin');
    const binData = serializeChunk(buildings);
    writeFileSync(binPath, binData);
    console.log(`  [${city.id}]   → wrote ${(Buffer.byteLength(binData) / 1024).toFixed(1)} KB to ${path.relative(ROOT, binPath)}`);

    // Also write JSON for human inspection / debugging
    const jsonPath = path.join(outDir, 'district.json');
    writeFileSync(jsonPath, JSON.stringify({
        id: city.id,
        center: city.center,
        radius: getCityRadius(city),
        numBuildings: buildings.length,
        buildings
    }, null, 2));
    console.log(`  [${city.id}]   → wrote debug JSON to ${path.relative(ROOT, jsonPath)}\n`);
}

// Write a small district index file for the runtime to know which authored districts exist and where
const districtIndex = districtRecords.map(c => ({
    id: c.id,
    cx: c.center[0],
    cz: c.center[1],
    radius: getCityRadius(c),
    district: c.districts?.[0] || null,
}));
writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(districtIndex, null, 2));
console.log(`✅  index written to world/chunks/index.json`);
console.log(`🏙️  Done!\n`);
