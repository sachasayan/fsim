import * as THREE from 'three';
import { createWorldLodManager } from '../js/modules/world/WorldLodManager.js';
import { createRuntimeLodSettings } from '../js/modules/world/LodSystem.js';

// Mock object
class MockLodObject {
    constructor(x, y, z) {
        this.position = new THREE.Vector3(x, y, z);
        this.updateLODCalled = 0;
        this.lastDist = 0;
    }
    updateLOD(cameraPos, dist) {
        this.updateLODCalled++;
        this.lastDist = dist;
    }
}

async function testLodManager() {
    console.log('Testing WorldLodManager...');

    const mgr = createWorldLodManager({ lodSettings: createRuntimeLodSettings() });
    const obj = new MockLodObject(100, 0, 0);

    mgr.register(obj);

    const camPos1 = new THREE.Vector3(0, 0, 0);
    mgr.updateWorldLOD(camPos1);

    if (obj.updateLODCalled !== 1) throw new Error('updateLOD should have been called');
    if (obj.lastDist !== 100) throw new Error(`Expected dist 100, got ${obj.lastDist}`);

    // Move camera slightly (less than threshold 10m)
    const camPos2 = new THREE.Vector3(5, 0, 0);
    mgr.updateWorldLOD(camPos2);
    if (obj.updateLODCalled !== 1) throw new Error('updateLOD should NOT have been called due to threshold');

    // Move camera more than threshold
    const camPos3 = new THREE.Vector3(15, 0, 0);
    mgr.updateWorldLOD(camPos3);
    if (obj.updateLODCalled !== 2) throw new Error('updateLOD should have been called after moving past threshold');
    if (Math.abs(obj.lastDist - 85) > 0.1) throw new Error(`Expected dist ~85, got ${obj.lastDist}`);

    mgr.updateWorldLOD(camPos3, { force: true });
    if (obj.updateLODCalled !== 3) throw new Error('force update should bypass the movement threshold');

    console.log('✅ WorldLodManager tests passed!');
}

testLodManager().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
