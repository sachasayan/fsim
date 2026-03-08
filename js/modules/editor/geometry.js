export function isPointInPolygon(x, z, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
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

export function districtContainsPoint(district, x, z) {
    if (district.points?.length >= 3) return isPointInPolygon(x, z, district.points);
    if (district.radius) return Math.hypot(x - district.center[0], z - district.center[1]) < district.radius;
    return false;
}

export function cityContainsPoint(worldData, city, x, z, getDistrictsForCity) {
    return getDistrictsForCity(worldData, city.id).some(district => districtContainsPoint(district, x, z));
}

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

export function terrainEditContainsPoint(edit, x, z) {
    if (Array.isArray(edit?.points) && edit.points.length > 0) {
        for (let i = 0; i < edit.points.length; i++) {
            const [px, pz] = edit.points[i];
            if (Math.hypot(x - px, z - pz) <= edit.radius) return true;
            if (i > 0) {
                const [ax, az] = edit.points[i - 1];
                if (getDistanceToSegment(x, z, ax, az, px, pz) <= edit.radius) return true;
            }
        }
        return false;
    }
    return Math.hypot(x - edit.x, z - edit.z) <= edit.radius;
}

export function getVertexHitIndex(points, worldPos, threshold) {
    for (let i = points.length - 1; i >= 0; i--) {
        const [x, z] = points[i];
        if (Math.hypot(worldPos.x - x, worldPos.z - z) <= threshold) return i;
    }
    return -1;
}

export function getClosestTerrainSegmentIndex(edit, worldPos, threshold) {
    if (!Array.isArray(edit?.points) || edit.points.length < 2) return -1;
    let bestIndex = -1;
    let bestDistance = threshold;
    for (let i = 1; i < edit.points.length; i++) {
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
