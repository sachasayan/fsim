import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { buildTreeMeshesForLod } from '../js/modules/world/terrain/TerrainGeneration.js';

function makeResources() {
    return {
        treeBillboardGeo: new THREE.PlaneGeometry(1, 1, 1, 1),
        treeGroundGeo: new THREE.PlaneGeometry(1, 1, 1, 1),
        treeGroundMats: {
            near: new THREE.MeshBasicMaterial(),
            mid: new THREE.MeshBasicMaterial()
        },
        treeTrunkGeo: new THREE.CylinderGeometry(0.12, 0.18, 1, 6),
        treeTrunkMat: new THREE.MeshStandardMaterial(),
        treeTypeConfigs: {
            broadleaf: {
                canopyMat: new THREE.MeshStandardMaterial(),
                depthMat: new THREE.MeshDepthMaterial(),
                baseTint: new THREE.Color(0x88aa77)
            }
        }
    };
}

function makeInstances() {
    return {
        broadleaf: new Float32Array([
            10, 2, 20, 7, 15, 0.5, 0.3, 1.0,
            30, 3, 40, 8, 17, 1.2, 0.7, 1.1
        ])
    };
}

test('buildTreeMeshesForLod builds hybrid near trees with canopy billboards and contact shadows', () => {
    const meshes = buildTreeMeshesForLod(makeInstances(), {
        enableTrees: true,
        treeRenderMode: 'hybrid',
        enableTreeContactShadows: true
    }, makeResources());

    assert.equal(meshes.length, 5);
    assert.equal(meshes.filter((mesh) => mesh.userData.treeRenderTier === 'near-trunk').length, 1);
    assert.equal(meshes.filter((mesh) => /^near-canopy-/.test(mesh.userData.treeRenderTier)).length, 3);
    assert.equal(meshes.filter((mesh) => mesh.userData.treeRenderTier === 'near-contact').length, 1);
    assert.ok(meshes.every((mesh) => mesh.count === 2));
    assert.equal(meshes.find((mesh) => mesh.userData.treeRenderTier === 'near-canopy-0').castShadow, true);
    assert.equal(meshes.find((mesh) => mesh.userData.treeRenderTier === 'near-canopy-1').castShadow, false);
});

test('buildTreeMeshesForLod builds billboard mid trees with contact shadows', () => {
    const meshes = buildTreeMeshesForLod(makeInstances(), {
        enableTrees: true,
        treeRenderMode: 'billboard',
        enableTreeContactShadows: true
    }, makeResources());

    assert.equal(meshes.length, 3);
    assert.equal(meshes[0].userData.treeRenderTier, 'mid-trunk-hint');
    assert.equal(meshes[1].userData.treeRenderTier, 'mid-billboard');
    assert.equal(meshes[2].userData.treeRenderTier, 'mid-contact');
});

test('buildTreeMeshesForLod omits trees when disabled', () => {
    const meshes = buildTreeMeshesForLod(makeInstances(), {
        enableTrees: false,
        treeRenderMode: 'disabled',
        enableTreeContactShadows: false
    }, makeResources());

    assert.deepEqual(meshes, []);
});
