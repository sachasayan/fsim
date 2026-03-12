import * as THREE from 'three';

import {
    applyInstancedRunwayLightShaderPatch,
    createRunwayLightUniformBindings
} from './RunwayShaderPatches.js';

const SOURCE_CACHE = new Map();

function buildRunwayLightOwnedShaderSource({ intensity }) {
    const shader = {
        uniforms: {},
        defines: {},
        vertexShader: THREE.ShaderLib.basic.vertexShader,
        fragmentShader: THREE.ShaderLib.basic.fragmentShader
    };

    applyInstancedRunwayLightShaderPatch(shader, { intensity });

    return {
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader,
        defines: shader.defines || {}
    };
}

export function getRunwayLightOwnedShaderSource({ intensity }) {
    const cacheKey = `runway-light:${intensity}`;
    if (!SOURCE_CACHE.has(cacheKey)) {
        SOURCE_CACHE.set(cacheKey, buildRunwayLightOwnedShaderSource({ intensity }));
    }
    return SOURCE_CACHE.get(cacheKey);
}

export function getRunwayLightUniformBindings(intensity) {
    return createRunwayLightUniformBindings(intensity);
}
