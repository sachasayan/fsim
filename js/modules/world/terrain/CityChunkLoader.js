// @ts-check

/**
 * CityChunkLoader.js
 *
 * Runtime module that fetches and parses pre-compiled district chunks.
 * Each district has a single `district.bin` file located at:
 *   /world/chunks/<districtId>/district.bin
 *
 * Binary format (little-endian, mirrors build-world.mjs serialization):
 *   [4]  magic  = 0x46574C44
 *   [4]  version = 4
 *   [4]  numBuildings
 *   [4]  numProps (v4+) or numRoadSegments (legacy, ignored)
 *   [4]  maskSize (legacy, ignored)
 *   [4]  maskOffset (legacy, ignored)
 *   per building (10 × f32): x,y,z, w,h,d, angle, classId, colorIdx, _pad
 *   per prop     ( 8 × f32): x,y,z, height, rotorRadius, angle, phase, typeId
 *   per road    ( 8 × f32): x1,y1,z1, x2,y2,z2, halfWidth, classId (legacy, ignored)
 *   mask data (maskSize*maskSize bytes): uint8 alpha channel (legacy, ignored)
 */

import { buildDistrictRecords } from '../MapDataUtils.js';

/**
 * @typedef {Window & typeof globalThis & {
 *   fsimWorld?: Parameters<typeof buildDistrictRecords>[0]
 * }} DistrictLoaderWindow
 */

const MAGIC = 0x46574C44;
const BLDG_FLOATS = 10;
const PROP_FLOATS = 8;

// Mapping classId integer → building class string (must match build-world.mjs CLASS_IDS order)
export const CLASS_NAMES = ['supertall', 'highrise', 'office', 'apartment', 'townhouse', 'industrial'];
export const DISTRICT_PROP_NAMES = ['windmill'];

// Cache so each district is only fetched once per session
const cache = new Map();
const activeFetches = new Map();

function deriveRadiusFromDistrict(center, district) {
    let maxDist = 600;
    const points = district?.points?.length >= 3
        ? district.points
        : district?.center && district?.radius
            ? [
                [district.center[0] - district.radius, district.center[1] - district.radius],
                [district.center[0] + district.radius, district.center[1] - district.radius],
                [district.center[0] + district.radius, district.center[1] + district.radius],
                [district.center[0] - district.radius, district.center[1] + district.radius]
            ]
            : [];
    for (const [x, z] of points) {
        maxDist = Math.max(maxDist, Math.hypot(x - center[0], z - center[1]));
    }
    return maxDist;
}

function normalizeDistrictIndexEntry(record) {
    const center = record.center || [record.cx, record.cz];
    const district = record.district || record.districts?.[0] || null;
    const radius = record.radius || deriveRadiusFromDistrict(center, district);
    return {
        id: record.id,
        cx: center[0],
        cz: center[1],
        radius,
        maskRadius: record.maskRadius || radius * 1.05,
        district,
        districts: district ? [district] : []
    };
}

function isPointInPolygon(x, z, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = points[i][0], zi = points[i][1];
        const xj = points[j][0], zj = points[j][1];
        const intersect = ((zi > z) !== (zj > z)) &&
            (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function districtContainsPoint(record, x, z) {
    const district = record.district || record.districts?.[0];
    if (district?.points?.length >= 3) return isPointInPolygon(x, z, district.points);
    if (district?.center && district?.radius) {
        return Math.hypot(x - district.center[0], z - district.center[1]) <= district.radius;
    }
    const dx = x - record.cx;
    const dz = z - record.cz;
    return dx * dx + dz * dz <= record.radius * record.radius;
}

/**
 * Fetches the district index listing all authored district footprints.
 * Returns an array of { id, cx, cz, radius, maskRadius, district, districts }.
 */
let districtIndexPromise = null;
export async function fetchDistrictIndex() {
    const runtimeWindow = /** @type {DistrictLoaderWindow} */ (window);
    if (runtimeWindow.fsimWorld) {
        return buildDistrictRecords(runtimeWindow.fsimWorld).map(normalizeDistrictIndexEntry);
    }
    if (!districtIndexPromise) {
        const url = `/world/chunks/index.json?t=${Date.now()}`;
        districtIndexPromise = fetch(url)
            .then(r => r.json())
            .then(records => records.map(normalizeDistrictIndexEntry));
    }
    return districtIndexPromise;
}

export function clearDistrictIndex() {
    districtIndexPromise = null;
}

/**
 * Loads and parses the binary chunk for a given district id.
 * Returns { buildings: Array } or null on failure.
 *
 * buildings:    { "cx,cz": [{ x,y,z,w,h,d,angle,classId,colorIdx }] }
 */
export async function loadDistrictChunk(districtId) {
    if (cache.has(districtId)) return cache.get(districtId);

    // Promise coalescing: if already fetching, wait for that same promise
    if (activeFetches.has(districtId)) return activeFetches.get(districtId);

    const fetchPromise = (async () => {
        let buf;
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            const url = `/world/chunks/${districtId}/district.bin?t=${Date.now()}`;
            const resp = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            buf = await resp.arrayBuffer();
        } catch (e) {
            console.warn(`[CityChunkLoader] Failed to load district "${districtId}":`, e.message);
            return null;
        }

        const view = new DataView(buf);
        let off = 0;

        const ri32 = () => { const v = view.getInt32(off, true); off += 4; return v; };
        const rf32 = () => { const v = view.getFloat32(off, true); off += 4; return v; };

        const magic = ri32();
        if (magic !== MAGIC) {
            console.error(`[CityChunkLoader] Invalid magic in district "${districtId}": 0x${magic.toString(16)}`);
            return null;
        }

        const version = ri32();
        if (version < 1 || version > 4) {
            console.warn(`[CityChunkLoader] Unknown version ${version} for district "${districtId}"`);
        }

        const numBuildings = ri32();
        const numPropsOrRoads = ri32();
        const numProps = version >= 4 ? numPropsOrRoads : 0;
        const numRoads = version >= 4 ? 0 : numPropsOrRoads;

        let maskSize = 0, maskOffset = 0;
        if (version >= 2) {
            maskSize = ri32();
            maskOffset = ri32();
        }

        const buildingsByChunk = {}; // Spatial index: { "cx,cz": [building, ...] }
        const propsByChunk = {}; // Spatial index: { "cx,cz": [prop, ...] }
        const CHUNK_SIZE = 4000; // Must match TerrainGeneration.js

        for (let i = 0; i < numBuildings; i++) {
            const x = rf32(), y = rf32(), z = rf32();
            const w = rf32(), h = rf32(), d = rf32();
            const angle = rf32();
            const classId = Math.round(rf32());
            const colorIdx = Math.round(rf32());
            rf32(); // _pad
            const b = { x, y, z, w, h, d, angle, classId, colorIdx };

            // Determine which chunk this building belongs to
            const cx = Math.floor(x / CHUNK_SIZE);
            const cz = Math.floor(z / CHUNK_SIZE);
            const key = `${cx},${cz}`;
            if (!buildingsByChunk[key]) buildingsByChunk[key] = [];
            buildingsByChunk[key].push(b);
        }

        for (let i = 0; i < numProps; i++) {
            const x = rf32(), y = rf32(), z = rf32();
            const height = rf32();
            const rotorRadius = rf32();
            const angle = rf32();
            const phase = rf32();
            const typeId = Math.round(rf32());
            const prop = { x, y, z, height, rotorRadius, angle, phase, typeId };

            const cx = Math.floor(x / CHUNK_SIZE);
            const cz = Math.floor(z / CHUNK_SIZE);
            const key = `${cx},${cz}`;
            if (!propsByChunk[key]) propsByChunk[key] = [];
            propsByChunk[key].push(prop);
        }

        const roadFloatBytes = 8 * 4;
        for (let i = 0; i < numRoads; i++) {
            off += roadFloatBytes;
        }
        const result = { buildings: buildingsByChunk, props: propsByChunk };
        cache.set(districtId, result);
        return result;
    })();

    activeFetches.set(districtId, fetchPromise);
    try {
        return await fetchPromise;
    } finally {
        activeFetches.delete(districtId);
    }
}

/**
 * Given a world position (x, z), returns the first district record that contains it,
 * or null if it's not inside any authored district.
 */
export function getDistrictAtPoint(x, z, districtIndex) {
    for (const district of districtIndex) {
        if (districtContainsPoint(district, x, z)) return district;
    }
    return null;
}
/**
 * Clears the cache for a specific district or all districts.
 */
export function clearDistrictCache(districtId = null) {
    if (districtId) {
        cache.delete(districtId);
    } else {
        cache.clear();
    }
}

export const fetchCityIndex = fetchDistrictIndex;
export const loadCityChunk = loadDistrictChunk;
export const getCityAtPoint = getDistrictAtPoint;
export const clearCityCache = clearDistrictCache;
