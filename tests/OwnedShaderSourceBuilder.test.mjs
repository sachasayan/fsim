import test from 'node:test';
import assert from 'node:assert/strict';

import {
    finalizeOwnedShaderSource,
    makePlaceholderUniformMap
} from '../js/modules/world/shaders/OwnedShaderSourceBuilder.js';

test('makePlaceholderUniformMap creates stable placeholder uniform entries', () => {
    const map = makePlaceholderUniformMap(['uFoo', 'uBar']);

    assert.deepEqual(Object.keys(map), ['uFoo', 'uBar']);
    assert.deepEqual(map.uFoo, { value: null });
    assert.deepEqual(map.uBar, { value: null });
});

test('finalizeOwnedShaderSource enforces required and forbidden shader contracts', () => {
    const shader = {
        vertexShader: 'varying vec3 vWorldPos;',
        fragmentShader: 'uniform sampler2D uWaterDepthTex;\nvec3 outgoingLight = vec3(1.0);',
        defines: { USE_COLOR: true }
    };

    const finalized = finalizeOwnedShaderSource({
        label: 'test water',
        shader,
        requiredVertex: [{ pattern: 'vWorldPos', description: 'world varying' }],
        requiredFragment: [{ pattern: 'uWaterDepthTex', description: 'water depth uniform' }],
        forbiddenFragment: [{ pattern: 'uTime', description: 'legacy time uniform' }]
    });

    assert.equal(finalized.vertexShader, shader.vertexShader);
    assert.equal(finalized.fragmentShader, shader.fragmentShader);
    assert.deepEqual(finalized.defines, shader.defines);

    assert.throws(
        () => finalizeOwnedShaderSource({
            label: 'broken water',
            shader,
            forbiddenFragment: [{ pattern: 'uWaterDepthTex', description: 'water depth uniform' }]
        }),
        /broken water fragment shader contains forbidden contract: water depth uniform/
    );
});
