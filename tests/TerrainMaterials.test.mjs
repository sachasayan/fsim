import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { makeTreeBillboardMaterial } from '../js/modules/world/terrain/TerrainMaterials.js';

test('makeTreeBillboardMaterial creates material with correct properties', () => {
    const mockTexture = new THREE.Texture();
    const mockTint = 0x123456;

    const material = makeTreeBillboardMaterial(mockTexture, mockTint);

    assert.ok(material instanceof THREE.MeshStandardMaterial, 'Material should be a MeshStandardMaterial');
    assert.equal(material.map, mockTexture, 'Material map should match the provided texture');
    assert.equal(material.color.getHex(), mockTint, 'Material color should match the provided tint');
    assert.equal(material.transparent, true, 'Material should be transparent');
    assert.equal(material.alphaTest, 0.12, 'Material alphaTest should be 0.12');
    assert.equal(material.side, THREE.FrontSide, 'Material uses FrontSide for billboard (camera-facing quads need no back face)');
    assert.equal(material.roughness, 1.0, 'Material roughness should be 1.0');
    assert.equal(material.metalness, 0.0, 'Material metalness should be 0.0');
});
