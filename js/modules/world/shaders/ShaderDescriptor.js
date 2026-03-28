// @ts-check

import {
    configureMaterialShaderPipeline,
    createOwnedShaderSourcePatch
} from './MaterialShaderPipeline.js';

/** @typedef {import('three').Material} Material */
/** @typedef {import('./MaterialShaderPipeline.js').ShaderPatch} ShaderPatch */

/**
 * @template T
 * @typedef {T | ((context: Record<string, unknown>, descriptor: OwnedShaderDescriptor | null) => T)} ResolvableValue
 */

/**
 * @template T
 * @typedef {(context: Record<string, unknown>, descriptor: OwnedShaderDescriptor | null) => T} ResolverFn
 */

/**
 * @typedef OwnedShaderDescriptor
 * @property {string} id
 * @property {ResolvableValue<string>} baseCacheKey
 * @property {ResolvableValue<string>} patchId
 * @property {ResolvableValue<string>} patchCacheKey
 * @property {Record<string, unknown>} metadata
 * @property {ResolvableValue<{ vertexShader?: string, fragmentShader?: string, defines?: Record<string, unknown> }>} source
 * @property {ResolvableValue<Record<string, unknown>> | null} [uniformBindings]
 */

/**
 * @template T
 * @param {ResolvableValue<T>} value
 * @param {Record<string, unknown>} [context]
 * @param {OwnedShaderDescriptor | null} [descriptor]
 * @returns {T}
 */
function resolveDescriptorValue(value, context = {}, descriptor = null) {
    return typeof value === 'function'
        ? /** @type {ResolverFn<T>} */ (value)(context, descriptor)
        : value;
}

/**
 * @param {{
 *   id: string,
 *   baseCacheKey: ResolvableValue<string>,
 *   patchId?: ResolvableValue<string> | null,
 *   patchCacheKey?: ResolvableValue<string> | null,
 *   metadata?: Record<string, unknown>,
 *   source: OwnedShaderDescriptor['source'],
 *   uniformBindings?: OwnedShaderDescriptor['uniformBindings']
 * }} options
 * @returns {OwnedShaderDescriptor}
 */
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

/**
 * @param {OwnedShaderDescriptor | null | undefined} descriptor
 * @param {Record<string, unknown>} [context]
 * @returns {{ id: string, baseCacheKey: string, patchId: string, patchCacheKey: string, metadata: Record<string, unknown> } | null}
 */
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

/**
 * @param {OwnedShaderDescriptor | null | undefined} descriptor
 * @param {Record<string, unknown>} [context]
 * @returns {ShaderPatch}
 */
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

/**
 * @param {Material} material
 * @param {OwnedShaderDescriptor} descriptor
 * @param {Record<string, unknown>} [context]
 * @returns {{ id: string, baseCacheKey: string, patchId: string, patchCacheKey: string, metadata: Record<string, unknown> }}
 */
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
