import crypto from 'node:crypto';

function canonicalize(value) {
    if (Array.isArray(value)) {
        return value.map(canonicalize);
    }
    if (!value || typeof value !== 'object') {
        return value;
    }

    const sortedEntries = Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([a], [b]) => a.localeCompare(b));

    const result = {};
    for (const [key, child] of sortedEntries) {
        result[key] = canonicalize(child);
    }
    return result;
}

export function getTerrainFingerprintPayload(mapData) {
    return canonicalize({
        terrainEdits: mapData?.terrainEdits || [],
        terrainGenerator: mapData?.terrainGenerator || null,
        terrainRegions: mapData?.terrainRegions || [],
        airports: mapData?.airports || []
    });
}

export function createTerrainFingerprint(mapData) {
    const payload = getTerrainFingerprintPayload(mapData);
    const serialized = JSON.stringify(payload);
    return crypto.createHash('sha256').update(serialized).digest('hex');
}
