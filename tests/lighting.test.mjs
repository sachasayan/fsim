import test from 'node:test';
import assert from 'node:assert/strict';

import { LIGHTING_PRESETS, getWeatherModeConfig, pickLightingPresetId, pickStartupWeatherMode } from '../js/modules/lighting.js';

test('lighting presets include only supported daytime presets', () => {
  assert.deepEqual(Object.keys(LIGHTING_PRESETS).sort(), ['blue_hour', 'dawn', 'golden_hour']);
});

test('getWeatherModeConfig returns fallback clear mode for unknown values', () => {
  const fallback = getWeatherModeConfig('not-a-mode');
  assert.equal(fallback.name, 'clear');
  assert.equal(fallback.fog, 0.0002);
  assert.equal(fallback.intensity, 0.0);
});

test('pickStartupWeatherMode maps random ranges to weather buckets', () => {
  const original = Math.random;
  try {
    Math.random = () => 0.0;
    assert.equal(pickStartupWeatherMode(), 0);

    Math.random = () => 0.62;
    assert.equal(pickStartupWeatherMode(), 1);

    Math.random = () => 0.9;
    assert.equal(pickStartupWeatherMode(), 2);
  } finally {
    Math.random = original;
  }
});

test('pickLightingPresetId always returns a valid preset id', () => {
  const original = Math.random;
  try {
    Math.random = () => 0.0;
    assert.equal(pickLightingPresetId(), 'dawn');

    Math.random = () => 0.999999;
    assert.ok(Object.hasOwn(LIGHTING_PRESETS, pickLightingPresetId()));
  } finally {
    Math.random = original;
  }
});
