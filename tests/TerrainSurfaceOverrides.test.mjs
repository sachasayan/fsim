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

test('open terrain remains unstamped', () => {
    const [asphalt] = getTerrainSurfaceOverrides(900, 900);
    assert.equal(asphalt, 0);
});
