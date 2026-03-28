// @ts-check

import { getDistrictType } from '../world/MapDataUtils.js';
import { getAuthoredObjectLabel } from '../world/AuthoredObjectCatalog.js';

/** @typedef {{ template: string, x: number, z: number, yaw: number }} AirportEntity */
/** @typedef {{ points: number[][], width: number, surface: string, feather?: number, kind?: string, id?: string }} RoadEntity */
/** @typedef {{ center?: number[], district_type?: string, type?: string, points?: number[][], radius?: number }} DistrictEntity */
/** @typedef {{ kind: string, x: number, z: number, radius?: number }} TerrainEditEntity */
/** @typedef {{ tileX: number, tileZ: number, tileWidth: number, tileHeight: number, terrainGenerator: unknown }} TerrainRegionEntity */
/** @typedef {{ assetId: string, x: number, z: number }} AuthoredObjectEntity */

/**
 * @param {unknown} obj
 * @returns {obj is Record<string, any>}
 */
function isObjectRecord(obj) {
    return !!obj && typeof obj === 'object';
}

/**
 * @param {unknown} obj
 * @returns {obj is AirportEntity}
 */
export function isAirport(obj) {
    if (!isObjectRecord(obj)) return false;
    return obj.template === 'default'
        && Number.isFinite(obj.x)
        && Number.isFinite(obj.z)
        && Number.isFinite(obj.yaw);
}

/**
 * @param {unknown} obj
 * @returns {obj is RoadEntity}
 */
export function isRoad(obj) {
    if (!isObjectRecord(obj)) return false;
    return Array.isArray(obj.points) && obj.points.length >= 2 && Number.isFinite(obj.width) && typeof obj.surface === 'string';
}

/**
 * @param {unknown} obj
 * @returns {obj is DistrictEntity}
 */
export function isDistrict(obj) {
    if (!isObjectRecord(obj)) return false;
    if (isRoad(obj)) return false;
    return !!obj.center && (!!obj.district_type || !!obj.type || Array.isArray(obj.points));
}

/**
 * @param {unknown} obj
 * @returns {obj is TerrainEditEntity}
 */
export function isTerrainEdit(obj) {
    if (!isObjectRecord(obj)) return false;
    return typeof obj.kind === 'string' && Number.isFinite(obj.x) && Number.isFinite(obj.z);
}

/**
 * @param {unknown} obj
 * @returns {obj is TerrainRegionEntity}
 */
export function isTerrainRegion(obj) {
    if (!isObjectRecord(obj)) return false;
    return Number.isFinite(obj.tileX)
        && Number.isFinite(obj.tileZ)
        && Number.isFinite(obj.tileWidth)
        && Number.isFinite(obj.tileHeight)
        && !!obj.terrainGenerator;
}

/**
 * @param {unknown} obj
 * @returns {obj is AuthoredObjectEntity}
 */
export function isAuthoredObject(obj) {
    if (!isObjectRecord(obj)) return false;
    return typeof obj.assetId === 'string'
        && Number.isFinite(obj.x)
        && Number.isFinite(obj.z);
}

/**
 * @param {unknown} obj
 * @returns {string}
 */
export function getLayerGroupId(obj) {
    if (isAirport(obj)) return 'airports';
    if (isAuthoredObject(obj)) return 'objects';
    if (isRoad(obj)) return 'roads';
    if (isDistrict(obj)) return 'districts';
    if (isTerrainRegion(obj)) return 'terrainRegions';
    if (isTerrainEdit(obj)) return 'terrain';
    return 'vantage';
}

/**
 * @param {unknown} obj
 * @param {number} [index]
 * @param {string} [fallback]
 * @returns {string}
 */
export function objectLabel(obj, index = 0, fallback = 'Item') {
    if (isRoad(obj)) {
        if (obj.id) return obj.id;
        const pointCount = Array.isArray(obj.points) ? obj.points.length : 0;
        return `${obj.kind || 'road'} · ${obj.surface || 'surface'} · ${pointCount} pts`;
    }
    if (isDistrict(obj)) {
        return `${getDistrictType(/** @type {any} */ (obj))}`;
    }
    if (isAirport(obj)) return 'Airport';
    if (isAuthoredObject(obj)) return getAuthoredObjectLabel(obj.assetId);
    if (isTerrainRegion(obj)) return `region ${obj.tileWidth}x${obj.tileHeight} @ ${obj.tileX},${obj.tileZ}`;
    if (isTerrainEdit(obj)) return `${obj.kind} #${index + 1}`;
    return fallback;
}
