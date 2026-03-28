// @ts-check

import { normalizeTerrainGeneratorConfig } from './terrain/TerrainSynthesis.js';
import { normalizeTerrainRegions } from './terrain/TerrainRegions.js';
import { normalizeAuthoredObject } from './AuthoredObjectCatalog.js';
import { normalizeAirport } from './AirportLayout.js';

/** @typedef {import('../../editor/core/types.js').EditorAirport} EditorAirport */
/** @typedef {import('../../editor/core/types.js').EditorAuthoredObject} EditorAuthoredObject */
/** @typedef {import('../../editor/core/types.js').EditorDistrict} EditorDistrict */
/** @typedef {import('../../editor/core/types.js').EditorPoint2} EditorPoint2 */
/** @typedef {import('../../editor/core/types.js').EditorRoad} EditorRoad */
/** @typedef {import('../../editor/core/types.js').EditorTerrainEdit} EditorTerrainEdit */
/** @typedef {import('../../editor/core/types.js').EditorTerrainGenerator} EditorTerrainGenerator */
/** @typedef {import('../../editor/core/types.js').EditorTerrainRegion} EditorTerrainRegion */
/** @typedef {import('../../editor/core/types.js').EditorWorldData} EditorWorldData */

/**
 * @typedef MapDataLike
 * @property {Array<{ id?: string, districts?: EditorDistrict[], radius?: number }>} [cities]
 * @property {EditorDistrict[]} [districts]
 * @property {EditorRoad[]} [roads]
 * @property {EditorTerrainEdit[]} [terrainEdits]
 * @property {EditorTerrainRegion[]} [terrainRegions]
 * @property {EditorAirport[]} [airports]
 * @property {EditorAuthoredObject[]} [authoredObjects]
 * @property {EditorTerrainGenerator} [terrainGenerator]
 * @property {string} [city_id]
 */

export const DISTRICT_TYPES = ['financial_core', 'commercial', 'residential', 'industrial', 'suburban', 'windmill_farm'];
export const ROAD_KINDS = ['road', 'taxiway', 'service'];
export const ROAD_SURFACES = ['asphalt', 'gravel', 'dirt'];
export const WINDMILL_FARM_DEFAULTS = Object.freeze({
    turbine_density: 0.5,
    rotor_radius: 22,
    setback: 90
});

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 */
function clampNumber(value, min, max, fallback) {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
}

/** @param {Partial<EditorDistrict> | null | undefined} district */
export function getDistrictType(district) {
    return district?.district_type || district?.type || 'residential';
}

/** @param {EditorDistrict} district */
export function normalizeWindmillFarmProps(district) {
    district.turbine_density = clampNumber(district.turbine_density, 0.05, 1.0, WINDMILL_FARM_DEFAULTS.turbine_density);
    district.rotor_radius = clampNumber(district.rotor_radius, 8, 80, WINDMILL_FARM_DEFAULTS.rotor_radius);
    district.setback = clampNumber(district.setback, 20, 240, WINDMILL_FARM_DEFAULTS.setback);
    return district;
}

/**
 * @param {EditorDistrict} rawDistrict
 * @param {string | null} [cityId]
 */
export function normalizeDistrict(rawDistrict, cityId = null) {
    const district = rawDistrict;
    district.district_type = getDistrictType(district);
    delete district.type;
    if (!DISTRICT_TYPES.includes(district.district_type)) {
        district.district_type = 'residential';
    }
    if (cityId && !district.city_id) district.city_id = cityId;
    if (!Array.isArray(district.points) && Array.isArray(district.footprint)) {
        district.points = district.footprint;
    }
    if (!Array.isArray(district.points)) district.points = null;
    delete district.footprint;
    if (!Array.isArray(district.points)) return district;
    const hasCenter = Array.isArray(district.center) && district.center.length === 2;
    let looksRelative = false;
    if (hasCenter && district.points.length > 0) {
        const center = /** @type {[number, number]} */ (district.center);
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        let sumX = 0, sumZ = 0;
        for (const [x, z] of district.points) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
            sumX += x;
            sumZ += z;
        }
        const centroidX = sumX / district.points.length;
        const centroidZ = sumZ / district.points.length;
        const maxSpan = Math.max(maxX - minX, maxZ - minZ, 1);
        const radius = /** @type {number} */ (Number.isFinite(district.radius) ? district.radius : 0);
        const centroidOffset = Math.hypot(centroidX - center[0], centroidZ - center[1]);
        looksRelative =
            district.points.some(([x, z]) => Math.abs(x - center[0]) > 5000 || Math.abs(z - center[1]) > 5000) ||
            centroidOffset > Math.max(1500, maxSpan * 2.5, radius * 3);
    }
    if (looksRelative) {
        const center = /** @type {[number, number]} */ (district.center);
        district.points = district.points.map(([x, z]) => [center[0] + x, center[1] + z]);
    }
    if (district.district_type === 'windmill_farm') {
        normalizeWindmillFarmProps(district);
    }
    delete district.city_id;
    return district;
}

/** @param {EditorTerrainEdit} rawEdit */
export function normalizeTerrainEdit(rawEdit) {
    const edit = rawEdit;
    edit.kind = edit.kind || 'raise';
    edit.radius = Number.isFinite(edit.radius) ? edit.radius : 300;
    edit.delta = Number.isFinite(edit.delta) ? edit.delta : 40;
    if (Array.isArray(edit.points) && edit.points.length > 0) {
        let sumX = 0;
        let sumZ = 0;
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        edit.points = edit.points
            .filter(point => Array.isArray(point) && point.length >= 2)
            .map(([x, z]) => [Math.round(x), Math.round(z)]);
        for (const [x, z] of edit.points) {
            sumX += x;
            sumZ += z;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
        }
        if (edit.points.length > 0) {
            edit.x = Math.round(sumX / edit.points.length);
            edit.z = Math.round(sumZ / edit.points.length);
        }
    } else {
        edit.points = null;
        edit.x = Number.isFinite(edit.x) ? edit.x : 0;
        edit.z = Number.isFinite(edit.z) ? edit.z : 0;
    }
    if (edit.kind === 'flatten') {
        edit.opacity = Number.isFinite(edit.opacity) ? edit.opacity : 0.65;
        edit.target_height = Number.isFinite(edit.target_height) ? edit.target_height : 0;
    }
    return edit;
}

/** @param {EditorRoad} rawRoad */
export function normalizeRoad(rawRoad) {
    const road = rawRoad;
    road.kind = ROAD_KINDS.includes(road.kind) ? road.kind : 'road';
    road.surface = ROAD_SURFACES.includes(road.surface) ? road.surface : 'asphalt';
    road.width = Number.isFinite(road.width) ? road.width : 18;
    road.feather = Number.isFinite(road.feather) ? road.feather : Math.max(0, road.width * 0.35);
    road.center = Array.isArray(road.center) && road.center.length >= 2
        ? [Math.round(road.center[0]), Math.round(road.center[1])]
        : null;

    if (!Array.isArray(road.points)) {
        road.points = null;
        return road;
    }

    road.points = road.points
        .filter(point => Array.isArray(point) && point.length >= 2)
        .map(([x, z]) => [Math.round(x), Math.round(z)]);

    if (road.points.length < 2) {
        road.points = null;
        return road;
    }

    let sumX = 0, sumZ = 0;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of road.points) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
        sumX += x;
        sumZ += z;
    }

    if (road.center) {
        const centroidX = sumX / road.points.length;
        const centroidZ = sumZ / road.points.length;
        const maxSpan = Math.max(maxX - minX, maxZ - minZ, road.width, 1);
        const centroidOffset = Math.hypot(centroidX - road.center[0], centroidZ - road.center[1]);
        const looksRelative =
            road.points.some(([x, z]) => Math.abs(x - road.center[0]) > 5000 || Math.abs(z - road.center[1]) > 5000) ||
            centroidOffset > Math.max(1500, maxSpan * 2.5);

        if (looksRelative) {
            road.points = road.points.map(([x, z]) => [road.center[0] + x, road.center[1] + z]);
        }
    }

    const finalSum = road.points.reduce((acc, [x, z]) => {
        acc.x += x;
        acc.z += z;
        return acc;
    }, { x: 0, z: 0 });
    road.center = [
        Math.round(finalSum.x / road.points.length),
        Math.round(finalSum.z / road.points.length)
    ];

    return road;
}

/**
 * @param {MapDataLike & EditorWorldData} data
 * @returns {EditorWorldData}
 */
export function normalizeMapData(data) {
    if (!data.cities) data.cities = [];
    if (!data.districts) data.districts = [];
    if (!data.roads) data.roads = [];
    if (!data.terrainEdits) data.terrainEdits = [];
    if (!data.terrainRegions) data.terrainRegions = [];
    if (!data.airports) data.airports = [];
    if (!data.authoredObjects) data.authoredObjects = [];
    data.terrainGenerator = normalizeTerrainGeneratorConfig(data.terrainGenerator);

    const flattenedDistricts = [...data.districts];
    data.cities.forEach(city => {
        delete city.radius;
        if (!Array.isArray(city.districts)) city.districts = [];
        for (const district of city.districts) {
            flattenedDistricts.push({ ...district, city_id: district.city_id || city.id });
        }
        city.districts = [];
    });

    data.districts = flattenedDistricts.map(district => normalizeDistrict(district));
    data.roads = data.roads
        .map(road => normalizeRoad(road))
        .filter(road => Array.isArray(road.points) && road.points.length >= 2);
    data.terrainEdits = data.terrainEdits.map(edit => normalizeTerrainEdit(edit));
    data.terrainRegions = normalizeTerrainRegions(data.terrainRegions);
    data.airports = /** @type {EditorAirport[]} */ (data.airports.map((airport) => normalizeAirport(airport)));
    data.authoredObjects = data.authoredObjects.map(object => normalizeAuthoredObject(object));
    delete data.cities;
    return data;
}

/** @param {EditorDistrict} district */
function getDistrictVertices(district) {
    if (district.points?.length >= 3) return district.points;
    if (!Array.isArray(district.center) || !Number.isFinite(district.radius)) return [];
    const [cx, cz] = /** @type {[number, number]} */ (district.center);
    const r = /** @type {number} */ (district.radius);
    return [
        [cx - r, cz - r],
        [cx + r, cz - r],
        [cx + r, cz + r],
        [cx - r, cz + r]
    ];
}

/** @param {EditorDistrict} district */
function getDistrictBounds(district) {
    const vertices = getDistrictVertices(district);
    if (vertices.length === 0) {
        const [cx, cz] = /** @type {[number, number]} */ (Array.isArray(district.center) ? district.center : [0, 0]);
        const r = /** @type {number} */ (Number.isFinite(district.radius) ? district.radius : 0);
        return { minX: cx - r, maxX: cx + r, minZ: cz - r, maxZ: cz + r };
    }

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of vertices) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
    }
    return { minX, maxX, minZ, maxZ };
}

/**
 * @param {EditorDistrict} district
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number }} bounds
 */
function getDistrictCenter(district, bounds) {
    const boundsCenter = [(bounds.minX + bounds.maxX) * 0.5, (bounds.minZ + bounds.maxZ) * 0.5];
    return boundsCenter;
}

/** @param {MapDataLike} data */
function collectNormalizedDistricts(data) {
    const districts = [];
    const hasTopLevelDistricts = Array.isArray(data.districts) && data.districts.length > 0;

    for (const district of data.districts || []) {
        districts.push(normalizeDistrict({ ...district }));
    }

    if (!hasTopLevelDistricts) {
        for (const city of data.cities || []) {
            for (const district of city.districts || []) {
                districts.push(normalizeDistrict({ ...district }, city.id));
            }
        }
    }

    return districts
        .filter(district => Array.isArray(district.points) && district.points.length >= 3)
        .map((district, index) => {
            const bounds = getDistrictBounds(district);
            return {
                district,
                bounds,
                center: getDistrictCenter(district, bounds),
                index
            };
        });
}

/**
 * @param {EditorDistrict} district
 * @param {number} index
 */
function hashDistrictGeometry(district, index) {
    const type = getDistrictType(district);
    const geom = JSON.stringify((district.points || []).map(([x, z]) => [Math.round(x), Math.round(z)]));
    let h = 2166136261;
    const input = `${type}|${geom}|${index}`;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
}

/** @param {MapDataLike} data */
export function buildDistrictRecords(data) {
    const districtEntries = collectNormalizedDistricts(data);
    if (districtEntries.length === 0) return [];

    return districtEntries.map(({ district, center, bounds, index }) => {
        const id = `district_${hashDistrictGeometry(district, index)}`;

        return {
            id,
            center,
            bounds,
            districts: [{ ...district }]
        };
    });
}

/** @param {MapDataLike} data */
export function buildCityRecords(data) {
    return buildDistrictRecords(data);
}
