// @ts-check

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

import { getAuthoredObjectAsset, listAuthoredObjectAssets } from './AuthoredObjectCatalog.js';
import {
    extractDefaultAirportAuthoredObjectTemplates,
    listRuntimeAirports,
    rotateAirportOffset
} from './AirportLayout.js';
import { SEA_LEVEL } from './terrain/TerrainPalette.js';

const DRACO_DECODER_PATH = '/node_modules/three/examples/jsm/libs/draco/gltf/';
const tmpBoundsBox = new THREE.Box3();
const tmpBoundsSphere = new THREE.Sphere();
const tmpShadowOffset = new THREE.Vector3();
const tmpShadowCenter = new THREE.Vector3();

type AuthoredObjectPlacement = {
    assetId: string;
    x: number;
    z: number;
    y?: number;
    yaw?: number;
    scale?: number;
    heightMode?: string;
};

type RuntimeAirport = {
    builtin?: boolean;
    x: number;
    z: number;
    yaw?: number;
};

type RuntimeWorldData = {
    authoredObjects?: AuthoredObjectPlacement[];
};

type AuthoredObjectInstanceEntry = {
    group: THREE.Object3D;
    placement: AuthoredObjectPlacement;
};

type ShadowContributorTarget = {
    center?: THREE.Vector3;
};

type ShadowContributor = {
    center: THREE.Vector3;
    radius: number;
    distance: number;
} | null;

type RuntimeWorldWindow = Window & typeof globalThis & {
    fsimWorld?: RuntimeWorldData;
};

/**
 * @param {THREE.Object3D} root
 */
function captureTemplateShadowBounds(root) {
    tmpBoundsBox.setFromObject(root);
    if (tmpBoundsBox.isEmpty()) {
        root.userData.shadowBoundsCenter = [0, 0, 0];
        root.userData.shadowBoundsRadius = 0;
        return;
    }
    tmpBoundsBox.getBoundingSphere(tmpBoundsSphere);
    root.userData.shadowBoundsCenter = tmpBoundsSphere.center.toArray();
    root.userData.shadowBoundsRadius = tmpBoundsSphere.radius;
}

/**
 * @returns {RuntimeWorldData | null}
 */
function getRuntimeWorldData() {
    if (typeof window === 'undefined') return null;
    const worldWindow = window as RuntimeWorldWindow;
    return worldWindow.fsimWorld || null;
}

/**
 * @param {AuthoredObjectPlacement} placement
 * @param {number} index
 */
function buildPlacementKey(placement, index) {
    return `${placement.assetId}:${placement.x}:${placement.z}:${placement.heightMode || 'terrain'}:${index}`;
}

/**
 * @param {RuntimeWorldData | null} worldData
 * @returns {AuthoredObjectPlacement[]}
 */
function buildGeneratedAirportAuthoredObjects(worldData) {
    const runtimeAirports = /** @type {RuntimeAirport[]} */ (listRuntimeAirports(worldData));
    const authoredTemplates = extractDefaultAirportAuthoredObjectTemplates(worldData);
    if (authoredTemplates.length === 0 || runtimeAirports.length <= 1) return [];
    /** @type {AuthoredObjectPlacement[]} */
    const generated = [];
    for (const airport of runtimeAirports) {
        if (airport.builtin) continue;
        for (const template of authoredTemplates) {
            const rotated = rotateAirportOffset(template.x, template.z, airport.yaw || 0);
            generated.push({
                assetId: template.assetId,
                x: airport.x + rotated.x,
                z: airport.z + rotated.z,
                y: template.y || 0,
                yaw: (template.yaw || 0) + (airport.yaw || 0),
                scale: template.scale || 1,
                heightMode: template.heightMode || 'terrain'
            });
        }
    }
    return generated;
}

/**
 * @param {THREE.Object3D} root
 */
function configureTemplate(root) {
    root.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        if (Array.isArray(child.material)) {
            child.material.forEach((material) => {
                if (material) material.shadowSide = THREE.FrontSide;
            });
        } else if (child.material) {
            child.material.shadowSide = THREE.FrontSide;
        }
    });
    captureTemplateShadowBounds(root);
}

/**
 * @param {THREE.Vector3} baseCenter
 * @param {number} baseExtent
 * @param {THREE.Vector3} contributorCenter
 * @param {number} contributorRadius
 * @param {number} [padding]
 * @param {THREE.Vector3} [targetCenter]
 */
export function mergeShadowCoverage(baseCenter, baseExtent, contributorCenter, contributorRadius, padding = 40, targetCenter = new THREE.Vector3()) {
    targetCenter.copy(baseCenter);
    const nextExtent = Math.max(baseExtent, contributorRadius + padding);
    if (!Number.isFinite(contributorRadius) || contributorRadius <= 0) {
        return {
            center: targetCenter,
            extent: nextExtent
        };
    }

    const requiredExtent = baseCenter.distanceTo(contributorCenter) * 0.5 + contributorRadius + padding;
    if (requiredExtent <= baseExtent) {
        return {
            center: targetCenter,
            extent: baseExtent
        };
    }

    targetCenter.lerp(contributorCenter, 0.5);
    return {
        center: targetCenter,
        extent: Math.max(nextExtent, requiredExtent)
    };
}

/**
 * @param {{ scene: THREE.Scene, getTerrainHeight?: ((x: number, z: number) => number) | null }} args
 */
export function createAuthoredObjectSystem({ scene, getTerrainHeight }) {
    const root = new THREE.Group();
    root.name = 'AuthoredObjects';
    scene.add(root);

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    /** @type {Map<string, Promise<THREE.Object3D | null>>} */
    const templatePromises = new Map();
    /** @type {Map<string, AuthoredObjectInstanceEntry>} */
    const instances = new Map();

    /**
     * @param {string} assetId
     * @returns {Promise<THREE.Object3D | null>}
     */
    function loadTemplate(assetId) {
        const asset = getAuthoredObjectAsset(assetId);
        if (!asset) return Promise.resolve(null);
        if (!templatePromises.has(asset.id)) {
            templatePromises.set(asset.id, new Promise((resolve, reject) => {
                loader.load(asset.url, (gltf) => {
                    configureTemplate(gltf.scene);
                    resolve(gltf.scene);
                }, undefined, reject);
            }).catch((error) => {
                console.error(`[authored-objects] Failed to load ${asset.url}`, error);
                return null;
            }));
        }
        return templatePromises.get(asset.id);
    }

    /**
     * @param {THREE.Object3D} instance
     * @param {AuthoredObjectPlacement} placement
     */
    function applyPlacementTransform(instance, placement) {
        const boundsCenter = Array.isArray(instance.userData.shadowBoundsCenter)
            ? instance.userData.shadowBoundsCenter
            : [0, 0, 0];
        const shadowBoundsRadius = Number.isFinite(instance.userData.shadowBoundsRadius)
            ? instance.userData.shadowBoundsRadius
            : 0;
        const terrainHeight = typeof getTerrainHeight === 'function'
            ? getTerrainHeight(placement.x, placement.z)
            : 0;
        const y = placement.heightMode === 'terrain'
            ? terrainHeight + placement.y
            : placement.heightMode === 'sea-level'
                ? SEA_LEVEL + placement.y
                : placement.y;
        instance.position.set(placement.x, y, placement.z);
        instance.rotation.set(0, THREE.MathUtils.degToRad(placement.yaw || 0), 0);
        instance.scale.setScalar(placement.scale || 1);
        tmpShadowOffset.fromArray(boundsCenter).multiplyScalar(placement.scale || 1).applyEuler(instance.rotation);
        instance.userData.shadowWorldCenter = tmpShadowCenter.copy(instance.position).add(tmpShadowOffset).toArray();
        instance.userData.shadowWorldRadius = shadowBoundsRadius * (placement.scale || 1);
    }

    async function syncToWorldData() {
        const worldData = getRuntimeWorldData();
        /** @type {AuthoredObjectPlacement[]} */
        const placements = [
            ...(Array.isArray(worldData?.authoredObjects) ? worldData.authoredObjects : []),
            ...buildGeneratedAirportAuthoredObjects(worldData)
        ];
        const nextKeys = new Set();

        for (let index = 0; index < placements.length; index += 1) {
            const placement = placements[index];
            const key = buildPlacementKey(placement, index);
            nextKeys.add(key);
            const existing = instances.get(key);
            if (existing) {
                existing.placement = placement;
                applyPlacementTransform(existing.group, placement);
                continue;
            }

            const template = await loadTemplate(placement.assetId);
            if (!template) continue;
            const group = template.clone(true);
            applyPlacementTransform(group, placement);
            root.add(group);
            instances.set(key, { group, placement });
        }

        for (const [key, entry] of instances.entries()) {
            if (nextKeys.has(key)) continue;
            root.remove(entry.group);
            instances.delete(key);
        }
    }

    function refreshTerrainAlignment() {
        for (const entry of instances.values()) {
            if (entry.placement?.heightMode !== 'terrain') continue;
            applyPlacementTransform(entry.group, entry.placement);
        }
    }

    /**
     * @param {THREE.Vector3} referencePosition
     * @param {number} [maxDistance]
     * @param {ShadowContributorTarget} [target]
     * @returns {ShadowContributor}
     */
    function getNearestShadowContributor(referencePosition, maxDistance = 1600, target: ShadowContributorTarget = {}) {
        let best = null;
        let bestDistanceSq = maxDistance * maxDistance;
        for (const { group } of instances.values()) {
            const center = group.userData.shadowWorldCenter;
            const radius = group.userData.shadowWorldRadius;
            if (!Array.isArray(center) || !Number.isFinite(radius) || radius <= 0) continue;
            tmpShadowCenter.fromArray(center);
            const distanceSq = referencePosition.distanceToSquared(tmpShadowCenter);
            if (distanceSq > bestDistanceSq) continue;
            bestDistanceSq = distanceSq;
            best = {
                center: (target.center || new THREE.Vector3()).copy(tmpShadowCenter),
                radius,
                distance: Math.sqrt(distanceSq)
            };
            target.center = best.center;
        }
        return best;
    }

    const handleWorldDataUpdated = () => {
        syncToWorldData().catch((error) => {
            console.error('[authored-objects] Failed to sync world objects', error);
        });
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('fsim:world-metadata-updated', handleWorldDataUpdated);
    }
    handleWorldDataUpdated();

    return {
        authoredObjectAssets: listAuthoredObjectAssets(),
        refreshTerrainAlignment,
        syncAuthoredObjects: syncToWorldData,
        getNearestShadowContributor
    };
}
