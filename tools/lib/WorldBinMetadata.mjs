import { readFileSync, writeFileSync } from 'node:fs';

import { buildDistrictRecords } from '../../js/modules/world/MapDataUtils.js';

const QTRE_MAGIC = 0x51545245;
const HEADER_SIZE = 32;

function decodeBufferSlice(buffer) {
    return new TextDecoder().decode(buffer);
}

function encodeMetadata(metadata) {
    return Buffer.from(JSON.stringify(metadata), 'utf8');
}

export function readWorldBinMetadata(worldBinPath) {
    const file = readFileSync(worldBinPath);
    const arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    const view = new DataView(arrayBuffer);
    const magic = view.getUint32(0, true);
    if (magic !== QTRE_MAGIC) {
        throw new Error(`Invalid QTRE magic in ${worldBinPath}`);
    }

    const metaOff = view.getUint32(16, true);
    const metaSize = view.getUint32(20, true);
    if (metaSize === 0) {
        return null;
    }

    const metadataBuffer = file.subarray(metaOff, metaOff + metaSize);
    return JSON.parse(decodeBufferSlice(metadataBuffer));
}

export function replaceWorldBinMetadata(worldBinPath, metadata) {
    const file = readFileSync(worldBinPath);
    const magic = file.readUInt32LE(0);
    if (magic !== QTRE_MAGIC) {
        throw new Error(`Invalid QTRE magic in ${worldBinPath}`);
    }

    const metaOff = file.readUInt32LE(16);
    const nextMeta = encodeMetadata(metadata);
    const nextFile = Buffer.concat([
        file.subarray(0, metaOff),
        nextMeta
    ]);
    nextFile.writeUInt32LE(nextMeta.byteLength, 20);

    if (nextFile.byteLength < HEADER_SIZE) {
        throw new Error(`Corrupt QTRE rewrite for ${worldBinPath}`);
    }

    writeFileSync(worldBinPath, nextFile);
}

export function buildWorldMetadata({
    mapData,
    terrainMetadata = {},
    worldSize,
    clearTerrainEdits = false,
    terrainFingerprint = null
}) {
    return mapData
        ? {
            ...mapData,
            worldSize,
            ...terrainMetadata,
            terrainFingerprint,
            terrainEdits: clearTerrainEdits ? [] : (mapData.terrainEdits || []),
            terrainRegions: mapData.terrainRegions || [],
            districts: mapData.districts || [],
            districtRecords: buildDistrictRecords(mapData)
        }
        : {
            worldSize,
            ...terrainMetadata,
            terrainFingerprint,
            terrainEdits: [],
            terrainRegions: [],
            districts: [],
            districtRecords: []
        };
}

export function extractTerrainMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') return {};
    return {
        terrainModel: metadata.terrainModel,
        terrainExtent: metadata.terrainExtent,
        terrainRegionMetadata: metadata.terrainRegionMetadata,
        hydrology: metadata.hydrology
    };
}
