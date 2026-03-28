// @ts-check

/** @typedef {import('three').Material} Material */
/** @typedef {import('three').WebGLProgramParametersWithUniforms['shader']} WebGLShaderLike */
/** @typedef {import('three').WebGLRenderer} WebGLRenderer */

/**
 * @typedef ShaderPatch
 * @property {string} id
 * @property {(shader: WebGLShaderLike, renderer: WebGLRenderer) => void} apply
 * @property {string | ((this: Material, patch: ShaderPatch, material: Material) => string | null | undefined) | null | undefined} [cacheKey]
 * @property {Record<string, unknown>} [metadata]
 */

/**
 * @typedef PipelineState
 * @property {Material['onBeforeCompile']} previousCompile
 * @property {Material['customProgramCacheKey']} previousCacheKey
 * @property {string | ((this: Material, material: Material) => string) | null} baseCacheKey
 * @property {ShaderPatch[]} patches
 */

/** @type {symbol} */
const PIPELINE_STATE_KEY = Symbol('materialShaderPipeline');

/**
 * @param {Material & { [PIPELINE_STATE_KEY]?: PipelineState }} material
 * @returns {PipelineState}
 */
function ensurePipelineState(material) {
    let state = material[PIPELINE_STATE_KEY];
    if (state) return state;

    const previousCompile = material.onBeforeCompile;
    const previousCacheKey = material.customProgramCacheKey;
    state = {
        previousCompile,
        previousCacheKey,
        baseCacheKey: null,
        patches: []
    };
    material[PIPELINE_STATE_KEY] = state;

    material.onBeforeCompile = (shader, renderer) => {
        if (state.previousCompile) {
            state.previousCompile(shader, renderer);
        }
        for (const patch of state.patches) {
            patch.apply(shader, renderer);
        }
    };

    material.customProgramCacheKey = function customProgramCacheKey() {
        const baseSource = state.baseCacheKey ?? state.previousCacheKey ?? material.uuid;
        const baseKey = typeof baseSource === 'function' ? baseSource.call(this, material) : baseSource;
        const patchKey = state.patches
            .map((patch) => {
                const source = patch.cacheKey ?? patch.id;
                return typeof source === 'function' ? source.call(this, patch, material) : source;
            })
            .filter(Boolean)
            .join('+');

        return patchKey ? `${baseKey}::${patchKey}` : baseKey;
    };

    return state;
}

/**
 * @param {Material} material
 * @param {PipelineState} state
 * @returns {void}
 */
function syncPipelineMetadata(material, state) {
    material.userData = material.userData || {};
    material.userData.shaderPipeline = {
        baseCacheKey: typeof state.baseCacheKey === 'string' ? state.baseCacheKey : null,
        patches: state.patches.map((patch) => patch.id)
    };
}

/**
 * @param {{ id: string, apply: ShaderPatch['apply'], cacheKey?: ShaderPatch['cacheKey'], metadata?: Record<string, unknown> }} options
 * @returns {ShaderPatch}
 */
export function createShaderPatch({ id, apply, cacheKey = id, metadata = {} }) {
    return { id, apply, cacheKey, metadata };
}

/**
 * @param {{
 *   id: string,
 *   cacheKey?: ShaderPatch['cacheKey'],
 *   source: {
 *     vertexShader?: string,
 *     fragmentShader?: string,
 *     defines?: Record<string, unknown>
 *   } | ((shader: WebGLShaderLike, renderer: WebGLRenderer) => {
 *     vertexShader?: string,
 *     fragmentShader?: string,
 *     defines?: Record<string, unknown>
 *   }),
 *   uniformBindings?: Record<string, unknown> | ((shader: WebGLShaderLike, renderer: WebGLRenderer) => Record<string, unknown>) | null,
 *   metadata?: Record<string, unknown>
 * }} options
 * @returns {ShaderPatch}
 */
export function createOwnedShaderSourcePatch({
    id,
    cacheKey = id,
    source,
    uniformBindings = null,
    metadata = {}
}) {
    return createShaderPatch({
        id,
        cacheKey,
        metadata: {
            ...metadata,
            ownedSource: true
        },
        apply(shader, renderer) {
            const resolvedSource = typeof source === 'function' ? source(shader, renderer) : source;
            if (resolvedSource?.vertexShader) {
                shader.vertexShader = resolvedSource.vertexShader;
            }
            if (resolvedSource?.fragmentShader) {
                shader.fragmentShader = resolvedSource.fragmentShader;
            }
            if (resolvedSource?.defines) {
                shader.defines = {
                    ...(shader.defines || {}),
                    ...resolvedSource.defines
                };
            }

            if (uniformBindings) {
                const resolvedBindings = typeof uniformBindings === 'function'
                    ? uniformBindings(shader, renderer)
                    : uniformBindings;
                Object.assign(shader.uniforms, resolvedBindings);
            }
        }
    });
}

/**
 * @param {Material & { [PIPELINE_STATE_KEY]?: PipelineState }} material
 * @param {string | ((this: Material, material: Material) => string) | null} baseCacheKey
 * @returns {void}
 */
export function setMaterialShaderBaseKey(material, baseCacheKey) {
    const state = ensurePipelineState(material);
    state.baseCacheKey = baseCacheKey;
    syncPipelineMetadata(material, state);
}

/**
 * @param {Material & { [PIPELINE_STATE_KEY]?: PipelineState }} material
 * @param {ShaderPatch} patch
 * @returns {void}
 */
export function upsertMaterialShaderPatch(material, patch) {
    const state = ensurePipelineState(material);
    const index = state.patches.findIndex((candidate) => candidate.id === patch.id);
    if (index >= 0) {
        state.patches[index] = patch;
    } else {
        state.patches.push(patch);
    }
    syncPipelineMetadata(material, state);
}

/**
 * @param {Material & { [PIPELINE_STATE_KEY]?: PipelineState }} material
 * @param {{ baseCacheKey?: string | ((this: Material, material: Material) => string) | null, patches?: ShaderPatch[] }} [options]
 * @returns {void}
 */
export function configureMaterialShaderPipeline(material, { baseCacheKey = null, patches = [] } = {}) {
    const state = ensurePipelineState(material);
    state.baseCacheKey = baseCacheKey;
    state.patches = [...patches];
    syncPipelineMetadata(material, state);
}

/**
 * @param {Material & { [PIPELINE_STATE_KEY]?: PipelineState }} material
 * @returns {{ baseCacheKey: PipelineState['baseCacheKey'], patches: Array<{ id: string, cacheKey: ShaderPatch['cacheKey'], metadata: Record<string, unknown> }> } | null}
 */
export function describeMaterialShaderPipeline(material) {
    const state = material[PIPELINE_STATE_KEY];
    if (!state) return null;
    return {
        baseCacheKey: state.baseCacheKey,
        patches: state.patches.map((patch) => ({
            id: patch.id,
            cacheKey: patch.cacheKey ?? patch.id,
            metadata: patch.metadata || {}
        }))
    };
}
