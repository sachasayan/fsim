import test from 'node:test';
import assert from 'node:assert/strict';

import { getTerrainHeight } from '../js/modules/world/terrain/TerrainUtils.js';

test('getTerrainHeight returns 0 in the inner runway zone', () => {
    // Mock Noise to always return 0.5 for fractal
    const mockNoise = {
        fractal: () => 0.5
    };

    // Inner runway zone is where |x| < 150 and |z| < 2500
    // Test center
    assert.equal(getTerrainHeight(0, 0, mockNoise), 0);
    // Test edges of inner runway
    assert.equal(getTerrainHeight(149, 2499, mockNoise), 0);
    assert.equal(getTerrainHeight(-149, -2499, mockNoise), 0);
});

test('getTerrainHeight returns unblended noise outside transition zone', () => {
    const mockNoise = {
        fractal: () => 0.5
    };

    // Expected full noise: 0.5 * 600 + 100 = 400
    const expectedFullNoise = 400;

    // Outside transition zone is where |x| >= 600 or |z| >= 3500
    assert.equal(getTerrainHeight(600, 0, mockNoise), expectedFullNoise);
    assert.equal(getTerrainHeight(0, 3500, mockNoise), expectedFullNoise);
    assert.equal(getTerrainHeight(1000, 5000, mockNoise), expectedFullNoise);
    assert.equal(getTerrainHeight(-600, -3500, mockNoise), expectedFullNoise);
});

test('getTerrainHeight blends in transition zone on X axis', () => {
    const mockNoise = {
        fractal: () => 0.5
    };

    const expectedFullNoise = 400;

    // Transition on X: z is within inner runway, x is between 150 and 600
    // x = 375, z = 0
    // blendX = Math.max(0, (375 - 150) / 450) = 225 / 450 = 0.5
    // blendZ = Math.max(0, (0 - 2500) / 1000) = 0
    // runwayMask = Math.min(1.0, Math.max(0.5, 0)) = 0.5
    // expected = 400 * 0.5 = 200
    assert.equal(getTerrainHeight(375, 0, mockNoise), expectedFullNoise * 0.5);

    // Negative X
    assert.equal(getTerrainHeight(-375, 0, mockNoise), expectedFullNoise * 0.5);
});

test('getTerrainHeight blends in transition zone on Z axis', () => {
    const mockNoise = {
        fractal: () => 0.5
    };

    const expectedFullNoise = 400;

    // Transition on Z: x is within inner runway, z is between 2500 and 3500
    // x = 0, z = 3000
    // blendX = Math.max(0, (0 - 150) / 450) = 0
    // blendZ = Math.max(0, (3000 - 2500) / 1000) = 500 / 1000 = 0.5
    // runwayMask = Math.min(1.0, Math.max(0, 0.5)) = 0.5
    // expected = 400 * 0.5 = 200
    assert.equal(getTerrainHeight(0, 3000, mockNoise), expectedFullNoise * 0.5);

    // Negative Z
    assert.equal(getTerrainHeight(0, -3000, mockNoise), expectedFullNoise * 0.5);
});

test('getTerrainHeight blends correctly in diagonal transition zone', () => {
    const mockNoise = {
        fractal: () => 0.5
    };

    const expectedFullNoise = 400;

    // Both X and Z in transition zone
    // x = 375 (blendX = 0.5)
    // z = 3000 (blendZ = 0.5)
    // runwayMask = Math.min(1.0, Math.max(0.5, 0.5)) = 0.5
    assert.equal(getTerrainHeight(375, 3000, mockNoise), expectedFullNoise * 0.5);

    // x = 487.5 (blendX = 337.5 / 450 = 0.75)
    // z = 3000 (blendZ = 0.5)
    // runwayMask = Math.max(0.75, 0.5) = 0.75
    assert.equal(getTerrainHeight(487.5, 3000, mockNoise), expectedFullNoise * 0.75);

    // z = 3250 (blendZ = 750 / 1000 = 0.75)
    // x = 375 (blendX = 0.5)
    // runwayMask = Math.max(0.5, 0.75) = 0.75
    assert.equal(getTerrainHeight(375, 3250, mockNoise), expectedFullNoise * 0.75);
});
