import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createOceanRenderer } from '../js/modules/world/terrain/OceanRenderer.js';

test('ocean renderer builds reusable camera-centered water patches', () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshBasicMaterial();
    let showWater = true;
    const ocean = createOceanRenderer({
        scene,
        material,
        SEA_LEVEL: 12,
        CHUNK_SIZE: 4000,
        isWaterSurfaceVisible: () => showWater
    });

    const diagnostics = ocean.getDiagnostics();
    assert.equal(diagnostics.activeOceanWaterMeshes, 3);
    assert.equal(diagnostics.visibleOceanWaterMeshes, 3);
    assert.equal(diagnostics.uniqueOceanWaterMaterials, 1);
    assert.ok(diagnostics.oceanWaterVertices > 0);
    assert.ok(diagnostics.oceanWaterTriangles > 0);

    ocean.update(new THREE.Vector3(4300, 100, -8200));
    const oceanGroup = scene.children.find((child) => child.name === 'OceanRenderer');
    assert.ok(oceanGroup);
    const [nearPatch, midPatch, farPatch] = oceanGroup.children;
    assert.equal(nearPatch.position.x, 4000);
    assert.equal(nearPatch.position.z, -8000);
    assert.equal(midPatch.position.x, 4000);
    assert.equal(midPatch.position.z, -8000);
    assert.equal(farPatch.position.x, 0);
    assert.equal(farPatch.position.z, -12000);

    showWater = false;
    ocean.update(new THREE.Vector3(4300, 100, -8200));
    assert.equal(ocean.getDiagnostics().visibleOceanWaterMeshes, 0);

    ocean.dispose();
    assert.equal(scene.children.includes(oceanGroup), false);
});
