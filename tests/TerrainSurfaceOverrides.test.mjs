import test from 'node:test';
import assert from 'node:assert/strict';

import { getTerrainSurfaceOverrides } from '../js/modules/world/terrain/TerrainSurfaceOverrides.js';

test('terrain surface overrides no longer stamp asphalt for airport surfaces', () => {
    assert.deepEqual(getTerrainSurfaceOverrides(0, 0), [0, 0, 0, 0]);
    assert.deepEqual(getTerrainSurfaceOverrides(-190, -450), [0, 0, 0, 0]);
    assert.deepEqual(getTerrainSurfaceOverrides(-80, 1400), [0, 0, 0, 0]);
});

test('authored roads do not stamp terrain asphalt', () => {
    const worldData = {
        roads: [
            {
                kind: 'road',
                surface: 'asphalt',
                width: 30,
                feather: 10,
                points: [[100, 100], [300, 100]]
            },
            {
                kind: 'taxiway',
                surface: 'asphalt',
                width: 24,
                feather: 8,
                points: [[2000, 2000], [2200, 2000]]
            }
        ]
    };

    assert.deepEqual(getTerrainSurfaceOverrides(200, 100, worldData), [0, 0, 0, 0]);
    assert.deepEqual(getTerrainSurfaceOverrides(2100, 2000, worldData), [0, 0, 0, 0]);
});
