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
            districts: [{ district_type: 'commercial', center: [0, 0], radius: 500, points: [[-500, -500], [500, -500], [500, 500], [-500, 500]] }],
            roads: [{ kind: 'road', surface: 'asphalt', width: 24, feather: 8, points: [[0, 0], [400, 0]] }],
            terrainRegions: [{ tileX: 4, tileZ: 5, tileWidth: 2, tileHeight: 3, terrainGenerator: { seed: 24680 } }],
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

test('commands can create terrain regions and block overlap', () => {
    const document = createFixture();
    const createResult = applyEditorCommand(document, {
        type: 'create-terrain-region',
        tileX: 10,
        tileZ: 10,
        tileWidth: 2,
        tileHeight: 2,
        terrainGenerator: { seed: 13579 }
    });
    assert.equal(createResult.document.worldData.terrainRegions.length, 2);
    assert.ok(createResult.selectionId);

    assert.throws(() => applyEditorCommand(createResult.document, {
        type: 'create-terrain-region',
        tileX: 11,
        tileZ: 11,
        tileWidth: 1,
        tileHeight: 1,
        terrainGenerator: { seed: 97531 }
    }), /already belong to another terrain region/);
});

test('serializeEditorDocument strips editor metadata from payloads', () => {
    const document = createFixture();
    const { mapPayload, vantagePayload } = serializeEditorDocument(document);

    assert.equal(Object.hasOwn(mapPayload.districts[0], '__editorId'), false);
    assert.equal(Object.hasOwn(mapPayload.terrainRegions[0], '__editorId'), false);
    assert.equal(Object.hasOwn(mapPayload.terrainRegions[0], 'bounds'), false);
    assert.equal(Object.hasOwn(vantagePayload.gateA, '__editorId'), false);
});

test('legacy city-authored data is flattened and city metadata is removed', () => {
    const document = createEditorDocument(
        {
            cities: [{ id: 'alpha', center: [0, 0], districts: [{ district_type: 'commercial', center: [0, 0], radius: 500, points: [[-500, -500], [500, -500], [500, 500], [-500, 500]] }] }],
            districts: []
        },
        {}
    );

    const { mapPayload } = serializeEditorDocument(document);
    assert.equal(mapPayload.cities, undefined);
    assert.equal(mapPayload.districts.length, 1);
    assert.equal(mapPayload.districts[0].city_id, undefined);
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

test('changing a district to windmill_farm applies default props and persists custom values', () => {
    const document = createFixture();
    const districtId = document.worldData.districts[0].__editorId;

    const typed = applyEditorCommand(document, {
        type: 'change-property',
        entityId: districtId,
        key: 'district_type',
        value: 'windmill_farm'
    });

    const district = typed.document.worldData.districts[0];
    assert.equal(district.district_type, 'windmill_farm');
    assert.equal(district.turbine_density, 0.5);
    assert.equal(district.rotor_radius, 22);
    assert.equal(district.setback, 90);

    const tuned = applyEditorCommand(typed.document, {
        type: 'change-property',
        entityId: districtId,
        key: 'turbine_density',
        value: 0.8
    });
    const reloaded = createEditorDocument(tuned.document.worldData, tuned.document.vantageData, tuned.document);

    assert.equal(reloaded.worldData.districts[0].turbine_density, 0.8);
    assert.equal(reloaded.worldData.districts[0].district_type, 'windmill_farm');
});
