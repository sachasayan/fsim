import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeRoad } from '../js/modules/world/MapDataUtils.js';
import { getVertexHitIndex, roadContainsPoint } from '../js/modules/editor/geometry.js';
import { isRoad, getLayerGroupId, objectLabel } from '../js/modules/editor/objectTypes.js';
import { getLayerGroupsData } from '../js/modules/editor/layers.js';

test('normalizeRoad-backed objects are classified as editor roads', () => {
    const road = normalizeRoad({
        kind: 'service',
        surface: 'gravel',
        width: 18,
        points: [[0, 0], [200, 0]]
    });

    assert.equal(isRoad(road), true);
    assert.equal(getLayerGroupId(road), 'roads');
    assert.equal(objectLabel(road), 'service · gravel · 2 pts');
});

test('roadContainsPoint respects width and feather', () => {
    const road = normalizeRoad({
        kind: 'road',
        surface: 'asphalt',
        width: 20,
        feather: 6,
        points: [[0, 0], [200, 0]]
    });

    assert.equal(roadContainsPoint(road, 100, 0), true);
    assert.equal(roadContainsPoint(road, 100, 12), true);
    assert.equal(roadContainsPoint(road, 100, 40), false);
});

test('roads are exposed as a dedicated layer group', () => {
    const road = normalizeRoad({
        kind: 'taxiway',
        surface: 'asphalt',
        width: 30,
        points: [[0, 0], [300, 0]]
    });

    const groups = getLayerGroupsData({ cities: [], districts: [], roads: [road], terrainEdits: [] }, [], objectLabel);
    const roadsGroup = groups.find(group => group.id === 'roads');

    assert.ok(roadsGroup);
    assert.equal(roadsGroup.items.length, 1);
    assert.equal(roadsGroup.items[0].label, 'taxiway · asphalt · 2 pts');
});

test('getVertexHitIndex returns the nearest point within threshold', () => {
    const points = [
        [0, 0],
        [100, 0],
        [220, 0]
    ];

    const hitIndex = getVertexHitIndex(points, { x: 88, z: 0 }, 140);
    assert.equal(hitIndex, 1);
});
