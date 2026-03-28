import { getDistrictType } from '../world/MapDataUtils.js';
import { getAuthoredObjectLabel } from '../world/AuthoredObjectCatalog.js';
import type {
    EditorAirport,
    EditorAuthoredObject,
    EditorDistrict,
    EditorEntity,
    EditorGroupId,
    EditorRoad,
    EditorTerrainEdit,
    EditorTerrainRegion
} from '../../editor/core/types.js';

type AirportEntity = EditorAirport;
type RoadEntity = EditorRoad;
type DistrictEntity = EditorDistrict;
type TerrainEditEntity = EditorTerrainEdit;
type TerrainRegionEntity = EditorTerrainRegion;
type AuthoredObjectEntity = EditorAuthoredObject;

function isObjectRecord(obj: unknown): obj is Record<string, any> {
    return !!obj && typeof obj === 'object';
}

export function isAirport(obj: unknown): obj is AirportEntity {
    if (!isObjectRecord(obj)) return false;
    return obj.template === 'default'
        && Number.isFinite(obj.x)
        && Number.isFinite(obj.z)
        && Number.isFinite(obj.yaw);
}

export function isRoad(obj: unknown): obj is RoadEntity {
    if (!isObjectRecord(obj)) return false;
    return Array.isArray(obj.points) && obj.points.length >= 2 && Number.isFinite(obj.width) && typeof obj.surface === 'string';
}

export function isDistrict(obj: unknown): obj is DistrictEntity {
    if (!isObjectRecord(obj)) return false;
    if (isRoad(obj)) return false;
    return !!obj.center && (!!obj.district_type || !!obj.type || Array.isArray(obj.points));
}

export function isTerrainEdit(obj: unknown): obj is TerrainEditEntity {
    if (!isObjectRecord(obj)) return false;
    return typeof obj.kind === 'string' && Number.isFinite(obj.x) && Number.isFinite(obj.z);
}

export function isTerrainRegion(obj: unknown): obj is TerrainRegionEntity {
    if (!isObjectRecord(obj)) return false;
    return Number.isFinite(obj.tileX)
        && Number.isFinite(obj.tileZ)
        && Number.isFinite(obj.tileWidth)
        && Number.isFinite(obj.tileHeight)
        && !!obj.terrainGenerator;
}

export function isAuthoredObject(obj: unknown): obj is AuthoredObjectEntity {
    if (!isObjectRecord(obj)) return false;
    return typeof obj.assetId === 'string'
        && Number.isFinite(obj.x)
        && Number.isFinite(obj.z);
}

/**
 * @param {unknown} obj
 * @returns {string}
 */
export function getLayerGroupId(obj: unknown): EditorGroupId {
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
export function objectLabel(obj: EditorEntity | unknown, index = 0, fallback = 'Item') {
    if (isRoad(obj)) {
        if (obj.id) return obj.id;
        const pointCount = Array.isArray(obj.points) ? obj.points.length : 0;
        return `${obj.kind || 'road'} · ${obj.surface || 'surface'} · ${pointCount} pts`;
    }
    if (isDistrict(obj)) {
        return `${getDistrictType(obj)}`;
    }
    if (isAirport(obj)) return 'Airport';
    if (isAuthoredObject(obj)) return getAuthoredObjectLabel(obj.assetId);
    if (isTerrainRegion(obj)) return `region ${obj.tileWidth}x${obj.tileHeight} @ ${obj.tileX},${obj.tileZ}`;
    if (isTerrainEdit(obj)) return `${obj.kind} #${index + 1}`;
    return fallback;
}
