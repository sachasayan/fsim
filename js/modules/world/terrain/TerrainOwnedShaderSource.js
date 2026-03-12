import * as THREE from 'three';
import { createOwnedShaderDescriptor } from '../shaders/ShaderDescriptor.js';
import {
    applyTerrainDetailShaderPatch,
    createTerrainDetailUniformBindings
} from './TerrainShaderPatches.js';

const SOURCE_CACHE = new Map();
const DESCRIPTOR_CACHE = new Map();

const TERRAIN_DETAIL_UNIFORM_KEYS = [
    'uTerrainDetailTex',
    'uRoadMarkingTex',
    'uRoadMarkingCenter',
    'uRoadMarkingWorldSize',
    'uRoadMarkingOpacity',
    'uRoadMarkingFadeStart',
    'uRoadMarkingFadeEnd',
    'uRoadMarkingBodyStart',
    'uRoadMarkingBodyEnd',
    'uRoadMarkingCoreStart',
    'uRoadMarkingCoreEnd',
    'uTerrainDetailScale',
    'uTerrainDetailStrength',
    'uTerrainSlopeStart',
    'uTerrainSlopeEnd',
    'uTerrainRockHeightStart',
    'uTerrainRockHeightEnd',
    'uTerrainAtmosStrength',
    'uTerrainFoliageNearStart',
    'uTerrainFoliageNearEnd',
    'uTerrainFoliageStrength',
    'uTerrainSandColor',
    'uTerrainGrassColor',
    'uTerrainRockColor',
    'uTerrainSnowColor',
    'uTerrainAsphaltColor'
];

const ATMOSPHERE_UNIFORM_KEYS = [
    'uAtmosCameraPos',
    'uAtmosColor',
    'uAtmosNear',
    'uAtmosFar'
];

function makePlaceholderUniformMap(keys) {
    return Object.fromEntries(keys.map((key) => [key, { value: null }]));
}

function buildTerrainOwnedShaderSource(isFarLOD) {
    const shader = {
        uniforms: {},
        defines: {},
        vertexShader: THREE.ShaderLib.standard.vertexShader,
        fragmentShader: THREE.ShaderLib.standard.fragmentShader
    };

    applyTerrainDetailShaderPatch(shader, {
        terrainDetailUniforms: makePlaceholderUniformMap(TERRAIN_DETAIL_UNIFORM_KEYS),
        atmosphereUniforms: makePlaceholderUniformMap(ATMOSPHERE_UNIFORM_KEYS),
        timeUniform: { value: 0 },
        isFarLOD
    });

    return {
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader,
        defines: shader.defines || {}
    };
}

export function getTerrainOwnedShaderSource({ isFarLOD = false } = {}) {
    const cacheKey = isFarLOD ? 'far' : 'near';
    if (!SOURCE_CACHE.has(cacheKey)) {
        SOURCE_CACHE.set(cacheKey, buildTerrainOwnedShaderSource(isFarLOD));
    }
    return SOURCE_CACHE.get(cacheKey);
}

export function getTerrainOwnedUniformBindings({
    terrainDetailUniforms,
    atmosphereUniforms,
    timeUniform
}) {
    return createTerrainDetailUniformBindings(terrainDetailUniforms, atmosphereUniforms, timeUniform);
}

export function getTerrainShaderDescriptor({ isFarLOD = false } = {}) {
    const cacheKey = isFarLOD ? 'far' : 'near';
    if (!DESCRIPTOR_CACHE.has(cacheKey)) {
        const fragId = isFarLOD ? 'far' : 'near';
        DESCRIPTOR_CACHE.set(cacheKey, createOwnedShaderDescriptor({
            id: `terrain-owned-${fragId}`,
            baseCacheKey: `terrain-owned-standard-v1-${fragId}`,
            patchId: 'terrain-owned-source',
            patchCacheKey: `terrain-owned-source-${fragId}`,
            metadata: {
                system: 'terrain',
                shaderFamily: 'standard',
                shaderVariant: fragId,
                isFarLOD
            },
            source: getTerrainOwnedShaderSource({ isFarLOD }),
            uniformBindings({
                terrainDetailUniforms,
                atmosphereUniforms,
                timeUniform
            }) {
                return getTerrainOwnedUniformBindings({
                    terrainDetailUniforms,
                    atmosphereUniforms,
                    timeUniform
                });
            }
        }));
    }

    return DESCRIPTOR_CACHE.get(cacheKey);
}
