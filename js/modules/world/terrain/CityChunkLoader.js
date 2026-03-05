/**
 * CityChunkLoader.js
 *
 * Runtime module that fetches and parses pre-compiled binary city chunks.
 * Each city has a single `city.bin` file located at:
 *   /world/chunks/<cityId>/city.bin
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

const MAGIC = 0x46574C44;
const BLDG_FLOATS = 10;
const ROAD_FLOATS = 8;

// Mapping classId integer → building class string (must match build-world.mjs CLASS_IDS order)
export const CLASS_NAMES = ['supertall', 'highrise', 'office', 'apartment', 'townhouse', 'industrial'];

// Cache so each city is only fetched once per session
const cache = new Map();

/**
 * Fetches the city index listing all cities and their bounding circles.
 * Returns an array of { id, cx, cz, radius }.
 */
let cityIndexPromise = null;
export async function fetchCityIndex() {
    if (!cityIndexPromise) {
        cityIndexPromise = fetch('/world/chunks/index.json').then(r => r.json());
    }
    return cityIndexPromise;
}

/**
 * Loads and parses the binary chunk for a given city id.
 * Returns { buildings: Array, roadSegments: Array } or null on failure.
 *
 * buildings:    [{ x,y,z,w,h,d,angle,classId,colorIdx }]
 * roadSegments: [{ x1,y1,z1,x2,y2,z2,halfWidth,classId }]
 */
export async function loadCityChunk(cityId) {
    if (cache.has(cityId)) return cache.get(cityId);

    let buf;
    try {
        const resp = await fetch(`/world/chunks/${cityId}/city.bin`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        buf = await resp.arrayBuffer();
    } catch (e) {
        console.warn(`[CityChunkLoader] Failed to load city "${cityId}":`, e.message);
        return null;
    }

    const view = new DataView(buf);
    let off = 0;

    const ri32 = () => { const v = view.getInt32(off, true); off += 4; return v; };
    const rf32 = () => { const v = view.getFloat32(off, true); off += 4; return v; };

    const magic = ri32();
    if (magic !== MAGIC) {
        console.error(`[CityChunkLoader] Invalid magic in city "${cityId}": 0x${magic.toString(16)}`);
        return null;
    }

    const version = ri32();
    if (version < 1 || version > 2) {
        console.warn(`[CityChunkLoader] Unknown version ${version} for city "${cityId}"`);
    }

    const numBuildings = ri32();
    const numRoads = ri32();

    let maskSize = 0, maskOffset = 0;
    if (version >= 2) {
        maskSize = ri32();
        maskOffset = ri32();
    }

    const buildings = [];
    for (let i = 0; i < numBuildings; i++) {
        const x = rf32(), y = rf32(), z = rf32();
        const w = rf32(), h = rf32(), d = rf32();
        const angle = rf32();
        const classId = Math.round(rf32());
        const colorIdx = Math.round(rf32());
        rf32(); // _pad
        buildings.push({ x, y, z, w, h, d, angle, classId, colorIdx });
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
        roadMaskTexture.generateMipmaps = true;
        roadMaskTexture.minFilter = THREE.LinearMipmapLinearFilter;
        roadMaskTexture.magFilter = THREE.LinearFilter;
        roadMaskTexture.wrapS = THREE.ClampToEdgeWrapping;
        roadMaskTexture.wrapT = THREE.ClampToEdgeWrapping;
        roadMaskTexture.needsUpdate = true;
    }

    const result = { buildings, roadSegments, roadMaskTexture };
    cache.set(cityId, result);
    return result;
}

/**
 * Given a world position (x, z), returns the first city that contains it,
 * or null if it's not inside any city.
 */
export function getCityAtPoint(x, z, cityIndex) {
    for (const city of cityIndex) {
        const dx = x - city.cx, dz = z - city.cz;
        if (dx * dx + dz * dz <= city.radius * city.radius) return city;
    }
    return null;
}
