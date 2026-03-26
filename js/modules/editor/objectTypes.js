import { getDistrictType } from '../world/MapDataUtils.js';

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

export function getLayerGroupId(obj) {
    if (isRoad(obj)) return 'roads';
    if (isDistrict(obj)) return 'districts';
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
    if (isTerrainEdit(obj)) return `${obj.kind} #${index + 1}`;
    return fallback;
}
