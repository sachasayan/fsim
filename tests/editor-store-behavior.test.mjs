import test from 'node:test';
import assert from 'node:assert/strict';

import { createEditorDocument } from '../js/editor/core/document.js';
import { createEditorStore } from '../js/editor/core/store.js';

function createStore() {
    return createEditorStore(createEditorDocument(
        {
            districts: [],
            roads: [{ kind: 'road', surface: 'asphalt', width: 24, feather: 8, points: [[0, 0], [400, 0]] }],
            terrainEdits: []
        },
        {}
    ));
}

test('move-vertex preserves the active vertex while dragging', () => {
    const store = createStore();
    const roadId = store.getState().document.index.groupIds.roads[0];

    store.dispatch({ type: 'set-selection', selectedId: roadId });
    store.dispatch({ type: 'set-active-vertex', activeVertex: { entityId: roadId, index: 1 } });

    store.runCommand({
        type: 'move-vertex',
        entityId: roadId,
        vertexIndex: 1,
        point: { x: 450, z: 25 }
    }, { coalesceKey: `vertex:${roadId}:1` });

    const state = store.getState();
    assert.deepEqual(state.selection.activeVertex, { entityId: roadId, index: 1 });
    assert.deepEqual(state.document.worldData.roads[0].points[1], [450, 25]);
});

test('terrain lab config edits stay in draft state until apply', () => {
    const store = createStore();
    const originalSeed = store.getState().document.worldData.terrainGenerator.seed;

    store.dispatch({ type: 'set-terrain-generator-config', path: ['seed'], value: 22222 });

    assert.equal(store.getState().ui.terrainLab.draftConfig.seed, 22222);
    assert.equal(store.getState().document.worldData.terrainGenerator.seed, originalSeed);
});

test('apply-terrain-generator persists the draft config and marks the document dirty', () => {
    const store = createStore();

    store.dispatch({ type: 'set-terrain-generator-config', path: ['seed'], value: 33333 });
    store.dispatch({ type: 'apply-terrain-generator' });

    const state = store.getState();
    assert.equal(state.document.worldData.terrainGenerator.seed, 33333);
    assert.equal(state.history.dirty, true);
});

test('reset-terrain-generator restores the saved config', () => {
    const store = createStore();
    const savedSeed = store.getState().document.worldData.terrainGenerator.seed;

    store.dispatch({ type: 'set-terrain-generator-config', path: ['seed'], value: 44444 });
    store.dispatch({ type: 'reset-terrain-generator' });

    assert.equal(store.getState().ui.terrainLab.draftConfig.seed, savedSeed);
});
