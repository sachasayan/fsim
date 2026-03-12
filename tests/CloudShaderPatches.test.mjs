import test from 'node:test';
import assert from 'node:assert/strict';

import {
    applyNearCloudShaderPatch,
    createNearCloudUniformBindings
} from '../js/modules/world/shaders/CloudShaderPatches.js';

function makeShader() {
    return {
        uniforms: {},
        vertexShader: `#include <common>
#include <worldpos_vertex>`,
        fragmentShader: `#include <common>
#include <alphatest_fragment>
#include <opaque_fragment>`
    };
}

test('applyNearCloudShaderPatch injects near-fade and phase-lighting code', () => {
    const shader = makeShader();
    const sharedCloudUniforms = {
        uCloudCameraPos: { value: 'camera' },
        uNearFadeStart: { value: 1 },
        uNearFadeEnd: { value: 2 },
        uCloudMinLight: { value: 0.5 },
        uCloudSunDir: { value: 'sun' },
        uCloudPhaseStrength: { value: 0.25 }
    };

    applyNearCloudShaderPatch(shader, { sharedCloudUniforms });

    assert.equal(shader.uniforms.uCloudCameraPos, sharedCloudUniforms.uCloudCameraPos);
    assert.match(shader.vertexShader, /varying vec3 vCloudWorldPos;/);
    assert.match(shader.fragmentShader, /float nearFade = 1\.0 - smoothstep\(uNearFadeStart, uNearFadeEnd, cloudDist\);/);
    assert.match(shader.fragmentShader, /float phase = mix\(phase1, phase2, 0\.4\) \* uCloudPhaseStrength;/);
});

test('createNearCloudUniformBindings keeps live uniform references', () => {
    const sharedCloudUniforms = {
        uCloudCameraPos: { value: 'camera' },
        uNearFadeStart: { value: 1 },
        uNearFadeEnd: { value: 2 },
        uCloudMinLight: { value: 0.5 },
        uCloudSunDir: { value: 'sun' },
        uCloudPhaseStrength: { value: 0.25 }
    };

    const bindings = createNearCloudUniformBindings(sharedCloudUniforms);

    assert.equal(bindings.uCloudCameraPos, sharedCloudUniforms.uCloudCameraPos);
    assert.equal(bindings.uCloudSunDir, sharedCloudUniforms.uCloudSunDir);
    assert.equal(bindings.uCloudPhaseStrength, sharedCloudUniforms.uCloudPhaseStrength);
});
