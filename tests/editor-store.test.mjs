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
            terrainEdits: [{ kind: 'raise', x: 100, z: 100, radius: 150, delta: 40 }],
            airports: [{ template: 'default', x: 2200, z: -1800, yaw: 30 }],
            authoredObjects: [{ assetId: 'lighthouse', x: -300, z: 800, y: 12, heightMode: 'terrain', yaw: 45, scale: 1.2 }]
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

test('commands can create authored objects with terrain and arbitrary height modes', () => {
    const document = createFixture();
    const createResult = applyEditorCommand(document, {
        type: 'create-authored-object',
        center: { x: 600, z: -900 },
        assetId: 'oil-rig',
        heightMode: 'absolute',
        y: 240,
        yaw: 90,
        scale: 1.5
    });

    const created = createResult.document.worldData.authoredObjects.at(-1);
    assert.equal(createResult.document.worldData.authoredObjects.length, 2);
    assert.equal(created.assetId, 'oil-rig');
    assert.equal(created.heightMode, 'absolute');
    assert.equal(created.y, 240);
    assert.equal(created.yaw, 90);
    assert.equal(created.scale, 1.5);
    assert.ok(createResult.selectionId);
});

test('commands can create and rotate airports', () => {
    const document = createFixture();
    const createResult = applyEditorCommand(document, {
        type: 'create-airport',
        center: { x: -2400, z: 3100 },
        yaw: -45
    });

    const created = createResult.document.worldData.airports.at(-1);
    assert.equal(createResult.document.worldData.airports.length, 2);
    assert.equal(created.template, 'default');
    assert.equal(created.x, -2400);
    assert.equal(created.z, 3100);
    assert.equal(created.yaw, -45);
    assert.ok(created.bounds);
    assert.ok(createResult.selectionId);
});

test('airports support move, duplicate, delete, and yaw edits', () => {
    const document = createFixture();
    const airportId = document.worldData.airports[0].__editorId;

    const moved = applyEditorCommand(document, {
        type: 'move-entity',
        entityId: airportId,
        nextPoint: { x: 2600, z: -1400 }
    });
    assert.equal(moved.document.worldData.airports[0].x, 2600);
    assert.equal(moved.document.worldData.airports[0].z, -1400);
    assert.ok(moved.document.worldData.airports[0].bounds);

    const rotated = applyEditorCommand(moved.document, {
        type: 'change-property',
        entityId: airportId,
        key: 'yaw',
        value: -75
    });
    assert.equal(rotated.document.worldData.airports[0].yaw, -75);
    assert.ok(rotated.document.worldData.airports[0].bounds);

    const duplicated = applyEditorCommand(rotated.document, {
        type: 'duplicate-entity',
        entityId: airportId
    });
    assert.equal(duplicated.document.worldData.airports.length, 2);
    assert.deepEqual(
        duplicated.document.worldData.airports.map(({ x, z, yaw, template }) => ({ x, z, yaw, template })),
        [
            { x: 2600, z: -1400, yaw: -75, template: 'default' },
            { x: 3000, z: -1000, yaw: -75, template: 'default' }
        ]
    );

    const deleted = applyEditorCommand(duplicated.document, {
        type: 'delete-entity',
        entityId: duplicated.selectionId
    });
    assert.equal(deleted.document.worldData.airports.length, 1);
    assert.equal(deleted.document.worldData.airports[0].x, 2600);
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
    assert.equal(Object.hasOwn(mapPayload.airports[0], 'bounds'), false);
    assert.equal(Object.hasOwn(mapPayload.authoredObjects[0], '__editorId'), false);
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
