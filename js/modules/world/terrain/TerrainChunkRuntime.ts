// @ts-check

import * as THREE from 'three';

type ChunkStateLike = {
    group?: THREE.Group | null;
    pendingGroup?: THREE.Group | null;
    cx?: number;
    cz?: number;
    bounds?: { minX: number; minZ: number; maxX: number; maxZ: number } | null;
    lod?: number;
    propsBuilt?: boolean;
    state?: string;
};

type TerrainChunkRuntimeOptions = {
    scene: THREE.Scene;
    CHUNK_SIZE: number;
    WARM_CHUNK_CACHE_MAX: number;
    terrainPerfState: {
        warmChunkCache: { hits: number; misses: number; evictions: number };
        chunkBaseRole: {
            buildStarts: number;
            buildCompletes: number;
            currentVisibleChunkCount: number;
            currentHiddenByReadyLeafCount: number;
        };
    };
    readyLeafSurfaceChunkCounts: Map<string, number>;
    createChunkBounds: (cx: number, cz: number) => { minX: number; minZ: number; maxX: number; maxZ: number };
    shouldSurfaceCastShadow: (bounds?: unknown) => boolean;
    shouldSurfaceReceiveShadow: (bounds?: unknown) => boolean;
    shouldWaterReceiveShadow: (bounds?: unknown) => boolean;
    markChunkShadowDirty: (chunkKey: string) => void;
    trackChunkBaseVisibility: (chunkKey: string, isVisible: boolean, hiddenByReadyLeaf: boolean, now?: number) => void;
    isBootstrapMode: () => boolean;
    isChunkGenerationEnabled: () => boolean;
    isTerrainSurfaceVisible: () => boolean;
    getCurrentBlockingChunkKeys: () => Set<string>;
    getChunkPriorityBoost: (key: string) => number;
    generateChunkBase: (cx: number, cz: number, lod: number) => Promise<THREE.Group>;
    generateChunkProps: (chunkGroup: THREE.Group, cx: number, cz: number, lod: number) => Promise<unknown>;
};

export function createTerrainChunkRuntime({
    scene,
    CHUNK_SIZE,
    WARM_CHUNK_CACHE_MAX,
    terrainPerfState,
    readyLeafSurfaceChunkCounts,
    createChunkBounds,
    shouldSurfaceCastShadow,
    shouldSurfaceReceiveShadow,
    shouldWaterReceiveShadow,
    markChunkShadowDirty,
    trackChunkBaseVisibility,
    isBootstrapMode,
    isChunkGenerationEnabled,
    isTerrainSurfaceVisible,
    getCurrentBlockingChunkKeys,
    getChunkPriorityBoost,
    generateChunkBase,
    generateChunkProps
}: TerrainChunkRuntimeOptions) {
    const terrainChunks = new Map<string, ChunkStateLike>();
    const warmChunkCache = new Map<string, {
        key: string;
        cx?: number;
        cz?: number;
        lod?: number;
        group: THREE.Group;
        cachedAt: number;
    }>();
    const pendingChunkBuilds: Array<{ cx: number; cz: number; lod: number; key: string; priority: number }> = [];
    const pendingChunkKeys = new Set<string>();
    let pendingQueueDirty = false;
    const pendingPropBuilds: Array<{ cx: number; cz: number; lod: number; priority: number; key: string; groupRef: THREE.Group | null }> = [];
    const pendingPropKeys = new Set<string>();
    let pendingPropQueueDirty = false;
    const chunkPools: THREE.Group[][] = [[], [], [], []];
    const instancedMeshPools = new Map<string, THREE.InstancedMesh[]>();

    function getPooledInstancedMesh(geometry: THREE.BufferGeometry, material: THREE.Material, count: number, { colorable = false } = {}) {
        const key = geometry.uuid + '_' + material.uuid;
        let pool = instancedMeshPools.get(key);
        if (!pool) {
            pool = [];
            instancedMeshPools.set(key, pool);
        }

        let bestIdx = -1;
        for (let i = 0; i < pool.length; i += 1) {
            const mesh = pool[i];
            if (mesh.instanceMatrix.count >= count) {
                if (bestIdx === -1 || mesh.instanceMatrix.count < pool[bestIdx].instanceMatrix.count) bestIdx = i;
            }
        }

        let mesh;
        if (bestIdx !== -1) {
            mesh = pool.splice(bestIdx, 1)[0];
        } else {
            const capacity = Math.max(count, 32);
            mesh = new THREE.InstancedMesh(geometry, material, capacity);
        }

        if (colorable && (!mesh.instanceColor || mesh.instanceColor.count < mesh.instanceMatrix.count)) {
            const colorArray = new Float32Array(mesh.instanceMatrix.count * 3);
            mesh.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3);
        }

        mesh.count = count;
        return mesh;
    }

    function recycleInstancedMesh(child: THREE.InstancedMesh) {
        child.count = 0;
        if (child.instanceMatrix) child.instanceMatrix.needsUpdate = false;
        if (child.instanceColor) child.instanceColor.needsUpdate = false;
        if (child.userData?.windmillBladeInstances) child.userData.windmillBladeInstances = null;
        child.userData = {};
        const key = child.geometry.uuid + '_' + child.material.uuid;
        let pool = instancedMeshPools.get(key);
        if (!pool) {
            pool = [];
            instancedMeshPools.set(key, pool);
        }
        pool.push(child);
    }

    function clearChunkPropMeshes(chunkGroup: THREE.Group | null | undefined) {
        if (!chunkGroup) return;
        chunkGroup.userData.windmillBladeMeshes = null;
        while (chunkGroup.children.length > 2) {
            const child = chunkGroup.children[chunkGroup.children.length - 1];
            chunkGroup.remove(child);
            if ((child as any).isInstancedMesh) {
                recycleInstancedMesh(child as THREE.InstancedMesh);
            }
        }
    }

    function getChunkBaseSurfaceMeshes(chunkGroup: THREE.Group | null | undefined) {
        return {
            terrainMesh: chunkGroup?.userData?.chunkBaseTerrainMesh || null,
            waterMesh: chunkGroup?.userData?.chunkBaseWaterMesh || null
        };
    }

    function setChunkBaseSurfaceMeshes(chunkGroup: THREE.Group | null | undefined, terrainMesh: THREE.Object3D | null, waterMesh: THREE.Object3D | null) {
        if (!chunkGroup) return;
        chunkGroup.userData.chunkBaseTerrainMesh = terrainMesh || null;
        chunkGroup.userData.chunkBaseWaterMesh = waterMesh || null;
    }

    function disposeChunkGroup(chunkGroup: THREE.Group | null | undefined) {
        if (!chunkGroup) return;
        scene.remove(chunkGroup);
        chunkGroup.userData.windmillBladeMeshes = null;
        const lod = chunkGroup.userData.lod;
        const { terrainMesh, waterMesh } = getChunkBaseSurfaceMeshes(chunkGroup);
        const preservedMeshes = new Set([terrainMesh, waterMesh].filter(Boolean));
        if (lod !== undefined && chunkPools[lod]) {
            for (let index = chunkGroup.children.length - 1; index >= 0; index -= 1) {
                const child = chunkGroup.children[index];
                if (preservedMeshes.has(child)) continue;
                chunkGroup.remove(child);
                if ((child as any).isInstancedMesh) {
                    recycleInstancedMesh(child as THREE.InstancedMesh);
                }
            }
            if (terrainMesh && waterMesh) {
                chunkPools[lod].push(chunkGroup);
            } else {
                setChunkBaseSurfaceMeshes(chunkGroup, null, null);
            }
        } else {
            chunkGroup.traverse((child: any) => {
                if (child.isMesh || child.isInstancedMesh) child.geometry.dispose();
            });
        }
    }

    function clearWarmChunkCache() {
        for (const cached of warmChunkCache.values()) {
            if (cached?.group) disposeChunkGroup(cached.group);
        }
        warmChunkCache.clear();
    }

    function cacheWarmChunkState(key: string, chunkState: ChunkStateLike) {
        if (!key || !chunkState?.group || chunkState.state !== 'done' || !chunkState.propsBuilt) {
            return false;
        }

        const cacheKey = `${key}|${chunkState.lod}`;
        const existing = warmChunkCache.get(cacheKey);
        if (existing?.group && existing.group !== chunkState.group) {
            disposeChunkGroup(existing.group);
        }

        scene.remove(chunkState.group);
        warmChunkCache.delete(cacheKey);
        warmChunkCache.set(cacheKey, {
            key,
            cx: chunkState.cx,
            cz: chunkState.cz,
            lod: chunkState.lod,
            group: chunkState.group,
            cachedAt: performance.now()
        });

        while (warmChunkCache.size > WARM_CHUNK_CACHE_MAX) {
            const oldestKey = warmChunkCache.keys().next().value;
            const oldest = warmChunkCache.get(oldestKey);
            warmChunkCache.delete(oldestKey);
            if (oldest?.group) disposeChunkGroup(oldest.group);
            terrainPerfState.warmChunkCache.evictions += 1;
        }

        return true;
    }

    function restoreWarmChunkState(key: string, lod: number) {
        const cacheKey = `${key}|${lod}`;
        const cached = warmChunkCache.get(cacheKey);
        if (!cached?.group) {
            terrainPerfState.warmChunkCache.misses += 1;
            return null;
        }

        warmChunkCache.delete(cacheKey);
        if (!cached.group.parent) scene.add(cached.group);
        terrainPerfState.warmChunkCache.hits += 1;
        return {
            group: cached.group,
            pendingGroup: null,
            cx: cached.cx,
            cz: cached.cz,
            bounds: Number.isFinite(cached.cx) && Number.isFinite(cached.cz)
                ? createChunkBounds(cached.cx, cached.cz)
                : null,
            lod,
            propsBuilt: true,
            state: 'done'
        };
    }

    function pruneChunkBaseSurface(chunkGroup: THREE.Group | null | undefined) {
        if (!chunkGroup) return;
        const chunkKey = chunkGroup.userData?.chunkKey;
        const { terrainMesh, waterMesh } = getChunkBaseSurfaceMeshes(chunkGroup);
        if (terrainMesh) {
            chunkGroup.remove(terrainMesh);
            (terrainMesh as any).geometry?.dispose?.();
        }
        if (waterMesh) {
            chunkGroup.remove(waterMesh);
            (waterMesh as any).geometry?.dispose?.();
        }
        setChunkBaseSurfaceMeshes(chunkGroup, null, null);
        if (typeof chunkKey === 'string') markChunkShadowDirty(chunkKey);
    }

    function activateChunkBaseGroup(chunkGroup: THREE.Group | null | undefined) {
        if (!chunkGroup) return;
        const chunkKey = chunkGroup.userData?.chunkKey;
        const bounds = chunkGroup?.userData?.bounds || null;
        const { terrainMesh, waterMesh } = getChunkBaseSurfaceMeshes(chunkGroup);
        if (terrainMesh) {
            (terrainMesh as any).visible = isTerrainSurfaceVisible();
            (terrainMesh as any).castShadow = shouldSurfaceCastShadow(bounds);
            (terrainMesh as any).receiveShadow = shouldSurfaceReceiveShadow(bounds);
        }
        if (waterMesh) {
            (waterMesh as any).visible = false;
            (waterMesh as any).receiveShadow = shouldWaterReceiveShadow(bounds);
        }
        if (typeof chunkKey === 'string') markChunkShadowDirty(chunkKey);
    }

    function ensureChunkHostGroup(chunkGroup: THREE.Group | null | undefined, cx: number, cz: number, lod: number) {
        const group = chunkGroup || new THREE.Group();
        group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
        group.userData.lod = lod;
        group.userData.chunkKey = `${cx},${cz}`;
        group.userData.bounds = createChunkBounds(cx, cz);
        if (!group.parent) {
            scene.add(group);
        }
        return group;
    }

    function chunkHasReadyLeafSurface(chunkKey: string) {
        return (readyLeafSurfaceChunkCounts.get(chunkKey) || 0) > 0;
    }

    function chunkNeedsVisibleBaseTerrain(chunkKey: string) {
        return isChunkGenerationEnabled() && isTerrainSurfaceVisible() && isBootstrapMode() && getCurrentBlockingChunkKeys().has(chunkKey);
    }

    function syncChunkBaseSurfaceVisibility(chunkKeys: Iterable<string> | null = null) {
        const keys = chunkKeys ? Array.from(chunkKeys) : Array.from(terrainChunks.keys());
        let currentVisibleChunkCount = 0;
        let currentHiddenByReadyLeafCount = 0;
        const now = performance.now();
        for (const chunkKey of keys) {
            const state = terrainChunks.get(chunkKey);
            const chunkGroup = state?.group;
            if (!chunkGroup) continue;
            const showBaseTerrain = chunkNeedsVisibleBaseTerrain(chunkKey) && !chunkHasReadyLeafSurface(chunkKey);
            const { terrainMesh, waterMesh } = getChunkBaseSurfaceMeshes(chunkGroup);
            if (!showBaseTerrain && !chunkNeedsVisibleBaseTerrain(chunkKey) && (terrainMesh || waterMesh)) {
                pruneChunkBaseSurface(chunkGroup);
            }
            const refreshedMeshes = getChunkBaseSurfaceMeshes(chunkGroup);
            const activeTerrainMesh = refreshedMeshes.terrainMesh as any;
            const activeWaterMesh = refreshedMeshes.waterMesh as any;
            if (activeTerrainMesh && activeTerrainMesh.visible !== showBaseTerrain) activeTerrainMesh.visible = showBaseTerrain;
            if (activeWaterMesh && activeWaterMesh.visible !== false) activeWaterMesh.visible = false;
            if ((activeTerrainMesh || activeWaterMesh) && typeof chunkKey === 'string') markChunkShadowDirty(chunkKey);
            if (activeTerrainMesh?.visible) currentVisibleChunkCount += 1;
            if (activeTerrainMesh && !activeTerrainMesh.visible && !showBaseTerrain) currentHiddenByReadyLeafCount += 1;
            trackChunkBaseVisibility(chunkKey, activeTerrainMesh?.visible === true, showBaseTerrain === false, now);
        }

        if (!chunkKeys) {
            terrainPerfState.chunkBaseRole.currentVisibleChunkCount = currentVisibleChunkCount;
            terrainPerfState.chunkBaseRole.currentHiddenByReadyLeafCount = currentHiddenByReadyLeafCount;
            return;
        }

        currentVisibleChunkCount = 0;
        currentHiddenByReadyLeafCount = 0;
        for (const [chunkKey, state] of terrainChunks.entries()) {
            const terrainMesh = state?.group?.userData?.chunkBaseTerrainMesh || null;
            if ((terrainMesh as any)?.visible) currentVisibleChunkCount += 1;
            if (terrainMesh && chunkHasReadyLeafSurface(chunkKey) && !(terrainMesh as any).visible) currentHiddenByReadyLeafCount += 1;
        }
        terrainPerfState.chunkBaseRole.currentVisibleChunkCount = currentVisibleChunkCount;
        terrainPerfState.chunkBaseRole.currentHiddenByReadyLeafCount = currentHiddenByReadyLeafCount;
    }

    function enqueueChunkBuild(cx: number, cz: number, lod: number, priority: number) {
        const key = `${cx}, ${cz}`;
        if (pendingChunkKeys.has(key)) return;
        pendingChunkKeys.add(key);
        pendingChunkBuilds.push({ cx, cz, lod, key, priority });
        pendingQueueDirty = true;
    }

    function markChunkQueueDirty() {
        pendingQueueDirty = true;
    }

    function removePendingPropJobs(key: string) {
        if (!pendingPropKeys.has(key)) return;
        for (let i = pendingPropBuilds.length - 1; i >= 0; i -= 1) {
            if (pendingPropBuilds[i].key === key) pendingPropBuilds.splice(i, 1);
        }
        pendingPropKeys.delete(key);
        pendingPropQueueDirty = true;
    }

    function enqueuePropBuild(cx: number, cz: number, lod: number, priority: number, key: string, groupRef: THREE.Group | null) {
        if (pendingPropKeys.has(key)) return;
        pendingPropKeys.add(key);
        pendingPropBuilds.push({ cx, cz, lod, priority, key, groupRef });
        pendingPropQueueDirty = true;
    }

    function markPropQueueDirty() {
        pendingPropQueueDirty = true;
    }

    function invalidateChunkProps() {
        clearWarmChunkCache();
        for (const [key, state] of terrainChunks.entries()) {
            removePendingPropJobs(key);
            const targetGroup = state.pendingGroup || state.group;
            if (!targetGroup) continue;
            clearChunkPropMeshes(targetGroup);
            state.propsBuilt = false;
            if (state.state !== 'building_base' && state.state !== 'error') {
                state.state = 'base_done';
                enqueuePropBuild(state.cx!, state.cz!, state.lod!, -getChunkPriorityBoost(key), key, targetGroup);
            }
        }
    }

    function processChunkBuildQueue(maxBuildsPerFrame = 2) {
        const startedAtMs = performance.now();
        if (!isChunkGenerationEnabled() || pendingChunkBuilds.length === 0) {
            return { durationMs: 0, builds: 0 };
        }
        if (pendingQueueDirty) {
            pendingChunkBuilds.sort((a, b) => b.priority - a.priority);
            pendingQueueDirty = false;
        }
        let builds = 0;
        while (builds < maxBuildsPerFrame && pendingChunkBuilds.length > 0) {
            const job = pendingChunkBuilds.pop()!;
            pendingChunkKeys.delete(job.key);
            const existing = terrainChunks.get(job.key);

            if (existing && existing.lod === job.lod) {
                if (!existing.propsBuilt && existing.state !== 'building_props') {
                    enqueuePropBuild(job.cx, job.cz, job.lod, job.priority, job.key, existing.group || existing.pendingGroup || null);
                }
                continue;
            }

            if (existing && existing.state === 'building_base' && existing.lod === job.lod) {
                continue;
            }

            if (!existing) {
                const restored = restoreWarmChunkState(job.key, job.lod);
                if (restored) {
                    terrainChunks.set(job.key, restored);
                    continue;
                }
            }

            let oldGroup = null;
            if (existing) {
                removePendingPropJobs(job.key);
                oldGroup = existing.group || null;
                if (existing.pendingGroup) disposeChunkGroup(existing.pendingGroup);
            }

            if (!chunkNeedsVisibleBaseTerrain(job.key)) {
                const hostGroup = ensureChunkHostGroup(oldGroup, job.cx, job.cz, job.lod);
                terrainChunks.set(job.key, {
                    group: hostGroup,
                    pendingGroup: null,
                    cx: job.cx,
                    cz: job.cz,
                    bounds: createChunkBounds(job.cx, job.cz),
                    lod: job.lod,
                    propsBuilt: false,
                    state: 'base_done'
                });
                enqueuePropBuild(job.cx, job.cz, job.lod, job.priority, job.key, hostGroup);
                syncChunkBaseSurfaceVisibility();
                builds += 1;
                continue;
            }

            terrainChunks.set(job.key, {
                group: oldGroup,
                pendingGroup: null,
                cx: job.cx,
                cz: job.cz,
                bounds: createChunkBounds(job.cx, job.cz),
                lod: job.lod,
                propsBuilt: false,
                state: 'building_base'
            });
            terrainPerfState.chunkBaseRole.buildStarts += 1;
            builds += 1;

            generateChunkBase(job.cx, job.cz, job.lod).then((group) => {
                const current = terrainChunks.get(job.key);
                if (current && current.lod === job.lod && current.state === 'building_base') {
                    activateChunkBaseGroup(group);
                    if (current.group) {
                        const priorState = {
                            group: current.group,
                            pendingGroup: null,
                            cx: current.cx,
                            cz: current.cz,
                            bounds: current.bounds,
                            lod: current.lod,
                            propsBuilt: current.propsBuilt,
                            state: current.propsBuilt ? 'done' : current.state
                        };
                        if (!cacheWarmChunkState(job.key, priorState)) disposeChunkGroup(current.group);
                    }
                    current.group = group;
                    setChunkBaseSurfaceMeshes(current.group, group.userData?.chunkBaseTerrainMesh || null, group.userData?.chunkBaseWaterMesh || null);
                    if (!current.group.parent) {
                        scene.add(current.group);
                    }
                    current.pendingGroup = null;
                    current.state = 'base_done';
                    terrainPerfState.chunkBaseRole.buildCompletes += 1;
                    enqueuePropBuild(job.cx, job.cz, job.lod, job.priority, job.key, group);
                    syncChunkBaseSurfaceVisibility();
                } else {
                    disposeChunkGroup(group);
                }
            }).catch((err) => {
                console.error(`[terrain] Base build failed for ${job.key}:`, err);
                const current = terrainChunks.get(job.key);
                if (current && current.state === 'building_base') current.state = 'error';
            });
        }

        return {
            durationMs: performance.now() - startedAtMs,
            builds
        };
    }

    function processPropBuildQueue(maxBuildsPerFrame = 1) {
        const startedAtMs = performance.now();
        if (pendingPropBuilds.length === 0) {
            return { durationMs: 0, builds: 0 };
        }
        if (pendingPropQueueDirty) {
            pendingPropBuilds.sort((a, b) => b.priority - a.priority);
            pendingPropQueueDirty = false;
        }
        let builds = 0;
        while (builds < maxBuildsPerFrame && pendingPropBuilds.length > 0) {
            const job = pendingPropBuilds.pop()!;
            pendingPropKeys.delete(job.key);
            const state = terrainChunks.get(job.key);

            const targetGroup = state ? (state.pendingGroup || state.group || null) : null;
            if (!state || targetGroup !== job.groupRef || state.lod !== job.lod || state.propsBuilt || state.state === 'building_props') {
                continue;
            }

            state.state = 'building_props';
            builds += 1;

            generateChunkProps(targetGroup, job.cx, job.cz, job.lod).then(() => {
                const current = terrainChunks.get(job.key);
                if (current && (current.pendingGroup === job.groupRef || current.group === job.groupRef) && current.lod === job.lod && current.state === 'building_props') {
                    if (current.pendingGroup) {
                        if (current.group) {
                            const priorState = {
                                group: current.group,
                                pendingGroup: null,
                                cx: current.cx,
                                cz: current.cz,
                                bounds: current.bounds,
                                lod: current.lod,
                                propsBuilt: current.propsBuilt,
                                state: current.propsBuilt ? 'done' : current.state
                            };
                            if (!cacheWarmChunkState(job.key, priorState)) disposeChunkGroup(current.group);
                        }
                        current.group = current.pendingGroup;
                        scene.add(current.group);
                        current.pendingGroup = null;
                    } else if (current.group && !current.group.parent) {
                        scene.add(current.group);
                    }
                    current.propsBuilt = true;
                    current.state = 'done';
                }
            }).catch((err) => {
                console.error(`[terrain] Prop build failed for ${job.key}:`, err);
                const current = terrainChunks.get(job.key);
                if (current && current.state === 'building_props') {
                    if (current.pendingGroup) {
                        if (current.group) {
                            const priorState = {
                                group: current.group,
                                pendingGroup: null,
                                cx: current.cx,
                                cz: current.cz,
                                bounds: current.bounds,
                                lod: current.lod,
                                propsBuilt: current.propsBuilt,
                                state: current.propsBuilt ? 'done' : current.state
                            };
                            if (!cacheWarmChunkState(job.key, priorState)) disposeChunkGroup(current.group);
                        }
                        current.group = current.pendingGroup;
                        scene.add(current.group);
                        current.pendingGroup = null;
                    }
                    current.state = 'done';
                }
            });
        }

        return {
            durationMs: performance.now() - startedAtMs,
            builds
        };
    }

    return {
        terrainChunks,
        warmChunkCache,
        pendingChunkBuilds,
        pendingChunkKeys,
        pendingPropBuilds,
        pendingPropKeys,
        chunkPools,
        getPooledInstancedMesh,
        clearWarmChunkCache,
        cacheWarmChunkState,
        restoreWarmChunkState,
        invalidateChunkProps,
        disposeChunkGroup,
        getChunkBaseSurfaceMeshes,
        setChunkBaseSurfaceMeshes,
        syncChunkBaseSurfaceVisibility,
        removePendingPropJobs,
        enqueueChunkBuild,
        markChunkQueueDirty,
        markPropQueueDirty,
        clearPendingChunkBuilds: () => {
            pendingChunkBuilds.length = 0;
            pendingChunkKeys.clear();
            pendingQueueDirty = false;
        },
        clearPendingPropBuilds: () => {
            pendingPropBuilds.length = 0;
            pendingPropKeys.clear();
            pendingPropQueueDirty = false;
        },
        processChunkBuildQueue,
        processPropBuildQueue
    };
}
