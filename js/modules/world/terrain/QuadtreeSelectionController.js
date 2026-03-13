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
    return Math.hypot(dx, dz);
}

export function createQuadtreeSelectionController({
    sampler,
    chunkSize,
    blockingRadius = null,
    interestRadius = null,
    minCellSize = null,
    maxDepth = Infinity
}) {
    if (!sampler) {
        throw new Error('createQuadtreeSelectionController requires a sampler');
    }

    const resolvedChunkSize = clampPositive(chunkSize, 1);
    const resolvedBlockingRadius = clampPositive(blockingRadius, resolvedChunkSize * 2);
    const resolvedInterestRadius = clampPositive(interestRadius, resolvedChunkSize * 6);
    const resolvedMinCellSize = clampPositive(minCellSize, resolvedChunkSize);

    function shouldSplitNode(node, cameraX, cameraZ, targetDepth) {
        if (node.type !== 'branch') return false;
        if (node.depth !== null && node.depth >= targetDepth) return false;
        if (node.size <= resolvedMinCellSize) return false;
        return distanceToNodeBounds(node, cameraX, cameraZ) <= node.size * 1.25;
    }

    function select({
        cameraX = 0,
        cameraZ = 0,
        blockingRadius = resolvedBlockingRadius,
        interestRadius = resolvedInterestRadius,
        minCellSize = resolvedMinCellSize,
        maxSelectionDepth = maxDepth
    } = {}) {
        const region = makeRegion(cameraX, cameraZ, clampPositive(interestRadius, resolvedInterestRadius));
        const requiredChunkKeys = new Set();
        const blockingChunkKeys = new Set();
        const selectedNodes = [];
        const stack = [{ nodeId: 0, depth: 0 }];
        const targetDepth = Number.isFinite(maxSelectionDepth) ? maxSelectionDepth : Infinity;
        const effectiveMinCellSize = clampPositive(minCellSize, resolvedMinCellSize);

        while (stack.length > 0) {
            const { nodeId, depth } = stack.pop();
            const node = sampler.getNode(nodeId, depth);
            if (!node || !sampler.intersectsAabb(nodeId, region.minX, region.minZ, region.maxX, region.maxZ, depth)) {
                continue;
            }

            const split = node.type === 'branch'
                && depth < targetDepth
                && node.size > effectiveMinCellSize
                && shouldSplitNode(node, cameraX, cameraZ, targetDepth);

            if (split) {
                const children = sampler.getNodeChildren(nodeId, depth);
                for (let index = children.length - 1; index >= 0; index -= 1) {
                    stack.push({ nodeId: children[index].id, depth: depth + 1 });
                }
                continue;
            }

            const nodeChunkKeys = sampler.mapNodeToChunkKeys(nodeId, resolvedChunkSize, depth);
            const nodeDistance = distanceToNodeBounds(node, cameraX, cameraZ);
            const blockingReady = nodeDistance <= blockingRadius;

            selectedNodes.push({
                nodeId: node.id,
                depth,
                type: node.type,
                minX: node.minX,
                minZ: node.minZ,
                maxX: node.maxX,
                maxZ: node.maxZ,
                size: node.size,
                blockingReady,
                chunkKeys: nodeChunkKeys
            });

            for (const key of nodeChunkKeys) {
                requiredChunkKeys.add(key);
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

        return {
            selectedNodes,
            requiredChunkKeys,
            blockingChunkKeys,
            nonBlockingChunkKeys,
            selectionRegion: region
        };
    }

    return {
        select
    };
}
