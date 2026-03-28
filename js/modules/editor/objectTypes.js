import { getDistrictType } from '../world/MapDataUtils.js';
import { getAuthoredObjectLabel } from '../world/AuthoredObjectCatalog.js';

export function isAirport(obj) {
    return !!obj
        && obj.template === 'default'
        && Number.isFinite(obj.x)
        && Number.isFinite(obj.z)
        && Number.isFinite(obj.yaw);
}

export function isRoad(obj) {
    return Array.isArray(obj?.points) && obj.points.length >= 2 && Number.isFinite(obj?.width) && typeof obj?.surface === 'string';
}

export function isDistrict(obj) {
    if (isRoad(obj)) return false;
    return !!obj?.center && (!!obj?.district_type || !!obj?.type || Array.isArray(obj?.points));
}

export function isTerrainEdit(obj) {
    return !!obj && typeof obj.kind === 'string' && Number.isFinite(obj.x) && Number.isFinite(obj.z);
}

export function isTerrainRegion(obj) {
    return !!obj
        && Number.isFinite(obj.tileX)
        && Number.isFinite(obj.tileZ)
        && Number.isFinite(obj.tileWidth)
        && Number.isFinite(obj.tileHeight)
        && !!obj.terrainGenerator;
}

export function isAuthoredObject(obj) {
    return !!obj
        && typeof obj.assetId === 'string'
        && Number.isFinite(obj.x)
        && Number.isFinite(obj.z);
}

export function getLayerGroupId(obj) {
    if (isAirport(obj)) return 'airports';
    if (isAuthoredObject(obj)) return 'objects';
    if (isRoad(obj)) return 'roads';
    if (isDistrict(obj)) return 'districts';
    if (isTerrainRegion(obj)) return 'terrainRegions';
    if (isTerrainEdit(obj)) return 'terrain';
    return 'vantage';
}

export function objectLabel(obj, index = 0, fallback = 'Item') {
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
