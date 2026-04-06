// @ts-check

import * as THREE from 'three';

export const OCT_EPSILON = 1e-6;
export const DEFAULT_ELEVATED_THRESHOLD = 0.52;
export const DEFAULT_HIGH_CARDINAL_THRESHOLD = 0.82;
export const DEFAULT_CAPTURE_ORTHO_SCALE_MULTIPLIER = 1.9;
export const HORIZON_BAND = 'horizon';
export const ELEVATED_BAND = 'elevated';
export const HIGH_CARDINAL_BAND = 'high-cardinal';

function clamp01(value) {
    return THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function clampPositive(value, fallback = 1) {
    const nextValue = Number(value);
    return Number.isFinite(nextValue) && nextValue > OCT_EPSILON ? nextValue : fallback;
}

function normalizeContentRect(contentRect) {
    if (!contentRect || typeof contentRect !== 'object') return null;
    const x = clamp01(Number(contentRect.x));
    const y = clamp01(Number(contentRect.y));
    const maxWidth = Math.max(OCT_EPSILON, 1 - x);
    const maxHeight = Math.max(OCT_EPSILON, 1 - y);
    const widthValue = Number(contentRect.width);
    const heightValue = Number(contentRect.height);
    const width = THREE.MathUtils.clamp(Number.isFinite(widthValue) ? widthValue : 1, OCT_EPSILON, maxWidth);
    const height = THREE.MathUtils.clamp(Number.isFinite(heightValue) ? heightValue : 1, OCT_EPSILON, maxHeight);
    return { x, y, width, height };
}

function decodeOctahedralDirection(encoded) {
    let x = encoded.x * 2.0 - 1.0;
    let z = encoded.y * 2.0 - 1.0;
    let y = 1.0 - Math.abs(x) - Math.abs(z);

    if (y < 0.0) {
        const unfoldedX = (1.0 - Math.abs(z)) * Math.sign(x || 1.0);
        const unfoldedZ = (1.0 - Math.abs(x)) * Math.sign(z || 1.0);
        x = unfoldedX;
        z = unfoldedZ;
    }

    return new THREE.Vector3(x, y, z).normalize();
}

function buildDirectionFromYawPitch(yawDeg, pitchDeg) {
    const yaw = THREE.MathUtils.degToRad(yawDeg);
    const pitch = THREE.MathUtils.degToRad(pitchDeg);
    const cosPitch = Math.cos(pitch);
    return new THREE.Vector3(
        Math.sin(yaw) * cosPitch,
        Math.sin(pitch),
        Math.cos(yaw) * cosPitch
    ).normalize();
}

function normalizeDirection(direction) {
    if (direction instanceof THREE.Vector3) return direction.clone().normalize();
    if (Array.isArray(direction)) {
        return new THREE.Vector3(
            Number(direction[0]) || 0,
            Number(direction[1]) || 0,
            Number(direction[2]) || 0
        ).normalize();
    }
    if (direction && typeof direction === 'object') {
        return new THREE.Vector3(
            Number(direction.x) || 0,
            Number(direction.y) || 0,
            Number(direction.z) || 0
        ).normalize();
    }
    return new THREE.Vector3(0, 1, 0);
}

function normalizeFrameBand(frameBand) {
    if (frameBand === ELEVATED_BAND || frameBand === HIGH_CARDINAL_BAND) {
        return frameBand;
    }
    return HORIZON_BAND;
}

export function buildOctahedralFrameDirections(gridSize = 4) {
    const size = Math.max(1, Math.floor(gridSize));
    const directions = [];
    for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
            directions.push(decodeOctahedralDirection({
                x: (col + 0.5) / size,
                y: (row + 0.5) / size
            }));
        }
    }
    return directions;
}

export function buildSilhouetteFriendlyFrameLayout() {
    const spec = [
        [-135, 0, HORIZON_BAND],
        [180, 0, HORIZON_BAND],
        [135, 0, HORIZON_BAND],
        [90, 0, HORIZON_BAND],
        [45, 0, HORIZON_BAND],
        [0, 0, HORIZON_BAND],
        [-45, 0, HORIZON_BAND],
        [-90, 0, HORIZON_BAND],
        [-135, 38, ELEVATED_BAND],
        [135, 38, ELEVATED_BAND],
        [45, 38, ELEVATED_BAND],
        [-45, 38, ELEVATED_BAND],
        [180, 62, HIGH_CARDINAL_BAND],
        [90, 62, HIGH_CARDINAL_BAND],
        [0, 62, HIGH_CARDINAL_BAND],
        [-90, 62, HIGH_CARDINAL_BAND]
    ];
    return {
        directions: spec.map(([yaw, pitch]) => buildDirectionFromYawPitch(yaw, pitch)),
        frameBands: spec.map(([, , band]) => band),
        viewBlendMode: 'direction-weighted',
        elevatedThreshold: DEFAULT_ELEVATED_THRESHOLD,
        highCardinalThreshold: DEFAULT_HIGH_CARDINAL_THRESHOLD,
        gridCols: 4,
        gridRows: 4
    };
}

export function resolveTreeImpostorFraming(metadata) {
    const boundsMin = Array.isArray(metadata?.boundsMin) ? metadata.boundsMin : [-0.5, 0, -0.5];
    const boundsMax = Array.isArray(metadata?.boundsMax) ? metadata.boundsMax : [0.5, 1, 0.5];
    const width = Math.max(0, Number(boundsMax[0]) - Number(boundsMin[0])) || 0;
    const height = Math.max(0, Number(boundsMax[1]) - Number(boundsMin[1])) || 0;
    const depth = Math.max(0, Number(boundsMax[2]) - Number(boundsMin[2])) || 0;
    const legacyCaptureOrthoScale = clampPositive(
        Math.max(width, height, depth, 1) * DEFAULT_CAPTURE_ORTHO_SCALE_MULTIPLIER,
        1
    );
    const captureOrthoScale = clampPositive(metadata?.captureOrthoScale, legacyCaptureOrthoScale);
    const explicitContentRect = normalizeContentRect(metadata?.contentRect);
    const derivedWidthRatio = THREE.MathUtils.clamp(Math.max(width, depth) / captureOrthoScale, OCT_EPSILON, 1);
    const derivedHeightRatio = THREE.MathUtils.clamp(height / captureOrthoScale, OCT_EPSILON, 1);
    const contentRect = explicitContentRect || {
        x: (1 - derivedWidthRatio) * 0.5,
        y: (1 - derivedHeightRatio) * 0.5,
        width: derivedWidthRatio,
        height: derivedHeightRatio
    };
    const padding = {
        left: clamp01(contentRect.x),
        right: clamp01(1 - (contentRect.x + contentRect.width)),
        bottom: clamp01(contentRect.y),
        top: clamp01(1 - (contentRect.y + contentRect.height))
    };
    return {
        captureOrthoScale,
        contentRect,
        visibleWidthRatio: contentRect.width,
        visibleHeightRatio: contentRect.height,
        padding,
        occupiedBounds: {
            width,
            height,
            depth
        }
    };
}

export function normalizeTreeImpostorMetadata(metadata) {
    const source = metadata && typeof metadata === 'object' ? metadata : {};
    const fallbackLayout = buildSilhouetteFriendlyFrameLayout();
    const gridColsHint = Math.max(1, Number(source?.grid?.cols) || 4);
    const gridRowsHint = Math.max(1, Number(source?.grid?.rows) || gridColsHint);
    const frameCountHint = Math.max(1, Number(source?.frameCount) || (gridColsHint * gridRowsHint) || 1);
    const hasExplicitFrameBands = Array.isArray(source?.frameBands) && source.frameBands.length > 0;
    const isDirectionWeighted = source?.viewBlendMode === 'direction-weighted' || hasExplicitFrameBands;

    let directions = Array.isArray(source?.directions) && source.directions.length > 0
        ? source.directions.map((direction) => normalizeDirection(direction))
        : [];
    if (directions.length === 0) {
        if (isDirectionWeighted && frameCountHint === fallbackLayout.directions.length) {
            directions = fallbackLayout.directions.map((direction) => direction.clone());
        } else {
            directions = buildOctahedralFrameDirections(Math.max(gridColsHint, Math.round(Math.sqrt(frameCountHint)) || 1));
        }
    }

    const frameCount = directions.length;
    const gridCols = Math.max(1, Number(source?.grid?.cols) || Math.round(Math.sqrt(frameCount)) || 1);
    const gridRows = Math.max(1, Number(source?.grid?.rows) || Math.round(Math.sqrt(frameCount)) || 1);
    const shouldUseDirectionWeightedFallback = isDirectionWeighted && frameCount === fallbackLayout.frameBands.length;

    let frameBands = Array.isArray(source?.frameBands) && source.frameBands.length === frameCount
        ? source.frameBands.map((frameBand) => normalizeFrameBand(frameBand))
        : [];
    if (frameBands.length !== frameCount) {
        frameBands = shouldUseDirectionWeightedFallback
            ? [...fallbackLayout.frameBands]
            : new Array(frameCount).fill(HORIZON_BAND);
    }

    const elevatedThreshold = Number.isFinite(source?.elevatedThreshold)
        ? Number(source.elevatedThreshold)
        : DEFAULT_ELEVATED_THRESHOLD;
    const highCardinalThreshold = Number.isFinite(source?.highCardinalThreshold)
        ? Math.max(elevatedThreshold + 0.01, Number(source.highCardinalThreshold))
        : DEFAULT_HIGH_CARDINAL_THRESHOLD;
    const framing = resolveTreeImpostorFraming(source);

    return {
        ...source,
        directions,
        frameCount,
        grid: {
            cols: gridCols,
            rows: gridRows
        },
        frameBands,
        viewBlendMode: isDirectionWeighted ? 'direction-weighted' : (source?.viewBlendMode || 'grid-bilinear'),
        elevatedThreshold,
        highCardinalThreshold,
        normalSpace: source?.normalSpace === 'object' ? 'object' : 'frame-local',
        depthEncoding: source?.depthEncoding || 'orthographic-normalized',
        depthRange: {
            near: Number(source?.depthRange?.near) || 0,
            far: Number(source?.depthRange?.far) || 1
        },
        captureOrthoScale: framing.captureOrthoScale,
        contentRect: framing.contentRect,
        visibleWidthRatio: framing.visibleWidthRatio,
        visibleHeightRatio: framing.visibleHeightRatio,
        padding: framing.padding,
        occupiedBounds: framing.occupiedBounds
    };
}
