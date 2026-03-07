/**
 * CityChunkLoader.js
 *
 * Runtime module that fetches and parses pre-compiled district chunks.
 * Each district has a single `district.bin` file located at:
 *   /world/chunks/<districtId>/district.bin
 *
 * Binary format (little-endian, mirrors build-world.mjs serialization):
 *   [4]  magic  = 0x46574C44
 *   [4]  version = 2
 *   [4]  numBuildings
 *   [4]  numRoadSegments
 *   [4]  maskSize (resolution, e.g., 1024)
 *   [4]  maskOffset (byte offset where mask data begins)
 *   per building (10 × f32): x,y,z, w,h,d, angle, classId, colorIdx, _pad
 *   per road    ( 8 × f32): x1,y1,z1, x2,y2,z2, halfWidth, classId
 *   mask data (maskSize*maskSize bytes): uint8 alpha channel
 */

import * as THREE from 'three';
import { buildDistrictRecords } from '../MapDataUtils.js';

const MAGIC = 0x46574C44;
const BLDG_FLOATS = 10;
const ROAD_FLOATS = 8;

// Mapping classId integer → building class string (must match build-world.mjs CLASS_IDS order)
export const CLASS_NAMES = ['supertall', 'highrise', 'office', 'apartment', 'townhouse', 'industrial'];

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
        const dx = x - center[0];
        const dz = z - center[1];
        maxDist = Math.max(maxDist, Math.sqrt(dx * dx + dz * dz));
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
        const ddx = x - district.center[0];
        const ddz = z - district.center[1];
        return ddx * ddx + ddz * ddz <= district.radius * district.radius;
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
    if (window.fsimWorld) {
        return buildDistrictRecords(window.fsimWorld).map(normalizeDistrictIndexEntry);
    }
    if (!districtIndexPromise) {
        districtIndexPromise = fetch('/world/chunks/index.json')
            .then(r => r.json())
            .then(records => records.map(normalizeDistrictIndexEntry));
    }
    return districtIndexPromise;
}

/**
 * Loads and parses the binary chunk for a given district id.
 * Returns { buildings: Array, roadSegments: Array } or null on failure.
 *
 * buildings:    { "cx,cz": [{ x,y,z,w,h,d,angle,classId,colorIdx }] }
 * roadSegments: [{ x1,y1,z1,x2,y2,z2,halfWidth,classId }]
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
            const resp = await fetch(`/world/chunks/${districtId}/district.bin`, { signal: controller.signal });
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
        if (version < 1 || version > 2) {
            console.warn(`[CityChunkLoader] Unknown version ${version} for district "${districtId}"`);
        }

        const numBuildings = ri32();
        const numRoads = ri32();

        let maskSize = 0, maskOffset = 0;
        if (version >= 2) {
            maskSize = ri32();
            maskOffset = ri32();
        }

        const buildingsByChunk = {}; // Spatial index: { "cx,cz": [building, ...] }
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

        const roadSegments = [];
        for (let i = 0; i < numRoads; i++) {
            const x1 = rf32(), y1 = rf32(), z1 = rf32();
            const x2 = rf32(), y2 = rf32(), z2 = rf32();
            const halfWidth = rf32();
            const classId = Math.round(rf32());
            roadSegments.push({ x1, y1, z1, x2, y2, z2, halfWidth, classId });
        }

        let roadMaskTexture = null;
        if (version >= 2 && maskSize > 0) {
            // Read 8-bit mask directly from the ArrayBuffer view
            const maskData = new Uint8Array(buf, maskOffset, maskSize * maskSize);
            // Copy data because the original ArrayBuffer might be GC'd or modified
            const dataCopy = new Uint8Array(maskData);
            // Create an uncompressed Alpha texture (1 channel, 8-bit)
            roadMaskTexture = new THREE.DataTexture(dataCopy, maskSize, maskSize, THREE.RedFormat, THREE.UnsignedByteType);
            roadMaskTexture.colorSpace = THREE.NoColorSpace; // CRITICAL: Stop sRGB gamma crush on alpha mask
            roadMaskTexture.generateMipmaps = true;
            roadMaskTexture.minFilter = THREE.LinearMipmapLinearFilter;
            roadMaskTexture.magFilter = THREE.LinearFilter;
            roadMaskTexture.wrapS = THREE.ClampToEdgeWrapping;
            roadMaskTexture.wrapT = THREE.ClampToEdgeWrapping;
            roadMaskTexture.needsUpdate = true;
        }

        const result = { buildings: buildingsByChunk, roadSegments, roadMaskTexture };
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
