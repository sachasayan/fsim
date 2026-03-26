import test from 'node:test';
import assert from 'node:assert/strict';

import {
    clampViewportToWorld,
    getTerrainEditBoundsById,
    invalidateChangedTerrainTiles,
    reconcileTerrainTileInvalidation
} from '../js/editor/canvas/controller.js';
import { DEFAULT_WORLD_SIZE } from '../js/modules/world/WorldConfig.js';
import { createEditorDocument } from '../js/editor/core/document.js';

function createDocumentWithTerrainEdits(terrainEdits, terrainGeneratorOverrides = {}) {
    return createEditorDocument({
        districts: [],
        roads: [],
        terrainEdits,
        terrainGenerator: {
            seed: 12345,
            preview: {
                overlay: 'height',
                resolution: 96,
                showContours: true,
                enabled: true,
                ...terrainGeneratorOverrides.preview
            },
            ...terrainGeneratorOverrides
        }
    }, {});
}

test('getTerrainEditBoundsById indexes terrain edit bounds by editor id', () => {
    const document = createDocumentWithTerrainEdits([
        {
            kind: 'raise',
            x: 0,
            z: 0,
            radius: 100,
            points: [[0, 0]],
            bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }
        }
    ]);

    const [editId] = document.index.groupIds.terrain;
    const boundsById = getTerrainEditBoundsById(document);
    assert.deepEqual(boundsById.get(editId), { minX: -100, maxX: 100, minZ: -100, maxZ: 100 });
});

test('invalidateChangedTerrainTiles invalidates only changed terrain edit regions', () => {
    const previousDocument = createDocumentWithTerrainEdits([
        {
            kind: 'raise',
            x: 0,
            z: 0,
            radius: 100,
            points: [[0, 0]],
            bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }
        },
        {
            kind: 'raise',
            x: 1000,
            z: 1000,
            radius: 50,
            points: [[1000, 1000]],
            bounds: { minX: 950, maxX: 1050, minZ: 950, maxZ: 1050 }
        }
    ]);

    const [movedId, untouchedId] = previousDocument.index.groupIds.terrain;
    const nextDocument = createDocumentWithTerrainEdits([
        {
            __editorId: movedId,
            kind: 'raise',
            x: 50,
            z: 50,
            radius: 100,
            points: [[50, 50]],
            bounds: { minX: -50, maxX: 150, minZ: -50, maxZ: 150 }
        },
        {
            __editorId: untouchedId,
            kind: 'raise',
            x: 1000,
            z: 1000,
            radius: 50,
            points: [[1000, 1000]],
            bounds: { minX: 950, maxX: 1050, minZ: 950, maxZ: 1050 }
        }
    ]);

    const calls = [];
    const tileManager = {
        invalidateWorldRect(minX, minZ, maxX, maxZ) {
            calls.push({ minX, minZ, maxX, maxZ });
        }
    };

    const nextBoundsById = invalidateChangedTerrainTiles(tileManager, getTerrainEditBoundsById(previousDocument), nextDocument);

    assert.deepEqual(calls, [
        { minX: -100, minZ: -100, maxX: 100, maxZ: 100 },
        { minX: -50, minZ: -50, maxX: 150, maxZ: 150 }
    ]);
    assert.deepEqual(nextBoundsById.get(movedId), { minX: -50, maxX: 150, minZ: -50, maxZ: 150 });
});

test('reconcileTerrainTileInvalidation invalidates all tiles when terrain lab config version changes', () => {
    const document = createDocumentWithTerrainEdits([]);
    const tileManager = {
        invalidateWorldRectCalls: [],
        invalidateAllCalls: 0,
        invalidateWorldRect(minX, minZ, maxX, maxZ) {
            this.invalidateWorldRectCalls.push({ minX, minZ, maxX, maxZ });
        },
        invalidateAll() {
            this.invalidateAllCalls += 1;
        }
    };

    const nextState = {
        document,
        ui: {
            terrainLab: {
                configVersion: 2
            }
        }
    };

    const result = reconcileTerrainTileInvalidation({
        tileManager,
        previousDocumentRef: document,
        previousTerrainEditBoundsById: new Map(),
        previousTerrainLabVersion: 1,
        nextState
    });

    assert.equal(tileManager.invalidateAllCalls, 1);
    assert.deepEqual(tileManager.invalidateWorldRectCalls, []);
    assert.equal(result.previousTerrainLabVersion, 2);
    assert.equal(result.previousDocumentRef, document);
});

test('clampViewportToWorld prevents zooming out past the world extents', () => {
    const viewport = clampViewportToWorld(
        { x: 0, z: 0, zoom: 0.001 },
        { width: 1600, height: 900 }
    );

    assert.equal(viewport.zoom, 1600 / DEFAULT_WORLD_SIZE);
    assert.equal(viewport.x, 0);
    assert.equal(viewport.z, 0);
});

test('clampViewportToWorld keeps the camera center inside the visible world bounds', () => {
    const viewport = clampViewportToWorld(
        { x: 50000, z: -50000, zoom: 0.02 },
        { width: 1200, height: 800 }
    );

    assert.equal(viewport.zoom, 0.02);
    assert.equal(viewport.x, 20000);
    assert.equal(viewport.z, -30000);
});
