import { getDistrictType } from '../world/MapDataUtils.js';

export function isDistrict(obj) {
    return !!obj?.center && !obj?.road && (!!obj?.district_type || !!obj?.type || Array.isArray(obj?.points));
}

export function isCity(obj) {
    return !!obj?.center && !!obj?.road;
}

export function isTerrainEdit(obj) {
    return !!obj && typeof obj.kind === 'string' && Number.isFinite(obj.x) && Number.isFinite(obj.z);
}

export function getLayerGroupId(obj) {
    if (isCity(obj)) return 'cities';
    if (isDistrict(obj)) return 'districts';
    if (isTerrainEdit(obj)) return 'terrain';
    return 'vantage';
}

export function objectLabel(obj, index = 0, fallback = 'Item') {
    if (isCity(obj)) return obj.id || `City ${index + 1}`;
    if (isDistrict(obj)) {
        const cityRef = obj.city_id ? ` @${obj.city_id}` : '';
        return `${getDistrictType(obj)}${cityRef}`;
    }
    if (isTerrainEdit(obj)) return `${obj.kind} #${index + 1}`;
    return fallback;
}
