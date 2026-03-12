import {
    configureMaterialShaderPipeline,
    createOwnedShaderSourcePatch
} from './MaterialShaderPipeline.js';

function resolveDescriptorValue(value, context = {}, descriptor = null) {
    return typeof value === 'function' ? value(context, descriptor) : value;
}

export function createOwnedShaderDescriptor({
    id,
    baseCacheKey,
    patchId = null,
    patchCacheKey = null,
    metadata = {},
    source,
    uniformBindings = null
}) {
    if (!id) {
        throw new Error('Owned shader descriptors require a stable id');
    }
    if (!baseCacheKey) {
        throw new Error(`Owned shader descriptor "${id}" is missing a baseCacheKey`);
    }
    if (!source) {
        throw new Error(`Owned shader descriptor "${id}" is missing shader source`);
    }

    const resolvedPatchId = patchId || `${id}-source`;
    return {
        id,
        baseCacheKey,
        patchId: resolvedPatchId,
        patchCacheKey: patchCacheKey || resolvedPatchId,
        metadata,
        source,
        uniformBindings
    };
}

export function describeOwnedShaderDescriptor(descriptor, context = {}) {
    if (!descriptor) return null;

    return {
        id: descriptor.id,
        baseCacheKey: resolveDescriptorValue(descriptor.baseCacheKey, context, descriptor),
        patchId: resolveDescriptorValue(descriptor.patchId, context, descriptor),
        patchCacheKey: resolveDescriptorValue(descriptor.patchCacheKey, context, descriptor),
        metadata: {
            ...(descriptor.metadata || {})
        }
    };
}

export function createOwnedShaderDescriptorPatch(descriptor, context = {}) {
    const description = describeOwnedShaderDescriptor(descriptor, context);
    if (!description) {
        throw new Error('Missing owned shader descriptor');
    }

    return createOwnedShaderSourcePatch({
        id: description.patchId,
        cacheKey: description.patchCacheKey,
        metadata: {
            descriptorId: description.id,
            ...description.metadata
        },
        source: resolveDescriptorValue(descriptor.source, context, descriptor),
        uniformBindings: descriptor.uniformBindings
            ? () => resolveDescriptorValue(descriptor.uniformBindings, context, descriptor)
            : null
    });
}

export function applyOwnedShaderDescriptor(material, descriptor, context = {}) {
    const description = describeOwnedShaderDescriptor(descriptor, context);
    configureMaterialShaderPipeline(material, {
        baseCacheKey: description.baseCacheKey,
        patches: [createOwnedShaderDescriptorPatch(descriptor, context)]
    });

    material.userData = material.userData || {};
    material.userData.shaderDescriptor = description;
    return description;
}
