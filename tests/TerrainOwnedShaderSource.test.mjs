import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
    getTerrainShaderDescriptor,
    getTerrainOwnedShaderSource,
    getTerrainOwnedUniformBindings
} from '../js/modules/world/terrain/TerrainOwnedShaderSource.js';
import { describeOwnedShaderDescriptor } from '../js/modules/world/shaders/ShaderDescriptor.js';
import { applyTerrainDetailShaderPatch } from '../js/modules/world/terrain/TerrainShaderPatches.js';

function normalizeShaderSource(source) {
    return source
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\s+/g, '')
        .trim();
}

test('getTerrainOwnedShaderSource caches and returns owned terrain shader variants', () => {
    const nearSourceA = getTerrainOwnedShaderSource({ isFarLOD: false, shadowContrast: 0.3 });
    const nearSourceB = getTerrainOwnedShaderSource({ isFarLOD: false, shadowContrast: 0.3 });
    const farSource = getTerrainOwnedShaderSource({ isFarLOD: true, shadowContrast: 0.3 });

    assert.equal(nearSourceA, nearSourceB);
    assert.match(nearSourceA.vertexShader, /attribute vec4 surfaceWeights;/);
    assert.match(nearSourceA.fragmentShader, /baseTerrainColor \*= naturalTerrainVertexTint;/);
    assert.match(nearSourceA.fragmentShader, /diffuseColor\.rgb = baseTerrainColor;/);
    assert.match(nearSourceA.fragmentShader, /float terrainShadowFade = resolveTerrainShadowFade\(vTerrainWorldPos\.xz\);/);
    assert.match(nearSourceA.fragmentShader, /float terrainShadowVisibility = mix\(1\.0, getShadowMask\(\), 0\.3000 \* terrainShadowFade\);/);
    assert.doesNotMatch(nearSourceA.fragmentShader, /#include <color_fragment>/);
    assert.match(farSource.fragmentShader, /#define IS_FAR_LOD/);
});

test('getTerrainOwnedUniformBindings returns live uniform references', () => {
    const terrainDetailUniforms = {
        uTerrainDetailTex: { value: 'detail' },
        uTerrainGrassTex: { value: 'grass-tex' },
        uTerrainDetailScale: { value: 1 },
        uTerrainDetailStrength: { value: 1 },
        uTerrainSlopeStart: { value: 1 },
        uTerrainSlopeEnd: { value: 1 },
        uTerrainRockHeightStart: { value: 1 },
        uTerrainRockHeightEnd: { value: 1 },
        uTerrainAtmosStrength: { value: 1 },
        uTerrainGrassTexScale: { value: 1 },
        uTerrainGrassTexStrength: { value: 1 },
        uTerrainGrassTexNearStart: { value: 1 },
        uTerrainGrassTexNearEnd: { value: 1 },
        uTerrainGrassShowTexture: { value: 1 },
        uTerrainGrassDebugMask: { value: 0 },
        uTerrainSandColor: { value: 'sand' },
        uTerrainGrassColor: { value: 'grass' },
        uTerrainRockColor: { value: 'rock' },
        uTerrainSnowColor: { value: 'snow' }
    };
    const atmosphereUniforms = {
        uAtmosCameraPos: { value: 'camera' },
        uAtmosColor: { value: 'color' },
        uAtmosNear: { value: 1 },
        uAtmosFar: { value: 2 },
        uSurfaceShadowDistance: { value: 20000 },
        uSurfaceShadowFadeStart: { value: 12000 },
        uShadowCoverageCenter: { value: 'shadow-center' },
        uShadowCoverageExtent: { value: 2200 },
        uShadowCoverageFadeStart: { value: 1760 }
    };
    const timeUniform = { value: 42 };

    const bindings = getTerrainOwnedUniformBindings({
        terrainDetailUniforms,
        atmosphereUniforms,
        timeUniform
    });

    assert.equal(bindings.uTerrainDetailTex, terrainDetailUniforms.uTerrainDetailTex);
    assert.equal(bindings.uAtmosColor, atmosphereUniforms.uAtmosColor);
    assert.equal(bindings.uSurfaceShadowDistance, atmosphereUniforms.uSurfaceShadowDistance);
    assert.equal(bindings.uShadowCoverageExtent, atmosphereUniforms.uShadowCoverageExtent);
    assert.equal(bindings.uTime, timeUniform);
});

test('getTerrainShaderDescriptor returns cached near/far descriptors with stable metadata', () => {
    const nearDescriptorA = getTerrainShaderDescriptor({ isFarLOD: false, shadowContrast: 0.3 });
    const nearDescriptorB = getTerrainShaderDescriptor({ isFarLOD: false, shadowContrast: 0.3 });
    const farDescriptor = getTerrainShaderDescriptor({ isFarLOD: true, shadowContrast: 0.3 });

    assert.equal(nearDescriptorA, nearDescriptorB);
    assert.deepEqual(describeOwnedShaderDescriptor(nearDescriptorA), {
        id: 'terrain-owned-near-0.3000',
        baseCacheKey: 'terrain-owned-standard-v1-near',
        patchId: 'terrain-owned-source',
        patchCacheKey: 'terrain-owned-source-near-0.3000',
        metadata: {
            system: 'terrain',
            shaderFamily: 'standard',
            shaderVariant: 'near',
            isFarLOD: false,
            shadowContrast: 0.3
        }
    });
    assert.deepEqual(describeOwnedShaderDescriptor(farDescriptor), {
        id: 'terrain-owned-far-0.3000',
        baseCacheKey: 'terrain-owned-standard-v1-far',
        patchId: 'terrain-owned-source',
        patchCacheKey: 'terrain-owned-source-far-0.3000',
        metadata: {
            system: 'terrain',
            shaderFamily: 'standard',
            shaderVariant: 'far',
            isFarLOD: true,
            shadowContrast: 0.3
        }
    });
});

test('terrain owned shader templates match the legacy terrain patch output', () => {
    const terrainDetailUniforms = Object.fromEntries([
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
    ].map((key) => [key, { value: null }]));
    const atmosphereUniforms = Object.fromEntries([
        'uAtmosCameraPos',
        'uAtmosColor',
        'uAtmosNear',
        'uAtmosFar',
        'uSurfaceShadowDistance',
        'uSurfaceShadowFadeStart',
        'uShadowCoverageCenter',
        'uShadowCoverageExtent',
        'uShadowCoverageFadeStart'
    ].map((key) => [key, { value: null }]));

    function buildLegacyTerrainSource(isFarLOD) {
        const shader = {
            uniforms: {},
            defines: {},
            vertexShader: THREE.ShaderLib.standard.vertexShader,
            fragmentShader: THREE.ShaderLib.standard.fragmentShader
        };
        applyTerrainDetailShaderPatch(shader, {
            terrainDetailUniforms,
            atmosphereUniforms,
            timeUniform: { value: 0 },
            isFarLOD,
            shadowContrast: 0.3
        });
        return shader;
    }

    const legacyNear = buildLegacyTerrainSource(false);
    const legacyFar = buildLegacyTerrainSource(true);
    const ownedNear = getTerrainOwnedShaderSource({ isFarLOD: false, shadowContrast: 0.3 });
    const ownedFar = getTerrainOwnedShaderSource({ isFarLOD: true, shadowContrast: 0.3 });

    assert.equal(normalizeShaderSource(ownedNear.vertexShader), normalizeShaderSource(legacyNear.vertexShader));
    assert.equal(normalizeShaderSource(ownedNear.fragmentShader), normalizeShaderSource(legacyNear.fragmentShader));
    assert.equal(normalizeShaderSource(ownedFar.fragmentShader), normalizeShaderSource(legacyFar.fragmentShader));
});
