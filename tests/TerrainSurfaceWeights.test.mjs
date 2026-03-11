import test from 'node:test';
import assert from 'node:assert/strict';

import { getTerrainSurfaceWeights } from '../js/modules/world/terrain/TerrainSurfaceWeights.js';

test('shore terrain biases strongly toward sand', () => {
    const [sand, grass, rock, snow] = getTerrainSurfaceWeights(-20, 0.02);
    assert.ok(sand > 0.7);
    assert.ok(grass < 0.25);
    assert.ok(rock < 0.15);
    assert.ok(snow < 0.01);
});

test('mid-elevation gentle terrain biases toward grass', () => {
    const [sand, grass, rock, snow] = getTerrainSurfaceWeights(80, 0.08);
    assert.ok(grass > 0.6);
    assert.ok(sand < 0.15);
    assert.ok(rock < 0.3);
    assert.ok(snow < 0.01);
});

test('steep alpine terrain biases toward rock and snow', () => {
    const [sand, grass, rock, snow] = getTerrainSurfaceWeights(660, 0.72);
    assert.ok(rock > 0.2);
    assert.ok(snow > 0.45);
    assert.ok(grass < 0.2);
    assert.ok(sand < 0.05);
});
