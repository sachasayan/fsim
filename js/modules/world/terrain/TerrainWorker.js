import { hash2, pickWeighted, cityHubInfluence, getDistrictProfile, getForestProfile, getTerrainHeight, QuadtreeMapSampler, setStaticSampler, getStaticWorldMetadata } from './TerrainUtils.js';
import { Noise } from '../../noise.js';
import { SEA_LEVEL, getTerrainBaseSrgb, getWaterDepthSrgb } from './TerrainPalette.js';
import { getTerrainSurfaceWeights } from './TerrainSurfaceWeights.js';
import { getTerrainSurfaceOverrides } from './TerrainSurfaceOverrides.js';

// Re-declare constants from TerrainGeneration to avoid importing THREE
const TREE_DENSITY_MULTIPLIER = 4.0;
const CHUNK_SIZE = 4000;

const treeSizes = {
    broadleaf: { hRange: [12, 21], wScale: 0.68 },
    poplar: { hRange: [13, 24], wScale: 0.4 },
    dry: { hRange: [9, 17], wScale: 0.58 }
};

const classConfigs = {
    supertall: {
        style: 'commercial',
        height: [180, 380],
        width: [24, 42],
        depth: [24, 42],
        colors: [0x1b2738, 0x111111, 0x202a36, 0x27364a],
        roof: [0x2d2d2d, 0x353535],
        podium: true,
        spire: true
    },
    highrise: {
        style: 'commercial',
        height: [80, 190],
        width: [18, 30],
        depth: [16, 28],
        colors: [0x34495e, 0x2c3e50, 0x4a6073, 0x3b4a59],
        roof: [0x3d3d3d, 0x4a4a4a],
        podium: true,
        spire: false
    },
    office: {
        style: 'commercial',
        height: [35, 90],
        width: [14, 26],
        depth: [12, 24],
        colors: [0x6e7b85, 0x7a7f89, 0x5e6970, 0x8a8f97],
        roof: [0x555555, 0x636363],
        podium: false,
        spire: false
    },
    apartment: {
        style: 'residential',
        height: [18, 48],
        width: [12, 20],
        depth: [10, 18],
        colors: [0xb6b1a5, 0x9f9a90, 0xc7c2b5, 0xa8a39a],
        roof: [0x6a5e50, 0x736857],
        podium: false,
        spire: false
    },
    townhouse: {
        style: 'residential',
        height: [8, 16],
        width: [7, 12],
        depth: [8, 13],
        colors: [0xe0d7cc, 0xd5cabf, 0xcbc0b3, 0xede4da],
        roof: [0x6a5035, 0x5a4731],
        podium: false,
        spire: false
    },
    industrial: {
        style: 'industrial',
        height: [10, 24],
        width: [18, 34],
        depth: [16, 30],
        colors: [0x8b8d8f, 0x7b7d7f, 0x6d7278, 0x9a9ca0],
        roof: [0x53575e, 0x454a52],
        podium: false,
        spire: false
    }
};

function srgbToLinear(c) {
    return (c < 0.04045) ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
}
function srgbArrayToLinear(rgb) {
    return {
        r: srgbToLinear(rgb[0] / 255),
        g: srgbToLinear(rgb[1] / 255),
        b: srgbToLinear(rgb[2] / 255)
    };
}

let matricesGenerated = 0; // tracking stats if needed

function computeGridNormals(positions, segments) {
    const verticesPerSide = segments + 1;
    const normals = new Float32Array(positions.length);

    for (let row = 0; row < verticesPerSide; row++) {
        const rowOffset = row * verticesPerSide;
        const rowUp = Math.max(0, row - 1) * verticesPerSide;
        const rowDown = Math.min(verticesPerSide - 1, row + 1) * verticesPerSide;

        for (let col = 0; col < verticesPerSide; col++) {
            const colLeft = Math.max(0, col - 1);
            const colRight = Math.min(verticesPerSide - 1, col + 1);
            const centerIndex = (rowOffset + col) * 3;
            const leftIndex = (rowOffset + colLeft) * 3;
            const rightIndex = (rowOffset + colRight) * 3;
            const upIndex = (rowUp + col) * 3;
            const downIndex = (rowDown + col) * 3;

            const dx = positions[rightIndex] - positions[leftIndex];
            const dz = positions[downIndex + 2] - positions[upIndex + 2];
            const dyX = positions[rightIndex + 1] - positions[leftIndex + 1];
            const dyZ = positions[downIndex + 1] - positions[upIndex + 1];

            let nx = -dz * dyX;
            let ny = dz * dx;
            let nz = -dyZ * dx;
            const length = Math.hypot(nx, ny, nz) || 1;

            nx /= length;
            ny /= length;
            nz /= length;

            normals[centerIndex] = nx;
            normals[centerIndex + 1] = ny;
            normals[centerIndex + 2] = nz;
        }
    }

    return normals;
}

function buildChunkBase(job) {
    const { cx, cz, lodCfg, positions, colors, surfaceWeights, surfaceOverrides, wPos, wCols } = job;
    const staticWorldMetadata = getStaticWorldMetadata();

    // Process terrain
    for (let i = 0; i < positions.length; i += 3) {
        let lx = positions[i];
        let lz = positions[i + 2];
        let vx = lx + cx * CHUNK_SIZE;
        let vz = lz + cz * CHUNK_SIZE;

        let height = getTerrainHeight(vx, vz, Noise);
        positions[i + 1] = height;

        const sampleDist = Math.max(12, 90 / Math.max(1, lodCfg.terrainRes));
        const hx = getTerrainHeight(vx + sampleDist, vz, Noise);
        const hz = getTerrainHeight(vx, vz + sampleDist, Noise);
        const slope = Math.max(Math.abs(hx - height), Math.abs(hz - height)) / sampleDist;

        const col = srgbArrayToLinear(getTerrainBaseSrgb(height));
        const weights = getTerrainSurfaceWeights(height, slope);
        const overrides = getTerrainSurfaceOverrides(vx, vz, staticWorldMetadata);

        colors[i] = col.r;
        colors[i + 1] = col.g;
        colors[i + 2] = col.b;

        const weightIndex = (i / 3) * 4;
        surfaceWeights[weightIndex] = weights[0];
        surfaceWeights[weightIndex + 1] = weights[1];
        surfaceWeights[weightIndex + 2] = weights[2];
        surfaceWeights[weightIndex + 3] = weights[3];
        surfaceOverrides[weightIndex] = overrides[0];
        surfaceOverrides[weightIndex + 1] = overrides[1];
        surfaceOverrides[weightIndex + 2] = overrides[2];
        surfaceOverrides[weightIndex + 3] = overrides[3];
    }

    // Process water
    for (let i = 0; i < wPos.length; i += 3) {
        let vx = wPos[i] + cx * CHUNK_SIZE;
        let vz = wPos[i + 2] + cz * CHUNK_SIZE;
        let th = getTerrainHeight(vx, vz, Noise);

        wPos[i + 1] = SEA_LEVEL;

        let waveNoise = Noise.fractal(vx / 30, vz / 30, 2, 0.5, 1);
        let depth = SEA_LEVEL - th + waveNoise * 4.0;
        const col = srgbArrayToLinear(getWaterDepthSrgb(depth));

        wCols[i] = col.r;
        wCols[i + 1] = col.g;
        wCols[i + 2] = col.b;
    }

    const normals = computeGridNormals(positions, lodCfg.terrainRes);
    const wNormals = computeGridNormals(wPos, lodCfg.waterRes);

    return { cx, cz, positions, normals, colors, surfaceWeights, surfaceOverrides, wPos, wNormals, wCols };
}

function buildChunkProps(job) {
    const { cx, cz, lod, lodCfg, positions, cityZones = [] } = job;

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

    const normalizedCityZones = cityZones.map(c => ({
        cx: c.cx,
        cz: c.cz,
        r2: c.radius * c.radius,
        districts: c.districts || []
    }));

    function inCity(vx, vz) {
        for (const c of normalizedCityZones) {
            if (c.districts.length > 0) {
                for (const district of c.districts) {
                    if (district.points?.length >= 3 && isPointInPolygon(vx, vz, district.points)) return true;
                    if (district.center && district.radius && Math.hypot(vx - district.center[0], vz - district.center[1]) <= district.radius) return true;
                }
                continue;
            }
            const dx = vx - c.cx, dz = vz - c.cz;
            if (dx * dx + dz * dz < c.r2) return true;
        }
        return false;
    }

    const treePositions = { broadleaf: [], poplar: [], dry: [] };
    const buildingPositions = { supertall: [], highrise: [], office: [], apartment: [], townhouse: [], industrial: [] };
    const boatPositions = [];

    for (let i = 0; i < positions.length; i += 3) {
        const lx = positions[i];
        const height = positions[i + 1];
        const lz = positions[i + 2];
        const vx = lx + cx * CHUNK_SIZE;
        const vz = lz + cz * CHUNK_SIZE;

        const distFromRunwayX = Math.abs(vx);
        const distFromRunwayZ = Math.abs(vz);
        const cellX = Math.floor(vx / 12);
        const cellZ = Math.floor(vz / 12);
        const rng = hash2(cellX, cellZ, 9);

        if (lodCfg.enableBoats && height < -30 && rng > (0.9988 + (1 - lodCfg.propDensity) * 0.0008)) {
            boatPositions.push({ x: lx, z: lz, rot: hash2(cellX, cellZ, 10) * Math.PI * 2 });
        }

        if (distFromRunwayX < 250 && distFromRunwayZ < 2800) continue;
        if (height < -5 || height > 430) continue;
        if (inCity(vx, vz)) continue; // Skip all procedural props inside city zones

        // Early exit: if it's too steep for buildings/trees, skip the heavy logic
        const sampleDist = 10;
        const h2 = getTerrainHeight(vx + sampleDist, vz, Noise);
        const h3 = getTerrainHeight(vx, vz + sampleDist, Noise);
        const slope = Math.max(Math.abs(h2 - height), Math.abs(h3 - height)) / sampleDist;
        if (slope > 0.8) continue;

        const macroUrban = (Noise.fractal(vx, vz, 3, 0.5, 0.00035) + 1) * 0.5;
        const hubUrban = cityHubInfluence(vx, vz);
        const corridorUrban = Math.max(0, 1 - Math.abs(Math.abs(vx) - 1800) / 1800) * Math.max(0, 1 - Math.abs(vz) / 14000);
        const urbanScore = Math.max(0, Math.min(1, hubUrban * 0.65 + macroUrban * 0.25 + corridorUrban * 0.25));
        const district = getDistrictProfile(vx, vz, urbanScore, height);

        const parkNoise = (Noise.fractal(vx - 20000, vz + 15000, 3, 0.5, 0.0025) + 1) * 0.5;
        const isPark = urbanScore > 0.35 && parkNoise > 0.7;
        const forestNoise = (Noise.fractal(vx + 5000, vz + 5000, 3, 0.5, 0.002) + 1) * 0.5;

        if (lodCfg.enableTrees && forestNoise > 0.45 && !isPark) {
            const forest = getForestProfile(vx, vz, height, forestNoise, urbanScore, Noise);
            const treeChance = Math.min(0.95, forest.density * lodCfg.propDensity * TREE_DENSITY_MULTIPLIER);
            if (rng < treeChance) {
                const treeType = pickWeighted(hash2(cellX, cellZ, 24), forest.typeWeights);
                treePositions[treeType].push({
                    x: lx + (hash2(cellX, cellZ, 20) - 0.5) * 20,
                    y: height,
                    z: lz + (hash2(cellX, cellZ, 21) - 0.5) * 20,
                    lean: (hash2(cellX, cellZ, 22) - 0.5) * 0.08,
                    seed: hash2(cellX, cellZ, 23),
                    seed2: hash2(cellX, cellZ, 25)
                });
            }
        }
    }

    // Process trees
    const treeInstances = {};
    for (const [treeType, trees] of Object.entries(treePositions)) {
        const count = trees.length;
        if (count === 0) continue;
        const instances = new Float32Array(count * 8);
        const cfg = treeSizes[treeType];

        for (let j = 0; j < count; j++) {
            const tp = trees[j];
            tp.y = lod <= 1 ? getTerrainHeight(tp.x + cx * CHUNK_SIZE, tp.z + cz * CHUNK_SIZE, Noise) : tp.y;

            const treeHeight = cfg.hRange[0] + tp.seed * (cfg.hRange[1] - cfg.hRange[0]);
            const treeWidth = treeHeight * cfg.wScale * (0.92 + tp.seed2 * 0.3);

            const offset = j * 8;
            instances[offset + 0] = tp.x;
            instances[offset + 1] = tp.y;
            instances[offset + 2] = tp.z;
            instances[offset + 3] = treeWidth;
            instances[offset + 4] = treeHeight;
            instances[offset + 5] = tp.seed * Math.PI * 2.0;
            instances[offset + 6] = tp.seed2;
            instances[offset + 7] = 0.78 + hash2(tp.x, tp.z, 31) * 0.58;
        }
        treeInstances[treeType] = instances;
    }

    return { cx, cz, treeInstances, buildingPositions, boatPositions };
}

self.postMessage({ type: 'workerReady' });

self.onmessage = function (e) {
    const { type, payload, jobId } = e.data;

    try {
        if (type === 'initStaticMap') {
            const sampler = new QuadtreeMapSampler(payload);
            setStaticSampler(sampler);
        } else if (type === 'chunkBase') {
            const result = buildChunkBase(payload);
            self.postMessage({
                jobId,
                type: 'chunkBase_done',
                result: result
            }, [
                result.positions.buffer,
                result.normals.buffer,
                result.colors.buffer,
                result.surfaceWeights.buffer,
                result.surfaceOverrides.buffer,
                result.wPos.buffer,
                result.wNormals.buffer,
                result.wCols.buffer
            ]);
        } else if (type === 'chunkProps') {
            const result = buildChunkProps(payload);
            const transferables = [];
            for (const key of Object.keys(result.treeInstances)) {
                transferables.push(result.treeInstances[key].buffer);
            }
            self.postMessage({
                jobId,
                type: 'chunkProps_done',
                result: result
            }, transferables);
        }
    } catch (err) {
        self.postMessage({ jobId, error: err.message, stack: err.stack });
    }
};
