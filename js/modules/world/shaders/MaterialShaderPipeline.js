const PIPELINE_STATE_KEY = Symbol('materialShaderPipeline');

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

function syncPipelineMetadata(material, state) {
    material.userData = material.userData || {};
    material.userData.shaderPipeline = {
        baseCacheKey: typeof state.baseCacheKey === 'string' ? state.baseCacheKey : null,
        patches: state.patches.map((patch) => patch.id)
    };
}

export function createShaderPatch({ id, apply, cacheKey = id, metadata = {} }) {
    return { id, apply, cacheKey, metadata };
}

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

export function setMaterialShaderBaseKey(material, baseCacheKey) {
    const state = ensurePipelineState(material);
    state.baseCacheKey = baseCacheKey;
    syncPipelineMetadata(material, state);
}

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

export function configureMaterialShaderPipeline(material, { baseCacheKey = null, patches = [] } = {}) {
    const state = ensurePipelineState(material);
    state.baseCacheKey = baseCacheKey;
    state.patches = [...patches];
    syncPipelineMetadata(material, state);
}

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
