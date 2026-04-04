// @ts-check

import * as THREE from 'three';

const MAX_TILE_SIZE = 64;
const TILE_BORDER = 1;
const TILE_PITCH = MAX_TILE_SIZE + (TILE_BORDER * 2);
const GRID_SIZE = 16;
const ATLAS_SIZE = TILE_PITCH * GRID_SIZE;

function copyPixel(data: Uint8Array, width: number, srcX: number, srcY: number, destX: number, destY: number) {
    const srcOffset = ((srcY * width) + srcX) * 4;
    const destOffset = ((destY * ATLAS_SIZE) + destX) * 4;
    data[destOffset] = data[srcOffset];
    data[destOffset + 1] = data[srcOffset + 1];
    data[destOffset + 2] = data[srcOffset + 2];
    data[destOffset + 3] = data[srcOffset + 3];
}

export function createWaterDepthAtlas() {
    const atlasData = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
    const atlasTexture = new THREE.DataTexture(atlasData, ATLAS_SIZE, ATLAS_SIZE, THREE.RGBAFormat);
    atlasTexture.colorSpace = THREE.NoColorSpace;
    atlasTexture.wrapS = THREE.ClampToEdgeWrapping;
    atlasTexture.wrapT = THREE.ClampToEdgeWrapping;
    atlasTexture.minFilter = THREE.LinearFilter;
    atlasTexture.magFilter = THREE.LinearFilter;
    atlasTexture.generateMipmaps = false;
    atlasTexture.needsUpdate = true;

    const freeSlots = [];
    let allocationCount = 0;
    let reuseCount = 0;
    for (let index = (GRID_SIZE * GRID_SIZE) - 1; index >= 0; index -= 1) {
        freeSlots.push(index);
    }

    /**
     * @param {{ data?: Uint8Array, size?: number } | null | undefined} payload
     * @returns {{ index: number; texture: THREE.DataTexture; uvMin: THREE.Vector2; uvMax: THREE.Vector2; size: number } | null}
     */
    function allocate(payload) {
        if (!payload?.data || !Number.isFinite(payload.size)) return null;
        const sourceSize = Math.max(1, Math.min(MAX_TILE_SIZE, Math.floor(payload.size)));
        allocationCount += 1;
        const slotIndex = freeSlots.pop();
        if (!Number.isInteger(slotIndex)) {
            throw new Error('Water depth atlas exhausted available slots');
        }
        if (freeSlots.length < (GRID_SIZE * GRID_SIZE) - 1) {
            reuseCount += 1;
        }

        const slotX = (slotIndex % GRID_SIZE) * TILE_PITCH;
        const slotY = Math.floor(slotIndex / GRID_SIZE) * TILE_PITCH;
        const innerX = slotX + TILE_BORDER;
        const innerY = slotY + TILE_BORDER;
        const sourceData = payload.data;

        for (let row = 0; row < sourceSize; row += 1) {
            const sourceRowStart = row * sourceSize * 4;
            const destRowStart = ((innerY + row) * ATLAS_SIZE + innerX) * 4;
            atlasData.set(sourceData.subarray(sourceRowStart, sourceRowStart + (sourceSize * 4)), destRowStart);
            copyPixel(sourceData, sourceSize, 0, row, slotX, innerY + row);
            copyPixel(sourceData, sourceSize, sourceSize - 1, row, innerX + sourceSize, innerY + row);
        }

        for (let col = 0; col < sourceSize; col += 1) {
            copyPixel(sourceData, sourceSize, col, 0, innerX + col, slotY);
            copyPixel(sourceData, sourceSize, col, sourceSize - 1, innerX + col, innerY + sourceSize);
        }

        copyPixel(sourceData, sourceSize, 0, 0, slotX, slotY);
        copyPixel(sourceData, sourceSize, sourceSize - 1, 0, innerX + sourceSize, slotY);
        copyPixel(sourceData, sourceSize, 0, sourceSize - 1, slotX, innerY + sourceSize);
        copyPixel(sourceData, sourceSize, sourceSize - 1, sourceSize - 1, innerX + sourceSize, innerY + sourceSize);

        atlasTexture.needsUpdate = true;

        const uvMin = new THREE.Vector2(
            (innerX + 0.5) / ATLAS_SIZE,
            (innerY + 0.5) / ATLAS_SIZE
        );
        const uvMax = new THREE.Vector2(
            (innerX + sourceSize - 0.5) / ATLAS_SIZE,
            (innerY + sourceSize - 0.5) / ATLAS_SIZE
        );

        return {
            index: slotIndex,
            texture: atlasTexture,
            uvMin,
            uvMax,
            size: sourceSize
        };
    }

    /**
     * @param {{ index?: number | null } | null | undefined} slot
     */
    function release(slot) {
        if (!slot || !Number.isInteger(slot.index)) return;
        freeSlots.push(slot.index);
    }

    return {
        texture: atlasTexture,
        atlasSize: ATLAS_SIZE,
        maxTileSize: MAX_TILE_SIZE,
        freeSlotCount: () => freeSlots.length,
        totalSlotCount: GRID_SIZE * GRID_SIZE,
        allocatedSlotCount: () => (GRID_SIZE * GRID_SIZE) - freeSlots.length,
        uploadCount: () => allocationCount,
        reuseCount: () => reuseCount,
        allocate,
        release
    };
}
