import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getRunwayLightOwnedShaderSource,
    getRunwayLightUniformBindings
} from '../js/modules/world/shaders/RunwayOwnedShaderSource.js';

test('runway owned light shader source is cached per intensity and contains instancing logic', () => {
    const sourceA = getRunwayLightOwnedShaderSource({ intensity: 12 });
    const sourceB = getRunwayLightOwnedShaderSource({ intensity: 12 });
    const sourceC = getRunwayLightOwnedShaderSource({ intensity: 24 });

    assert.equal(sourceA, sourceB);
    assert.notEqual(sourceA, sourceC);
    assert.match(sourceA.vertexShader, /vInstanceColor = instanceColor;/);
    assert.match(sourceA.vertexShader, /vDist = - mvPosition\.z;/);
    assert.match(sourceA.fragmentShader, /float lodFade = smoothstep\(16000\.0, 10000\.0, vDist\);/);
});

test('runway owned light uniform bindings return intensity uniform', () => {
    const bindings = getRunwayLightUniformBindings(24);

    assert.equal(bindings.uIntensity.value, 24);
});
