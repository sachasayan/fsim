import test from 'node:test';
import assert from 'node:assert/strict';

import { createEditorDocument } from '../js/editor/core/document.js';
import { findObjectsAtWorldPos } from '../js/editor/canvas/render.js';
import { transformAirportPoint } from '../js/modules/world/AirportLayout.js';

function createStateWithAirport(airport, viewport = { x: 0, z: 0, zoom: 0.05 }) {
    const document = createEditorDocument({
        districts: [],
        roads: [],
        terrainEdits: [],
        terrainRegions: [],
        airports: [airport],
        authoredObjects: []
    }, {});
    return {
        document,
        viewport,
        selection: { selectedId: null, hoverId: null },
        tools: { currentTool: 'select' },
        layers: {
            groupVisibility: {},
            itemVisibility: {},
            groupLocked: {},
            itemLocked: {}
        }
    };
}

test('findObjectsAtWorldPos hits rotated airport footprints', () => {
    const airport = { template: 'default', x: 1000, z: 2000, yaw: 90 };
    const state = createStateWithAirport(airport);
    const hitPoint = transformAirportPoint(airport, 0, 1600);

    const found = findObjectsAtWorldPos(state, hitPoint);

    assert.equal(found.length, 1);
    assert.equal(found[0], state.document.worldData.airports[0].__editorId);
});

test('findObjectsAtWorldPos rejects points outside rotated airport footprints', () => {
    const airport = { template: 'default', x: 1000, z: 2000, yaw: 90 };
    const state = createStateWithAirport(airport);
    const missPoint = transformAirportPoint(airport, 1200, 0);

    const found = findObjectsAtWorldPos(state, missPoint);

    assert.deepEqual(found, []);
});

test('findObjectsAtWorldPos ignores airports when the airport layer is hidden', () => {
    const airport = { template: 'default', x: 1000, z: 2000, yaw: 45 };
    const state = createStateWithAirport(airport);
    state.layers.groupVisibility.airports = false;
    const hitPoint = transformAirportPoint(airport, 0, 1200);

    const found = findObjectsAtWorldPos(state, hitPoint);

    assert.deepEqual(found, []);
});
