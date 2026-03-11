import test from 'node:test';
import assert from 'node:assert/strict';

import { getTerrainSurfaceOverrides } from '../js/modules/world/terrain/TerrainSurfaceOverrides.js';

test('runway center stamps asphalt', () => {
    const [asphalt] = getTerrainSurfaceOverrides(0, 0);
    assert.ok(asphalt > 0.95);
});

test('apron center stamps asphalt', () => {
    const [asphalt] = getTerrainSurfaceOverrides(-190, -450);
    assert.ok(asphalt > 0.95);
});

test('taxiway centerline stamps asphalt', () => {
    const [asphalt] = getTerrainSurfaceOverrides(-80, 1400);
    assert.ok(asphalt > 0.9);
});

test('authored road centerline stamps asphalt', () => {
    const worldData = {
        roads: [
            {
                surface: 'asphalt',
                width: 30,
                feather: 10,
                points: [[100, 100], [300, 100]]
            }
        ]
    };

    const [asphalt] = getTerrainSurfaceOverrides(200, 100, worldData);
    assert.ok(asphalt > 0.9);
});

test('authored roads override legacy taxiway fallback', () => {
    const worldData = {
        roads: [
            {
                surface: 'asphalt',
                width: 24,
                feather: 8,
                points: [[2000, 2000], [2200, 2000]]
            }
        ]
    };

    const [asphalt] = getTerrainSurfaceOverrides(-80, 1400, worldData);
    assert.equal(asphalt, 0);
});

test('open terrain remains unstamped', () => {
    const [asphalt] = getTerrainSurfaceOverrides(900, 900);
    assert.equal(asphalt, 0);
});
