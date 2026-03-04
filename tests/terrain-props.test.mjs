import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// Mock Web Worker to intercept messages and simulate responses immediately
globalThis.Worker = class Worker {
    constructor() {
        this.onmessage = null;
        this.onerror = null;
    }

    postMessage(data) {
        // Simulate an asynchronous worker response
        setImmediate(() => {
            if (this.onmessage) {
                // If it's chunkProps, return a mock response
                if (data.type === 'chunkProps') {
                    this.onmessage({
                        data: {
                            jobId: data.jobId,
                            type: data.type,
                            result: {
                                treePositions: {
                                    oak: [
                                        { x: 0, y: 0, z: 0, seed: 0.5, seed2: 0.5, lean: 0 }
                                    ]
                                },
                                buildingPositions: {
                                    supertall: [
                                        { x: 10, y: 0, z: 10, seed: 0.5, seed2: 0.5, seed3: 0.5, angle: 0 }
                                    ]
                                },
                                boatPositions: [
                                    { x: 20, y: 0, z: 20, rot: 0 }
                                ]
                            }
                        }
                    });
                } else if (data.type === 'chunkBase') {
                    this.onmessage({
                        data: {
                            jobId: data.jobId,
                            type: data.type,
                            result: {
                                positions: new Float32Array(3),
                                colors: new Float32Array(3),
                                wPos: new Float32Array(3),
                                wCols: new Float32Array(3)
                            }
                        }
                    });
                }
            }
        });
    }
};

const { generateChunkProps } = await import('../js/modules/world/terrain/TerrainGeneration.js');

function createMockCtx(lod = 0) {
    const dummy = new THREE.Object3D();
    return {
        LOD_LEVELS: [
            { terrainRes: 10, waterRes: 10, enableBoats: true },
            { terrainRes: 5, waterRes: 5, enableBoats: false } // LOD 1 disables boats
        ],
        treeBillboardGeo: new THREE.BufferGeometry(),
        treeTypeConfigs: {
            oak: { mat: new THREE.Material(), hRange: [10, 20], wScale: 0.5 }
        },
        detailedBuildingMats: { commercial: new THREE.Material() },
        baseBuildingMat: new THREE.Material(),
        baseBuildingGeo: new THREE.BufferGeometry(),
        roofCapGeo: new THREE.BufferGeometry(),
        roofCapMat: new THREE.Material(),
        podiumGeo: new THREE.BufferGeometry(),
        podiumMat: new THREE.Material(),
        spireGeo: new THREE.BufferGeometry(),
        spireMat: new THREE.Material(),
        hvacGeo: new THREE.BufferGeometry(),
        hvacMat: new THREE.Material(),
        getPooledInstancedMesh: (geo, mat, count) => {
            return new THREE.InstancedMesh(geo, mat, count);
        },
        hullGeo: new THREE.BufferGeometry(),
        hullMat: new THREE.Material(),
        cabinGeo: new THREE.BufferGeometry(),
        cabinMat: new THREE.Material(),
        mastGeo: new THREE.BufferGeometry(),
        mastMat: new THREE.Material(),
        dummy
    };
}

function createMockChunkGroup(validGeometry = true, chunkKey = '0,0') {
    const group = new THREE.Group();
    group.userData = { chunkKey };

    if (validGeometry) {
        const mesh = new THREE.Mesh();
        mesh.geometry = new THREE.BufferGeometry();
        mesh.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
        group.add(mesh);
    }

    return group;
}

test('generateChunkProps returns early if terrainMesh or geometry is missing', async () => {
    const mockCtx = createMockCtx();
    const mockGroup = createMockChunkGroup(false);

    await generateChunkProps(mockGroup, 0, 0, 0, mockCtx);
    assert.equal(mockGroup.children.length, 0); // No instances added
});

test('generateChunkProps returns early if chunk is repurposed or disposed', async () => {
    const mockCtx = createMockCtx();
    const mockGroup = createMockChunkGroup(true, '0,0');

    // Simulate chunk key changing during await (e.g., player moved rapidly and chunk was re-pooled)
    const promise = generateChunkProps(mockGroup, 0, 0, 0, mockCtx);
    mockGroup.userData.chunkKey = '1,1'; // Repurpose

    await promise;
    // Base geometry mesh is children[0], no other children should be added
    assert.equal(mockGroup.children.length, 1);
});

test('generateChunkProps correctly generates trees, buildings, and boats', async () => {
    const mockCtx = createMockCtx(0);
    const mockGroup = createMockChunkGroup(true, '0,0');

    await generateChunkProps(mockGroup, 0, 0, 0, mockCtx);

    // Original mesh (1) + Tree Cards A/B (2) + Supertall Building / Roof / Podium / Spire / HVAC (5) + Boat Hull/Cabin/Mast (3) = 11
    assert.equal(mockGroup.children.length, 11);

    // Verify specific meshes exist by their type/geometry (assuming order of addition)
    const children = mockGroup.children;
    assert.ok(children[1].isInstancedMesh, 'Tree Card A should be InstancedMesh');
    assert.ok(children[2].isInstancedMesh, 'Tree Card B should be InstancedMesh');
});

test('generateChunkProps skips objects based on LOD configuration', async () => {
    const mockCtx = createMockCtx(1);
    const mockGroup = createMockChunkGroup(true, '0,0');

    // lod = 1 disables boats, disables detailed building shadows and HVACs
    await generateChunkProps(mockGroup, 0, 0, 1, mockCtx);

    // Original mesh (1) + Tree Cards A/B (2) + Supertall Building / Roof / Podium / Spire (4) = 7
    // HVAC and Boats shouldn't be added.
    assert.equal(mockGroup.children.length, 7);
});
