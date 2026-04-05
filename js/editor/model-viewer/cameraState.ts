import type { ModelViewerCameraState } from './types';

export const DEFAULT_CAMERA_STATE: ModelViewerCameraState = {
    cameraYaw: 28,
    cameraPitch: 12,
    cameraDistance: 5.8
};

export const CAMERA_LIMITS = {
    minPitch: -10,
    maxPitch: 85,
    minDistance: 2,
    maxDistance: 18
} as const;

export function clampCameraState(state: ModelViewerCameraState): ModelViewerCameraState {
    return {
        cameraYaw: normalizeYaw(state.cameraYaw),
        cameraPitch: clamp(state.cameraPitch, CAMERA_LIMITS.minPitch, CAMERA_LIMITS.maxPitch),
        cameraDistance: clamp(state.cameraDistance, CAMERA_LIMITS.minDistance, CAMERA_LIMITS.maxDistance)
    };
}

export function fitDistanceForRadius(radius: number, fovDegrees: number): number {
    const safeRadius = Math.max(radius, 0.5);
    const halfFov = (fovDegrees * Math.PI) / 360;
    const distance = safeRadius / Math.sin(Math.max(halfFov, 1e-3));
    return clamp(distance * 1.1, CAMERA_LIMITS.minDistance, CAMERA_LIMITS.maxDistance);
}

export function normalizeYaw(value: number) {
    let nextValue = value;
    while (nextValue > 180) nextValue -= 360;
    while (nextValue <= -180) nextValue += 360;
    return nextValue;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}
