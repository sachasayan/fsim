import { AIRPORT_CONFIG } from './config.js';

export const DEFAULT_AIRPORT_TEMPLATE = 'default';
export const DEFAULT_AIRPORT_AUTHORED_ASSET_IDS = Object.freeze([
    'air-traffic-control-1',
    'airliner-blue',
    'airliner-white',
    'airplane-quad-engine',
    'prop-biplane'
]);

export const LEGACY_DEFAULT_AIRPORT = Object.freeze({
    id: 'legacy-default-airport',
    x: 0,
    z: 0,
    yaw: 0,
    template: DEFAULT_AIRPORT_TEMPLATE,
    builtin: true
});

function clampNumber(value, min, max, fallback) {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
}

export function normalizeAirport(rawAirport) {
    const airport = rawAirport || {};
    airport.x = Math.round(Number.isFinite(airport.x) ? airport.x : 0);
    airport.z = Math.round(Number.isFinite(airport.z) ? airport.z : 0);
    airport.yaw = clampNumber(Number(airport.yaw), -180, 180, 0);
    airport.template = airport.template === DEFAULT_AIRPORT_TEMPLATE
        ? DEFAULT_AIRPORT_TEMPLATE
        : DEFAULT_AIRPORT_TEMPLATE;
    return airport;
}

export function listMapAirports(worldData) {
    return (worldData?.airports || []).map((airport) => normalizeAirport(airport));
}

export function listRuntimeAirports(worldData) {
    return [
        { ...LEGACY_DEFAULT_AIRPORT },
        ...listMapAirports(worldData).map((airport, index) => ({
            id: airport.id || `map-airport-${index}`,
            ...airport,
            builtin: false
        }))
    ];
}

export function extractDefaultAirportAuthoredObjectTemplates(worldData) {
    const authoredObjects = Array.isArray(worldData?.authoredObjects) ? worldData.authoredObjects : [];
    return authoredObjects
        .filter((placement) => DEFAULT_AIRPORT_AUTHORED_ASSET_IDS.includes(placement.assetId))
        .map((placement) => ({
            assetId: placement.assetId,
            x: placement.x,
            z: placement.z,
            y: placement.y || 0,
            yaw: placement.yaw || 0,
            scale: placement.scale || 1,
            heightMode: placement.heightMode || 'terrain'
        }));
}

export function rotateAirportOffset(localX, localZ, yawDeg = 0) {
    const yawRad = yawDeg * Math.PI / 180;
    const cosYaw = Math.cos(yawRad);
    const sinYaw = Math.sin(yawRad);
    return {
        x: localX * cosYaw + localZ * sinYaw,
        z: -localX * sinYaw + localZ * cosYaw
    };
}

export function worldToAirportLocal(airport, worldX, worldZ) {
    const dx = worldX - airport.x;
    const dz = worldZ - airport.z;
    const yawRad = -(airport.yaw || 0) * Math.PI / 180;
    const cosYaw = Math.cos(yawRad);
    const sinYaw = Math.sin(yawRad);
    return {
        x: dx * cosYaw + dz * sinYaw,
        z: -dx * sinYaw + dz * cosYaw
    };
}

export function transformAirportPoint(airport, localX, localZ) {
    const rotated = rotateAirportOffset(localX, localZ, airport.yaw || 0);
    return {
        x: airport.x + rotated.x,
        z: airport.z + rotated.z
    };
}

export function getAirportFootprintLocalBounds(padding = 80) {
    const halfRunwayWidth = AIRPORT_CONFIG.RUNWAY.width * 0.5;
    const halfRunwayLength = AIRPORT_CONFIG.RUNWAY.length * 0.5;
    const apronMinX = AIRPORT_CONFIG.APRON.x - AIRPORT_CONFIG.APRON.width * 0.5;
    const apronMaxX = AIRPORT_CONFIG.APRON.x + AIRPORT_CONFIG.APRON.width * 0.5;
    const apronMinZ = AIRPORT_CONFIG.APRON.z - AIRPORT_CONFIG.APRON.depth * 0.5;
    const apronMaxZ = AIRPORT_CONFIG.APRON.z + AIRPORT_CONFIG.APRON.depth * 0.5;

    let minX = Math.min(-halfRunwayWidth, apronMinX);
    let maxX = Math.max(halfRunwayWidth, apronMaxX);
    let minZ = Math.min(-halfRunwayLength, apronMinZ);
    let maxZ = Math.max(halfRunwayLength, apronMaxZ);

    for (const hangar of AIRPORT_CONFIG.HANGARS) {
        minX = Math.min(minX, hangar.x - 30);
        maxX = Math.max(maxX, hangar.x + 30);
        minZ = Math.min(minZ, hangar.z - 30);
        maxZ = Math.max(maxZ, hangar.z + 30);
    }

    minX = Math.min(minX, AIRPORT_CONFIG.TOWER.x - 20, AIRPORT_CONFIG.RADAR.x - 16);
    maxX = Math.max(maxX, AIRPORT_CONFIG.TOWER.x + 20, AIRPORT_CONFIG.RADAR.x + 16);
    minZ = Math.min(minZ, AIRPORT_CONFIG.TOWER.z - 20, AIRPORT_CONFIG.RADAR.z - 16);
    maxZ = Math.max(maxZ, AIRPORT_CONFIG.TOWER.z + 20, AIRPORT_CONFIG.RADAR.z + 16);

    return {
        minX: minX - padding,
        maxX: maxX + padding,
        minZ: minZ - padding,
        maxZ: maxZ + padding
    };
}

export function getAirportWorldFootprintBounds(airport, padding = 80) {
    const localBounds = getAirportFootprintLocalBounds(padding);
    const corners = [
        transformAirportPoint(airport, localBounds.minX, localBounds.minZ),
        transformAirportPoint(airport, localBounds.maxX, localBounds.minZ),
        transformAirportPoint(airport, localBounds.maxX, localBounds.maxZ),
        transformAirportPoint(airport, localBounds.minX, localBounds.maxZ)
    ];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const corner of corners) {
        minX = Math.min(minX, corner.x);
        maxX = Math.max(maxX, corner.x);
        minZ = Math.min(minZ, corner.z);
        maxZ = Math.max(maxZ, corner.z);
    }
    return { minX, maxX, minZ, maxZ };
}

export function airportContainsWorldPoint(airport, worldX, worldZ, padding = 100) {
    const local = worldToAirportLocal(airport, worldX, worldZ);
    const bounds = getAirportFootprintLocalBounds(padding);
    return local.x >= bounds.minX
        && local.x <= bounds.maxX
        && local.z >= bounds.minZ
        && local.z <= bounds.maxZ;
}

export function buildAirportDescriptor(airport) {
    const thresholdHalfLength = AIRPORT_CONFIG.RUNWAY.length * 0.5;
    return {
        ...airport,
        runway: {
            center: { x: airport.x, z: airport.z },
            width: AIRPORT_CONFIG.RUNWAY.width,
            length: AIRPORT_CONFIG.RUNWAY.length,
            thresholds: [
                transformAirportPoint(airport, 0, -thresholdHalfLength),
                transformAirportPoint(airport, 0, thresholdHalfLength)
            ]
        },
        tower: transformAirportPoint(airport, AIRPORT_CONFIG.TOWER.x, AIRPORT_CONFIG.TOWER.z),
        apron: {
            ...transformAirportPoint(airport, AIRPORT_CONFIG.APRON.x, AIRPORT_CONFIG.APRON.z),
            width: AIRPORT_CONFIG.APRON.width,
            depth: AIRPORT_CONFIG.APRON.depth
        },
        radar: transformAirportPoint(airport, AIRPORT_CONFIG.RADAR.x, AIRPORT_CONFIG.RADAR.z),
        hangars: AIRPORT_CONFIG.HANGARS.map((hangar) => ({
            ...transformAirportPoint(airport, hangar.x, hangar.z),
            yaw: (airport.yaw || 0) + hangar.yawDeg
        })),
        bounds: getAirportWorldFootprintBounds(airport)
    };
}

export function getAirportRunwayThresholds(worldData) {
    return listRuntimeAirports(worldData)
        .map((airport) => buildAirportDescriptor(airport).runway.thresholds)
        .flat();
}

export function applyAirportRunwayFlattening(baseHeight, x, z, worldData = null) {
    let nextHeight = baseHeight;
    for (const airport of listRuntimeAirports(worldData)) {
        const local = worldToAirportLocal(airport, x, z);
        const distFromRunwayX = Math.abs(local.x);
        const distFromRunwayZ = Math.abs(local.z);
        const apronMinX = AIRPORT_CONFIG.APRON.x - AIRPORT_CONFIG.APRON.width * 0.5;
        const apronMaxX = AIRPORT_CONFIG.APRON.x + AIRPORT_CONFIG.APRON.width * 0.5;
        const apronMinZ = AIRPORT_CONFIG.APRON.z - AIRPORT_CONFIG.APRON.depth * 0.5;
        const apronMaxZ = AIRPORT_CONFIG.APRON.z + AIRPORT_CONFIG.APRON.depth * 0.5;

        if (distFromRunwayX < 150 && distFromRunwayZ < 2500) {
            return 0;
        }
        if (distFromRunwayX < 600 && distFromRunwayZ < 3500) {
            const blendX = Math.max(0, (distFromRunwayX - 150) / 450);
            const blendZ = Math.max(0, (distFromRunwayZ - 2500) / 1000);
            const runwayMask = Math.min(1.0, Math.max(blendX, blendZ));
            nextHeight = Math.min(nextHeight, Math.max(0, baseHeight * runwayMask));
        }

        const apronInner = (
            local.x >= apronMinX - 80
            && local.x <= apronMaxX + 80
            && local.z >= apronMinZ - 80
            && local.z <= apronMaxZ + 80
        );
        if (apronInner) {
            return 0;
        }

        const apronOuter = (
            local.x >= apronMinX - 260
            && local.x <= apronMaxX + 260
            && local.z >= apronMinZ - 260
            && local.z <= apronMaxZ + 260
        );
        if (apronOuter) {
            const dx = Math.max(apronMinX - local.x, 0, local.x - apronMaxX);
            const dz = Math.max(apronMinZ - local.z, 0, local.z - apronMaxZ);
            const blend = Math.min(1, Math.max(dx, dz) / 180);
            nextHeight = Math.min(nextHeight, Math.max(0, baseHeight * blend));
        }
    }
    return nextHeight;
}

export function isNearAirportRunway(x, z, worldData = null, halfWidth = 250, halfLength = 2800) {
    return listRuntimeAirports(worldData).some((airport) => {
        const local = worldToAirportLocal(airport, x, z);
        return Math.abs(local.x) < halfWidth && Math.abs(local.z) < halfLength;
    });
}
