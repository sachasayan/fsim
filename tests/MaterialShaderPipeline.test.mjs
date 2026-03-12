import test from 'node:test';
import assert from 'node:assert/strict';

import {
    configureMaterialShaderPipeline,
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
