import test from 'node:test';
import assert from 'node:assert/strict';

import { createEditorDocument } from '../js/editor/core/document.js';
import { createEditorStore } from '../js/editor/core/store.js';

function createStore() {
    return createEditorStore(createEditorDocument(
        {
            districts: [{
                district_type: 'commercial',
                center: [0, 0],
                radius: 500,
                points: [[-500, -500], [500, -500], [500, 500], [-500, 500]]
            }],
            roads: [{
                kind: 'road',
                surface: 'asphalt',
                width: 24,
                feather: 8,
                points: [[0, 0], [400, 0]]
            }],
            terrainRegions: [{
                tileX: 2,
                tileZ: 3,
                tileWidth: 2,
                tileHeight: 2,
                terrainGenerator: { seed: 12345 }
            }],
            terrainEdits: [],
            airports: [],
            authoredObjects: [],
            terrainGenerator: {
                seed: 12345,
                preview: {
                    overlay: 'height',
                    resolution: 96,
                    showContours: true,
                    enabled: true
                }
            }
        },
        {
            gateA: { x: 1000, y: 120, z: 2000, tilt: 45 }
        }
    ));
}

test('undo and redo restore document state and selection snapshots', () => {
    const store = createStore();
    const districtId = store.getState().document.index.groupIds.districts[0];

    store.dispatch({ type: 'set-selection', selectedId: districtId });
    store.runCommand({
        type: 'change-property',
        entityId: districtId,
        key: 'district_type',
        value: 'industrial'
    });

    let state = store.getState();
    assert.equal(state.document.worldData.districts[0].district_type, 'industrial');
    assert.equal(state.selection.selectedId, districtId);
    assert.equal(store.canUndo(), true);
    assert.equal(store.canRedo(), false);

    store.dispatch({ type: 'undo' });
    state = store.getState();
    assert.equal(state.document.worldData.districts[0].district_type, 'commercial');
    assert.equal(state.selection.selectedId, districtId);
    assert.equal(store.canUndo(), false);
    assert.equal(store.canRedo(), true);

    store.dispatch({ type: 'redo' });
    state = store.getState();
    assert.equal(state.document.worldData.districts[0].district_type, 'industrial');
    assert.equal(state.selection.selectedId, districtId);
    assert.equal(store.canUndo(), true);
    assert.equal(store.canRedo(), false);
});

test('coalesced move commands keep one undo snapshot and clear redo after a new edit', () => {
    const store = createStore();
    const roadId = store.getState().document.index.groupIds.roads[0];

    store.dispatch({ type: 'set-selection', selectedId: roadId });
    store.dispatch({ type: 'set-active-vertex', activeVertex: { entityId: roadId, index: 1 } });

    store.runCommand({
        type: 'move-vertex',
        entityId: roadId,
        vertexIndex: 1,
        point: { x: 420, z: 10 }
    }, { coalesceKey: `vertex:${roadId}:1` });
    store.runCommand({
        type: 'move-vertex',
        entityId: roadId,
        vertexIndex: 1,
        point: { x: 460, z: 20 }
    }, { coalesceKey: `vertex:${roadId}:1` });

    let state = store.getState();
    assert.equal(state.history.undoStack.length, 1);
    assert.deepEqual(state.selection.activeVertex, { entityId: roadId, index: 1 });
    assert.deepEqual(state.document.worldData.roads[0].points[1], [460, 20]);

    store.dispatch({ type: 'undo' });
    state = store.getState();
    assert.deepEqual(state.document.worldData.roads[0].points[1], [400, 0]);
    assert.equal(state.history.redoStack.length, 1);

    store.runCommand({
        type: 'change-property',
        entityId: roadId,
        key: 'width',
        value: 30
    });

    state = store.getState();
    assert.equal(state.document.worldData.roads[0].width, 30);
    assert.equal(state.history.redoStack.length, 0);
    assert.equal(store.canRedo(), false);
});

test('layer visibility and locking toggles flip state per group and item', () => {
    const store = createStore();
    const districtId = store.getState().document.index.groupIds.districts[0];

    store.dispatch({ type: 'toggle-group-visible', groupId: 'districts' });
    store.dispatch({ type: 'toggle-group-lock', groupId: 'districts' });
    store.dispatch({ type: 'toggle-group-collapse', groupId: 'districts' });
    store.dispatch({ type: 'toggle-item-visible', itemId: districtId });
    store.dispatch({ type: 'toggle-item-lock', itemId: districtId });

    let state = store.getState();
    assert.equal(state.layers.groupVisibility.districts, false);
    assert.equal(state.layers.groupLocked.districts, true);
    assert.equal(state.layers.collapsed.districts, true);
    assert.equal(state.layers.itemVisibility[districtId], false);
    assert.equal(state.layers.itemLocked[districtId], true);

    store.dispatch({ type: 'toggle-group-visible', groupId: 'districts' });
    store.dispatch({ type: 'toggle-group-lock', groupId: 'districts' });
    store.dispatch({ type: 'toggle-group-collapse', groupId: 'districts' });
    store.dispatch({ type: 'toggle-item-visible', itemId: districtId });
    store.dispatch({ type: 'toggle-item-lock', itemId: districtId });

    state = store.getState();
    assert.equal(state.layers.groupVisibility.districts, true);
    assert.equal(state.layers.groupLocked.districts, false);
    assert.equal(state.layers.collapsed.districts, false);
    assert.equal(state.layers.itemVisibility[districtId], true);
    assert.equal(state.layers.itemLocked[districtId], false);
});
