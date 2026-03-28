// @ts-check

/** @typedef {import('three').Material} Material */
/** @typedef {import('three').WebGLProgramParametersWithUniforms['shader']} WebGLShaderLike */
/** @typedef {import('three').WebGLRenderer} WebGLRenderer */

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} source
 * @param {string} includeName
 * @param {string} content
 * @returns {string}
 */
export function replaceShaderInclude(source, includeName, content) {
    const pattern = new RegExp(`#include\\s*<\\s*${escapeRegExp(includeName)}\\s*>`, 'g');
    if (!pattern.test(source)) {
        throw new Error(`Missing shader include <${includeName}>`);
    }
    pattern.lastIndex = 0;
    return source.replace(pattern, content);
}

/**
 * @param {string} source
 * @param {string} snippet
 * @param {string} replacement
 * @param {string} [label]
 * @returns {string}
 */
export function replaceShaderSnippet(source, snippet, replacement, label = snippet) {
    if (!source.includes(snippet)) {
        throw new Error(`Missing shader snippet: ${label}`);
    }
    return source.replace(snippet, replacement);
}

/**
 * @param {string} source
 * @param {string} defineLine
 * @returns {string}
 */
export function prependShaderDefine(source, defineLine) {
    return source.includes(defineLine) ? source : `${defineLine}\n${source}`;
}

/**
 * @param {Material} material
 * @param {(shader: WebGLShaderLike, renderer: WebGLRenderer) => void} patchFn
 * @returns {void}
 */
export function chainMaterialShaderPatch(material, patchFn) {
    const previousCompile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
        if (previousCompile) previousCompile(shader, renderer);
        patchFn(shader, renderer);
    };
}

/**
 * @param {Material} material
 * @param {string | ((this: Material, material: Material) => string)} suffix
 * @returns {void}
 */
export function appendMaterialProgramCacheKey(material, suffix) {
    const previousCacheKey = material.customProgramCacheKey;
    material.customProgramCacheKey = function customProgramCacheKey() {
        const baseKey = previousCacheKey ? previousCacheKey.call(this) : material.uuid;
        const resolvedSuffix = typeof suffix === 'function' ? suffix.call(this, material) : suffix;
        return `${baseKey}${resolvedSuffix}`;
    };
}
