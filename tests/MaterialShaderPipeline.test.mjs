import test from 'node:test';
import assert from 'node:assert/strict';

import {
    configureMaterialShaderPipeline,
    createOwnedShaderSourcePatch,
    createShaderPatch,
    describeMaterialShaderPipeline,
    setMaterialShaderBaseKey,
    upsertMaterialShaderPatch
} from '../js/modules/world/shaders/MaterialShaderPipeline.js';

test('configureMaterialShaderPipeline composes patch application and cache keys', () => {
    const material = {
        userData: {},
        onBeforeCompile(shader) {
            shader.fragmentShader += '\n// base';
        },
        customProgramCacheKey() {
            return 'legacy-key';
        }
    };
    const shader = { fragmentShader: 'void main() {}' };

    configureMaterialShaderPipeline(material, {
        baseCacheKey: 'terrain',
        patches: [
            createShaderPatch({
                id: 'lighting',
                apply(targetShader) {
                    targetShader.fragmentShader += '\n// lighting';
                }
            }),
            createShaderPatch({
                id: 'fog',
                cacheKey: 'fog-v2',
                apply(targetShader) {
                    targetShader.fragmentShader += '\n// fog';
                }
            })
        ]
    });

    material.onBeforeCompile(shader);

    assert.match(shader.fragmentShader, /\/\/ base/);
    assert.match(shader.fragmentShader, /\/\/ lighting/);
    assert.match(shader.fragmentShader, /\/\/ fog/);
    assert.equal(material.customProgramCacheKey(), 'terrain::lighting+fog-v2');
});

test('upsertMaterialShaderPatch replaces patches by id and updates metadata', () => {
    const material = { userData: {} };

    setMaterialShaderBaseKey(material, 'water');
    upsertMaterialShaderPatch(material, createShaderPatch({
        id: 'surface',
        cacheKey: 'surface-a',
        metadata: { version: 1 },
        apply() {}
    }));
    upsertMaterialShaderPatch(material, createShaderPatch({
        id: 'surface',
        cacheKey: 'surface-b',
        metadata: { version: 2 },
        apply() {}
    }));

    const description = describeMaterialShaderPipeline(material);

    assert.equal(material.customProgramCacheKey(), 'water::surface-b');
    assert.deepEqual(description.patches, [
        {
            id: 'surface',
            cacheKey: 'surface-b',
            metadata: { version: 2 }
        }
    ]);
});

test('createOwnedShaderSourcePatch replaces shader sources and binds uniforms', () => {
    const material = { userData: {} };
    const shader = {
        uniforms: { diffuse: { value: 'existing' } },
        defines: { STANDARD: '' },
        vertexShader: 'old-vertex',
        fragmentShader: 'old-fragment'
    };
    const liveUniform = { value: 7 };

    configureMaterialShaderPipeline(material, {
        baseCacheKey: 'owned',
        patches: [
            createOwnedShaderSourcePatch({
                id: 'owned-source',
                source: {
                    vertexShader: 'new-vertex',
                    fragmentShader: 'new-fragment',
                    defines: { USE_COLOR: '' }
                },
                uniformBindings: {
                    uLive: liveUniform
                }
            })
        ]
    });

    material.onBeforeCompile(shader);

    assert.equal(shader.vertexShader, 'new-vertex');
    assert.equal(shader.fragmentShader, 'new-fragment');
    assert.equal(shader.uniforms.uLive, liveUniform);
    assert.ok(Object.prototype.hasOwnProperty.call(shader.defines, 'USE_COLOR'));
});
