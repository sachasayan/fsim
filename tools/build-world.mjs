/**
 * build-world.mjs — Offline city layout compiler
 *
 * Reads tools/map.json, generates Voronoi-based city block layouts with road
 * networks and building lot assignments, samples the shared TerrainUtils height
 * function, and serialises everything into compact binary chunk files under
 * world/chunks/<cityId>/.
 *
 * Usage:
 *   node tools/build-world.mjs
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PNG } from 'pngjs';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MAP_PATH = path.join(__dirname, 'map.json');
const OUT_DIR = path.join(ROOT, 'world', 'chunks');

// ---------------------------------------------------------------------------
// Noise (inline — mirrors TerrainUtils so we can sample height offline)
// ---------------------------------------------------------------------------
// Simple seeded permutation table (Ken Perlin's approach)
// Exact port of js/modules/noise.js to ensure height matching
const Noise = {
    permutation: new Uint8Array(512),
    init(seed = 12345) {
        let p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;
        let s = seed;
        for (let i = 255; i > 0; i--) {
            s = Math.imul(1664525, s) + 1013904223 | 0;
            let rand = Math.floor((((s >>> 8) & 0xfffff) / 0x100000) * (i + 1));
            let temp = p[i];
            p[i] = p[rand];
            p[rand] = temp;
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

function getTerrainHeight(x, z) {
    let distFromRunwayZ = Math.abs(z);
    let distFromRunwayX = Math.abs(x);
    let noiseVal = Noise.fractal(x, z, 6, 0.5, 0.0003) * 600 + 100;

    if (distFromRunwayX < 150 && distFromRunwayZ < 2500) {
        return 0;
    } else if (distFromRunwayX < 600 && distFromRunwayZ < 3500) {
        let blendX = Math.max(0, (distFromRunwayX - 150) / 450);
        let blendZ = Math.max(0, (distFromRunwayZ - 2500) / 1000);
        let runwayMask = Math.min(1.0, Math.max(blendX, blendZ));
        return noiseVal * runwayMask;
    }
    return noiseVal;
}

// ---------------------------------------------------------------------------
// Pseudo-random helpers
// ---------------------------------------------------------------------------
function seededRand(seed) {
    // Simple xorshift32
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

// ---------------------------------------------------------------------------
// V2 Organic Grid Generation (Perlin-warped Manhattan grid)
// ---------------------------------------------------------------------------
function generateCityGrid(cx, cz, radius, seed) {
    const rng = seededRand(seed * 9999 + cx * 293 + cz);
    const blockSize = 130; // 130m standard block size
    const steps = Math.ceil(radius / blockSize) + 1;

    const grid = [];
    for (let i = 0; i <= steps * 2 + 1; i++) grid[i] = [];
    const nodes = [];

    // Generate warped grid nodes
    for (let ix = -steps; ix <= steps; ix++) {
        for (let iz = -steps; iz <= steps; iz++) {
            const ux = cx + ix * blockSize;
            const uz = cz + iz * blockSize;

            // Perlin warp (-0.5 to 0.5) to make it organic
            const warpX = (hash2(ux, uz, 1) - 0.5) * blockSize * 0.45;
            const warpZ = (hash2(ux, uz, 2) - 0.5) * blockSize * 0.45;

            const px = ux + warpX;
            const pz = uz + warpZ;

            const dist = Math.hypot(px - cx, pz - cz);
            if (dist > radius * 1.05) {
                grid[ix + steps][iz + steps] = -1; // out of bounds
                continue;
            }

            nodes.push([px, pz]);
            grid[ix + steps][iz + steps] = nodes.length - 1;
        }
    }

    const edges = [];
    const blocks = [];

    // Connect nodes into edges and extract city blocks
    for (let ix = -steps; ix < steps; ix++) {
        for (let iz = -steps; iz < steps; iz++) {
            const nBL = grid[ix + steps][iz + steps];
            const nBR = grid[ix + 1 + steps][iz + steps];
            const nTL = grid[ix + steps][iz + 1 + steps];
            const nTR = grid[ix + 1 + steps][iz + 1 + steps];

            if (nBL !== -1 && nBL !== undefined) {
                if (nBR !== -1 && nBR !== undefined) edges.push([nBL, nBR]);
                if (nTL !== -1 && nTL !== undefined) edges.push([nBL, nTL]);
            }
            if (ix === steps - 1 && nBR !== -1 && nBR !== undefined) {
                const nTopRight = grid[ix + 1 + steps][iz + 1 + steps];
                if (nTopRight !== -1 && nTopRight !== undefined) edges.push([nBR, nTopRight]);
            }
            if (iz === steps - 1 && nTL !== -1 && nTL !== undefined) {
                const nTopRight = grid[ix + 1 + steps][iz + 1 + steps];
                if (nTopRight !== -1 && nTopRight !== undefined) edges.push([nTL, nTopRight]);
            }

            // Add block if all 4 corners exist
            if (nBL !== -1 && nBR !== -1 && nTL !== -1 && nTR !== -1 &&
                nBL !== undefined && nBR !== undefined && nTL !== undefined && nTR !== undefined) {
                blocks.push([nodes[nBL], nodes[nBR], nodes[nTR], nodes[nTL]]);
            }
        }
    }

    // Add radial/arterial overlays (cut diagonals through the grid)
    const numRadials = 1 + Math.floor(rng() * 2);
    for (let r = 0; r < numRadials; r++) {
        const angle = rng() * Math.PI * 2;
        const dx = Math.cos(angle) * blockSize * 3;
        const dz = Math.sin(angle) * blockSize * 3;

        let currX = cx + (rng() - 0.5) * radius * 0.5;
        let currZ = cz + (rng() - 0.5) * radius * 0.5;
        let lastNodeIdx = -1;

        for (let step = 0; step < 10; step++) {
            const nextX = currX + dx;
            const nextZ = currZ + dz;
            if (Math.hypot(nextX - cx, nextZ - cz) > radius) break;

            nodes.push([nextX, nextZ]);
            const currIdx = nodes.length - 1;
            if (lastNodeIdx !== -1) edges.push([lastNodeIdx, currIdx]);

            lastNodeIdx = currIdx;
            currX = nextX;
            currZ = nextZ;
        }
    }

    return { nodes, edges, blocks };
}

// For each edge mid-point, classify road type based on urban intensity
function classifyRoad(s1, s2, city) {
    const mx = (s1[0] + s2[0]) / 2, mz = (s1[1] + s2[1]) / 2;
    const d = Math.hypot(mx - city.center[0], mz - city.center[1]);
    const ratio = d / city.radius;
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
        weights[d.type] = (weights[d.type] || 0) + w;
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
    const cityBaseNorm = Math.max(0, 1.0 - dist / city.radius);

    // Add specific boosts for core districts
    let coreBoost = 0;
    for (const d of city.districts) {
        if (d.type === 'financial_core' || d.type === 'commercial') {
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
    }

    return Math.min(1.0, cityBaseNorm * 0.4 + coreBoost * 0.8);
}

// ---------------------------------------------------------------------------
// Building placement — populate city blocks with buildings
// ---------------------------------------------------------------------------
function placeBuildingsInCity(city, roads, blocks) {
    const buildings = []; // {x, y, z, w, h, d, angle, classId, colorIdx}
    const { center, radius, road: roadCfg } = city;
    const rng = seededRand(roadCfg.seed * 31337);

    // Populate every grid block defined by the road network intersections
    for (const block of blocks) {
        // Block is a quad: [BL, BR, TR, TL]
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        let cx = 0, cz = 0;
        for (const p of block) {
            minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
            minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]);
            cx += p[0]; cz += p[1];
        }
        cx /= 4; cz /= 4; // Block center

        // Keep inside actual city limits
        if (Math.hypot(cx - center[0], cz - center[1]) > radius * 0.95) continue;

        const cellIntensity = getUrbanIntensity(cx, cz, city);

        // Dynamic density: tightly packed in core, spaced out in suburbs
        const lotStep = 45 - (cellIntensity * 30); // 45m (suburb) down to 15m (core)
        const spawnChance = 0.5 + (cellIntensity * 0.45); // up to 95% filled out in core

        // Scan the AABB of the cell perfectly
        const stepsX = Math.ceil((maxX - minX) / lotStep);
        const stepsZ = Math.ceil((maxZ - minZ) / lotStep);

        for (let ix = 0; ix <= stepsX; ix++) {
            for (let iz = 0; iz <= stepsZ; iz++) {
                // Jitter decreases in tight urban cores for cleaner rows
                const bx = minX + ix * lotStep + (rng() - 0.5) * (8 - cellIntensity * 6);
                const bz = minZ + iz * lotStep + (rng() - 0.5) * (8 - cellIntensity * 6);

                if (Math.hypot(bx - center[0], bz - center[1]) > radius * 0.98) continue;

                // Keep points roughly within the block's diamond/poly footprint
                // (Quick strict manhattan-ish check using center)
                if (Math.abs(bx - cx) + Math.abs(bz - cz) > Math.abs(maxX - minX)) continue;

                // Grab neighborhood profiles mapping
                const distWeights = getDistrictWeights(bx, bz, city);
                const primaryDistrict = pickWeighted(rng, distWeights);
                const classWeights = DISTRICT_CLASS_WEIGHTS[primaryDistrict] || DISTRICT_CLASS_WEIGHTS.residential;
                const classIdStr = pickWeighted(rng, classWeights);
                const classId = CLASS_IDS.indexOf(classIdStr);

                const widthRange = CLASS_WIDTH[classIdStr];
                const w = widthRange[0] + rng() * (widthRange[1] - widthRange[0]);
                const depthRange = CLASS_DEPTH[classIdStr];
                const d = depthRange[0] + rng() * (depthRange[1] - depthRange[0]);
                const heightRange = CLASS_HEIGHT[classIdStr];
                const h = heightRange[0] + rng() * (heightRange[1] - heightRange[0]);

                let onRoad = false;
                const buildingRadius = Math.hypot(w, d) / 2;

                // Shader thicknessPx = seg.halfWidth * 2.5
                // The visual road footprint is 2.5x the configured halfWidth. 
                // We add 1m sidewalk buffer.
                const visualRoadScale = 2.5;
                const sidewalkMargin = 1.0;

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

                    // True collision buffer
                    const collisionDist = (halfWidth * visualRoadScale) + buildingRadius + sidewalkMargin;
                    if (d2 < collisionDist * collisionDist) {
                        onRoad = true;
                        break;
                    }
                }

                if (onRoad) continue;

                let lx = bx, lz = bz;
                if (primaryDistrict === 'residential' || primaryDistrict === 'suburban') {
                    // Pull building towards road frontage, leaving exact margin
                    const frontageOffset = 22 + rng() * 12;
                    const roadVisualRadius = refSeg ? refSeg.halfWidth * visualRoadScale : 0;
                    const pull = Math.max(0, Math.sqrt(bestRoadDist) - (frontageOffset + roadVisualRadius));

                    const angleToRoad = Math.atan2((refSeg.z1 + refSeg.z2) / 2 - lz, (refSeg.x1 + refSeg.x2) / 2 - lx);
                    lx += Math.cos(angleToRoad) * pull * 0.8;
                    lz += Math.sin(angleToRoad) * pull * 0.8;
                }

                // Probabilistic skip for breathing room
                if (rng() > spawnChance) continue;

                const groundY = getTerrainHeight(lx, lz);
                if (groundY < 2.0 || groundY > 430) continue;

                // Align to road angle, with optional 90-degree rotations for variety
                const roadRelativeAngle = bestRoadAngle + (Math.floor(rng() * 4) * (Math.PI / 2));

                const palette = DISTRICT_PALETTES[primaryDistrict] || DISTRICT_PALETTES.residential;
                const colorIdx = palette[Math.floor(rng() * 4)];

                buildings.push({ x: lx, y: groundY, z: lz, w, h, d, angle: roadRelativeAngle, classId, colorIdx });
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
// Binary serialization
//
// Chunk file format (little-endian):
//   [4]  magic  = 0x46574C44 "FWLD"
//   [4]  version = 1
//   [4]  numBuildings
//   [4]  numRoadSegments
//   [4*numBuildings*10]  buildings: x,y,z,w,h,d,angle,classId(f32),colorIdx(f32),pad
//   [4*numRoadSegments*7] roads: x1,y1,z1,x2,y2,z2,halfWidth,classId(f32)
// ---------------------------------------------------------------------------
const MAGIC = 0x46574C44;
const VERSION = 2; // Bumped version for mask texture inclusion
const BLDG_FLOATS = 10;  // x,y,z, w,h,d, angle, classId, colorIdx, _pad
const ROAD_FLOATS = 8;   // x1,y1,z1, x2,y2,z2, halfWidth, classId

function serializeChunk(buildings, roadSegments, maskData, maskSize) {
    const headerInts = 6; // magic, version, numBuildings, numRoadSegments, maskSize, maskOffset

    // Calculate offsets
    const bldgBytes = buildings.length * BLDG_FLOATS * 4;
    const roadBytes = roadSegments.length * ROAD_FLOATS * 4;
    const maskBytes = maskSize * maskSize; // 1 byte per pixel (alpha channel mask)

    const maskOffset = headerInts * 4 + bldgBytes + roadBytes;
    const byteLen = maskOffset + maskBytes;

    const buf = new ArrayBuffer(byteLen);
    const view = new DataView(buf);
    let off = 0;

    const wi32 = (v) => { view.setInt32(off, v, true); off += 4; };
    const wf32 = (v) => { view.setFloat32(off, v, true); off += 4; };

    wi32(MAGIC);
    wi32(VERSION);
    wi32(buildings.length);
    wi32(roadSegments.length);
    wi32(maskSize);      // Dimensions of the square mask (e.g. 1024 or 2048)
    wi32(maskOffset);    // Byte offset where the 8-bit mask data begins

    for (const b of buildings) {
        wf32(b.x); wf32(b.y); wf32(b.z);
        wf32(b.w); wf32(b.h); wf32(b.d);
        wf32(b.angle);
        wf32(b.classId);
        wf32(b.colorIdx);
        wf32(0); // pad to even BLDG_FLOATS
    }

    for (const r of roadSegments) {
        wf32(r.x1); wf32(r.y1); wf32(r.z1);
        wf32(r.x2); wf32(r.y2); wf32(r.z2);
        wf32(r.halfWidth);
        wf32(r.classId);
    }

    // Copy the 8-bit mask array directly to the end of the buffer
    const dstArray = new Uint8Array(buf, maskOffset);
    dstArray.set(maskData);

    return Buffer.from(buf);
}

// ---------------------------------------------------------------------------
// 2D Road Mask Rasterization
// ---------------------------------------------------------------------------
// Rasterizes thick lines for roads into a flat 2D mask.
// The fragment shader will use this mask to blend an asphalt map onto the terrain.
function generateRoadMask(city, roadSegments, size = 1024) {
    // 1 channel (alpha mask: 0=grass, 255=road center)
    const data = new Uint8Array(size * size);

    // Map bounds: -radius to +radius from city center
    const cx = city.center[0], cz = city.center[1];
    const r = city.radius;
    const worldToPx = (size) / (r * 2);

    // Add margin to map size to ensure roads stretching out aren't perfectly clipped
    const mapWorldRad = r * 1.05;
    const pxScale = size / (mapWorldRad * 2);

    // FIRST PASS: Generate urban ground (low alpha) based on urban intensity
    for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
            // Convert px back to world coords relative to map center
            const wx = cx - mapWorldRad + (px / pxScale);
            const wz = cz - mapWorldRad + (py / pxScale);
            const intensity = getUrbanIntensity(wx, wz, city);

            // If there's any urban intensity, paint a baseline "urban ground" value (e.g., 30 to 100)
            if (intensity > 0.05) {
                // Map intensity [0.05, 1.0] to alpha [80, 160] to prevent WebGL gamma crush
                const val = Math.floor(80 + intensity * 80);
                data[py * size + px] = val;
            } else {
                data[py * size + px] = 0;
            }
        }
    }

    // SECOND PASS: Draw high-alpha roads on top
    for (const seg of roadSegments) {
        let x1 = (seg.x1 - cx + mapWorldRad) * pxScale;
        let y1 = (seg.z1 - cz + mapWorldRad) * pxScale;
        let x2 = (seg.x2 - cx + mapWorldRad) * pxScale;
        let y2 = (seg.z2 - cz + mapWorldRad) * pxScale;

        let thicknessPx = (seg.halfWidth * 2.5) * pxScale;

        // Simple SDF line drawing
        const minX = Math.max(0, Math.floor(Math.min(x1, x2) - thicknessPx));
        const maxX = Math.min(size - 1, Math.ceil(Math.max(x1, x2) + thicknessPx));
        const minY = Math.max(0, Math.floor(Math.min(y1, y2) - thicknessPx));
        const maxY = Math.min(size - 1, Math.ceil(Math.max(y1, y2) + thicknessPx));

        const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;

        for (let py = minY; py <= maxY; py++) {
            for (let px = minX; px <= maxX; px++) {
                // Distance to line segment
                let t = 0;
                if (l2 !== 0) {
                    t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
                    t = Math.max(0, Math.min(1, t));
                }
                const projX = x1 + t * (x2 - x1);
                const projY = y1 + t * (y2 - y1);
                const distSq = (px - projX) ** 2 + (py - projY) ** 2;

                // Falloff for anti-aliasing / blending
                if (distSq < thicknessPx * thicknessPx) {
                    const dist = Math.sqrt(distSq);
                    // Roads go from 160 (edges) to 255 (center)
                    const roadAlphaBase = 160;
                    const alpha = Math.max(0, 1.0 - (dist / thicknessPx));
                    const val = Math.floor(roadAlphaBase + alpha * 95);
                    const idx = py * size + px;
                    if (val > data[idx]) data[idx] = val;
                }
            }
        }
    }

    return { data, size, worldRadius: mapWorldRad };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const mapData = JSON.parse(readFileSync(MAP_PATH, 'utf8'));

console.log(`\n🌆  build-world — processing ${mapData.cities.length} cities\n`);

for (const city of mapData.cities) {
    const outDir = path.join(OUT_DIR, city.id);
    mkdirSync(outDir, { recursive: true });

    console.log(`  [${city.id}] Generating Organic Grid road network…`);
    const { nodes, edges, blocks } = generateCityGrid(city.center[0], city.center[1], city.radius, city.road.seed);
    const roadSegments = buildRoadSegments(nodes, edges, city);

    console.log(`  [${city.id}]   → ${nodes.length} nodes, ${edges.length} road edges, ${blocks.length} blocks`);
    console.log(`  [${city.id}] Placing buildings via Block Parsing…`);

    const buildings = placeBuildingsInCity(city, roadSegments, blocks);
    console.log(`  [${city.id}]   → ${buildings.length} buildings`);

    console.log(`  [${city.id}] Rasterizing road mask texture…`);
    const maskSize = 1024;
    const mask = generateRoadMask(city, roadSegments, maskSize);

    // Save PNG for debug
    const png = new PNG({ width: maskSize, height: maskSize });
    for (let i = 0; i < mask.data.length; i++) {
        // Map 1-channel data to RGBA
        const val = mask.data[i];
        png.data[i * 4] = val;     // R
        png.data[i * 4 + 1] = val; // G
        png.data[i * 4 + 2] = val; // B
        png.data[i * 4 + 3] = 255; // A
    }
    writeFileSync(path.join(outDir, 'mask.png'), PNG.sync.write(png));

    // Write single binary chunk for the whole city (now includes mask)
    const binPath = path.join(outDir, 'city.bin');
    const binData = serializeChunk(buildings, roadSegments, mask.data, maskSize);
    writeFileSync(binPath, binData);
    console.log(`  [${city.id}]   → wrote ${(Buffer.byteLength(binData) / 1024).toFixed(1)} KB to ${path.relative(ROOT, binPath)}`);

    // Also write JSON for human inspection / debugging
    const jsonPath = path.join(outDir, 'city.json');
    writeFileSync(jsonPath, JSON.stringify({
        id: city.id,
        center: city.center,
        radius: city.radius,
        maskRadius: mask.worldRadius, // Tell runtime what map scale is
        numBuildings: buildings.length,
        numRoadSegments: roadSegments.length,
        buildings,
        roadSegments
    }, null, 2));
    console.log(`  [${city.id}]   → wrote debug JSON to ${path.relative(ROOT, jsonPath)}\n`);
}

// Write a small city index file for the runtime to know which cities exist and where
const cityIndex = mapData.cities.map(c => ({
    id: c.id,
    cx: c.center[0],
    cz: c.center[1],
    radius: c.radius,
}));
writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(cityIndex, null, 2));
console.log(`✅  index written to world/chunks/index.json`);
console.log(`🏙️  Done!\n`);
