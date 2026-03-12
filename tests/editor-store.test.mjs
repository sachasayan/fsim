import test from 'node:test';
import assert from 'node:assert/strict';

import { applyEditorCommand, nudgeEntityCommand, snapWorldPoint } from '../js/editor/core/commands.js';
import {
    createEditorDocument,
    resolveSelectionAfterReload,
    serializeEditorDocument
} from '../js/editor/core/document.js';

function createFixture() {
    return createEditorDocument(
        {
            cities: [{ id: 'alpha', center: [0, 0] }],
            districts: [{ district_type: 'commercial', center: [0, 0], radius: 500, points: [[-500, -500], [500, -500], [500, 500], [-500, 500]], city_id: 'alpha' }],
            roads: [{ kind: 'road', surface: 'asphalt', width: 24, feather: 8, points: [[0, 0], [400, 0]] }],
            terrainEdits: [{ kind: 'raise', x: 100, z: 100, radius: 150, delta: 40 }]
        },
        {
            gateA: { x: 1000, y: 120, z: 2000, tilt: 45 }
        }
    );
}

test('createEditorDocument assigns stable editor ids and preserves them on reload', () => {
    const document = createFixture();
    const selectedId = document.worldData.roads[0].__editorId;
    const reloaded = createEditorDocument(document.worldData, document.vantageData, document);

    assert.equal(resolveSelectionAfterReload(document, reloaded, selectedId), selectedId);
    assert.ok(reloaded.index.entitiesById.has(selectedId));
});

test('commands can create and delete editable entities', () => {
    const document = createFixture();
    const createResult = applyEditorCommand(document, {
        type: 'create-road',
        center: { x: 600, z: 600 }
    });
    assert.equal(createResult.document.worldData.roads.length, 2);
    assert.ok(createResult.selectionId);

    const deleteResult = applyEditorCommand(createResult.document, {
        type: 'delete-entity',
        entityId: createResult.selectionId
    });
    assert.equal(deleteResult.document.worldData.roads.length, 1);
});

test('serializeEditorDocument strips editor metadata from payloads', () => {
    const document = createFixture();
    const { mapPayload, vantagePayload } = serializeEditorDocument(document);

    assert.equal(Object.hasOwn(mapPayload.cities[0], '__editorId'), false);
    assert.equal(Object.hasOwn(vantagePayload.gateA, '__editorId'), false);
});

test('snapWorldPoint honors snapping toggle', () => {
    assert.deepEqual(snapWorldPoint({ x: 149, z: 251 }, true, true), { x: 100, z: 300 });
    assert.deepEqual(snapWorldPoint({ x: 149, z: 251 }, false, true), { x: 149, z: 251 });
});

test('nudgeEntityCommand nudges entities and active vertices', () => {
    const document = createFixture();
    const roadId = document.worldData.roads[0].__editorId;
    const moveRoad = nudgeEntityCommand(document, roadId, { x: 100, z: -100 });
    assert.deepEqual(moveRoad.nextCenter, [300, -100]);

    const moveVertex = nudgeEntityCommand(document, roadId, { x: 20, z: 0 }, { entityId: roadId, index: 1 });
    assert.deepEqual(moveVertex.point, { x: 420, z: 0 });
});
