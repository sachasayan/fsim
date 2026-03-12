import test from 'node:test';
import assert from 'node:assert/strict';

import { applyInstancedRunwayLightShaderPatch } from '../js/modules/world/shaders/RunwayShaderPatches.js';

function makeShader() {
    return {
        uniforms: {},
        vertexShader: `#include <common>
#include <color_vertex>
#include <project_vertex>`,
        fragmentShader: `#include <common>
vec4 diffuseColor = vec4( diffuse, opacity );`
    };
}

test('applyInstancedRunwayLightShaderPatch injects intensity and instancing color support', () => {
    const shader = makeShader();

    applyInstancedRunwayLightShaderPatch(shader, { intensity: 12 });

    assert.equal(shader.uniforms.uIntensity.value, 12);
    assert.match(shader.vertexShader, /vInstanceColor = instanceColor;/);
    assert.match(shader.vertexShader, /vDist = - mvPosition\.z;/);
    assert.match(shader.fragmentShader, /float lodFade = smoothstep\(16000\.0, 10000\.0, vDist\);/);
});
