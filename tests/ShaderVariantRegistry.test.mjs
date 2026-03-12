import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createShaderVariantRegistry,
    listShaderVariants,
    registerShaderVariant,
    registerShaderVariants
} from '../js/modules/world/ShaderVariantRegistry.js';

test('shader variant registry stores variants in registration order', () => {
    const registry = createShaderVariantRegistry();

    registerShaderVariant(registry, {
        id: 'terrain-near',
        metadata: { system: 'terrain' },
        build() {
            return { objects: [] };
        }
    });
    registerShaderVariants(registry, [
        {
            id: 'water-near',
            build() {
                return { objects: [] };
            }
        },
        [
            {
                id: 'cloud-near',
                build() {
                    return { objects: [] };
                }
            }
        ]
    ]);

    assert.deepEqual(
        listShaderVariants(registry).map((entry) => entry.id),
        ['terrain-near', 'water-near', 'cloud-near']
    );
});

test('shader variant registry rejects duplicate ids', () => {
    const registry = createShaderVariantRegistry();

    registerShaderVariant(registry, {
        id: 'terrain-near',
        build() {
            return { objects: [] };
        }
    });

    assert.throws(
        () => registerShaderVariant(registry, {
            id: 'terrain-near',
            build() {
                return { objects: [] };
            }
        }),
        /Duplicate shader variant id "terrain-near"/
    );
});
