import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getWaterShaderDescriptor,
    getWaterOwnedShaderSource,
    getWaterOwnedUniformBindings
} from '../js/modules/world/terrain/WaterOwnedShaderSource.js';
import { describeOwnedShaderDescriptor } from '../js/modules/world/shaders/ShaderDescriptor.js';

test('water owned shader sources are cached and expose expected near/far behavior', () => {
    const nearSourceA = getWaterOwnedShaderSource({ isFarLOD: false, strength: 0.74, desat: 0.08 });
    const nearSourceB = getWaterOwnedShaderSource({ isFarLOD: false, strength: 0.74, desat: 0.08 });
    const farSource = getWaterOwnedShaderSource({ isFarLOD: true, strength: 0.74, desat: 0.08 });

    assert.equal(nearSourceA, nearSourceB);
    assert.match(nearSourceA.vertexShader, /varying vec3 vAtmosWorldPos;/);
    assert.match(nearSourceA.fragmentShader, /uniform float uTime;/);
    assert.match(nearSourceA.fragmentShader, /vec2 normalUv1 = vNormalMapUv \+ vec2\(uTime \* 0\.12, uTime \* 0\.08\);/);
    assert.match(nearSourceA.fragmentShader, /float atmosMix = smoothstep\(uAtmosNear, uAtmosFar, atmosDist\) \* 0\.7400;/);
    assert.match(farSource.fragmentShader, /float atmosMix = smoothstep\(uAtmosNear, uAtmosFar, atmosDist\) \* 0\.7400;/);
    assert.doesNotMatch(farSource.fragmentShader, /uniform float uTime;/);
});

test('water owned uniform bindings expose live references and reject missing near-water time uniforms', () => {
    const atmosphereUniforms = {
        uAtmosCameraPos: { value: 'camera' },
        uAtmosColor: { value: 'color' },
        uAtmosNear: { value: 1 },
        uAtmosFar: { value: 2 }
    };
    const timeUniform = { value: 42 };

    const nearBindings = getWaterOwnedUniformBindings({
        atmosphereUniforms,
        timeUniform,
        isFarLOD: false
    });
    const farBindings = getWaterOwnedUniformBindings({
        atmosphereUniforms,
        isFarLOD: true
    });

    assert.equal(nearBindings.uAtmosColor, atmosphereUniforms.uAtmosColor);
    assert.equal(nearBindings.uTime, timeUniform);
    assert.equal(farBindings.uAtmosNear, atmosphereUniforms.uAtmosNear);
    assert.equal(Object.prototype.hasOwnProperty.call(farBindings, 'uTime'), false);
    assert.throws(
        () => getWaterOwnedUniformBindings({ atmosphereUniforms, isFarLOD: false }),
        /Near water owned shader requires a time uniform binding/
    );
});

test('getWaterShaderDescriptor returns cached descriptors with variant metadata', () => {
    const nearDescriptorA = getWaterShaderDescriptor({ isFarLOD: false, strength: 0.74, desat: 0.08 });
    const nearDescriptorB = getWaterShaderDescriptor({ isFarLOD: false, strength: 0.74, desat: 0.08 });
    const farDescriptor = getWaterShaderDescriptor({ isFarLOD: true, strength: 0.74, desat: 0.08 });

    assert.equal(nearDescriptorA, nearDescriptorB);
    assert.deepEqual(describeOwnedShaderDescriptor(nearDescriptorA), {
        id: 'water-owned-near-0.7400-0.0800',
        baseCacheKey: 'water-owned-standard-v1-near',
        patchId: 'water-owned-source',
        patchCacheKey: 'water-owned-source-near-0.7400-0.0800',
        metadata: {
            system: 'terrain',
            shaderFamily: 'standard',
            shaderVariant: 'near',
            isFarLOD: false,
            atmosphereStrength: 0.74,
            atmosphereDesat: 0.08,
            dualScroll: true
        }
    });
    assert.deepEqual(describeOwnedShaderDescriptor(farDescriptor), {
        id: 'water-owned-far-0.7400-0.0800',
        baseCacheKey: 'water-owned-basic-v1-far',
        patchId: 'water-owned-source',
        patchCacheKey: 'water-owned-source-far-0.7400-0.0800',
        metadata: {
            system: 'terrain',
            shaderFamily: 'basic',
            shaderVariant: 'far',
            isFarLOD: true,
            atmosphereStrength: 0.74,
            atmosphereDesat: 0.08,
            dualScroll: false
        }
    });
});
