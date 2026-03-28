import test from 'node:test';
import assert from 'node:assert/strict';

import {
    appendTerrainStrokePoint,
    createTerrainStroke,
    insertTerrainStrokePoint,
    moveTerrainStrokePoint,
    refreshTerrainEditGeometry,
    removeTerrainStrokePoint
} from '../js/modules/editor/terrainEdits.js';

function createTileManager() {
    const calls = [];
    return {
        calls,
        invalidateWorldRect(minX, minZ, maxX, maxZ) {
            calls.push({ minX, minZ, maxX, maxZ });
        }
    };
}

function isTerrainEdit(edit) {
    return ['raise', 'lower', 'flatten'].includes(edit?.kind);
}

test('createTerrainStroke builds raise strokes and invalidates their bounds', () => {
    const tileManager = createTileManager();
    const worldData = { terrainEdits: [] };

    const edit = createTerrainStroke({ x: 101.4, z: -49.6 }, {
        currentTool: 'terrain-raise',
        terrainBrush: { radius: 150, strength: 40 },
        sampleTerrainHeight: () => 123,
        worldData,
        tileManager
    });

    assert.equal(edit.kind, 'raise');
    assert.equal(edit.delta, 40);
    assert.deepEqual(edit.points, [[101, -50]]);
    assert.deepEqual(edit.bounds, { minX: -49, maxX: 251, minZ: -200, maxZ: 100 });
    assert.equal(worldData.terrainEdits.length, 1);
    assert.deepEqual(tileManager.calls, [{ minX: -49, minZ: -200, maxX: 251, maxZ: 100 }]);
});

test('createTerrainStroke builds flatten strokes with sampled target height and opacity', () => {
    const tileManager = createTileManager();
    const worldData = { terrainEdits: [] };

    const edit = createTerrainStroke({ x: 10, z: 20 }, {
        currentTool: 'terrain-flatten',
        terrainBrush: { radius: 90, strength: 0.35 },
        sampleTerrainHeight: () => 47.8,
        worldData,
        tileManager
    });

    assert.equal(edit.kind, 'flatten');
    assert.equal(edit.target_height, 48);
    assert.equal(edit.opacity, 0.35);
    assert.equal('delta' in edit, false);
});

test('appendTerrainStrokePoint rejects nearby points and otherwise invalidates old and new bounds', () => {
    const tileManager = createTileManager();
    const edit = {
        kind: 'raise',
        radius: 100,
        points: [[0, 0]]
    };
    refreshTerrainEditGeometry(edit);

    assert.equal(appendTerrainStrokePoint(edit, { x: 5, z: 0 }, { tileManager }), false);
    assert.deepEqual(tileManager.calls, []);

    assert.equal(appendTerrainStrokePoint(edit, { x: 100, z: 0 }, { tileManager }), true);
    assert.deepEqual(edit.points, [[0, 0], [100, 0]]);
    assert.deepEqual(tileManager.calls, [
        { minX: -100, minZ: -100, maxX: 100, maxZ: 100 },
        { minX: -100, minZ: -100, maxX: 200, maxZ: 100 }
    ]);
});

test('terrain stroke point edits update geometry and invalidate before and after the change', () => {
    const tileManager = createTileManager();
    const deps = { isTerrainEdit, tileManager };
    const edit = {
        kind: 'raise',
        radius: 80,
        points: [[0, 0], [100, 0]]
    };
    refreshTerrainEditGeometry(edit);

    moveTerrainStrokePoint(edit, 1, { x: 200, z: 40 }, deps);
    assert.deepEqual(edit.points, [[0, 0], [200, 40]]);
    assert.equal(edit.x, 100);
    assert.equal(edit.z, 20);

    insertTerrainStrokePoint(edit, 1, { x: 90, z: 10 }, deps);
    assert.deepEqual(edit.points, [[0, 0], [90, 10], [200, 40]]);

    assert.equal(removeTerrainStrokePoint(edit, 0, deps), true);
    assert.deepEqual(edit.points, [[90, 10], [200, 40]]);
    assert.equal(removeTerrainStrokePoint({ kind: 'raise', radius: 50, points: [[1, 2]] }, 0, deps), false);

    assert.deepEqual(tileManager.calls, [
        { minX: -80, minZ: -80, maxX: 180, maxZ: 80 },
        { minX: -80, minZ: -80, maxX: 280, maxZ: 120 },
        { minX: -80, minZ: -80, maxX: 280, maxZ: 120 },
        { minX: -80, minZ: -80, maxX: 280, maxZ: 120 },
        { minX: -80, minZ: -80, maxX: 280, maxZ: 120 },
        { minX: 10, minZ: -70, maxX: 280, maxZ: 120 }
    ]);
});
