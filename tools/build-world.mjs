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
// Voronoi generation (Lloyd-relaxed)
// ---------------------------------------------------------------------------
function generateVoronoiSeeds(cx, cz, radius, seed, count = 60) {
    const rng = seededRand(seed * 9999 + cx * 293 + cz);
    const seeds = [];
    // Push until we have enough inside the circle
    let attempts = 0;
    while (seeds.length < count && attempts < count * 20) {
        attempts++;
        const angle = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * radius * 0.92; // sqrt for uniform radial dist
        seeds.push([cx + Math.cos(angle) * r, cz + Math.sin(angle) * r]);
    }
    return seeds;
}

function lloydRelax(seeds, cx, cz, radius, iterations = 4) {
    let pts = seeds.map(s => [...s]);
    for (let iter = 0; iter < iterations; iter++) {
        // Compute centroid of each cell by sampling a grid
        const res = 48;
        const step = (radius * 2) / res;
        const sums = pts.map(() => [0, 0, 0]); // [sx, sz, count]

        for (let ix = 0; ix <= res; ix++) {
            for (let iz = 0; iz <= res; iz++) {
                const px = cx - radius + ix * step;
                const pz = cz - radius + iz * step;
                if ((px - cx) ** 2 + (pz - cz) ** 2 > radius * radius) continue;
                let bestDist = Infinity, bestIdx = 0;
                for (let j = 0; j < pts.length; j++) {
                    const d = (pts[j][0] - px) ** 2 + (pts[j][1] - pz) ** 2;
                    if (d < bestDist) { bestDist = d; bestIdx = j; }
                }
                sums[bestIdx][0] += px;
                sums[bestIdx][1] += pz;
                sums[bestIdx][2]++;
            }
        }

        for (let j = 0; j < pts.length; j++) {
            if (sums[j][2] > 0) {
                const nc = [sums[j][0] / sums[j][2], sums[j][1] / sums[j][2]];
                // Hard-clamp to city radius
                const dx = nc[0] - cx, dz = nc[1] - cz;
                const d = Math.sqrt(dx * dx + dz * dz);
                if (d < radius * 0.9) pts[j] = nc;
            }
        }
    }
    return pts;
}

// Build Delaunay edges from seeds (brute k-nearest neighbour).
// Distance limits are proportional to average inter-seed spacing.
function buildRoadEdges(seeds, radius) {
    const edges = []; // [i, j]
    const seen = new Set();
    const k = 6; // connect to k nearest

    // Expected average spacing between seeds
    const avgSpacing = radius / Math.sqrt(seeds.length) * 1.6;
    const minDist = avgSpacing * 0.2;
    const maxDist = avgSpacing * 3.5;

    for (let i = 0; i < seeds.length; i++) {
        const dists = seeds.map((s, j) => [j, (s[0] - seeds[i][0]) ** 2 + (s[1] - seeds[i][1]) ** 2]);
        dists.sort((a, b) => a[1] - b[1]);
        for (let n = 1; n <= Math.min(k, seeds.length - 1); n++) {
            const j = dists[n][0];
            const len = Math.sqrt(dists[n][1]);
            if (len > maxDist || len < minDist) continue;
            const key = i < j ? `${i}-${j}` : `${j}-${i}`;
            if (!seen.has(key)) { seen.add(key); edges.push([i, j]); }
        }
    }
    return edges;
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
// District lookup
// ---------------------------------------------------------------------------
const DISTRICT_CLASS_WEIGHTS = {
    financial_core: { supertall: 0.22, highrise: 0.44, office: 0.27, apartment: 0.07 },
    commercial: { highrise: 0.18, office: 0.38, apartment: 0.30, townhouse: 0.14 },
    residential: { apartment: 0.30, townhouse: 0.58, industrial: 0.12 },
    industrial: { industrial: 0.60, office: 0.20, apartment: 0.08, townhouse: 0.12 },
    suburban: { townhouse: 0.72, apartment: 0.20, industrial: 0.08 },
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

function getDistrict(x, z, city) {
    let best = null, bestDist = Infinity;
    for (const d of city.districts) {
        const dist = Math.hypot(x - d.center[0], z - d.center[1]);
        if (dist < bestDist) { bestDist = dist; best = d; }
    }
    return best ? best.type : 'residential';
}

// ---------------------------------------------------------------------------
// Building placement — populate city blocks with buildings
// ---------------------------------------------------------------------------
function placeBuildingsInCity(city, roads, voronoiSeeds) {
    const buildings = []; // {x, y, z, w, h, d, angle, classId, colorIdx}
    const { center, radius, road: roadCfg } = city;
    const rng = seededRand(roadCfg.seed * 31337);

    // For each Voronoi seed, scatter buildings inside its cell.
    // We sample a grid inside the cell's rough bounding area, keeping only
    // points whose nearest Voronoi seed is this cell's seed (Voronoi ownership test).
    const lotStep = 50; // m — spacing between building lots

    for (let si = 0; si < voronoiSeeds.length; si++) {
        const sc = voronoiSeeds[si]; // cell center

        // Estimate cell size from nearest-neighbor distance to other seeds
        let nearestDist = Infinity;
        for (let sj = 0; sj < voronoiSeeds.length; sj++) {
            if (si === sj) continue;
            const d = Math.hypot(sc[0] - voronoiSeeds[sj][0], sc[1] - voronoiSeeds[sj][1]);
            if (d < nearestDist) nearestDist = d;
        }
        const cellR = Math.min(nearestDist * 0.45, 240); // rough cell radius
        const spawnChance = 0.62; // not every lot gets a building (visual breathing room)

        // Scan a grid within the cell bounding box
        const steps = Math.ceil(cellR * 2 / lotStep);
        for (let ix = 0; ix <= steps; ix++) {
            for (let iz = 0; iz <= steps; iz++) {
                const bx = sc[0] - cellR + ix * lotStep + (rng() - 0.5) * 8;
                const bz = sc[1] - cellR + iz * lotStep + (rng() - 0.5) * 8;

                // Must be within city radius
                if (Math.hypot(bx - center[0], bz - center[1]) > radius * 0.97) continue;

                // Voronoi ownership — nearest seed must be this cell
                let nearest = si;
                let nearSq = (bx - sc[0]) ** 2 + (bz - sc[1]) ** 2;
                for (let sj = 0; sj < voronoiSeeds.length; sj++) {
                    if (sj === si) continue;
                    const d2 = (bx - voronoiSeeds[sj][0]) ** 2 + (bz - voronoiSeeds[sj][1]) ** 2;
                    if (d2 < nearSq) { nearSq = d2; nearest = sj; }
                }
                if (nearest !== si) continue;

                // Not on a road?
                let onRoad = false;
                let bestRoadAngle = 0;
                let bestRoadDist = Infinity;
                for (const seg of roads) {
                    const { x1, z1, x2, z2, halfWidth } = seg;
                    const dx = x2 - x1, dz = z2 - z1;
                    const len2 = dx * dx + dz * dz;
                    if (len2 === 0) continue;
                    let t = ((bx - x1) * dx + (bz - z1) * dz) / len2;
                    t = Math.max(0, Math.min(1, t));
                    const nx = x1 + t * dx - bx, nz = z1 + t * dz - bz;
                    const d2 = nx * nx + nz * nz;
                    if (d2 < (halfWidth + 5) ** 2) { onRoad = true; break; }
                    // Track closest road for building orientation
                    if (d2 < bestRoadDist) {
                        bestRoadDist = d2;
                        bestRoadAngle = Math.atan2(dz, dx); // angle of road
                    }
                }
                if (onRoad) continue;

                // Probabilistic skip for breathing room
                if (rng() > spawnChance) continue;

                // District & class
                const districtType = getDistrict(bx, bz, city);
                const weights = DISTRICT_CLASS_WEIGHTS[districtType] || DISTRICT_CLASS_WEIGHTS.residential;
                const buildingClass = pickWeighted(rng, weights);
                const classId = CLASS_IDS.indexOf(buildingClass);

                const [hMin, hMax] = CLASS_HEIGHT[buildingClass];
                const [wMin, wMax] = CLASS_WIDTH[buildingClass];
                const [dMin, dMax] = CLASS_DEPTH[buildingClass];

                const h = hMin + rng() * (hMax - hMin);
                const w = wMin + rng() * (wMax - wMin);
                const d = dMin + rng() * (dMax - dMin);

                const groundY = getTerrainHeight(bx, bz);
                if (groundY < -5 || groundY > 430) continue;

                // Snap angle to nearest 90° from road direction for a clean street-facing look
                const snappedAngle = Math.round(bestRoadAngle / (Math.PI / 2)) * (Math.PI / 2);
                const colorIdx = Math.floor(rng() * 4);

                buildings.push({ x: bx, y: groundY, z: bz, w, h, d, angle: snappedAngle, classId, colorIdx });
            }
        }
    }

    return buildings;
}

// ---------------------------------------------------------------------------
// Road segment list for a city
// ---------------------------------------------------------------------------
function buildRoadSegments(seeds, edges, city) {
    const segments = [];
    for (const [i, j] of edges) {
        const s1 = seeds[i], s2 = seeds[j];
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
    data.fill(0);

    // Map bounds: -radius to +radius from city center
    const cx = city.center[0], cz = city.center[1];
    const r = city.radius;
    const worldToPx = (size) / (r * 2);

    // Add margin to map size to ensure roads stretching out aren't perfectly clipped
    const mapWorldRad = r * 1.05;
    const pxScale = size / (mapWorldRad * 2);

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
                    // 1.0 at center, 0.0 at edge
                    const alpha = Math.max(0, 1.0 - (dist / thicknessPx));
                    // Write max alpha (support intersections)
                    const val = Math.min(255, alpha * 255);
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

    console.log(`  [${city.id}] Generating Voronoi road network…`);
    const rawSeeds = generateVoronoiSeeds(city.center[0], city.center[1], city.radius, city.road.seed);
    const seeds = lloydRelax(rawSeeds, city.center[0], city.center[1], city.radius);
    const edges = buildRoadEdges(seeds, city.radius);
    const roadSegments = buildRoadSegments(seeds, edges, city);

    console.log(`  [${city.id}]   → ${seeds.length} nodes, ${edges.length} road edges`);
    console.log(`  [${city.id}] Placing buildings…`);

    console.log(`  [${city.id}] Placing buildings…`);
    const buildings = placeBuildingsInCity(city, roadSegments, seeds);
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
