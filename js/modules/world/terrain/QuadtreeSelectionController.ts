// @ts-check

function clampPositive(value, fallback) {
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function makeRegion(centerX, centerZ, radius) {
    return {
        minX: centerX - radius,
        minZ: centerZ - radius,
        maxX: centerX + radius,
        maxZ: centerZ + radius
    };
}

function distanceToNodeBounds(node, x, z) {
    const dx = x < node.minX ? node.minX - x : (x > node.maxX ? x - node.maxX : 0);
    const dz = z < node.minZ ? node.minZ - z : (z > node.maxZ ? z - node.maxZ : 0);
    return Math.sqrt(dx * dx + dz * dz);
}

function getChunkLodForNodeSize(nodeSize, chunkSize) {
    const lod0Size = chunkSize * 0.25;
    const lod1Size = chunkSize * 0.5;
    const lod2Size = chunkSize;
    if (nodeSize <= lod0Size) return 0;
    if (nodeSize <= lod1Size) return 1;
    if (nodeSize <= lod2Size) return 2;
    return 3;
}

export function createQuadtreeSelectionController({
    sampler,
    chunkSize,
    blockingRadius = null,
    interestRadius = null,
    minCellSize = null,
    splitDistanceFactor = 0.6,
    maxDepth = Infinity
}) {
    if (!sampler) {
        throw new Error('createQuadtreeSelectionController requires a sampler');
    }

    const resolvedChunkSize = clampPositive(chunkSize, 1);
    const resolvedBlockingRadius = clampPositive(blockingRadius, resolvedChunkSize * 2);
    const resolvedInterestRadius = clampPositive(interestRadius, resolvedChunkSize * 6);
    const resolvedMinCellSize = clampPositive(minCellSize, resolvedChunkSize);
    const resolvedSplitDistanceFactor = clampPositive(splitDistanceFactor, 0.6);

    function getDesiredNodeSize(distance, minNodeSize, distanceFactor) {
        return Math.max(minNodeSize, distance * distanceFactor);
    }

    function shouldSplitNode(node, distance, targetDepth, minNodeSize, distanceFactor) {
        if (node.type !== 'branch') return false;
        if (node.depth !== null && node.depth >= targetDepth) return false;
        if (node.size <= minNodeSize) return false;
        const desiredNodeSize = getDesiredNodeSize(distance, minNodeSize, distanceFactor);
        return node.size > desiredNodeSize;
    }

    function select({
        cameraX = 0,
        cameraZ = 0,
        blockingRadius = resolvedBlockingRadius,
        interestRadius = resolvedInterestRadius,
        minCellSize = resolvedMinCellSize,
        splitDistanceFactor = resolvedSplitDistanceFactor,
        maxSelectionDepth = maxDepth
    } = {}) {
        const region = makeRegion(cameraX, cameraZ, clampPositive(interestRadius, resolvedInterestRadius));
        const requiredChunkKeys = new Set();
        const blockingChunkKeys = new Set();
        const chunkLods = new Map();
        const selectedLeaves = [];
        const selectedLeafIds = new Set();
        const blockingLeafIds = new Set();
        const rootNode = sampler.getNode(0, 0);
        const rootDist = rootNode ? distanceToNodeBounds(rootNode, cameraX, cameraZ) : 0;
        const stack = [0, 0, rootDist];
        const targetDepth = Number.isFinite(maxSelectionDepth) ? maxSelectionDepth : Infinity;
        const effectiveMinCellSize = clampPositive(minCellSize, resolvedMinCellSize);
        const effectiveSplitDistanceFactor = clampPositive(splitDistanceFactor, resolvedSplitDistanceFactor);

        while (stack.length > 0) {
            const nodeDistance = stack.pop();
            const depth = stack.pop();
            const nodeId = stack.pop();
            const node = sampler.getNode(nodeId, depth);
            if (!node || !sampler.intersectsAabb(nodeId, region.minX, region.minZ, region.maxX, region.maxZ, depth)) {
                continue;
            }

            const split = node.type === 'branch'
                && depth < targetDepth
                && shouldSplitNode(node, nodeDistance, targetDepth, effectiveMinCellSize, effectiveSplitDistanceFactor);

            if (split) {
                const children = sampler.getNodeChildren(nodeId, depth);
                const childrenDists = new Float64Array(children.length);
                for (let i = 0; i < children.length; i++) {
                    childrenDists[i] = distanceToNodeBounds(children[i], cameraX, cameraZ);
                }
                
                for (let i = 1; i < children.length; i++) {
                    const keyChild = children[i];
                    const keyDist = childrenDists[i];
                    let j = i - 1;
                    while (j >= 0 && childrenDists[j] > keyDist) {
                        children[j + 1] = children[j];
                        childrenDists[j + 1] = childrenDists[j];
                        j -= 1;
                    }
                    children[j + 1] = keyChild;
                    childrenDists[j + 1] = keyDist;
                }

                for (let index = children.length - 1; index >= 0; index -= 1) {
                    stack.push(children[index].id, depth + 1, childrenDists[index]);
                }
                continue;
            }

            const nodeChunkKeys = sampler.mapNodeToChunkKeys(nodeId, resolvedChunkSize, depth);
            const blockingReady = nodeDistance <= blockingRadius;
            const chunkLod = getChunkLodForNodeSize(node.size, resolvedChunkSize);

            const leafId = `leaf:${node.id}`;
            const leaf = {
                leafId,
                nodeId: node.id,
                depth,
                type: node.type,
                bounds: {
                    minX: node.minX,
                    minZ: node.minZ,
                    maxX: node.maxX,
                    maxZ: node.maxZ
                },
                size: node.size,
                chunkLod,
                blockingReady,
                chunkKeys: nodeChunkKeys
            };
            selectedLeaves.push(leaf);
            selectedLeafIds.add(leafId);
            if (blockingReady) {
                blockingLeafIds.add(leafId);
            }

            for (const key of nodeChunkKeys) {
                requiredChunkKeys.add(key);
                const previousLod = chunkLods.get(key);
                if (!Number.isInteger(previousLod) || chunkLod < previousLod) {
                    chunkLods.set(key, chunkLod);
                }
                if (blockingReady) {
                    blockingChunkKeys.add(key);
                }
            }
        }

        const nonBlockingChunkKeys = new Set();
        for (const key of requiredChunkKeys) {
            if (!blockingChunkKeys.has(key)) {
                nonBlockingChunkKeys.add(key);
            }
        }

        selectedLeaves.sort((a, b) => {
            const aDistance = distanceToNodeBounds(a.bounds, cameraX, cameraZ);
            const bDistance = distanceToNodeBounds(b.bounds, cameraX, cameraZ);
            if (aDistance !== bDistance) return aDistance - bDistance;
            if ((a.size ?? 0) !== (b.size ?? 0)) return (a.size ?? 0) - (b.size ?? 0);
            return String(a.leafId).localeCompare(String(b.leafId));
        });

        return {
            selectedLeaves,
            selectedLeafIds,
            blockingLeafIds,
            requiredChunkKeys,
            blockingChunkKeys,
            nonBlockingChunkKeys,
            chunkLods,
            selectionRegion: region
        };
    }

    return {
        select
    };
}
