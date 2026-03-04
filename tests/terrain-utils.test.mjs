import test from 'node:test';
import assert from 'node:assert/strict';

import { getDistrictProfile } from '../js/modules/world/terrain/TerrainUtils.js';

test('getDistrictProfile returns financial_core when urbanScore > 0.78', () => {
    const profile = getDistrictProfile(0, 0, 0.8, 50);
    assert.equal(profile.kind, 'financial_core');
});

test('getDistrictProfile returns waterfront_mixed when near water and urbanScore > 0.5', () => {
    // height < 35 is near water
    const profile = getDistrictProfile(0, 0, 0.6, 30);
    assert.equal(profile.kind, 'waterfront_mixed');
});

test('getDistrictProfile returns industrial_belt when district noise > 0.72 and urbanScore > 0.42', () => {
    // dx=0, dz=2 => vx=0, vz=6400 gives districtNoise ~0.988 (> 0.72)
    // height=40 (not near water) to bypass waterfront_mixed
    const profile = getDistrictProfile(0, 6400, 0.6, 40);
    assert.equal(profile.kind, 'industrial_belt');
});

test('getDistrictProfile returns mixed_use when urbanScore > 0.52 (and other conditions fail)', () => {
    // dx=0, dz=0 => vx=0, vz=0 gives districtNoise ~0.093 (<= 0.72)
    // height=40 (not near water)
    const profile = getDistrictProfile(0, 0, 0.6, 40);
    assert.equal(profile.kind, 'mixed_use');
});

test('getDistrictProfile returns residential_ring as fallback when urbanScore is low', () => {
    // urbanScore = 0.4 (fails all previous checks)
    const profile = getDistrictProfile(0, 0, 0.4, 40);
    assert.equal(profile.kind, 'residential_ring');
});

test('getDistrictProfile properties are correct for each kind', () => {
    const profile = getDistrictProfile(0, 0, 0.6, 40); // mixed_use
    assert.equal(profile.roadScale, 0.96);
    assert.equal(profile.lotDensity, 0.15);
    assert.deepEqual(profile.classWeights, {
        highrise: 0.18,
        office: 0.3,
        apartment: 0.34,
        townhouse: 0.14,
        industrial: 0.04
    });
});
