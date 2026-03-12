import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createFarCloudUniforms,
    getFarCloudOwnedShaderSource,
    getNearCloudOwnedShaderSource,
    getNearCloudUniformBindings
} from '../js/modules/world/shaders/CloudOwnedShaderSource.js';

test('cloud owned shader sources are cached and expose expected near/far code', () => {
    const nearSourceA = getNearCloudOwnedShaderSource();
    const nearSourceB = getNearCloudOwnedShaderSource();
    const farSourceA = getFarCloudOwnedShaderSource();
    const farSourceB = getFarCloudOwnedShaderSource();

    assert.equal(nearSourceA, nearSourceB);
    assert.equal(farSourceA, farSourceB);
    assert.match(nearSourceA.vertexShader, /varying vec3 vCloudWorldPos;/);
    assert.match(nearSourceA.fragmentShader, /float nearFade = 1\.0 - smoothstep\(uNearFadeStart, uNearFadeEnd, cloudDist\);/);
    assert.match(farSourceA.fragmentShader, /float n = fbm\(p \+ fbm\(p \* 0\.5\) \* 0\.3\);/);
    assert.match(farSourceA.fragmentShader, /gl_FragColor = vec4\(finalColor, alpha \* uOpacity\);/);
});

test('cloud owned uniform helpers return live references and tuning-driven defaults', () => {
    const sharedCloudUniforms = {
        uCloudCameraPos: { value: 'camera' },
        uNearFadeStart: { value: 1 },
        uNearFadeEnd: { value: 2 },
        uCloudMinLight: { value: 0.5 },
        uCloudSunDir: { value: 'sun' },
        uCloudPhaseStrength: { value: 0.25 }
    };

    const nearBindings = getNearCloudUniformBindings(sharedCloudUniforms);
    const farUniforms = createFarCloudUniforms({
        cloudTuning: {
            farFadeStart: 9000,
            farFadeEnd: 14500
        }
    });

    assert.equal(nearBindings.uCloudCameraPos, sharedCloudUniforms.uCloudCameraPos);
    assert.equal(nearBindings.uNearFadeEnd, sharedCloudUniforms.uNearFadeEnd);
    assert.equal(farUniforms.uFarFadeStart.value, 9000);
    assert.equal(farUniforms.uFarFadeEnd.value, 14500);
    assert.equal(farUniforms.uDomainRadius.value, 114000);
});
