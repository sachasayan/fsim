// @ts-check

import * as THREE from 'three';
import { createOwnedShaderDescriptor } from '../shaders/ShaderDescriptor.js';
import {
    finalizeOwnedShaderSource,
    makePlaceholderUniformMap
} from '../shaders/OwnedShaderSourceBuilder.js';
import {
    applyTerrainDetailShaderPatch,
    createTerrainDetailUniformBindings
} from './TerrainShaderPatches.js';

const SOURCE_CACHE = new Map();
const DESCRIPTOR_CACHE = new Map();

const TERRAIN_DETAIL_UNIFORM_KEYS = [
    'uTerrainDetailTex',
    'uTerrainGrassTex',
    'uTerrainDetailScale',
    'uTerrainDetailStrength',
    'uTerrainSlopeStart',
    'uTerrainSlopeEnd',
    'uTerrainRockHeightStart',
    'uTerrainRockHeightEnd',
    'uTerrainAtmosStrength',
    'uTerrainGrassTexScale',
    'uTerrainGrassTexStrength',
    'uTerrainGrassTexNearStart',
    'uTerrainGrassTexNearEnd',
    'uTerrainGrassShowTexture',
    'uTerrainGrassDebugMask',
    'uTerrainSandColor',
    'uTerrainGrassColor',
    'uTerrainRockColor',
    'uTerrainSnowColor'
];

const ATMOSPHERE_UNIFORM_KEYS = ['uAtmosCameraPos', 'uAtmosColor', 'uAtmosNear', 'uAtmosFar'];

function buildTerrainOwnedShaderSource({ isFarLOD = false, shadowContrast = 0.0 } = {}) {
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
        isFarLOD,
        shadowContrast
    });

    return finalizeOwnedShaderSource({
        label: `terrain ${isFarLOD ? 'far' : 'near'} owned source`,
        shader,
        requiredVertex: [
            { pattern: 'attribute vec4 surfaceWeights;', description: 'surfaceWeights attribute injection' },
            { pattern: 'varying vec3 vTerrainWorldPos;', description: 'terrain world position varying' }
        ],
        requiredFragment: [
            { pattern: 'uniform sampler2D uTerrainDetailTex;', description: 'terrain detail texture uniform' },
            { pattern: 'diffuseColor.rgb = baseTerrainColor;', description: 'terrain base color assignment' },
            { pattern: 'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;', description: 'standard lighting output' }
        ]
    });
}

export function getTerrainOwnedShaderSource({ isFarLOD = false, shadowContrast = 0.0 } = {}) {
    const cacheKey = `${isFarLOD ? 'far' : 'near'}:${shadowContrast.toFixed(4)}`;
    if (!SOURCE_CACHE.has(cacheKey)) {
        SOURCE_CACHE.set(cacheKey, buildTerrainOwnedShaderSource({ isFarLOD, shadowContrast }));
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

export function getTerrainShaderDescriptor({ isFarLOD = false, shadowContrast = 0.0 } = {}) {
    const cacheKey = `${isFarLOD ? 'far' : 'near'}:${shadowContrast.toFixed(4)}`;
    if (!DESCRIPTOR_CACHE.has(cacheKey)) {
        const fragId = isFarLOD ? 'far' : 'near';
        DESCRIPTOR_CACHE.set(cacheKey, createOwnedShaderDescriptor({
            id: `terrain-owned-${fragId}-${shadowContrast.toFixed(4)}`,
            baseCacheKey: `terrain-owned-standard-v1-${fragId}`,
            patchId: 'terrain-owned-source',
            patchCacheKey: `terrain-owned-source-${fragId}-${shadowContrast.toFixed(4)}`,
            metadata: {
                system: 'terrain',
                shaderFamily: 'standard',
                shaderVariant: fragId,
                isFarLOD,
                shadowContrast
            },
            source: getTerrainOwnedShaderSource({ isFarLOD, shadowContrast }),
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
