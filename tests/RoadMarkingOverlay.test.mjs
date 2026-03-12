import test from 'node:test';
import assert from 'node:assert/strict';

import { getRoadMarkingStyle, shouldRefreshRoadOverlay } from '../js/modules/world/terrain/RoadMarkingOverlay.js';

test('getRoadMarkingStyle defaults asphalt roads to dashed yellow center lines', () => {
    const style = getRoadMarkingStyle({
        kind: 'road',
        surface: 'asphalt',
        points: [[0, 0], [100, 0]]
    });

    assert.deepEqual(style, {
        width: 0.36,
        dashLength: 5.5,
        gapLength: 5.5,
        color: '#f4d35e'
    });
});

test('getRoadMarkingStyle disables unsupported roads', () => {
    assert.equal(getRoadMarkingStyle({
        kind: 'service',
        surface: 'gravel',
        points: [[0, 0], [100, 0]]
    }), null);
});

test('getRoadMarkingStyle gives taxiways a solid bright yellow center line', () => {
    const style = getRoadMarkingStyle({
        kind: 'taxiway',
        surface: 'asphalt',
        points: [[0, 0], [100, 0]]
    });

    assert.deepEqual(style, {
        width: 0.88,
        dashLength: 0,
        gapLength: 0,
        color: '#ffff00'
    });
});

test('shouldRefreshRoadOverlay recenters only when threshold is crossed or roads change', () => {
    assert.equal(shouldRefreshRoadOverlay({ x: 0, z: 0 }, { x: 100, z: 60 }, 180, false), false);
    assert.equal(shouldRefreshRoadOverlay({ x: 0, z: 0 }, { x: 181, z: 0 }, 180, false), true);
    assert.equal(shouldRefreshRoadOverlay({ x: 0, z: 0 }, { x: 0, z: 0 }, 180, true), true);
});
