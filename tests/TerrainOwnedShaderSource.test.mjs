import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getTerrainShaderDescriptor,
    getTerrainOwnedShaderSource,
    getTerrainOwnedUniformBindings
} from '../js/modules/world/terrain/TerrainOwnedShaderSource.js';
import { describeOwnedShaderDescriptor } from '../js/modules/world/shaders/ShaderDescriptor.js';

test('getTerrainOwnedShaderSource caches and returns owned terrain shader variants', () => {
    const nearSourceA = getTerrainOwnedShaderSource({ isFarLOD: false });
    const nearSourceB = getTerrainOwnedShaderSource({ isFarLOD: false });
    const farSource = getTerrainOwnedShaderSource({ isFarLOD: true });

    assert.equal(nearSourceA, nearSourceB);
    assert.match(nearSourceA.vertexShader, /attribute vec4 surfaceWeights;/);
    assert.match(nearSourceA.fragmentShader, /vec3 roadMarkingSrgbToLinear\(vec3 value\)/);
    assert.match(farSource.fragmentShader, /#define IS_FAR_LOD/);
});

test('getTerrainOwnedUniformBindings returns live uniform references', () => {
    const terrainDetailUniforms = {
        uTerrainDetailTex: { value: 'detail' },
        uRoadMarkingTex: { value: 'road' },
        uRoadMarkingCenter: { value: 'center' },
        uRoadMarkingWorldSize: { value: 1 },
        uRoadMarkingOpacity: { value: 1 },
        uRoadMarkingFadeStart: { value: 1 },
        uRoadMarkingFadeEnd: { value: 1 },
        uRoadMarkingBodyStart: { value: 1 },
        uRoadMarkingBodyEnd: { value: 1 },
        uRoadMarkingCoreStart: { value: 1 },
        uRoadMarkingCoreEnd: { value: 1 },
        uTerrainDetailScale: { value: 1 },
        uTerrainDetailStrength: { value: 1 },
        uTerrainSlopeStart: { value: 1 },
        uTerrainSlopeEnd: { value: 1 },
        uTerrainRockHeightStart: { value: 1 },
        uTerrainRockHeightEnd: { value: 1 },
        uTerrainAtmosStrength: { value: 1 },
        uTerrainFoliageNearStart: { value: 1 },
        uTerrainFoliageNearEnd: { value: 1 },
        uTerrainFoliageStrength: { value: 1 },
        uTerrainSandColor: { value: 'sand' },
        uTerrainGrassColor: { value: 'grass' },
        uTerrainRockColor: { value: 'rock' },
        uTerrainSnowColor: { value: 'snow' },
        uTerrainAsphaltColor: { value: 'asphalt' }
    };
    const atmosphereUniforms = {
        uAtmosCameraPos: { value: 'camera' },
        uAtmosColor: { value: 'color' },
        uAtmosNear: { value: 1 },
        uAtmosFar: { value: 2 }
    };
    const timeUniform = { value: 42 };

    const bindings = getTerrainOwnedUniformBindings({
        terrainDetailUniforms,
        atmosphereUniforms,
        timeUniform
    });

    assert.equal(bindings.uTerrainDetailTex, terrainDetailUniforms.uTerrainDetailTex);
    assert.equal(bindings.uAtmosColor, atmosphereUniforms.uAtmosColor);
    assert.equal(bindings.uTime, timeUniform);
});

test('getTerrainShaderDescriptor returns cached near/far descriptors with stable metadata', () => {
    const nearDescriptorA = getTerrainShaderDescriptor({ isFarLOD: false });
    const nearDescriptorB = getTerrainShaderDescriptor({ isFarLOD: false });
    const farDescriptor = getTerrainShaderDescriptor({ isFarLOD: true });

    assert.equal(nearDescriptorA, nearDescriptorB);
    assert.deepEqual(describeOwnedShaderDescriptor(nearDescriptorA), {
        id: 'terrain-owned-near',
        baseCacheKey: 'terrain-owned-standard-v1-near',
        patchId: 'terrain-owned-source',
        patchCacheKey: 'terrain-owned-source-near',
        metadata: {
            system: 'terrain',
            shaderFamily: 'standard',
            shaderVariant: 'near',
            isFarLOD: false
        }
    });
    assert.deepEqual(describeOwnedShaderDescriptor(farDescriptor), {
        id: 'terrain-owned-far',
        baseCacheKey: 'terrain-owned-standard-v1-far',
        patchId: 'terrain-owned-source',
        patchCacheKey: 'terrain-owned-source-far',
        metadata: {
            system: 'terrain',
            shaderFamily: 'standard',
            shaderVariant: 'far',
            isFarLOD: true
        }
    });
});
