import { hash2, pickWeighted, cityHubInfluence, getDistrictProfile, getForestProfile, getTerrainHeight, QuadtreeMapSampler, setStaticSampler } from './TerrainUtils.js';
import { Noise } from '../../noise.js';
import { SEA_LEVEL, getTerrainBaseSrgb, getWaterDepthSrgb } from './TerrainPalette.js';

// Re-declare constants from TerrainGeneration to avoid importing THREE
const TREE_DENSITY_MULTIPLIER = 4.0;
const CHUNK_SIZE = 4000;

const treeSizes = {
    conifer: { hRange: [14, 24], wScale: 0.45 },
    broadleaf: { hRange: [11, 19], wScale: 0.6 },
    poplar: { hRange: [13, 23], wScale: 0.42 },
    dry: { hRange: [8, 15], wScale: 0.52 }
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

function buildChunkBase(job) {
    const { cx, cz, lodCfg, positions, colors, wPos, wCols } = job;

    // Process terrain
    for (let i = 0; i < positions.length; i += 3) {
        let lx = positions[i];
        let lz = positions[i + 2];
        let vx = lx + cx * CHUNK_SIZE;
        let vz = lz + cz * CHUNK_SIZE;

        let height = getTerrainHeight(vx, vz, Noise);
        positions[i + 1] = height;

        const col = srgbArrayToLinear(getTerrainBaseSrgb(height));

        colors[i] = col.r;
        colors[i + 1] = col.g;
        colors[i + 2] = col.b;
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

    return { cx, cz, positions, colors, wPos, wCols };
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
                    if (district.center && district.radius) {
                        const ddx = vx - district.center[0];
                        const ddz = vz - district.center[1];
                        if (ddx * ddx + ddz * ddz <= district.radius * district.radius) return true;
                    }
                }
                continue;
            }
            const dx = vx - c.cx, dz = vz - c.cz;
            if (dx * dx + dz * dz < c.r2) return true;
        }
        return false;
    }

    const treePositions = { conifer: [], broadleaf: [], poplar: [], dry: [] };
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

        const warpX = Noise.fractal(vx + 7000, vz - 11000, 2, 0.5, 0.0013) * 60;
        const warpZ = Noise.fractal(vx - 9000, vz + 13000, 2, 0.5, 0.0013) * 60;
        const roadSpacing = (90 + (1 - urbanScore) * 140) * district.roadScale;
        const roadWidth = 4 + urbanScore * 4;
        const roadX = Math.abs((((vx + warpX) % roadSpacing) + roadSpacing) % roadSpacing - roadSpacing / 2);
        const roadZ = Math.abs((((vz + warpZ) % roadSpacing) + roadSpacing) % roadSpacing - roadSpacing / 2);
        const isRoad = roadX < roadWidth || roadZ < roadWidth;

        const parkNoise = (Noise.fractal(vx - 20000, vz + 15000, 3, 0.5, 0.0025) + 1) * 0.5;
        const isPark = urbanScore > 0.35 && parkNoise > 0.7 && !isRoad;
        const forestNoise = (Noise.fractal(vx + 5000, vz + 5000, 3, 0.5, 0.002) + 1) * 0.5;

        if (lodCfg.enableTrees && forestNoise > 0.45 && !isRoad && !isPark) {
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
    const treeMatrices = {};
    for (const [treeType, trees] of Object.entries(treePositions)) {
        const count = trees.length;
        if (count === 0) continue;
        const matrices = new Float32Array(count * 16);
        const cfg = treeSizes[treeType];

        for (let j = 0; j < count; j++) {
            const tp = trees[j];
            tp.y = lod <= 1 ? getTerrainHeight(tp.x + cx * CHUNK_SIZE, tp.z + cz * CHUNK_SIZE, Noise) : tp.y;

            const treeHeight = cfg.hRange[0] + tp.seed * (cfg.hRange[1] - cfg.hRange[0]);
            const treeWidth = treeHeight * cfg.wScale * (0.92 + tp.seed2 * 0.3);

            const offset = j * 16;
            matrices[offset + 0] = treeWidth; matrices[offset + 1] = 0; matrices[offset + 2] = 0; matrices[offset + 3] = 0;
            matrices[offset + 4] = 0; matrices[offset + 5] = treeHeight; matrices[offset + 6] = 0; matrices[offset + 7] = 0;
            matrices[offset + 8] = 0; matrices[offset + 9] = 0; matrices[offset + 10] = 1; matrices[offset + 11] = 0;
            matrices[offset + 12] = tp.x; matrices[offset + 13] = tp.y; matrices[offset + 14] = tp.z; matrices[offset + 15] = 1;
        }
        treeMatrices[treeType] = matrices;
    }

    return { cx, cz, treeMatrices, buildingPositions, boatPositions };
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
            }, [result.positions.buffer, result.colors.buffer, result.wPos.buffer, result.wCols.buffer]);
        } else if (type === 'chunkProps') {
            const result = buildChunkProps(payload);
            const transferables = [];
            for (const key of Object.keys(result.treeMatrices)) {
                transferables.push(result.treeMatrices[key].buffer);
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
