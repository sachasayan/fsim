// @ts-check

function getRadialInfluence(dist, radius) {
    if (dist >= radius) return 0;
    const t = 1 - dist / radius;
    return t * t * (3 - 2 * t);
}

function getDistanceToSegment(x, z, ax, az, bx, bz) {
    const abx = bx - ax;
    const abz = bz - az;
    const lenSq = abx * abx + abz * abz;
    if (lenSq <= 1e-6) return Math.hypot(x - ax, z - az);
    const t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / lenSq));
    const px = ax + abx * t;
    const pz = az + abz * t;
    return Math.hypot(x - px, z - pz);
}

function getEditInfluence(edit, x, z) {
    const radius = edit.radius || 0;
    const points = Array.isArray(edit.points) ? edit.points : null;
    if (points?.length) {
        let minDist = Infinity;
        for (let i = 0; i < points.length; i++) {
            const [px, pz] = points[i];
            minDist = Math.min(minDist, Math.hypot(x - px, z - pz));
            if (i > 0) {
                const [ax, az] = points[i - 1];
                minDist = Math.min(minDist, getDistanceToSegment(x, z, ax, az, px, pz));
            }
        }
        return getRadialInfluence(minDist, radius);
    }

    const dx = x - edit.x;
    const dz = z - edit.z;
    const dist = Math.hypot(dx, dz);
    return getRadialInfluence(dist, radius);
}

export function applyTerrainEdits(baseHeight, x, z, terrainEdits = []) {
    let height = baseHeight;
    for (const edit of terrainEdits) {
        const influence = getEditInfluence(edit, x, z);
        if (influence <= 0) continue;

        if (edit.kind === 'lower') {
            height -= (edit.delta || 0) * influence;
            continue;
        }
        if (edit.kind === 'flatten') {
            const opacity = Math.max(0, Math.min(1, edit.opacity ?? 0.65));
            height += ((edit.target_height ?? height) - height) * influence * opacity;
            continue;
        }
        height += (edit.delta || 0) * influence;
    }
    return height;
}
