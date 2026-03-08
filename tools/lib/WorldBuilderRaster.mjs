/**
 * WorldBuilderRaster.mjs
 * Library for rasterizing road masks and urban intensity for the fsim world builder.
 */

/**
 * Rasterizes thick lines for roads into a flat 2D mask.
 * @param {Object} city - City metadata.
 * @param {Array} roadSegments - List of road segments.
 * @param {Function} getUrbanIntensity - Function to calculate urban intensity.
 * @param {number} size - Output texture size.
 * @returns {Object} { data: Uint8Array, size: number, worldRadius: number }
 */
export function generateRoadMask(city, roadSegments, getUrbanIntensity, size = 1024) {
    const data = new Uint8Array(size * size);
    const cx = city.center[0], cz = city.center[1];
    const r = deriveCityRadius(city);
    const mapWorldRad = r * 1.05;
    const pxScale = size / (mapWorldRad * 2);

    // FIRST PASS: Urban ground based on urban intensity
    for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
            const wx = cx - mapWorldRad + (px / pxScale);
            const wz = cz - mapWorldRad + (py / pxScale);
            const intensity = getUrbanIntensity(wx, wz, city);

            if (intensity > 0.05) {
                // Keep urban base subtle so roads remain high-contrast in shader thresholds.
                const val = Math.floor(30 + intensity * 60);
                data[py * size + px] = val;
            } else {
                data[py * size + px] = 0;
            }
        }
    }

    // SECOND PASS: Draw high-alpha roads on top
    for (const seg of roadSegments) {
        let x1 = (seg.x1 - cx + mapWorldRad) * pxScale;
        let y1 = (seg.z1 - cz + mapWorldRad) * pxScale;
        let x2 = (seg.x2 - cx + mapWorldRad) * pxScale;
        let y2 = (seg.z2 - cz + mapWorldRad) * pxScale;
        let thicknessPx = (seg.halfWidth * 2.5) * pxScale;

        const minX = Math.max(0, Math.floor(Math.min(x1, x2) - thicknessPx));
        const maxX = Math.min(size - 1, Math.ceil(Math.max(x1, x2) + thicknessPx));
        const minY = Math.max(0, Math.floor(Math.min(y1, y2) - thicknessPx));
        const maxY = Math.min(size - 1, Math.ceil(Math.max(y1, y2) + thicknessPx));

        const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;

        for (let py = minY; py <= maxY; py++) {
            for (let px = minX; px <= maxX; px++) {
                let t = 0;
                if (l2 !== 0) {
                    t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
                    t = Math.max(0, Math.min(1, t));
                }
                const projX = x1 + t * (x2 - x1);
                const projY = y1 + t * (y2 - y1);
                const distSq = (px - projX) ** 2 + (py - projY) ** 2;

                if (distSq < thicknessPx * thicknessPx) {
                    const dist = Math.sqrt(distSq);
                    const roadAlphaBase = 205;
                    const alpha = Math.max(0, 1.0 - (dist / thicknessPx));
                    const val = Math.floor(roadAlphaBase + alpha * 50);
                    const idx = py * size + px;
                    if (val > data[idx]) data[idx] = val;
                }
            }
        }
    }
    return { data, size, worldRadius: mapWorldRad };
}

function deriveCityRadius(city) {
    const cx = city.center[0];
    const cz = city.center[1];
    let maxDist = 600;
    for (const district of city.districts || []) {
        const points = district.points?.length >= 3
            ? district.points
            : district.center && district.radius
                ? [
                    [district.center[0] - district.radius, district.center[1] - district.radius],
                    [district.center[0] + district.radius, district.center[1] - district.radius],
                    [district.center[0] + district.radius, district.center[1] + district.radius],
                    [district.center[0] - district.radius, district.center[1] + district.radius]
                ]
                : [];
        for (const [x, z] of points) {
            maxDist = Math.max(maxDist, Math.hypot(x - cx, z - cz));
        }
    }
    return city.radius || maxDist;
}
