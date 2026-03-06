import * as THREE from 'three';

export function createWorldLodManager() {
    const registeredObjects = new Set();
    const lastUpdatePos = new THREE.Vector3(Infinity, Infinity, Infinity);
    const UPDATE_THRESHOLD_SQ = 100; // Only update LODs if camera moved > 10m

    function register(obj) {
        if (typeof obj.updateLOD === 'function') {
            registeredObjects.add(obj);
        } else {
            console.warn('[WorldLodManager] Attempted to register object without updateLOD method:', obj);
        }
    }

    function unregister(obj) {
        registeredObjects.delete(obj);
    }

    function updateWorldLOD(cameraPos) {
        if (cameraPos.distanceToSquared(lastUpdatePos) < UPDATE_THRESHOLD_SQ) {
            return;
        }

        lastUpdatePos.copy(cameraPos);

        for (const obj of registeredObjects) {
            const dist = cameraPos.distanceTo(obj.position || new THREE.Vector3());
            obj.updateLOD(cameraPos, dist);
        }
    }

    return {
        register,
        unregister,
        updateWorldLOD
    };
}
