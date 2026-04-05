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
        },
        treeModelMetrics: {
            width: 0.8,
            height: 1,
            depth: 0.8
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

test('buildTreeMeshesForLod uses uniform scale for mesh trees and asset aspect for octahedral trees', () => {
    const resources = makeResources();
    resources.treeMeshParts = [{
        geometry: new THREE.BoxGeometry(1, 1, 1),
        material: new THREE.MeshStandardMaterial({ transparent: true, alphaTest: 0.2 })
    }];
    resources.treeOctahedralGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
    resources.treeOctahedralGeo.translate(0, 0.5, 0);
    resources.treeOctahedralMat = new THREE.MeshStandardMaterial({ transparent: true, alphaTest: 0.2 });
    resources.treeOctahedralDepthMat = new THREE.MeshDepthMaterial();

    const meshLod = buildTreeMeshesForLod(makeInstances(), {
        enableTrees: true,
        treeRenderMode: 'mesh',
        enableTreeContactShadows: false
    }, resources);
    const meshMatrix = new THREE.Matrix4();
    const meshPosition = new THREE.Vector3();
    const meshQuaternion = new THREE.Quaternion();
    const meshScale = new THREE.Vector3();
    meshLod[0].getMatrixAt(0, meshMatrix);
    meshMatrix.decompose(meshPosition, meshQuaternion, meshScale);
    assert.ok(Math.abs(meshScale.x - meshScale.y) < 1e-6);
    assert.ok(Math.abs(meshScale.z - meshScale.y) < 1e-6);

    const octahedralLod = buildTreeMeshesForLod(makeInstances(), {
        enableTrees: true,
        treeRenderMode: 'octahedral',
        enableTreeContactShadows: false
    }, resources);
    const impostorMatrix = new THREE.Matrix4();
    const impostorPosition = new THREE.Vector3();
    const impostorQuaternion = new THREE.Quaternion();
    const impostorScale = new THREE.Vector3();
    octahedralLod[0].getMatrixAt(0, impostorMatrix);
    impostorMatrix.decompose(impostorPosition, impostorQuaternion, impostorScale);
    assert.ok(Math.abs(impostorScale.y - 15) < 1e-6);
    assert.ok(Math.abs(impostorScale.x - (15 * 0.8)) < 1e-6);
});

test('buildTreeMeshesForLod can add a single diagnostic reference mesh beside octahedral trees', () => {
    const resources = makeResources();
    resources.treeMeshParts = [{
        geometry: new THREE.BoxGeometry(1, 1, 1),
        material: new THREE.MeshStandardMaterial({ transparent: true, alphaTest: 0.2 })
    }];
    resources.treeOctahedralGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
    resources.treeOctahedralGeo.translate(0, 0.5, 0);
    resources.treeOctahedralMat = new THREE.MeshStandardMaterial({ transparent: true, alphaTest: 0.2 });
    resources.treeOctahedralDepthMat = new THREE.MeshDepthMaterial();
    resources.terrainDebugSettings = {
        treeImpostorDebugReferenceMode: 'side-by-side',
        treeImpostorDebugReferenceOffset: 2
    };

    const meshes = buildTreeMeshesForLod(makeInstances(), {
        enableTrees: true,
        treeRenderMode: 'octahedral',
        enableTreeContactShadows: false
    }, resources);

    assert.equal(meshes.filter((mesh) => mesh.userData.treeRenderTier === 'mid-octahedral').length, 1);
    assert.equal(meshes.filter((mesh) => /^debug-reference-mesh-/.test(mesh.userData.treeRenderTier)).length, 1);
    const referenceMesh = meshes.find((mesh) => mesh.userData.treeRenderTier === 'debug-reference-mesh-0');
    assert.equal(referenceMesh.castShadow, false);
    assert.equal(referenceMesh.receiveShadow, false);
});
