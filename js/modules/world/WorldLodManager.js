// @ts-check

import * as THREE from 'three';

/**
 * @typedef {{
 *   position?: import('three').Vector3 | null,
 *   updateLOD: (cameraPos: import('three').Vector3, dist: number) => void
 * }} WorldLodRegistrable
 */

/**
 * @typedef {{
 *   lodSettings?: ReturnType<import('./LodSystem').createRuntimeLodSettings> | null
 * }} WorldLodManagerArgs
 */

/**
 * @param {WorldLodManagerArgs} args
 */
export function createWorldLodManager({ lodSettings }) {
    /** @type {Set<WorldLodRegistrable>} */
    const registeredObjects = new Set();
    const lastUpdatePos = new THREE.Vector3(Infinity, Infinity, Infinity);
    const fallbackPosition = new THREE.Vector3();

    /**
     * @param {unknown} obj
     */
    function register(obj) {
        const candidate = /** @type {{ updateLOD?: unknown } | null | undefined } */ (obj);
        if (typeof candidate?.updateLOD === 'function') {
            registeredObjects.add(/** @type {WorldLodRegistrable} */ (obj));
        } else {
            console.warn('[WorldLodManager] Attempted to register object without updateLOD method:', obj);
        }
    }

    /**
     * @param {WorldLodRegistrable} obj
     */
    function unregister(obj) {
        registeredObjects.delete(obj);
    }

    /**
     * @param {import('three').Vector3} cameraPos
     * @param {{ force?: boolean }} [options]
     */
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
