import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getRunwayLightOwnedShaderSource,
    getRunwayLightShaderDescriptor,
    getRunwayLightUniformBindings
} from '../js/modules/world/shaders/RunwayOwnedShaderSource.js';
import { describeOwnedShaderDescriptor } from '../js/modules/world/shaders/ShaderDescriptor.js';

test('runway owned light shader source is cached per intensity and contains instancing logic', () => {
    const sourceA = getRunwayLightOwnedShaderSource({ intensity: 12 });
    const sourceB = getRunwayLightOwnedShaderSource({ intensity: 12 });
    const sourceC = getRunwayLightOwnedShaderSource({ intensity: 24 });

    assert.equal(sourceA, sourceB);
    assert.notEqual(sourceA, sourceC);
    assert.match(sourceA.vertexShader, /vInstanceColor = instanceColor\.xyz;/);
    assert.match(sourceA.vertexShader, /vDist = - mvPosition\.z;/);
    assert.match(sourceA.fragmentShader, /float lodFade = smoothstep\(16000\.0, 10000\.0, vDist\);/);
    assert.doesNotMatch(sourceA.fragmentShader, /uTime/);
});

test('runway owned light uniform bindings return intensity uniform', () => {
    const bindings = getRunwayLightUniformBindings(24);

    assert.equal(bindings.uIntensity.value, 24);
});

test('runway light shader descriptor is cached with stable metadata', () => {
    const descriptorA = getRunwayLightShaderDescriptor({ intensity: 24 });
    const descriptorB = getRunwayLightShaderDescriptor({ intensity: 24 });

    assert.equal(descriptorA, descriptorB);
    assert.deepEqual(describeOwnedShaderDescriptor(descriptorA), {
        id: 'runway-light-24',
        baseCacheKey: 'runway-light-owned-v1-24',
        patchId: 'runway-light-owned-source',
        patchCacheKey: 'runway-light-owned-source-24',
        metadata: {
            intensity: 24,
            shaderFamily: 'basic',
            system: 'runway'
        }
    });
});
