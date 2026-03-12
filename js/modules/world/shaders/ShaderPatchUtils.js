function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function replaceShaderInclude(source, includeName, content) {
    const pattern = new RegExp(`#include\\s*<\\s*${escapeRegExp(includeName)}\\s*>`, 'g');
    if (!pattern.test(source)) {
        throw new Error(`Missing shader include <${includeName}>`);
    }
    pattern.lastIndex = 0;
    return source.replace(pattern, content);
}

export function replaceShaderSnippet(source, snippet, replacement, label = snippet) {
    if (!source.includes(snippet)) {
        throw new Error(`Missing shader snippet: ${label}`);
    }
    return source.replace(snippet, replacement);
}

export function prependShaderDefine(source, defineLine) {
    return source.includes(defineLine) ? source : `${defineLine}\n${source}`;
}

export function chainMaterialShaderPatch(material, patchFn) {
    const previousCompile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
        if (previousCompile) previousCompile(shader, renderer);
        patchFn(shader, renderer);
    };
}

export function appendMaterialProgramCacheKey(material, suffix) {
    const previousCacheKey = material.customProgramCacheKey;
    material.customProgramCacheKey = function customProgramCacheKey() {
        const baseKey = previousCacheKey ? previousCacheKey.call(this) : material.uuid;
        const resolvedSuffix = typeof suffix === 'function' ? suffix.call(this, material) : suffix;
        return `${baseKey}${resolvedSuffix}`;
    };
}
