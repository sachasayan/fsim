import { hash2, pickWeighted, cityHubInfluence, getDistrictProfile, getForestProfile, getTerrainHeight, getTerrainMaskSet, QuadtreeMapSampler, setStaticSampler, getStaticWorldMetadata, getStaticSampler } from './TerrainUtils.js';
import { Noise } from '../../noise.js';
import { SEA_LEVEL, WATER_DEPTH_BANDS, getTerrainBaseSrgb, getWaterDepthSrgb } from './TerrainPalette.js';
import { getTerrainSurfaceWeights } from './TerrainSurfaceWeights.js';
import { getTerrainSurfaceOverrides } from './TerrainSurfaceOverrides.js';

// Re-declare constants from TerrainGeneration to avoid importing THREE
const TREE_DENSITY_MULTIPLIER = 4.0;
const CHUNK_SIZE = 4000;
const SKIRT_DEPTH = 28;

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

function buildBorderLoopIndices(stride) {
    const indices = [];
    for (let x = 0; x < stride; x += 1) indices.push(x);
    for (let z = 1; z < stride; z += 1) indices.push((z * stride) + (stride - 1));
    for (let x = stride - 2; x >= 0; x -= 1) indices.push(((stride - 1) * stride) + x);
    for (let z = stride - 2; z > 0; z -= 1) indices.push(z * stride);
    return indices;
}

function sampleNodeHeightGrid(node, resolution, depth, sampler) {
    if (!sampler || !node || !Number.isFinite(resolution) || resolution < 1) {
        return null;
    }

    const decodedLeaf = resolution === 32 ? sampler.decodeLeafHeightSamples(node.id, depth) : null;
    if (decodedLeaf && decodedLeaf.resolution === resolution) {
        return decodedLeaf;
    }

    const stride = resolution + 1;
    const heights = new Float32Array(stride * stride);
    for (let z = 0; z <= resolution; z += 1) {
        const wz = node.minZ + (z / resolution) * node.size;
        for (let x = 0; x <= resolution; x += 1) {
            const wx = node.minX + (x / resolution) * node.size;
            heights[z * stride + x] = sampler.getAltitudeAt(wx, wz);
        }
    }

    return {
        resolution,
        stride,
        heights
    };
}

function leafContainsWater(heights) {
    if (!heights) return false;
    for (let index = 0; index < heights.length; index += 1) {
        if (heights[index] < SEA_LEVEL) return true;
    }
    return false;
}

function createLeafSurfaceBuffers({ node, heights, stride, worldData, sampler, materialKind }) {
    const resolution = stride - 1;
    const topVertexCount = stride * stride;
    const borderLoop = buildBorderLoopIndices(stride);
    const vertexCount = topVertexCount + borderLoop.length;
    const positions = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const surfaceWeights = materialKind === 'terrain' ? new Float32Array(vertexCount * 4) : null;
    const surfaceOverrides = materialKind === 'terrain' ? new Float32Array(vertexCount * 4) : null;
    const segmentSize = node.size / resolution;
    const gridStride = stride;

    for (let z = 0; z < stride; z += 1) {
        for (let x = 0; x < stride; x += 1) {
            const index = z * stride + x;
            const positionIndex = index * 3;
            const worldX = node.minX + x * segmentSize;
            const worldZ = node.minZ + z * segmentSize;
            const height = materialKind === 'terrain' ? heights[index] : SEA_LEVEL;
            const rightIndex = z * gridStride + Math.min(resolution, x + 1);
            const downIndex = Math.min(resolution, z + 1) * gridStride + x;
            const slope = materialKind === 'terrain'
                ? Math.max(
                    Math.abs(heights[rightIndex] - heights[index]),
                    Math.abs(heights[downIndex] - heights[index])
                ) / Math.max(1e-3, segmentSize)
                : 0;
            const color = materialKind === 'terrain'
                ? srgbArrayToLinear(getTerrainBaseSrgb(height))
                : srgbArrayToLinear(getWaterDepthSrgb(Math.max(0, SEA_LEVEL - heights[index])));

            positions[positionIndex] = x * segmentSize;
            positions[positionIndex + 1] = height;
            positions[positionIndex + 2] = z * segmentSize;
            uvs[index * 2] = worldX / 512;
            uvs[index * 2 + 1] = worldZ / 512;
            colors[positionIndex] = color.r;
            colors[positionIndex + 1] = color.g;
            colors[positionIndex + 2] = color.b;

            if (materialKind === 'terrain') {
                const weightIndex = index * 4;
                const weights = getTerrainSurfaceWeights(height, slope, getTerrainMaskSet(worldX, worldZ));
                const overrides = getTerrainSurfaceOverrides(worldX, worldZ, worldData);
                surfaceWeights[weightIndex] = weights[0];
                surfaceWeights[weightIndex + 1] = weights[1];
                surfaceWeights[weightIndex + 2] = weights[2];
                surfaceWeights[weightIndex + 3] = weights[3];
                surfaceOverrides[weightIndex] = overrides[0];
                surfaceOverrides[weightIndex + 1] = overrides[1];
                surfaceOverrides[weightIndex + 2] = overrides[2];
                surfaceOverrides[weightIndex + 3] = overrides[3];
            }
        }
    }

    const topNormals = computeGridNormals(positions.slice(0, topVertexCount * 3), resolution);
    const normals = new Float32Array(vertexCount * 3);
    normals.set(topNormals, 0);

    for (let index = 0; index < borderLoop.length; index += 1) {
        const topIndex = borderLoop[index];
        const sourcePositionIndex = topIndex * 3;
        const sourceWeightIndex = topIndex * 4;
        const skirtVertexIndex = topVertexCount + index;
        const skirtPositionIndex = skirtVertexIndex * 3;

        positions[skirtPositionIndex] = positions[sourcePositionIndex];
        positions[skirtPositionIndex + 1] = positions[sourcePositionIndex + 1] - SKIRT_DEPTH;
        positions[skirtPositionIndex + 2] = positions[sourcePositionIndex + 2];
        uvs[skirtVertexIndex * 2] = uvs[topIndex * 2];
        uvs[(skirtVertexIndex * 2) + 1] = uvs[(topIndex * 2) + 1];

        colors[skirtPositionIndex] = colors[sourcePositionIndex];
        colors[skirtPositionIndex + 1] = colors[sourcePositionIndex + 1];
        colors[skirtPositionIndex + 2] = colors[sourcePositionIndex + 2];
        normals[skirtPositionIndex] = normals[sourcePositionIndex];
        normals[skirtPositionIndex + 1] = normals[sourcePositionIndex + 1];
        normals[skirtPositionIndex + 2] = normals[sourcePositionIndex + 2];

        if (materialKind === 'terrain') {
            const skirtWeightIndex = skirtVertexIndex * 4;
            surfaceWeights[skirtWeightIndex] = surfaceWeights[sourceWeightIndex];
            surfaceWeights[skirtWeightIndex + 1] = surfaceWeights[sourceWeightIndex + 1];
            surfaceWeights[skirtWeightIndex + 2] = surfaceWeights[sourceWeightIndex + 2];
            surfaceWeights[skirtWeightIndex + 3] = surfaceWeights[sourceWeightIndex + 3];
            surfaceOverrides[skirtWeightIndex] = surfaceOverrides[sourceWeightIndex];
            surfaceOverrides[skirtWeightIndex + 1] = surfaceOverrides[sourceWeightIndex + 1];
            surfaceOverrides[skirtWeightIndex + 2] = surfaceOverrides[sourceWeightIndex + 2];
            surfaceOverrides[skirtWeightIndex + 3] = surfaceOverrides[sourceWeightIndex + 3];
        }
    }

    const topIndexCount = resolution * resolution * 6;
    const skirtIndexCount = borderLoop.length * 6;
    const indices = new Uint32Array(topIndexCount + skirtIndexCount);
    let writeIndex = 0;

    for (let z = 0; z < resolution; z += 1) {
        for (let x = 0; x < resolution; x += 1) {
            const a = z * stride + x;
            const b = a + 1;
            const c = a + stride;
            const d = c + 1;
            indices[writeIndex++] = a;
            indices[writeIndex++] = c;
            indices[writeIndex++] = b;
            indices[writeIndex++] = b;
            indices[writeIndex++] = c;
            indices[writeIndex++] = d;
        }
    }

    for (let index = 0; index < borderLoop.length; index += 1) {
        const next = (index + 1) % borderLoop.length;
        const topA = borderLoop[index];
        const topB = borderLoop[next];
        const skirtA = topVertexCount + index;
        const skirtB = topVertexCount + next;
        indices[writeIndex++] = topA;
        indices[writeIndex++] = topB;
        indices[writeIndex++] = skirtA;
        indices[writeIndex++] = skirtA;
        indices[writeIndex++] = topB;
        indices[writeIndex++] = skirtB;
    }

    return {
        positions,
        normals,
        colors,
        uvs,
        indices,
        surfaceWeights,
        surfaceOverrides
    };
}

function buildWaterDepthTextureData(node, sampler, resolution = 64) {
    const size = Math.max(4, resolution);
    const data = new Uint8Array(size * size * 4);
    for (let z = 0; z < size; z += 1) {
        const vz = size === 1 ? 0 : z / (size - 1);
        const worldZ = node.minZ + vz * node.size;
        for (let x = 0; x < size; x += 1) {
            const ux = size === 1 ? 0 : x / (size - 1);
            const worldX = node.minX + ux * node.size;
            const terrainHeight = sampler.getAltitudeAt(worldX, worldZ);
            const depth = Math.max(0, Math.min(WATER_DEPTH_BANDS.deepEnd, SEA_LEVEL - terrainHeight));
            const encoded = Math.round((depth / WATER_DEPTH_BANDS.deepEnd) * 255);
            const index = (z * size + x) * 4;
            data[index] = encoded;
            data[index + 1] = encoded;
            data[index + 2] = encoded;
            data[index + 3] = 255;
        }
    }
    return { data, size };
}

function buildLeafSurface(job) {
    const staticSampler = getStaticSampler();
    const worldData = getStaticWorldMetadata();
    if (!staticSampler || !Number.isInteger(job.nodeId)) {
        throw new Error('Leaf surface build requires initialized static sampler and node id');
    }

    const node = staticSampler.getNode(job.nodeId, job.depth);
    const decoded = sampleNodeHeightGrid(node, job.surfaceResolution, job.depth, staticSampler);
    if (!node || !decoded) {
        throw new Error('Leaf surface build failed to resolve node data');
    }

    const hasWater = leafContainsWater(decoded.heights);
    const terrain = createLeafSurfaceBuffers({
        node,
        heights: decoded.heights,
        stride: decoded.stride,
        worldData,
        sampler: staticSampler,
        materialKind: 'terrain'
    });

    let water = null;
    let waterDepth = null;
    if (hasWater) {
        water = createLeafSurfaceBuffers({
            node,
            heights: decoded.heights,
            stride: decoded.stride,
            worldData,
            sampler: staticSampler,
            materialKind: 'water'
        });
        waterDepth = buildWaterDepthTextureData(node, staticSampler, job.waterDepthResolution);
    }

    return {
        node: {
            minX: node.minX,
            minZ: node.minZ,
            size: node.size
        },
        surfaceResolution: job.surfaceResolution,
        hasWater,
        terrain,
        water,
        waterDepth
    };
}

function buildChunkBase(job) {
    const { cx, cz, lodCfg, positions, colors, surfaceWeights, surfaceOverrides, wPos, wCols } = job;
    const staticWorldMetadata = getStaticWorldMetadata();

    const chunkMinX = cx * CHUNK_SIZE;
    const chunkMinZ = cz * CHUNK_SIZE;
    const chunkMaxX = chunkMinX + CHUNK_SIZE;
    const chunkMaxZ = chunkMinZ + CHUNK_SIZE;
    const margin = 300; // Buffer for feathering/overrides

    const localRoadSegments = [];
    const localRoadsForOverrides = [];

    if (staticWorldMetadata?.roads) {
        for (const road of staticWorldMetadata.roads) {
            if (!road.points || road.points.length < 2) continue;
            
            // Check if road is within chunk boundary + margin
            let roadMinX = Infinity, roadMaxX = -Infinity, roadMinZ = Infinity, roadMaxZ = -Infinity;
            for (const p of road.points) {
                if (p[0] < roadMinX) roadMinX = p[0];
                if (p[0] > roadMaxX) roadMaxX = p[0];
                if (p[1] < roadMinZ) roadMinZ = p[1];
                if (p[1] > roadMaxZ) roadMaxZ = p[1];
            }

            if (roadMaxX < chunkMinX - margin || roadMinX > chunkMaxX + margin ||
                roadMaxZ < chunkMinZ - margin || roadMinZ > chunkMaxZ + margin) {
                continue;
            }

            localRoadsForOverrides.push(road);
            
            let roadWidth = road.width;
            if (!Number.isFinite(roadWidth)) {
                roadWidth = road.kind === 'taxiway' ? 12.0 : 8.0; 
            }
            
            const halfWidth = roadWidth * 0.5 + 32.0; 
            const embankment = 48.0; 
            const totalRadius = halfWidth + embankment;

            for (let i = 0; i < road.points.length - 1; i++) {
                localRoadSegments.push({ p1: road.points[i], p2: road.points[i+1], halfWidth, embankment, totalRadius });
            }
        }
    }

    function distToSegment(px, pz, ax, az, bx, bz, out) {
        const l2 = (bx - ax) * (bx - ax) + (bz - az) * (bz - az);
        if (l2 === 0) {
            out.dist = Math.hypot(px - ax, pz - az);
            out.projX = ax;
            out.projZ = az;
            return;
        }
        let t = ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / l2;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const projX = ax + t * (bx - ax);
        const projZ = az + t * (bz - az);
        out.dist = Math.hypot(px - projX, pz - projZ);
        out.projX = projX;
        out.projZ = projZ;
    }

    const tmpSegOut = { dist: 0, projX: 0, projZ: 0 };
    
    // A helper to get the potentially carved height so slope calculations match the physics surface
    function getCarvedHeight(vx, vz) {
        let height = getTerrainHeight(vx, vz, Noise);
        if (localRoadSegments.length > 0) {
            let maxBlend = 0;
            let targetHeight = height;

            for (let i = 0; i < localRoadSegments.length; i++) {
                const seg = localRoadSegments[i];
                distToSegment(vx, vz, seg.p1[0], seg.p1[1], seg.p2[0], seg.p2[1], tmpSegOut);
                if (tmpSegOut.dist < seg.totalRadius) {
                    let blend = 0;
                    if (tmpSegOut.dist <= seg.halfWidth) {
                        blend = 1.0;
                    } else {
                        const t = 1.0 - (tmpSegOut.dist - seg.halfWidth) / seg.embankment;
                        blend = t * t * (3 - 2 * t);
                    }
                    if (blend > maxBlend) {
                        maxBlend = blend;
                        targetHeight = getTerrainHeight(tmpSegOut.projX, tmpSegOut.projZ, Noise);
                    }
                }
            }
            if (maxBlend > 0) {
                height = height * (1 - maxBlend) + targetHeight * maxBlend;
            }
        }
        return height;
    }

    // Process terrain
    for (let i = 0; i < positions.length; i += 3) {
        let lx = positions[i];
        let lz = positions[i + 2];
        let vx = lx + cx * CHUNK_SIZE;
        let vz = lz + cz * CHUNK_SIZE;

        let height = getCarvedHeight(vx, vz);
        positions[i + 1] = height;

        const sampleDist = Math.max(12, 90 / Math.max(1, lodCfg.terrainRes));
        const hx = getCarvedHeight(vx + sampleDist, vz);
        const hz = getCarvedHeight(vx, vz + sampleDist);
        const slope = Math.max(Math.abs(hx - height), Math.abs(hz - height)) / sampleDist;
        const terrainMasks = getTerrainMaskSet(vx, vz);

        const col = srgbArrayToLinear(getTerrainBaseSrgb(height));
        const weights = getTerrainSurfaceWeights(height, slope, terrainMasks);
        const overrides = getTerrainSurfaceOverrides(vx, vz, staticWorldMetadata, localRoadsForOverrides);

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
        const terrainMasks = getTerrainMaskSet(vx, vz);
        if (slope > 0.8 || terrainMasks.cliff > 0.72) continue;

        const macroUrban = (Noise.fractal(vx, vz, 3, 0.5, 0.00035) + 1) * 0.5;
        const hubUrban = cityHubInfluence(vx, vz);
        const corridorUrban = Math.max(0, 1 - Math.abs(Math.abs(vx) - 1800) / 1800) * Math.max(0, 1 - Math.abs(vz) / 14000);
        const urbanScore = Math.max(0, Math.min(1, hubUrban * 0.65 + macroUrban * 0.25 + corridorUrban * 0.25));
        const district = getDistrictProfile(vx, vz, urbanScore, height);

        const parkNoise = (Noise.fractal(vx - 20000, vz + 15000, 3, 0.5, 0.0025) + 1) * 0.5;
        const isPark = urbanScore > 0.35 && parkNoise > 0.7;
        const forestNoise = (Noise.fractal(vx + 5000, vz + 5000, 3, 0.5, 0.002) + 1) * 0.5;

        if (lodCfg.enableTrees && forestNoise > 0.45 && !isPark) {
            const forest = getForestProfile(vx, vz, height, forestNoise, urbanScore, Noise, terrainMasks);
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
            self.postMessage({ type: 'initStaticMap_done' });
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
        } else if (type === 'leafSurface') {
            const result = buildLeafSurface(payload);
            const transferables = [
                result.terrain.positions.buffer,
                result.terrain.normals.buffer,
                result.terrain.colors.buffer,
                result.terrain.uvs.buffer,
                result.terrain.indices.buffer,
                result.terrain.surfaceWeights.buffer,
                result.terrain.surfaceOverrides.buffer
            ];
            if (result.water) {
                transferables.push(
                    result.water.positions.buffer,
                    result.water.normals.buffer,
                    result.water.colors.buffer,
                    result.water.uvs.buffer,
                    result.water.indices.buffer
                );
            }
            if (result.waterDepth) {
                transferables.push(result.waterDepth.data.buffer);
            }
            self.postMessage({
                jobId,
                type: 'leafSurface_done',
                result
            }, transferables);
        }
    } catch (err) {
        self.postMessage({ jobId, error: err.message, stack: err.stack });
    }
};
