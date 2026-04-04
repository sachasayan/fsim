// @ts-check

import * as THREE from 'three';

type Bounds = {
    minX: number;
    minZ: number;
    maxX: number;
    maxZ: number;
};

type PhysicsLike = {
    position: { x: number; z: number };
    velocity?: { x?: number; z?: number };
};

type LeafStateLike = {
    leafId: string;
    nodeId?: number | null;
    depth?: number;
    size?: number;
    bounds?: Bounds | null;
    chunkKeys?: string[];
    blockingReady?: boolean;
    propState?: string;
    pendingSinceAtMs?: number | null;
    enqueuedAtMs?: number | null;
    retired?: boolean;
    state?: string;
    terrainMesh?: THREE.Mesh | null;
    waterMesh?: THREE.Mesh | null;
    waterDepthBinding?: {
        texture: THREE.Texture | null;
        uvMin: THREE.Vector2;
        uvMax: THREE.Vector2;
    } | null;
    hasWater?: boolean;
    surfaceResolution?: number | null;
    waterSurfaceResolution?: number | null;
    buildVersion?: number;
    lastBuildStartedAtMs?: number | null;
    workerBuildStartedAtMs?: number | null;
    workerBuildPromise?: Promise<void> | null;
    readyChunkCoverageActive?: boolean;
};

type TerrainLeafSurfaceRuntimeOptions = {
    scene: THREE.Scene;
    activeLeaves: Map<string, LeafStateLike>;
    readyLeafSurfaceChunkCounts: Map<string, number>;
    terrainMaterial: THREE.Material;
    waterMaterial: THREE.MeshStandardMaterial;
    waterSurfaceUniforms: Record<string, any>;
    dispatchTerrainWorker: (kind: string, payload: Record<string, unknown>) => Promise<any>;
    getStaticSampler: () => any;
    getNativeSurfaceResolution: (nodeSize: number, options?: { bootstrapBlocking?: boolean }) => number;
    getWaterSurfaceResolution: (terrainSurfaceResolution: number, nodeSize: number, options?: { bootstrapBlocking?: boolean }) => number;
    getPhysicsState: () => PhysicsLike;
    isBootstrapMode: () => boolean;
    CHUNK_SIZE: number;
    HIGH_LOD_SURFACE_RESOLUTION: number;
    skirtDepth: number;
    SEA_LEVEL: number;
    WATER_DEPTH_BANDS: { deepEnd: number; foam: number; shallowStart: number; shallowEnd: number };
    srgbArrayToLinear: (rgb: number[]) => { r: number; g: number; b: number };
    getTerrainBaseSrgb: (height: number) => number[];
    getWaterDepthSrgb: (depth: number) => number[];
    getTerrainSurfaceWeights: (height: number, slope: number, maskSet: unknown) => number[];
    getTerrainMaskSet: (x: number, z: number) => unknown;
    configureWaterMaterialDebug: (material: THREE.Material, options?: Record<string, unknown>) => void;
    acquireLeafWaterMaterial: (waterDepthBinding: { texture: THREE.Texture | null; uvMin: THREE.Vector2; uvMax: THREE.Vector2 } | null, node: { minX: number; minZ: number; size: number }) => THREE.Material;
    acquireWaterDepthTextureFromPayload: (payload: any) => { texture: THREE.Texture | null; uvMin: THREE.Vector2; uvMax: THREE.Vector2 } | null;
    isLeafGenerationEnabled: () => boolean;
    isTerrainSurfaceVisible: () => boolean;
    isWaterSurfaceVisible: () => boolean;
    shouldSurfaceCastShadow: (bounds?: unknown) => boolean;
    shouldSurfaceReceiveShadow: (bounds?: unknown) => boolean;
    shouldWaterReceiveShadow: (bounds?: unknown) => boolean;
    disposeLeafRuntimeLeaf: (leafState: LeafStateLike) => void;
    recordLeafCompletion: (leafState: LeafStateLike, now: number) => void;
    recordLeafBuildBreakdown: (sample: Record<string, number | null | undefined>) => void;
    recordLeafBuildApplyTiming: (durationMs: number) => void;
    recordTerrainGenerationPerf: (kind: string, sample: Record<string, number | null | undefined>) => void;
    resolveRetiredLeafTransitions: (selectedLeafStates?: LeafStateLike[]) => Set<string>;
    syncLeafSurfaceTransitionVisibility: (selectedLeafStates?: LeafStateLike[]) => void;
    syncChunkBaseSurfaceVisibility: (chunkKeys?: Iterable<string> | null) => void;
    distanceToLeafBoundsSq: (leaf: LeafStateLike | Bounds | null | undefined, x: number, z: number) => number;
};

function computeGridNormals(positions: Float32Array, segments: number) {
    const verticesPerSide = segments + 1;
    const normals = new Float32Array(positions.length);

    for (let row = 0; row < verticesPerSide; row += 1) {
        const rowOffset = row * verticesPerSide;
        const rowUp = Math.max(0, row - 1) * verticesPerSide;
        const rowDown = Math.min(verticesPerSide - 1, row + 1) * verticesPerSide;

        for (let col = 0; col < verticesPerSide; col += 1) {
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

function buildBorderLoopIndices(stride: number) {
    const indices = [];
    for (let x = 0; x < stride; x += 1) indices.push(x);
    for (let z = 1; z < stride; z += 1) indices.push((z * stride) + (stride - 1));
    for (let x = stride - 2; x >= 0; x -= 1) indices.push(((stride - 1) * stride) + x);
    for (let z = stride - 2; z > 0; z -= 1) indices.push(z * stride);
    return indices;
}

export function createTerrainLeafSurfaceRuntime({
    scene,
    activeLeaves,
    readyLeafSurfaceChunkCounts,
    terrainMaterial,
    waterMaterial,
    waterSurfaceUniforms,
    dispatchTerrainWorker,
    getStaticSampler,
    getNativeSurfaceResolution,
    getWaterSurfaceResolution,
    getPhysicsState,
    isBootstrapMode,
    CHUNK_SIZE,
    HIGH_LOD_SURFACE_RESOLUTION,
    skirtDepth,
    SEA_LEVEL,
    WATER_DEPTH_BANDS,
    srgbArrayToLinear,
    getTerrainBaseSrgb,
    getWaterDepthSrgb,
    getTerrainSurfaceWeights,
    getTerrainMaskSet,
    configureWaterMaterialDebug,
    acquireLeafWaterMaterial,
    acquireWaterDepthTextureFromPayload,
    isLeafGenerationEnabled,
    isTerrainSurfaceVisible,
    isWaterSurfaceVisible,
    shouldSurfaceCastShadow,
    shouldSurfaceReceiveShadow,
    shouldWaterReceiveShadow,
    disposeLeafRuntimeLeaf,
    recordLeafCompletion,
    recordLeafBuildBreakdown,
    recordLeafBuildApplyTiming,
    recordTerrainGenerationPerf,
    resolveRetiredLeafTransitions,
    syncLeafSurfaceTransitionVisibility,
    syncChunkBaseSurfaceVisibility,
    distanceToLeafBoundsSq
}: TerrainLeafSurfaceRuntimeOptions) {
    const pendingLeafBuilds: Array<{ leafId: string; priority: number }> = [];
    const pendingLeafBuildIds = new Set<string>();
    let pendingLeafQueueDirty = false;
    const pendingLeafApplies: Array<{ leafId: string; buildVersion: number; result: any; workerMs: number | null; priority: number }> = [];
    let pendingLeafApplyQueueDirty = false;

    function createLeafSurfaceGeometry({
        node,
        heights,
        stride,
        materialKind
    }: {
        node: { minX: number; minZ: number; size: number };
        heights: Float32Array;
        stride: number;
        materialKind: 'terrain' | 'water';
    }) {
        const resolution = stride - 1;
        const topVertexCount = stride * stride;
        const borderLoop = buildBorderLoopIndices(stride);
        const vertexCount = topVertexCount + borderLoop.length;
        const positions = new Float32Array(vertexCount * 3);
        const colors = new Float32Array(vertexCount * 3);
        const uvs = new Float32Array(vertexCount * 2);
        const surfaceWeights = materialKind === 'terrain' ? new Float32Array(vertexCount * 4) : null;
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

                if (materialKind === 'terrain' && surfaceWeights) {
                    const weightIndex = index * 4;
                    const weights = getTerrainSurfaceWeights(height, slope, getTerrainMaskSet(worldX, worldZ));
                    surfaceWeights[weightIndex] = weights[0];
                    surfaceWeights[weightIndex + 1] = weights[1];
                    surfaceWeights[weightIndex + 2] = weights[2];
                    surfaceWeights[weightIndex + 3] = weights[3];
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
            positions[skirtPositionIndex + 1] = positions[sourcePositionIndex + 1] - skirtDepth;
            positions[skirtPositionIndex + 2] = positions[sourcePositionIndex + 2];
            uvs[skirtVertexIndex * 2] = uvs[topIndex * 2];
            uvs[(skirtVertexIndex * 2) + 1] = uvs[(topIndex * 2) + 1];

            colors[skirtPositionIndex] = colors[sourcePositionIndex];
            colors[skirtPositionIndex + 1] = colors[sourcePositionIndex + 1];
            colors[skirtPositionIndex + 2] = colors[sourcePositionIndex + 2];
            normals[skirtPositionIndex] = normals[sourcePositionIndex];
            normals[skirtPositionIndex + 1] = normals[sourcePositionIndex + 1];
            normals[skirtPositionIndex + 2] = normals[sourcePositionIndex + 2];

            if (materialKind === 'terrain' && surfaceWeights) {
                const skirtWeightIndex = skirtVertexIndex * 4;
                surfaceWeights[skirtWeightIndex] = surfaceWeights[sourceWeightIndex];
                surfaceWeights[skirtWeightIndex + 1] = surfaceWeights[sourceWeightIndex + 1];
                surfaceWeights[skirtWeightIndex + 2] = surfaceWeights[sourceWeightIndex + 2];
                surfaceWeights[skirtWeightIndex + 3] = surfaceWeights[sourceWeightIndex + 3];
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

        const geometry = new THREE.BufferGeometry();
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        if (materialKind === 'terrain' && surfaceWeights) {
            geometry.setAttribute('surfaceWeights', new THREE.Float32BufferAttribute(surfaceWeights, 4));
        }
        return geometry;
    }

    function createLeafSurfaceGeometryFromBuffers(payload: any, materialKind: 'terrain' | 'water' = 'terrain') {
        if (!payload) return null;
        const geometry = new THREE.BufferGeometry();
        geometry.setIndex(new THREE.BufferAttribute(payload.indices, 1));
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(payload.positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(payload.normals, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(payload.colors, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(payload.uvs, 2));
        if (materialKind === 'terrain' && payload.surfaceWeights) {
            geometry.setAttribute('surfaceWeights', new THREE.Float32BufferAttribute(payload.surfaceWeights, 4));
        }
        return geometry;
    }

    function createWaterDepthTextureFromPayload(payload: any) {
        if (!payload?.data || !Number.isFinite(payload.size)) return null;
        const texture = new THREE.DataTexture(payload.data, payload.size, payload.size, THREE.RGBAFormat);
        texture.colorSpace = THREE.NoColorSpace;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        return {
            texture,
            uvMin: new THREE.Vector2(0, 0),
            uvMax: new THREE.Vector2(1, 1)
        };
    }

    function sampleNodeHeightGrid(sampler: any, node: any, resolution: number, depth: number) {
        if (!sampler || !node || !Number.isFinite(resolution) || resolution < 1) {
            return null;
        }

        const decodedLeaf = resolution === HIGH_LOD_SURFACE_RESOLUTION ? sampler.decodeLeafHeightSamples(node.id, depth) : null;
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

    function createWaterDepthTexture(node: any, sampler: any, resolution = 64) {
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

        const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
        texture.colorSpace = THREE.NoColorSpace;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        return texture;
    }

    function leafContainsWater(heights: Float32Array | null | undefined) {
        if (!heights) return false;
        for (let index = 0; index < heights.length; index += 1) {
            if (heights[index] < SEA_LEVEL) {
                return true;
            }
        }
        return false;
    }

    function createLeafWaterMaterial(waterDepthBinding: { texture: THREE.Texture | null; uvMin: THREE.Vector2; uvMax: THREE.Vector2 } | null, node: { minX: number; minZ: number; size: number }) {
        const material = waterMaterial.clone();
        material.normalMap = waterMaterial.normalMap;
        material.normalScale = waterMaterial.normalScale.clone();

        const leafWaterUniforms = {
            uWaterDepthTex: { value: waterDepthBinding?.texture || null },
            uWaterDepthUvMin: { value: waterDepthBinding?.uvMin?.clone?.() || new THREE.Vector2(0, 0) },
            uWaterDepthUvMax: { value: waterDepthBinding?.uvMax?.clone?.() || new THREE.Vector2(1, 1) },
            uWaterBoundsMin: { value: new THREE.Vector2(node.minX, node.minZ) },
            uWaterBoundsSize: { value: new THREE.Vector2(node.size, node.size) },
            uWaterDepthScale: { value: WATER_DEPTH_BANDS.deepEnd },
            uWaterFoamDepth: { value: WATER_DEPTH_BANDS.foam },
            uWaterShallowStart: { value: WATER_DEPTH_BANDS.shallowStart },
            uWaterShallowEnd: { value: WATER_DEPTH_BANDS.shallowEnd },
            uWaterDeepEnd: { value: WATER_DEPTH_BANDS.deepEnd },
            uWaterFoamColor: { value: waterSurfaceUniforms.uWaterFoamColor.value.clone() },
            uWaterShallowColor: { value: waterSurfaceUniforms.uWaterShallowColor.value.clone() },
            uWaterDeepColor: { value: waterSurfaceUniforms.uWaterDeepColor.value.clone() }
        };

        configureWaterMaterialDebug(material, {
            isFarLOD: false,
            waterUniforms: leafWaterUniforms
        });
        return material;
    }

    function enqueueCompletedLeafApply(leafState: LeafStateLike, result: any, workerMs: number | null) {
        if (!leafState || !result) return;
        pendingLeafApplies.push({
            leafId: leafState.leafId,
            buildVersion: leafState.buildVersion || 0,
            result,
            workerMs,
            priority: getLeafBuildPriority(leafState)
        });
        pendingLeafApplyQueueDirty = true;
    }

    function enqueueLeafBuild(leafState: LeafStateLike, priority = 0) {
        if (!leafState || pendingLeafBuildIds.has(leafState.leafId) || !isLeafGenerationEnabled()) return;
        leafState.enqueuedAtMs = performance.now();
        if (!Number.isFinite(leafState.pendingSinceAtMs)) {
            leafState.pendingSinceAtMs = leafState.enqueuedAtMs;
        }
        pendingLeafBuildIds.add(leafState.leafId);
        pendingLeafBuilds.push({ leafId: leafState.leafId, priority });
        pendingLeafQueueDirty = true;
    }

    function getLeafCenter(leafState: LeafStateLike) {
        const bounds = leafState?.bounds;
        if (!bounds) return null;
        return {
            x: (bounds.minX + bounds.maxX) * 0.5,
            z: (bounds.minZ + bounds.maxZ) * 0.5
        };
    }

    function getLeafBuildPriority(leafState: LeafStateLike) {
        if (!leafState) return Number.POSITIVE_INFINITY;
        const physicsState = getPhysicsState();
        const distanceSq = distanceToLeafBoundsSq(leafState, physicsState.position.x, physicsState.position.z);
        const velocityX = Number.isFinite(physicsState.velocity?.x) ? physicsState.velocity?.x || 0 : 0;
        const velocityZ = Number.isFinite(physicsState.velocity?.z) ? physicsState.velocity?.z || 0 : 0;
        const speed = Math.hypot(velocityX, velocityZ);
        let effectiveDistanceSq = distanceSq;
        let forwardBoost = 0;

        if (speed > 1) {
            for (const lookaheadSeconds of [0.4, 0.9, 1.6]) {
                const predictedX = physicsState.position.x + velocityX * lookaheadSeconds;
                const predictedZ = physicsState.position.z + velocityZ * lookaheadSeconds;
                effectiveDistanceSq = Math.min(effectiveDistanceSq, distanceToLeafBoundsSq(leafState, predictedX, predictedZ));
            }

            const center = getLeafCenter(leafState);
            if (center) {
                const toLeafX = center.x - physicsState.position.x;
                const toLeafZ = center.z - physicsState.position.z;
                const toLeafLength = Math.hypot(toLeafX, toLeafZ);
                if (toLeafLength > 1e-3) {
                    const alignment = ((toLeafX * velocityX) + (toLeafZ * velocityZ)) / (toLeafLength * speed);
                    if (alignment > 0) {
                        forwardBoost = alignment * Math.min(60000, speed * 220);
                    }
                }
            }
        }

        const pendingAgeMs = Number.isFinite(leafState.pendingSinceAtMs)
            ? Math.max(0, performance.now() - (leafState.pendingSinceAtMs || 0))
            : 0;
        const pendingAgeBoost = Math.min(120000, pendingAgeMs * 150);
        const blockingBoost = leafState.blockingReady ? 1_000_000 : 0;
        const nearBoost = effectiveDistanceSq < (800 * 800) ? 120000 : effectiveDistanceSq < (1600 * 1600) ? 40000 : 0;
        const baseReadyBoost = leafState.propState === 'base_ready' ? 20000 : 0;
        const sizeBias = Number.isFinite(leafState.size) ? leafState.size * 0.01 : 0;
        return effectiveDistanceSq - blockingBoost - forwardBoost - pendingAgeBoost - nearBoost - baseReadyBoost - sizeBias;
    }

    function refreshLeafBuildQueuePriorities() {
        if (pendingLeafBuilds.length === 0) return;
        for (const job of pendingLeafBuilds) {
            const leafState = activeLeaves.get(job.leafId);
            if (!leafState || leafState.retired || leafState.state === 'surface_ready') continue;
            job.priority = getLeafBuildPriority(leafState);
        }
        pendingLeafQueueDirty = true;
    }

    function refreshLeafApplyQueuePriorities() {
        if (pendingLeafApplies.length === 0) return;
        for (const job of pendingLeafApplies) {
            const leafState = activeLeaves.get(job.leafId);
            job.priority = (!leafState || leafState.retired) ? Number.POSITIVE_INFINITY : getLeafBuildPriority(leafState);
        }
        pendingLeafApplyQueueDirty = true;
    }

    function applyWorkerLeafSurfaceResult(leafState: LeafStateLike, result: any, { workerMs = null } = {}) {
        if (!leafState || !result?.terrain || !result?.node) {
            return;
        }

        const buildStartedAtMs = performance.now();
        const materialSetupStartedAtMs = performance.now();
        const terrainGeometry = createLeafSurfaceGeometryFromBuffers(result.terrain, 'terrain');
        const terrainGeometryMs = performance.now() - materialSetupStartedAtMs;
        const terrainMesh = new THREE.Mesh(terrainGeometry!, terrainMaterial);
        terrainMesh.castShadow = shouldSurfaceCastShadow(leafState.bounds);
        terrainMesh.receiveShadow = shouldSurfaceReceiveShadow(leafState.bounds);
        terrainMesh.visible = isTerrainSurfaceVisible();
        terrainMesh.position.set(result.node.minX, 0, result.node.minZ);

        let waterGeometryMs = 0;
        let waterDepthTextureMs = 0;
        let waterDepthBinding = null;
        let waterMesh = null;
        if (result.hasWater && result.water) {
            const waterGeometryStartedAtMs = performance.now();
            const waterGeometry = createLeafSurfaceGeometryFromBuffers(result.water, 'water');
            waterGeometryMs = performance.now() - waterGeometryStartedAtMs;
            const waterDepthStartedAtMs = performance.now();
            waterDepthBinding = acquireWaterDepthTextureFromPayload(result.waterDepth) || createWaterDepthTextureFromPayload(result.waterDepth);
            waterDepthTextureMs = performance.now() - waterDepthStartedAtMs;
            const leafWaterMaterial = acquireLeafWaterMaterial(waterDepthBinding, result.node) || createLeafWaterMaterial(waterDepthBinding, result.node);
            waterMesh = new THREE.Mesh(waterGeometry!, leafWaterMaterial);
            waterMesh.receiveShadow = shouldWaterReceiveShadow(leafState.bounds);
            waterMesh.visible = isWaterSurfaceVisible();
            waterMesh.position.set(result.node.minX, 0, result.node.minZ);
        }
        const materialSetupMs = performance.now() - materialSetupStartedAtMs;

        const sceneAttachStartedAtMs = performance.now();
        if (leafState.terrainMesh || leafState.waterMesh) {
            disposeLeafRuntimeLeaf(leafState);
        }
        leafState.terrainMesh = terrainMesh;
        leafState.waterMesh = waterMesh;
        leafState.waterDepthBinding = waterDepthBinding;
        leafState.hasWater = result.hasWater === true;
        leafState.surfaceResolution = result.surfaceResolution;
        leafState.waterSurfaceResolution = result.waterSurfaceResolution ?? null;
        leafState.state = 'surface_ready';
        leafState.workerBuildPromise = null;
        leafState.workerBuildStartedAtMs = null;
        if (!leafState.readyChunkCoverageActive) {
            for (const key of leafState.chunkKeys || []) {
                readyLeafSurfaceChunkCounts.set(key, (readyLeafSurfaceChunkCounts.get(key) || 0) + 1);
            }
            leafState.readyChunkCoverageActive = true;
        }
        recordLeafCompletion(leafState, performance.now());
        scene.add(terrainMesh);
        if (waterMesh) {
            scene.add(waterMesh);
        }
        const selectedLeafStates = [];
        for (const activeLeafState of activeLeaves.values()) {
            if (!activeLeafState?.retired) selectedLeafStates.push(activeLeafState);
        }
        const visibilityDirtyChunkKeys = resolveRetiredLeafTransitions(selectedLeafStates);
        syncLeafSurfaceTransitionVisibility(selectedLeafStates);
        syncChunkBaseSurfaceVisibility(visibilityDirtyChunkKeys.size > 0 ? visibilityDirtyChunkKeys : null);
        const sceneAttachMs = performance.now() - sceneAttachStartedAtMs;
        recordLeafBuildBreakdown({
            sampleHeightMs: 0,
            terrainGeometryMs,
            waterGeometryMs,
            waterDepthTextureMs,
            materialSetupMs,
            sceneAttachMs,
            workerComputeMs: workerMs,
            totalMs: performance.now() - buildStartedAtMs
        });
        recordLeafBuildApplyTiming(performance.now() - buildStartedAtMs);
        recordTerrainGenerationPerf('leafSurface', {
            workerMs,
            applyMs: performance.now() - buildStartedAtMs
        });
    }

    function flushCompletedLeafApplies(maxAppliesPerFrame = 1, timeBudgetMs = 3) {
        const startedAtMs = performance.now();
        if (pendingLeafApplies.length === 0) {
            return { durationMs: 0, applies: 0 };
        }
        refreshLeafApplyQueuePriorities();
        if (pendingLeafApplyQueueDirty) {
            pendingLeafApplies.sort((a, b) => b.priority - a.priority);
            pendingLeafApplyQueueDirty = false;
        }

        let applies = 0;
        while (applies < maxAppliesPerFrame && pendingLeafApplies.length > 0) {
            if (applies > 0 && (performance.now() - startedAtMs) >= timeBudgetMs) break;
            const job = pendingLeafApplies.pop()!;
            const leafState = activeLeaves.get(job.leafId);
            if (!leafState || leafState.retired || (leafState.buildVersion || 0) !== job.buildVersion) continue;
            applyWorkerLeafSurfaceResult(leafState, job.result, { workerMs: job.workerMs });
            applies += 1;
        }

        return {
            durationMs: performance.now() - startedAtMs,
            applies
        };
    }

    function startWorkerLeafSurfaceBuild(leafState: LeafStateLike) {
        const sampler = getStaticSampler();
        if (!sampler || !Number.isInteger(leafState?.nodeId)) {
            leafState.state = 'error';
            leafState.workerBuildPromise = null;
            leafState.workerBuildStartedAtMs = null;
            return;
        }

        const node = sampler.getNode(leafState.nodeId, leafState.depth);
        if (!node) {
            leafState.state = 'error';
            leafState.workerBuildPromise = null;
            leafState.workerBuildStartedAtMs = null;
            return;
        }

        const surfaceResolution = getNativeSurfaceResolution(node.size ?? CHUNK_SIZE, {
            bootstrapBlocking: leafState.blockingReady
        });
        const waterSurfaceResolution = getWaterSurfaceResolution(surfaceResolution, node.size ?? CHUNK_SIZE, {
            bootstrapBlocking: leafState.blockingReady
        });
        const waterDepthResolution = (isBootstrapMode() && leafState.blockingReady) ? 16 : (isBootstrapMode() ? 32 : 64);
        const buildVersion = leafState.buildVersion;
        const workerStartedAtMs = performance.now();
        leafState.state = 'building_surface';
        leafState.workerBuildStartedAtMs = workerStartedAtMs;
        leafState.workerBuildPromise = dispatchTerrainWorker('leafSurface', {
            nodeId: leafState.nodeId,
            depth: leafState.depth,
            surfaceResolution,
            waterSurfaceResolution,
            waterDepthResolution
        }).then((result) => {
            const activeLeafState = activeLeaves.get(leafState.leafId);
            if (!activeLeafState || activeLeafState !== leafState || activeLeafState.retired || activeLeafState.buildVersion !== buildVersion) {
                return;
            }
            if (!isLeafGenerationEnabled()) {
                activeLeafState.state = activeLeafState.terrainMesh ? 'surface_ready' : 'pending_surface';
                activeLeafState.workerBuildPromise = null;
                activeLeafState.workerBuildStartedAtMs = null;
                return;
            }
            activeLeafState.state = 'awaiting_apply';
            activeLeafState.workerBuildPromise = null;
            activeLeafState.workerBuildStartedAtMs = null;
            enqueueCompletedLeafApply(activeLeafState, result, performance.now() - workerStartedAtMs);
        }).catch((error) => {
            const activeLeafState = activeLeaves.get(leafState.leafId);
            if (!activeLeafState || activeLeafState !== leafState || activeLeafState.buildVersion !== buildVersion) {
                return;
            }
            console.error('[terrain] Leaf surface worker build failed', error);
            activeLeafState.state = 'error';
            activeLeafState.workerBuildPromise = null;
            activeLeafState.workerBuildStartedAtMs = null;
        });
    }

    function processLeafBuildQueue(maxBuildsPerFrame = 4) {
        const startedAtMs = performance.now();
        if (!isLeafGenerationEnabled() || pendingLeafBuilds.length === 0) {
            return { durationMs: 0, builds: 0 };
        }
        refreshLeafBuildQueuePriorities();
        if (pendingLeafQueueDirty) {
            pendingLeafBuilds.sort((a, b) => b.priority - a.priority);
            pendingLeafQueueDirty = false;
        }

        let builds = 0;
        while (builds < maxBuildsPerFrame && pendingLeafBuilds.length > 0) {
            const job = pendingLeafBuilds.pop()!;
            pendingLeafBuildIds.delete(job.leafId);
            const leafState = activeLeaves.get(job.leafId);
            if (!leafState || leafState.retired || leafState.state === 'surface_ready' || leafState.workerBuildPromise) continue;
            leafState.buildVersion = (leafState.buildVersion || 0) + 1;
            leafState.lastBuildStartedAtMs = performance.now();
            startWorkerLeafSurfaceBuild(leafState);
            builds += 1;
        }

        flushCompletedLeafApplies(Math.max(1, Math.ceil(maxBuildsPerFrame * 0.5)), 4);

        return {
            durationMs: performance.now() - startedAtMs,
            builds
        };
    }

    return {
        pendingLeafBuilds,
        pendingLeafBuildIds,
        enqueueLeafBuild,
        getLeafBuildPriority,
        processLeafBuildQueue,
        flushCompletedLeafApplies,
        clearPendingLeafBuilds: () => {
            pendingLeafBuilds.length = 0;
            pendingLeafBuildIds.clear();
            pendingLeafApplies.length = 0;
            pendingLeafQueueDirty = false;
            pendingLeafApplyQueueDirty = false;
        },
        hasPendingLeafApplies: () => pendingLeafApplies.length > 0,
        sampleNodeHeightGrid,
        createWaterDepthTexture,
        leafContainsWater
    };
}
