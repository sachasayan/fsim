import test from 'node:test';
import assert from 'node:assert/strict';

import { carveHeightForRoadSegments, projectPointToRoadSegment } from '../js/modules/world/terrain/TerrainWorker.js';

test('projectPointToRoadSegment returns clamped interpolation along a segment', () => {
    const projection = projectPointToRoadSegment(50, 20, 0, 0, 100, 0);

    assert.equal(projection.projX, 50);
    assert.equal(projection.projZ, 0);
    assert.equal(projection.t, 0.5);
    assert.equal(projection.dist, 20);
});

test('carveHeightForRoadSegments follows the road grade instead of a noisy centerline sample', () => {
    const baseHeight = 200;
    const noisySample = () => 9999;
    const roadSegments = [{
        p1: [0, 0],
        p2: [100, 0],
        halfWidth: 10,
        embankment: 20,
        totalRadius: 30,
        startHeight: 0,
        endHeight: 100
    }];

    const carved = carveHeightForRoadSegments(50, 0, baseHeight, roadSegments, noisySample);

    assert.equal(carved, 50);
});

test('carveHeightForRoadSegments feathers smoothly into surrounding terrain', () => {
    const baseHeight = 200;
    const roadSegments = [{
        p1: [0, 0],
        p2: [100, 0],
        halfWidth: 10,
        embankment: 20,
        totalRadius: 30,
        startHeight: 0,
        endHeight: 100
    }];

    const carved = carveHeightForRoadSegments(50, 20, baseHeight, roadSegments);

    assert.equal(carved, 125);
});

test('carveHeightForRoadSegments leaves terrain untouched outside the road falloff', () => {
    const baseHeight = 200;
    const roadSegments = [{
        p1: [0, 0],
        p2: [100, 0],
        halfWidth: 10,
        embankment: 20,
        totalRadius: 30,
        startHeight: 0,
        endHeight: 100
    }];

    const carved = carveHeightForRoadSegments(50, 40, baseHeight, roadSegments);

    assert.equal(carved, baseHeight);
});
