import * as THREE from 'three';

export function createWorldLodManager({ lodSettings }) {
    const registeredObjects = new Set();
    const lastUpdatePos = new THREE.Vector3(Infinity, Infinity, Infinity);
    const fallbackPosition = new THREE.Vector3();

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

    function updateWorldLOD(cameraPos, { force = false } = {}) {
        const updateThreshold = lodSettings?.world?.cameraMoveThreshold ?? 10;
        const updateThresholdSq = updateThreshold * updateThreshold;
        if (!force && cameraPos.distanceToSquared(lastUpdatePos) < updateThresholdSq) {
            return;
        }

        lastUpdatePos.copy(cameraPos);

        for (const obj of registeredObjects) {
            const dist = cameraPos.distanceTo(obj.position || fallbackPosition);
            obj.updateLOD(cameraPos, dist);
        }
    }

    function invalidate() {
        lastUpdatePos.set(Infinity, Infinity, Infinity);
    }

    return {
        register,
        unregister,
        invalidate,
        updateWorldLOD
    };
}
