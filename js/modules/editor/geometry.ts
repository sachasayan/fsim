export type Point2 = [number, number];
export type WorldPointLike = { x: number; z: number };
export type DistrictLike = { center: Point2; radius?: number; points?: Point2[] | number[][] };
export type TerrainEditLike = { x: number; z: number; radius?: number; points?: Point2[] | number[][] };
export type RoadLike = { points?: Point2[] | number[][]; width?: number; feather?: number };
export type TerrainRegionLike = { bounds?: { minX: number; maxX: number; minZ: number; maxZ: number } };

/**
 * @param {unknown} point
 * @returns {point is Point2}
 */
function isPoint2(point) {
    return Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

/**
 * @param {number} x
 * @param {number} z
 * @param {Array<Point2 | number[]>} points
 * @returns {boolean}
 */
export function isPointInPolygon(x, z, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        if (!isPoint2(points[i]) || !isPoint2(points[j])) continue;
        const xi = points[i][0];
        const zi = points[i][1];
        const xj = points[j][0];
        const zj = points[j][1];
        const intersect = ((zi > z) !== (zj > z)) &&
            (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * @param {DistrictLike} district
 * @param {number} x
 * @param {number} z
 * @returns {boolean}
 */
export function districtContainsPoint(district, x, z) {
    if (district.points?.length >= 3) return isPointInPolygon(x, z, district.points);
    if (district.radius) return Math.hypot(x - district.center[0], z - district.center[1]) < district.radius;
    return false;
}

/**
 * @param {number} x
 * @param {number} z
 * @param {number} ax
 * @param {number} az
 * @param {number} bx
 * @param {number} bz
 * @returns {number}
 */
export function getDistanceToSegment(x, z, ax, az, bx, bz) {
    const abx = bx - ax;
    const abz = bz - az;
    const lenSq = abx * abx + abz * abz;
    if (lenSq <= 1e-6) return Math.hypot(x - ax, z - az);
    const t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / lenSq));
    const px = ax + abx * t;
    const pz = az + abz * t;
    return Math.hypot(x - px, z - pz);
}

/**
 * @param {TerrainEditLike} edit
 * @param {number} x
 * @param {number} z
 * @returns {boolean}
 */
export function terrainEditContainsPoint(edit, x, z) {
    if (Array.isArray(edit?.points) && edit.points.length > 0) {
        for (let i = 0; i < edit.points.length; i++) {
            const currentPoint = edit.points[i];
            if (!isPoint2(currentPoint)) continue;
            const [px, pz] = currentPoint;
            const radius = Number.isFinite(edit.radius) ? edit.radius : 0;
            if (Math.hypot(x - px, z - pz) <= radius) return true;
            if (i > 0) {
                const previousPoint = edit.points[i - 1];
                if (!isPoint2(previousPoint)) continue;
                const [ax, az] = previousPoint;
                if (getDistanceToSegment(x, z, ax, az, px, pz) <= radius) return true;
            }
        }
        return false;
    }
    return Math.hypot(x - edit.x, z - edit.z) <= (Number.isFinite(edit.radius) ? edit.radius : 0);
}

/**
 * @param {RoadLike} road
 * @param {number} x
 * @param {number} z
 * @param {number} [threshold]
 * @returns {boolean}
 */
export function roadContainsPoint(road, x, z, threshold = 0) {
    if (!Array.isArray(road?.points) || road.points.length < 2) return false;
    const effectiveRadius = Math.max((road.width || 0) * 0.5 + (road.feather || 0), threshold);
    for (let i = 1; i < road.points.length; i++) {
        if (!isPoint2(road.points[i - 1]) || !isPoint2(road.points[i])) continue;
        const [ax, az] = road.points[i - 1];
        const [bx, bz] = road.points[i];
        if (getDistanceToSegment(x, z, ax, az, bx, bz) <= effectiveRadius) return true;
    }
    return false;
}

/**
 * @param {TerrainRegionLike} region
 * @param {number} x
 * @param {number} z
 * @returns {boolean}
 */
export function terrainRegionContainsPoint(region, x, z) {
    const bounds = region?.bounds;
    if (!bounds) return false;
    return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

/**
 * @param {Array<Point2 | number[]>} points
 * @param {WorldPointLike} worldPos
 * @param {number} threshold
 * @returns {number}
 */
export function getVertexHitIndex(points, worldPos, threshold) {
    let bestIndex = -1;
    let bestDistance = threshold;
    for (let i = points.length - 1; i >= 0; i--) {
        if (!isPoint2(points[i])) continue;
        const [x, z] = points[i];
        const distance = Math.hypot(worldPos.x - x, worldPos.z - z);
        if (distance <= bestDistance) {
            bestDistance = distance;
            bestIndex = i;
        }
    }
    return bestIndex;
}

/**
 * @param {TerrainEditLike} edit
 * @param {WorldPointLike} worldPos
 * @param {number} threshold
 * @returns {number}
 */
export function getClosestTerrainSegmentIndex(edit, worldPos, threshold) {
    if (!Array.isArray(edit?.points) || edit.points.length < 2) return -1;
    let bestIndex = -1;
    let bestDistance = threshold;
    for (let i = 1; i < edit.points.length; i++) {
        if (!isPoint2(edit.points[i - 1]) || !isPoint2(edit.points[i])) continue;
        const [ax, az] = edit.points[i - 1];
        const [bx, bz] = edit.points[i];
        const dist = getDistanceToSegment(worldPos.x, worldPos.z, ax, az, bx, bz);
        if (dist <= bestDistance) {
            bestDistance = dist;
            bestIndex = i;
        }
    }
    return bestIndex;
}
