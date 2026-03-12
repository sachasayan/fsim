import * as THREE from 'three';

const DEFAULT_OVERLAY_WORLD_SIZE = 640;
const DEFAULT_TEXTURE_SIZE = 2048;
const DEFAULT_RECENTER_DISTANCE = 96;

const DASH_SCALE = {
    road: { width: 0.36, dashLength: 5.5, gapLength: 5.5, color: '#f4d35e' },
    taxiway: { width: 0.88, dashLength: 0, gapLength: 0, color: '#ffff00' }
};

export function getRoadMarkingStyle(road) {
    if (!road || road.surface !== 'asphalt') return null;
    if (!Array.isArray(road.points) || road.points.length < 2) return null;

    if (road.markings?.centerLine === false || road.centerLine === false) return null;

    const style = road.markings?.centerLineStyle || road.centerLineStyle || road.kind;
    if (style === 'none') return null;

    if (style === 'taxiway' || road.kind === 'taxiway') {
        return {
            width: road.markings?.centerLineWidth ?? road.centerLineWidth ?? DASH_SCALE.taxiway.width,
            dashLength: road.markings?.dashLength ?? road.dashLength ?? DASH_SCALE.taxiway.dashLength,
            gapLength: road.markings?.gapLength ?? road.gapLength ?? DASH_SCALE.taxiway.gapLength,
            color: road.markings?.centerLineColor ?? road.centerLineColor ?? DASH_SCALE.taxiway.color
        };
    }

    if (road.kind === 'road' || style === 'road' || style === 'dashed') {
        return {
            width: road.markings?.centerLineWidth ?? road.centerLineWidth ?? DASH_SCALE.road.width,
            dashLength: road.markings?.dashLength ?? road.dashLength ?? DASH_SCALE.road.dashLength,
            gapLength: road.markings?.gapLength ?? road.gapLength ?? DASH_SCALE.road.gapLength,
            color: road.markings?.centerLineColor ?? road.centerLineColor ?? DASH_SCALE.road.color
        };
    }

    return null;
}

export function shouldRefreshRoadOverlay(previousCenter, nextCenter, minDistance, roadsChanged) {
    if (roadsChanged) return true;
    if (!previousCenter || !nextCenter) return true;
    const dx = nextCenter.x - previousCenter.x;
    const dz = nextCenter.z - previousCenter.z;
    return (dx * dx + dz * dz) >= minDistance * minDistance;
}

function getRoadBounds(points) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of points) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
    }
    return { minX, maxX, minZ, maxZ };
}

function roadOverlapsOverlay(points, centerX, centerZ, worldSize, padding = 64) {
    const half = worldSize * 0.5 + padding;
    const bounds = getRoadBounds(points);
    return !(
        bounds.maxX < centerX - half ||
        bounds.minX > centerX + half ||
        bounds.maxZ < centerZ - half ||
        bounds.minZ > centerZ + half
    );
}

function worldToOverlay(x, z, centerX, centerZ, worldSize, textureSize) {
    const half = worldSize * 0.5;
    const u = (x - (centerX - half)) / worldSize;
    const v = 1.0 - (z - (centerZ - half)) / worldSize;
    return [u * textureSize, v * textureSize];
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export class RoadMarkingOverlay {
    constructor({
        worldSize = DEFAULT_OVERLAY_WORLD_SIZE,
        textureSize = DEFAULT_TEXTURE_SIZE,
        recenterDistance = DEFAULT_RECENTER_DISTANCE
    } = {}) {
        this.worldSize = worldSize;
        this.textureSize = textureSize;
        this.recenterDistance = recenterDistance;
        this.center = null;
        this.lastRoadsRef = null;

        this.canvas = document.createElement('canvas');
        this.canvas.width = textureSize;
        this.canvas.height = textureSize;
        this.ctx = this.canvas.getContext('2d', { alpha: true });
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.wrapS = THREE.ClampToEdgeWrapping;
        this.texture.wrapT = THREE.ClampToEdgeWrapping;
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.magFilter = THREE.LinearFilter;
        this.texture.generateMipmaps = false;
        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.clear();
    }

    clear() {
        if (typeof this.ctx.setTransform === 'function') {
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
        this.ctx.clearRect(0, 0, this.textureSize, this.textureSize);
        this.texture.needsUpdate = true;
    }

    update(x, z, worldData = null) {
        const roads = worldData?.roads || [];
        const nextCenter = { x, z };
        const roadsChanged = roads !== this.lastRoadsRef;
        if (!shouldRefreshRoadOverlay(this.center, nextCenter, this.recenterDistance, roadsChanged)) return false;

        this.center = nextCenter;
        this.lastRoadsRef = roads;
        this.redraw(roads);
        return true;
    }

    redraw(roads) {
        this.clear();
        if (!Array.isArray(roads) || roads.length === 0) return;

        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        for (const road of roads) {
            const style = getRoadMarkingStyle(road);
            if (!style) continue;
            if (!roadOverlapsOverlay(road.points, this.center.x, this.center.z, this.worldSize, road.width || 24)) continue;

            const pxPerMeter = this.textureSize / this.worldSize;
            const lineWidth = Math.max(3.0, style.width * pxPerMeter);
            const dashLength = Math.max(0, style.dashLength * pxPerMeter);
            const gapLength = Math.max(0, style.gapLength * pxPerMeter);

            this.ctx.strokeStyle = style.color;
            this.ctx.lineWidth = lineWidth;
            if (typeof this.ctx.setLineDash === 'function') {
                this.ctx.setLineDash(dashLength > 0 && gapLength > 0 ? [dashLength, gapLength] : []);
            }
            this.ctx.lineDashOffset = 0;
            this.ctx.beginPath();

            for (let i = 0; i < road.points.length; i++) {
                const [px, py] = worldToOverlay(
                    road.points[i][0],
                    road.points[i][1],
                    this.center.x,
                    this.center.z,
                    this.worldSize,
                    this.textureSize
                );
                if (i === 0) this.ctx.moveTo(px, py);
                else this.ctx.lineTo(px, py);
            }

            this.ctx.stroke();
        }

        this.texture.needsUpdate = true;
    }

    sampleWorld(x, z) {
        if (!this.center || !this.ctx || typeof this.ctx.getImageData !== 'function') return null;
        const [px, py] = this.projectWorldToOverlay(x, z);
        const sx = clamp(Math.round(px), 0, this.textureSize - 1);
        const sy = clamp(Math.round(py), 0, this.textureSize - 1);
        const pixel = this.ctx.getImageData(sx, sy, 1, 1).data;
        return {
            x: sx,
            y: sy,
            rgba: [pixel[0], pixel[1], pixel[2], pixel[3]]
        };
    }

    projectWorldToOverlay(x, z) {
        if (!this.center) return null;
        return worldToOverlay(x, z, this.center.x, this.center.z, this.worldSize, this.textureSize);
    }
}
