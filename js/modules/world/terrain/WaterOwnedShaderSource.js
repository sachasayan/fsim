import * as THREE from 'three';
import { createOwnedShaderDescriptor } from '../shaders/ShaderDescriptor.js';

import {
    applyWaterSurfaceColorShaderPatch,
    applyWaterStaticPatternShaderPatch,
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

function buildWaterOwnedShaderSource({
    isFarLOD = false,
    strength = 0.74,
    desat = 0.08,
    shadowContrast = 0.0,
    normalStrength = 1.5,
    patternEnabled = true
} = {}) {
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
        desat,
        shadowContrast
    });

    if (!isFarLOD) {
        applyWaterStaticPatternShaderPatch(shader, {
            normalStrength,
            patternEnabled
        });
    }

    return {
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader,
        defines: shader.defines || {}
    };
}

export function getWaterOwnedShaderSource({
    isFarLOD = false,
    strength = 0.74,
    desat = 0.08,
    shadowContrast = 0.0,
    normalStrength = 1.5,
    patternEnabled = true
} = {}) {
    const cacheKey = `${isFarLOD ? 'far' : 'near'}:${strength.toFixed(4)}:${desat.toFixed(4)}:${shadowContrast.toFixed(4)}:${normalStrength.toFixed(4)}:${patternEnabled ? 'pattern' : 'flat'}`;
    if (!SOURCE_CACHE.has(cacheKey)) {
        SOURCE_CACHE.set(cacheKey, buildWaterOwnedShaderSource({
            isFarLOD,
            strength,
            desat,
            shadowContrast,
            normalStrength,
            patternEnabled
        }));
    }
    return SOURCE_CACHE.get(cacheKey);
}

export function getWaterOwnedUniformBindings({ atmosphereUniforms, waterSurfaceUniforms, isFarLOD = false }) {
    const bindings = createWaterSurfaceUniformBindings(atmosphereUniforms, waterSurfaceUniforms);
    return bindings;
}

export function getWaterShaderDescriptor({
    isFarLOD = false,
    strength = 0.74,
    desat = 0.08,
    shadowContrast = 0.0,
    normalStrength = 1.5,
    patternEnabled = true
} = {}) {
    const fragId = isFarLOD ? 'far' : 'near';
    const shaderFamily = isFarLOD ? 'basic' : 'standard';
    const cacheKey = `${fragId}:${strength.toFixed(4)}:${desat.toFixed(4)}:${shadowContrast.toFixed(4)}:${normalStrength.toFixed(4)}:${patternEnabled ? 'pattern' : 'flat'}`;
    if (!DESCRIPTOR_CACHE.has(cacheKey)) {
        DESCRIPTOR_CACHE.set(cacheKey, createOwnedShaderDescriptor({
            id: `water-owned-${fragId}-${strength.toFixed(4)}-${desat.toFixed(4)}-${shadowContrast.toFixed(4)}-${normalStrength.toFixed(4)}-${patternEnabled ? 'pattern' : 'flat'}`,
            baseCacheKey: `water-owned-${shaderFamily}-v1-${fragId}`,
            patchId: 'water-owned-source',
            patchCacheKey: `water-owned-source-${fragId}-${strength.toFixed(4)}-${desat.toFixed(4)}-${shadowContrast.toFixed(4)}-${normalStrength.toFixed(4)}-${patternEnabled ? 'pattern' : 'flat'}`,
            metadata: {
                system: 'terrain',
                shaderFamily,
                shaderVariant: fragId,
                isFarLOD,
                atmosphereStrength: strength,
                atmosphereDesat: desat,
                shadowContrast,
                normalStrength,
                staticPattern: !isFarLOD && patternEnabled
            },
            source: getWaterOwnedShaderSource({
                isFarLOD,
                strength,
                desat,
                shadowContrast,
                normalStrength,
                patternEnabled
            }),
            uniformBindings({ atmosphereUniforms, waterSurfaceUniforms }) {
                return getWaterOwnedUniformBindings({
                    atmosphereUniforms,
                    waterSurfaceUniforms,
                    isFarLOD
                });
            }
        }));
    }

    return DESCRIPTOR_CACHE.get(cacheKey);
}
