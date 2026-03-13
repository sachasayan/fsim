import * as THREE from 'three';
import { createOwnedShaderDescriptor } from '../shaders/ShaderDescriptor.js';

import {
    applyWaterSurfaceColorShaderPatch,
    applyWaterDualScrollShaderPatch,
    createWaterDualScrollUniformBindings,
    createWaterSurfaceUniformBindings
} from './TerrainShaderPatches.js';

const SOURCE_CACHE = new Map();
const DESCRIPTOR_CACHE = new Map();

const ATMOSPHERE_UNIFORM_KEYS = [
    'uAtmosCameraPos',
    'uAtmosColor',
    'uAtmosNear',
    'uAtmosFar'
];

const WATER_SURFACE_UNIFORM_KEYS = [
    'uWaterDepthTex',
    'uWaterBoundsMin',
    'uWaterBoundsSize',
    'uWaterDepthScale',
    'uWaterFoamDepth',
    'uWaterShallowStart',
    'uWaterShallowEnd',
    'uWaterDeepEnd',
    'uWaterFoamColor',
    'uWaterShallowColor',
    'uWaterDeepColor'
];

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

    applyWaterSurfaceColorShaderPatch(shader, {
        atmosphereUniforms: makePlaceholderUniformMap(ATMOSPHERE_UNIFORM_KEYS),
        waterSurfaceUniforms: makePlaceholderUniformMap(WATER_SURFACE_UNIFORM_KEYS),
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

export function getWaterOwnedUniformBindings({ atmosphereUniforms, waterSurfaceUniforms, timeUniform = null, isFarLOD = false }) {
    const bindings = createWaterSurfaceUniformBindings(atmosphereUniforms, waterSurfaceUniforms);

    if (!isFarLOD) {
        if (!timeUniform) {
            throw new Error('Near water owned shader requires a time uniform binding');
        }
        Object.assign(bindings, createWaterDualScrollUniformBindings(timeUniform));
    }

    return bindings;
}

export function getWaterShaderDescriptor({ isFarLOD = false, strength = 0.74, desat = 0.08 } = {}) {
    const fragId = isFarLOD ? 'far' : 'near';
    const shaderFamily = isFarLOD ? 'basic' : 'standard';
    const cacheKey = `${fragId}:${strength.toFixed(4)}:${desat.toFixed(4)}`;
    if (!DESCRIPTOR_CACHE.has(cacheKey)) {
        DESCRIPTOR_CACHE.set(cacheKey, createOwnedShaderDescriptor({
            id: `water-owned-${fragId}-${strength.toFixed(4)}-${desat.toFixed(4)}`,
            baseCacheKey: `water-owned-${shaderFamily}-v1-${fragId}`,
            patchId: 'water-owned-source',
            patchCacheKey: `water-owned-source-${fragId}-${strength.toFixed(4)}-${desat.toFixed(4)}`,
            metadata: {
                system: 'terrain',
                shaderFamily,
                shaderVariant: fragId,
                isFarLOD,
                atmosphereStrength: strength,
                atmosphereDesat: desat,
                dualScroll: !isFarLOD
            },
            source: getWaterOwnedShaderSource({ isFarLOD, strength, desat }),
            uniformBindings({ atmosphereUniforms, waterSurfaceUniforms, timeUniform = null }) {
                return getWaterOwnedUniformBindings({
                    atmosphereUniforms,
                    waterSurfaceUniforms,
                    timeUniform,
                    isFarLOD
                });
            }
        }));
    }

    return DESCRIPTOR_CACHE.get(cacheKey);
}
