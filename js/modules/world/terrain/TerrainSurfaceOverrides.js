import { AIRPORT_CONFIG } from '../config.js';

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0, edge1, value) {
    const t = clamp01((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
}

function rectWeight(x, z, cx, cz, width, depth, feather = 0) {
    const dx = Math.abs(x - cx);
    const dz = Math.abs(z - cz);
    const halfW = width * 0.5;
    const halfD = depth * 0.5;
    if (dx > halfW + feather || dz > halfD + feather) return 0;
    if (feather <= 0) return 1;

    const wx = 1.0 - smoothstep(halfW, halfW + feather, dx);
    const wz = 1.0 - smoothstep(halfD, halfD + feather, dz);
    return Math.min(wx, wz);
}

function distanceToSegmentSquared(px, pz, ax, az, bx, bz) {
    const abx = bx - ax;
    const abz = bz - az;
    const apx = px - ax;
    const apz = pz - az;
    const lenSq = abx * abx + abz * abz;
    if (lenSq <= 1e-6) {
        const dx = px - ax;
        const dz = pz - az;
        return dx * dx + dz * dz;
    }
    const t = clamp01((apx * abx + apz * abz) / lenSq);
    const qx = ax + abx * t;
    const qz = az + abz * t;
    const dx = px - qx;
    const dz = pz - qz;
    return dx * dx + dz * dz;
}

function polylineWeight(x, z, points, width, feather = 0) {
    const radius = width * 0.5;
    const outer = radius + feather;
    const outerSq = outer * outer;
    let bestSq = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const distSq = distanceToSegmentSquared(x, z, a[0], a[1], b[0], b[1]);
        if (distSq < bestSq) bestSq = distSq;
    }
    if (bestSq > outerSq) return 0;
    if (feather <= 0) return 1;
    return 1.0 - smoothstep(radius, outer, Math.sqrt(bestSq));
}

const AIRPORT_TAXIWAYS = [
    [
        [0, 1800],
        [-80, 1400],
        [-190, -200]
    ],
    [
        [0, -1800],
        [-80, -1400],
        [-190, -400]
    ]
];

function getRoadSurfaceWeight(x, z, roads, surface = 'asphalt') {
    if (!Array.isArray(roads) || roads.length === 0) return 0;

    let best = 0;
    for (const road of roads) {
        if (road?.surface !== surface) continue;
        if (!Array.isArray(road.points) || road.points.length < 2) continue;
        best = Math.max(best, polylineWeight(x, z, road.points, road.width || 18, road.feather || 0));
    }
    return best;
}

export function getTerrainSurfaceOverrides(x, z, worldData = null) {
    const runtimeWorld = worldData || (typeof window !== 'undefined' ? window?.fsimWorld || null : null);
    const hasAuthoredRoads = Array.isArray(runtimeWorld?.roads) && runtimeWorld.roads.length > 0;
    const runway = rectWeight(
        x,
        z,
        AIRPORT_CONFIG.RUNWAY.x,
        AIRPORT_CONFIG.RUNWAY.z,
        AIRPORT_CONFIG.RUNWAY.width + 18,
        AIRPORT_CONFIG.RUNWAY.length + 24,
        18
    );
    const apron = rectWeight(
        x,
        z,
        AIRPORT_CONFIG.APRON.x,
        AIRPORT_CONFIG.APRON.z,
        AIRPORT_CONFIG.APRON.width + 20,
        AIRPORT_CONFIG.APRON.depth + 20,
        20
    );
    const taxiway = hasAuthoredRoads
        ? getRoadSurfaceWeight(x, z, runtimeWorld.roads, 'asphalt')
        : AIRPORT_TAXIWAYS.reduce((best, points) => (
            Math.max(best, polylineWeight(x, z, points, AIRPORT_CONFIG.TAXIWAY.width + 10, 10))
        ), 0);

    const asphalt = Math.max(runway, apron, taxiway);
    return [asphalt, 0, 0, 0];
}
