import * as THREE from 'three';

import {
    applyDistanceAtmosphereShaderPatch,
    applyWaterDualScrollShaderPatch,
    createDistanceAtmosphereUniformBindings,
    createWaterDualScrollUniformBindings
} from './TerrainShaderPatches.js';

const ATMOSPHERE_UNIFORM_KEYS = [
    'uAtmosCameraPos',
    'uAtmosColor',
    'uAtmosNear',
    'uAtmosFar'
];

const SOURCE_CACHE = new Map();

function makePlaceholderUniformMap(keys) {
    return Object.fromEntries(keys.map((key) => [key, { value: null }]));
}

function buildWaterOwnedShaderSource({ isFarLOD = false, strength = 0.74, desat = 0.08 } = {}) {
    const shader = {
        uniforms: {},
        defines: {},
        vertexShader: isFarLOD ? THREE.ShaderLib.basic.vertexShader : THREE.ShaderLib.standard.vertexShader,
        fragmentShader: isFarLOD ? THREE.ShaderLib.basic.fragmentShader : THREE.ShaderLib.standard.fragmentShader
    };

    applyDistanceAtmosphereShaderPatch(shader, {
        atmosphereUniforms: makePlaceholderUniformMap(ATMOSPHERE_UNIFORM_KEYS),
        strength,
        desat
    });

    if (!isFarLOD) {
        applyWaterDualScrollShaderPatch(shader, {
            timeUniform: { value: 0 }
        });
    }

    return {
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader,
        defines: shader.defines || {}
    };
}

export function getWaterOwnedShaderSource({ isFarLOD = false, strength = 0.74, desat = 0.08 } = {}) {
    const cacheKey = `${isFarLOD ? 'far' : 'near'}:${strength.toFixed(4)}:${desat.toFixed(4)}`;
    if (!SOURCE_CACHE.has(cacheKey)) {
        SOURCE_CACHE.set(cacheKey, buildWaterOwnedShaderSource({ isFarLOD, strength, desat }));
    }
    return SOURCE_CACHE.get(cacheKey);
}

export function getWaterOwnedUniformBindings({ atmosphereUniforms, timeUniform = null, isFarLOD = false }) {
    const bindings = {
        ...createDistanceAtmosphereUniformBindings(atmosphereUniforms)
    };

    if (!isFarLOD) {
        if (!timeUniform) {
            throw new Error('Near water owned shader requires a time uniform binding');
        }
        Object.assign(bindings, createWaterDualScrollUniformBindings(timeUniform));
    }

    return bindings;
}
