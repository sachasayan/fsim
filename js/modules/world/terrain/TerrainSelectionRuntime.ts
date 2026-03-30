// @ts-check

import { getLodForRingDistance } from './TerrainUtils.js';

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

type SelectedLeaf = {
    leafId: string;
    nodeId: number | null;
    depth: number;
    type: string;
    bounds: Bounds;
    size: number;
    chunkLod: number;
    blockingReady: boolean;
    chunkKeys: string[];
};

type TerrainSelectionLike = {
    selectedLeaves: SelectedLeaf[];
    selectedLeafIds: Set<string>;
    blockingLeafIds: Set<string>;
    requiredChunkKeys: Set<string>;
    blockingChunkKeys: Set<string>;
    nonBlockingChunkKeys: Set<string>;
    chunkLods: Map<string, number>;
    selectionRegion: unknown;
};

type ChunkStateLike = {
    lod?: number | null;
};

type BuildTerrainSelectionOptions = {
    centerChunkX: number;
    centerChunkZ: number;
    controller: { select: (options?: Record<string, unknown>) => TerrainSelectionLike } | null;
    physicsState: PhysicsLike;
    bootstrapMode: boolean;
    terrainDebugSettings: {
        bootstrapRadius: number;
        selectionInterestRadius: number;
        selectionLookaheadMaxDistance: number;
        selectionLookaheadSeconds: number;
        selectionLookaheadRadiusPadding: number;
        selectionBlockingRadius: number;
        selectionMinCellSize: number;
        selectionSplitDistanceFactor: number;
        selectionMaxDepth: number;
    };
    CHUNK_SIZE: number;
    lodSettings: {
        terrain: {
            renderDistance: number;
            ringThresholds: number[];
            ringHysteresis: number;
        };
    };
    terrainChunks: Map<string, ChunkStateLike>;
    bootstrapMaxLeaves: number;
    createChunkBounds: (cx: number, cz: number) => Bounds;
};

function distanceToBoundsSq(bounds: Bounds | null | undefined, x: number, z: number) {
    if (!bounds) return Infinity;
    const dx = x < bounds.minX ? bounds.minX - x : (x > bounds.maxX ? x - bounds.maxX : 0);
    const dz = z < bounds.minZ ? bounds.minZ - z : (z > bounds.maxZ ? z - bounds.maxZ : 0);
    return dx * dx + dz * dz;
}

function getTargetLod(ringDistance: number, currentLod: number | null = null, lodSettings: BuildTerrainSelectionOptions['lodSettings'], bootstrapMode: boolean) {
    const lod = getLodForRingDistance(ringDistance, currentLod, lodSettings.terrain);
    return bootstrapMode ? (ringDistance === 0 ? lod : 3) : lod;
}

function trimBootstrapSelection(selection: TerrainSelectionLike, cameraX: number, cameraZ: number, bootstrapMaxLeaves: number, bootstrapMode: boolean) {
    if (!bootstrapMode || !selection || !Array.isArray(selection.selectedLeaves) || selection.selectedLeaves.length === 0) {
        return selection;
    }

    const prioritizedLeaves = [...selection.selectedLeaves].sort((a, b) => {
        const aDistanceSq = distanceToBoundsSq(a.bounds, cameraX, cameraZ);
        const bDistanceSq = distanceToBoundsSq(b.bounds, cameraX, cameraZ);
        if (aDistanceSq !== bDistanceSq) return aDistanceSq - bDistanceSq;
        if ((a.size ?? 0) !== (b.size ?? 0)) return (a.size ?? 0) - (b.size ?? 0);
        return String(a.leafId).localeCompare(String(b.leafId));
    });

    const keptLeafCount = Math.min(prioritizedLeaves.length, bootstrapMaxLeaves);
    const keptLeaves = prioritizedLeaves.slice(0, keptLeafCount).map((leaf) => ({ ...leaf }));
    const blockingLeafIdSet = new Set(
        keptLeaves
            .filter((leaf) => leaf.blockingReady)
            .map((leaf) => leaf.leafId)
    );

    const requiredChunkKeys = new Set<string>();
    const blockingChunkKeys = new Set<string>();
    const nonBlockingChunkKeys = new Set<string>();
    const chunkLods = new Map<string, number>();
    const selectedLeafIds = new Set<string>();

    for (const leaf of keptLeaves) {
        leaf.blockingReady = blockingLeafIdSet.has(leaf.leafId);
        selectedLeafIds.add(leaf.leafId);
        for (const key of leaf.chunkKeys || []) {
            requiredChunkKeys.add(key);
            const previousLod = chunkLods.get(key);
            if (!Number.isInteger(previousLod) || leaf.chunkLod < previousLod) {
                chunkLods.set(key, leaf.chunkLod);
            }
            if (leaf.blockingReady) blockingChunkKeys.add(key);
        }
    }

    for (const key of requiredChunkKeys) {
        if (!blockingChunkKeys.has(key)) nonBlockingChunkKeys.add(key);
    }

    return {
        ...selection,
        selectedLeaves: keptLeaves,
        selectedLeafIds,
        blockingLeafIds: blockingLeafIdSet,
        requiredChunkKeys,
        blockingChunkKeys,
        nonBlockingChunkKeys,
        chunkLods
    };
}

function refineBlockingSelection(
    selection: TerrainSelectionLike,
    cameraX: number,
    cameraZ: number,
    physicsState: PhysicsLike,
    bootstrapMode: boolean,
    CHUNK_SIZE: number,
    terrainDebugSettings: BuildTerrainSelectionOptions['terrainDebugSettings']
) {
    if (bootstrapMode || !selection || !Array.isArray(selection.selectedLeaves) || selection.selectedLeaves.length === 0) {
        return selection;
    }

    const currentlyBlockingLeaves = selection.selectedLeaves.filter((leaf) => leaf.blockingReady);
    if (currentlyBlockingLeaves.length <= 24) {
        return selection;
    }

    const velocityX = Number.isFinite(physicsState.velocity?.x) ? physicsState.velocity?.x || 0 : 0;
    const velocityZ = Number.isFinite(physicsState.velocity?.z) ? physicsState.velocity?.z || 0 : 0;
    const speed = Math.hypot(velocityX, velocityZ);
    const nearDistanceSq = Math.pow(Math.max(CHUNK_SIZE * 0.6, terrainDebugSettings.selectionBlockingRadius * 0.45), 2);
    const targetBlockingLeafCount = Math.max(
        20,
        Math.min(
            currentlyBlockingLeaves.length,
            24 + Math.min(12, Math.round(speed / 35))
        )
    );

    function scoreLeaf(leaf: SelectedLeaf) {
        const baseDistanceSq = distanceToBoundsSq(leaf.bounds, cameraX, cameraZ);
        let effectiveDistanceSq = baseDistanceSq;
        let forwardBoost = 0;

        if (speed > 1) {
            const centerX = (leaf.bounds.minX + leaf.bounds.maxX) * 0.5;
            const centerZ = (leaf.bounds.minZ + leaf.bounds.maxZ) * 0.5;
            const toLeafX = centerX - cameraX;
            const toLeafZ = centerZ - cameraZ;
            const toLeafLength = Math.hypot(toLeafX, toLeafZ);
            if (toLeafLength > 1e-3) {
                const alignment = ((toLeafX * velocityX) + (toLeafZ * velocityZ)) / (toLeafLength * speed);
                if (alignment > 0) {
                    forwardBoost = alignment * Math.min(50000, speed * 180);
                }
            }
            for (const lookaheadSeconds of [0.4, 0.9, 1.5]) {
                const predictedX = cameraX + velocityX * lookaheadSeconds;
                const predictedZ = cameraZ + velocityZ * lookaheadSeconds;
                effectiveDistanceSq = Math.min(effectiveDistanceSq, distanceToBoundsSq(leaf.bounds, predictedX, predictedZ));
            }
        }

        const sizeBias = Number.isFinite(leaf.size) ? leaf.size * 0.01 : 0;
        return effectiveDistanceSq - forwardBoost - sizeBias;
    }

    const alwaysKeep: SelectedLeaf[] = [];
    const candidates: SelectedLeaf[] = [];
    for (const leaf of currentlyBlockingLeaves) {
        if (distanceToBoundsSq(leaf.bounds, cameraX, cameraZ) <= nearDistanceSq) {
            alwaysKeep.push(leaf);
        } else {
            candidates.push(leaf);
        }
    }

    candidates.sort((a, b) => scoreLeaf(a) - scoreLeaf(b));
    const refinedBlockingLeafIds = new Set(alwaysKeep.map((leaf) => leaf.leafId));
    for (const leaf of candidates) {
        if (refinedBlockingLeafIds.size >= targetBlockingLeafCount) break;
        refinedBlockingLeafIds.add(leaf.leafId);
    }

    if (refinedBlockingLeafIds.size === currentlyBlockingLeaves.length) {
        return selection;
    }

    const selectedLeaves = selection.selectedLeaves.map((leaf) => ({
        ...leaf,
        blockingReady: refinedBlockingLeafIds.has(leaf.leafId)
    }));
    const blockingChunkKeys = new Set<string>();
    const nonBlockingChunkKeys = new Set<string>();
    for (const leaf of selectedLeaves) {
        for (const key of leaf.chunkKeys || []) {
            if (leaf.blockingReady) blockingChunkKeys.add(key);
        }
    }
    for (const key of selection.requiredChunkKeys || []) {
        if (!blockingChunkKeys.has(key)) nonBlockingChunkKeys.add(key);
    }

    return {
        ...selection,
        selectedLeaves,
        blockingLeafIds: refinedBlockingLeafIds,
        blockingChunkKeys,
        nonBlockingChunkKeys
    };
}

function buildGridActiveChunks(
    centerChunkX: number,
    centerChunkZ: number,
    bootstrapMode: boolean,
    lodSettings: BuildTerrainSelectionOptions['lodSettings'],
    terrainChunks: Map<string, ChunkStateLike>,
    CHUNK_SIZE: number,
    createChunkBounds: (cx: number, cz: number) => Bounds
) {
    const renderDistance = bootstrapMode ? 0 : lodSettings.terrain.renderDistance;
    const activeChunks = new Map<string, number>();
    const nextBlockingChunkKeys = new Set<string>();
    const selectedLeaves: SelectedLeaf[] = [];
    const selectedLeafIds = new Set<string>();
    const nextBlockingLeafIds = new Set<string>();

    for (let dx = -renderDistance; dx <= renderDistance; dx++) {
        for (let dz = -renderDistance; dz <= renderDistance; dz++) {
            const cx = centerChunkX + dx;
            const cz = centerChunkZ + dz;
            const key = `${cx}, ${cz}`;
            const ringDistance = Math.max(Math.abs(dx), Math.abs(dz));
            const currentLod = terrainChunks.has(key) ? terrainChunks.get(key)?.lod ?? null : null;
            const lod = getTargetLod(ringDistance, currentLod, lodSettings, bootstrapMode);
            activeChunks.set(key, lod);
            nextBlockingChunkKeys.add(key);
            const leafId = `grid:${key}`;
            selectedLeafIds.add(leafId);
            nextBlockingLeafIds.add(leafId);
            selectedLeaves.push({
                leafId,
                nodeId: null,
                depth: 0,
                type: 'grid',
                bounds: createChunkBounds(cx, cz),
                size: CHUNK_SIZE,
                chunkLod: lod,
                blockingReady: true,
                chunkKeys: [key]
            });
        }
    }

    return {
        selectedLeaves,
        selectedLeafIds,
        blockingLeafIds: nextBlockingLeafIds,
        activeChunks,
        blockingKeys: nextBlockingChunkKeys,
        selectedNodes: selectedLeaves,
        selectionRegion: null,
        mode: 'grid_fallback'
    };
}

export function smoothActiveChunkLods(activeChunks: Map<string, number>) {
    if (!activeChunks || activeChunks.size === 0) return activeChunks;

    let changed = true;
    let iterations = 0;
    while (changed && iterations < 8) {
        changed = false;
        iterations += 1;

        for (const [key, lod] of activeChunks.entries()) {
            const [cxRaw, czRaw] = key.split(',');
            const cx = Number(cxRaw.trim());
            const cz = Number(czRaw.trim());
            if (!Number.isFinite(cx) || !Number.isFinite(cz)) continue;

            const neighbors = [
                `${cx - 1}, ${cz}`,
                `${cx + 1}, ${cz}`,
                `${cx}, ${cz - 1}`,
                `${cx}, ${cz + 1}`
            ];

            for (const neighborKey of neighbors) {
                if (!activeChunks.has(neighborKey)) continue;
                const neighborLod = activeChunks.get(neighborKey);
                if (!Number.isInteger(neighborLod)) continue;

                if (lod < neighborLod - 1) {
                    activeChunks.set(neighborKey, lod + 1);
                    changed = true;
                } else if (neighborLod < lod - 1) {
                    activeChunks.set(key, neighborLod + 1);
                    changed = true;
                }
            }
        }
    }

    return activeChunks;
}

export function updateLeafChunkLods(selectedLeaves: SelectedLeaf[], activeChunks: Map<string, number>) {
    if (!Array.isArray(selectedLeaves)) return;
    for (const leaf of selectedLeaves) {
        let finestLod = Number.isInteger(leaf.chunkLod) ? leaf.chunkLod : null;
        for (const key of leaf.chunkKeys || []) {
            const chunkLod = activeChunks.get(key);
            if (!Number.isInteger(chunkLod)) continue;
            if (!Number.isInteger(finestLod) || chunkLod < finestLod) {
                finestLod = chunkLod;
            }
        }
        leaf.chunkLod = finestLod ?? leaf.chunkLod ?? 3;
    }
}

export function buildTerrainSelection({
    centerChunkX,
    centerChunkZ,
    controller,
    physicsState,
    bootstrapMode,
    terrainDebugSettings,
    CHUNK_SIZE,
    lodSettings,
    terrainChunks,
    bootstrapMaxLeaves,
    createChunkBounds
}: BuildTerrainSelectionOptions) {
    if (!controller) {
        return buildGridActiveChunks(
            centerChunkX,
            centerChunkZ,
            bootstrapMode,
            lodSettings,
            terrainChunks,
            CHUNK_SIZE,
            createChunkBounds
        );
    }

    const velocityX = Number.isFinite(physicsState.velocity?.x) ? physicsState.velocity?.x || 0 : 0;
    const velocityZ = Number.isFinite(physicsState.velocity?.z) ? physicsState.velocity?.z || 0 : 0;
    const speed = Math.hypot(velocityX, velocityZ);
    const baseInterestRadius = bootstrapMode ? terrainDebugSettings.bootstrapRadius : terrainDebugSettings.selectionInterestRadius;
    const lookaheadDistance = Math.min(
        terrainDebugSettings.selectionLookaheadMaxDistance,
        speed * terrainDebugSettings.selectionLookaheadSeconds
    );
    const lookaheadScale = speed > 1 && lookaheadDistance > 0 ? (lookaheadDistance / speed) : 0;
    const selectionFocusX = physicsState.position.x + velocityX * lookaheadScale;
    const selectionFocusZ = physicsState.position.z + velocityZ * lookaheadScale;
    const interestRadius = baseInterestRadius + Math.min(
        terrainDebugSettings.selectionLookaheadRadiusPadding,
        lookaheadDistance * 0.5
    );

    const selection = controller.select({
        cameraX: selectionFocusX,
        cameraZ: selectionFocusZ,
        blockingRadius: bootstrapMode ? terrainDebugSettings.bootstrapRadius : terrainDebugSettings.selectionBlockingRadius,
        interestRadius,
        minCellSize: terrainDebugSettings.selectionMinCellSize,
        splitDistanceFactor: terrainDebugSettings.selectionSplitDistanceFactor,
        maxSelectionDepth: terrainDebugSettings.selectionMaxDepth
    });
    const effectiveSelection = refineBlockingSelection(
        trimBootstrapSelection(selection, physicsState.position.x, physicsState.position.z, bootstrapMaxLeaves, bootstrapMode),
        physicsState.position.x,
        physicsState.position.z,
        physicsState,
        bootstrapMode,
        CHUNK_SIZE,
        terrainDebugSettings
    );
    const activeChunks = new Map<string, number>();

    for (const key of effectiveSelection.requiredChunkKeys) {
        const [cxRaw, czRaw] = key.split(',');
        const cx = Number(cxRaw.trim());
        const cz = Number(czRaw.trim());
        if (!Number.isFinite(cx) || !Number.isFinite(cz)) continue;
        const currentLod = terrainChunks.has(key) ? terrainChunks.get(key)?.lod ?? null : null;
        const selectedLod = effectiveSelection.chunkLods.get(key);
        const targetLod = Number.isInteger(selectedLod) ? selectedLod : currentLod;
        activeChunks.set(key, targetLod ?? 3);
    }

    return {
        selectedLeaves: effectiveSelection.selectedLeaves,
        selectedLeafIds: effectiveSelection.selectedLeafIds,
        blockingLeafIds: effectiveSelection.blockingLeafIds,
        activeChunks,
        blockingKeys: new Set(effectiveSelection.blockingChunkKeys),
        selectedNodes: effectiveSelection.selectedLeaves,
        selectionRegion: effectiveSelection.selectionRegion,
        mode: bootstrapMode ? 'native_bootstrap' : 'quadtree'
    };
}
