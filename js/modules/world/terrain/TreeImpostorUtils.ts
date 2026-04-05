// @ts-check

import * as THREE from 'three';

const OCT_EPSILON = 1e-6;

/**
 * @typedef {{ index: number, weight: number }} WeightedImpostorFrame
 * @typedef {{
 *   frameWeights: WeightedImpostorFrame[],
 *   primaryIndex: number,
 *   secondaryIndex: number,
 *   blend: number,
 *   encodedUv: THREE.Vector2
 * }} WeightedImpostorFrameSelection
 */

/**
 * @param {THREE.Vector3 | { x: number, y: number, z: number }} vector
 */
export function encodeOctahedralDirection(vector) {
    const length = Math.abs(vector.x) + Math.abs(vector.y) + Math.abs(vector.z);
    if (!Number.isFinite(length) || length <= OCT_EPSILON) {
        return new THREE.Vector2(0.5, 0.5);
    }

    let x = vector.x / length;
    let y = vector.y / length;
    let z = vector.z / length;
    if (y < 0.0) {
        const foldedX = (1.0 - Math.abs(z)) * Math.sign(x || 1.0);
        const foldedZ = (1.0 - Math.abs(x)) * Math.sign(z || 1.0);
        x = foldedX;
        z = foldedZ;
    }

    return new THREE.Vector2(x * 0.5 + 0.5, z * 0.5 + 0.5);
}

/**
 * @param {THREE.Vector2 | { x: number, y: number }} encoded
 */
export function decodeOctahedralDirection(encoded) {
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

export function buildOctahedralFrameDirections(gridSize = 4) {
    const size = Math.max(1, Math.floor(gridSize));
    /** @type {THREE.Vector3[]} */
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

/**
 * @param {THREE.Vector3 | { x: number, y: number, z: number }} direction
 * @param {number} gridCols
 * @param {number} gridRows
 */
export function findWeightedImpostorFrames(direction, gridCols, gridRows) {
    const view = new THREE.Vector3(direction.x, direction.y, direction.z);
    if (view.lengthSq() <= OCT_EPSILON) {
        return {
            frameWeights: [{ index: 0, weight: 1 }],
            primaryIndex: 0,
            secondaryIndex: 0,
            blend: 0,
            encodedUv: new THREE.Vector2(0.5, 0.5)
        };
    }
    view.normalize();

    const cols = Math.max(1, Math.floor(gridCols) || 1);
    const rows = Math.max(1, Math.floor(gridRows) || 1);
    const encodedUv = encodeOctahedralDirection(view);
    const sampleX = THREE.MathUtils.clamp(encodedUv.x * cols - 0.5, 0, Math.max(0, cols - 1));
    const sampleY = THREE.MathUtils.clamp(encodedUv.y * rows - 0.5, 0, Math.max(0, rows - 1));
    const x0 = Math.floor(sampleX);
    const y0 = Math.floor(sampleY);
    const x1 = Math.min(cols - 1, x0 + 1);
    const y1 = Math.min(rows - 1, y0 + 1);
    const tx = sampleX - x0;
    const ty = sampleY - y0;

    /** @type {[number, number, number][]} */
    const candidates = [
        [x0, y0, (1.0 - tx) * (1.0 - ty)],
        [x1, y0, tx * (1.0 - ty)],
        [x0, y1, (1.0 - tx) * ty],
        [x1, y1, tx * ty]
    ];

    /** @type {Map<number, number>} */
    const mergedWeights = new Map();
    for (const [col, row, weight] of candidates) {
        if (weight <= OCT_EPSILON) continue;
        const index = row * cols + col;
        mergedWeights.set(index, (mergedWeights.get(index) || 0) + weight);
    }

    /** @type {WeightedImpostorFrame[]} */
    const frameWeights = [...mergedWeights.entries()]
        .map(([index, weight]) => ({ index, weight }))
        .sort((a, b) => b.weight - a.weight);

    if (frameWeights.length === 0) {
        return {
            frameWeights: [{ index: 0, weight: 1 }],
            primaryIndex: 0,
            secondaryIndex: 0,
            blend: 0,
            encodedUv
        };
    }

    const totalWeight = frameWeights.reduce((sum, entry) => sum + entry.weight, 0) || 1;
    for (const entry of frameWeights) {
        entry.weight /= totalWeight;
    }

    const primaryIndex = frameWeights[0]?.index ?? 0;
    const secondaryIndex = frameWeights[1]?.index ?? primaryIndex;
    const primaryWeight = frameWeights[0]?.weight ?? 1;
    const secondaryWeight = frameWeights[1]?.weight ?? 0;
    const blend = secondaryIndex === primaryIndex
        ? 0
        : THREE.MathUtils.clamp(secondaryWeight / Math.max(OCT_EPSILON, primaryWeight + secondaryWeight), 0, 1);

    return {
        frameWeights,
        primaryIndex,
        secondaryIndex,
        blend,
        encodedUv
    };
}

/**
 * @param {THREE.Vector3 | { x: number, y: number, z: number }} direction
 * @param {ArrayLike<THREE.Vector3 | { x: number, y: number, z: number }>} frameDirections
 */
export function findTwoNearestImpostorFrames(direction, frameDirections) {
    const view = new THREE.Vector3(direction.x, direction.y, direction.z);
    if (view.lengthSq() <= OCT_EPSILON) {
        return { primaryIndex: 0, secondaryIndex: 0, blend: 0 };
    }
    view.normalize();

    let bestIndex = 0;
    let secondIndex = 0;
    let bestDot = -Infinity;
    let secondDot = -Infinity;

    for (let index = 0; index < frameDirections.length; index += 1) {
        const frame = frameDirections[index];
        const dot = view.x * frame.x + view.y * frame.y + view.z * frame.z;
        if (dot > bestDot) {
            secondDot = bestDot;
            secondIndex = bestIndex;
            bestDot = dot;
            bestIndex = index;
        } else if (dot > secondDot) {
            secondDot = dot;
            secondIndex = index;
        }
    }

    if (bestIndex === secondIndex) {
        return { primaryIndex: bestIndex, secondaryIndex: secondIndex, blend: 0 };
    }

    const total = Math.max(OCT_EPSILON, bestDot + secondDot);
    const blend = THREE.MathUtils.clamp(1.0 - (bestDot / total), 0.0, 1.0);
    return { primaryIndex: bestIndex, secondaryIndex: secondIndex, blend };
}
