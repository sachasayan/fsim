import test from 'node:test';
import assert from 'node:assert/strict';
import { getForestProfile } from '../js/modules/world/terrain/TerrainUtils.js';

// getForestProfile signature: getForestProfile(vx, vz, height, forestNoise, urbanScore, Noise)

// A customizable mock for Noise
const createMockNoise = (moistureNoiseVal, heatNoiseVal) => {
    return {
        fractal: (x, z, octaves, persistence, scale) => {
            // Check the scale to differentiate between the moisture call and heat call
            if (scale === 0.0018) {
                // Moisture call: (Noise.fractal(vx + 9000, vz - 7000, 3, 0.5, 0.0018) + 1) * 0.5
                return moistureNoiseVal;
            } else if (scale === 0.0012) {
                // Heat call: (Noise.fractal(vx - 12000, vz + 6000, 3, 0.5, 0.0012) + 1) * 0.5 - Math.max(0, height - 220) / 520
                return heatNoiseVal;
            }
            return 0; // Default
        }
    };
};

test('getForestProfile returns parkland when urbanScore > 0.35', () => {
    // urbanScore = 0.4
    const mockNoise = createMockNoise(0, 0);
    const profile = getForestProfile(0, 0, 100, 0, 0.4, mockNoise);
    assert.equal(profile.kind, 'parkland');
    assert.equal(profile.density, 0.06);
    assert.deepEqual(profile.typeWeights, { broadleaf: 0.55, poplar: 0.35, conifer: 0.1 });
});

test('getForestProfile returns alpine when height > 280', () => {
    // urbanScore <= 0.35, height = 300
    const mockNoise = createMockNoise(0, 0);
    const profile = getForestProfile(0, 0, 300, 0.5, 0.2, mockNoise);
    assert.equal(profile.kind, 'alpine');
    assert.equal(profile.density, 0.08 + 0.5 * 0.08); // forestNoise = 0.5
    assert.deepEqual(profile.typeWeights, { conifer: 0.72, dry: 0.2, poplar: 0.08 });
});

test('getForestProfile returns alpine when heat < 0.28', () => {
    // urbanScore <= 0.35, height <= 280, heat < 0.28
    // heat = (heatNoiseVal + 1) * 0.5 - Math.max(0, height - 220) / 520
    // let height = 200, so Math.max(0, -20) / 520 = 0
    // heat = (heatNoiseVal + 1) * 0.5. If heatNoiseVal = -0.5, heat = 0.25 < 0.28
    const mockNoise = createMockNoise(0, -0.5);
    const profile = getForestProfile(0, 0, 200, 0.5, 0.2, mockNoise);
    assert.equal(profile.kind, 'alpine');
    assert.equal(profile.density, 0.08 + 0.5 * 0.08);
});

test('getForestProfile returns dense_mixed when moisture > 0.66', () => {
    // urbanScore <= 0.35, height <= 280, heat >= 0.28, moisture > 0.66
    // moisture = (moistureNoiseVal + 1) * 0.5
    // If moistureNoiseVal = 0.5, moisture = 1.5 * 0.5 = 0.75 > 0.66
    // If heatNoiseVal = 0, heat = 0.5 >= 0.28
    const mockNoise = createMockNoise(0.5, 0);
    const profile = getForestProfile(0, 0, 200, 0.5, 0.2, mockNoise);
    assert.equal(profile.kind, 'dense_mixed');
    assert.equal(profile.density, 0.16 + 0.5 * 0.1);
    assert.deepEqual(profile.typeWeights, { conifer: 0.46, broadleaf: 0.34, poplar: 0.2 });
});

test('getForestProfile returns dry_scrub when moisture < 0.35', () => {
    // urbanScore <= 0.35, height <= 280, heat >= 0.28, moisture < 0.35
    // moisture = (moistureNoiseVal + 1) * 0.5
    // If moistureNoiseVal = -0.5, moisture = 0.5 * 0.5 = 0.25 < 0.35
    // If heatNoiseVal = 0, heat = 0.5 >= 0.28
    const mockNoise = createMockNoise(-0.5, 0);
    const profile = getForestProfile(0, 0, 200, 0.5, 0.2, mockNoise);
    assert.equal(profile.kind, 'dry_scrub');
    assert.equal(profile.density, 0.05 + 0.5 * 0.05);
    assert.deepEqual(profile.typeWeights, { dry: 0.52, poplar: 0.18, broadleaf: 0.16, conifer: 0.14 });
});

test('getForestProfile returns temperate_mixed as default', () => {
    // urbanScore <= 0.35, height <= 280, heat >= 0.28, 0.35 <= moisture <= 0.66
    // moisture = (moistureNoiseVal + 1) * 0.5
    // If moistureNoiseVal = 0, moisture = 0.5 (between 0.35 and 0.66)
    // If heatNoiseVal = 0, heat = 0.5 >= 0.28
    const mockNoise = createMockNoise(0, 0);
    const profile = getForestProfile(0, 0, 200, 0.5, 0.2, mockNoise);
    assert.equal(profile.kind, 'temperate_mixed');
    assert.equal(profile.density, 0.1 + 0.5 * 0.07);
    assert.deepEqual(profile.typeWeights, { broadleaf: 0.42, conifer: 0.35, poplar: 0.2, dry: 0.03 });
});
