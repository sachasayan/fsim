import test from 'node:test';
import assert from 'node:assert/strict';

import {
    applyOwnedShaderDescriptor,
    createOwnedShaderDescriptor,
    describeOwnedShaderDescriptor
} from '../js/modules/world/shaders/ShaderDescriptor.js';
import { describeMaterialShaderPipeline } from '../js/modules/world/shaders/MaterialShaderPipeline.js';

test('applyOwnedShaderDescriptor configures a material from a resolved descriptor', () => {
    const timeUniform = { value: 42 };
    const material = { userData: {} };
    const descriptor = createOwnedShaderDescriptor({
        id: 'terrain-owned-near',
        baseCacheKey: ({ variant }) => `terrain-owned-${variant}`,
        patchId: 'terrain-owned-source',
        patchCacheKey: ({ variant }) => `terrain-owned-source-${variant}`,
        metadata: {
            system: 'terrain',
            variant: 'near'
        },
        source: {
            vertexShader: 'new-vertex',
            fragmentShader: 'new-fragment',
            defines: {
                USE_COLOR: ''
            }
        },
        uniformBindings: ({ liveUniform }) => ({
            uTime: liveUniform
        })
    });

    const description = applyOwnedShaderDescriptor(material, descriptor, {
        variant: 'near',
        liveUniform: timeUniform
    });
    const shader = {
        uniforms: {},
        defines: {},
        vertexShader: 'old-vertex',
        fragmentShader: 'old-fragment'
    };

    material.onBeforeCompile(shader);

    assert.deepEqual(description, {
        id: 'terrain-owned-near',
        baseCacheKey: 'terrain-owned-near',
        patchId: 'terrain-owned-source',
        patchCacheKey: 'terrain-owned-source-near',
        metadata: {
            system: 'terrain',
            variant: 'near'
        }
    });
    assert.equal(material.customProgramCacheKey(), 'terrain-owned-near::terrain-owned-source-near');
    assert.equal(material.userData.shaderDescriptor.id, 'terrain-owned-near');
    assert.deepEqual(describeMaterialShaderPipeline(material), {
        baseCacheKey: 'terrain-owned-near',
        patches: [
            {
                id: 'terrain-owned-source',
                cacheKey: 'terrain-owned-source-near',
                metadata: {
                    descriptorId: 'terrain-owned-near',
                    system: 'terrain',
                    variant: 'near',
                    ownedSource: true
                }
            }
        ]
    });
    assert.equal(shader.vertexShader, 'new-vertex');
    assert.equal(shader.fragmentShader, 'new-fragment');
    assert.equal(shader.uniforms.uTime, timeUniform);
    assert.ok(Object.prototype.hasOwnProperty.call(shader.defines, 'USE_COLOR'));
});

test('describeOwnedShaderDescriptor returns descriptor metadata without mutating it', () => {
    const descriptor = createOwnedShaderDescriptor({
        id: 'water-owned-near',
        baseCacheKey: 'water-owned-standard-v1-near',
        metadata: {
            system: 'terrain',
            dualScroll: true
        },
        source: {
            vertexShader: 'vertex',
            fragmentShader: 'fragment'
        }
    });

    const description = describeOwnedShaderDescriptor(descriptor);

    assert.deepEqual(description, {
        id: 'water-owned-near',
        baseCacheKey: 'water-owned-standard-v1-near',
        patchId: 'water-owned-near-source',
        patchCacheKey: 'water-owned-near-source',
        metadata: {
            system: 'terrain',
            dualScroll: true
        }
    });
    description.metadata.system = 'changed';
    assert.equal(descriptor.metadata.system, 'terrain');
});
