import test from 'node:test';
import assert from 'node:assert/strict';

import { LIGHTING_PRESETS, pickLightingPresetId } from '../js/modules/lighting.js';

test('lighting presets include expected daytime presets', () => {
  const keys = Object.keys(LIGHTING_PRESETS).sort();
  assert.deepEqual(keys, ['blue_hour', 'dawn', 'daytime', 'golden_hour']);
});

test('every preset has all required fields', () => {
  const required = [
    'clearColor', 'stormColor', 'hemiSkyColor', 'hemiGroundColor',
    'dirColor', 'ambientBase', 'directBase', 'sunPhiDeg', 'sunThetaDeg',
    'skyTurbidity', 'skyRayleigh', 'skyMieCoefficient', 'skyMieDirectionalG',
    'exposure', 'bloom', 'hazeColor', 'hazeOpacity', 'starOpacity',
    'cloudColorClear', 'cloudColorStorm', 'cloudOpacityBase', 'cloudOpacityStorm',
    'cloudEmissiveBase', 'cloudEmissiveStorm'
  ];
  for (const [id, preset] of Object.entries(LIGHTING_PRESETS)) {
    for (const field of required) {
      assert.ok(Object.hasOwn(preset, field), `Preset "${id}" is missing field "${field}"`);
    }
    assert.ok(typeof preset.bloom.threshold === 'number', `Preset "${id}" bloom.threshold must be a number`);
    assert.ok(typeof preset.bloom.strength === 'number', `Preset "${id}" bloom.strength must be a number`);
    assert.ok(typeof preset.bloom.radius === 'number', `Preset "${id}" bloom.radius must be a number`);
  }
});

test('pickLightingPresetId always returns a valid preset id', () => {
  const original = Math.random;
  try {
    Math.random = () => 0.0;
    assert.ok(Object.hasOwn(LIGHTING_PRESETS, pickLightingPresetId()));

    Math.random = () => 0.999999;
    assert.ok(Object.hasOwn(LIGHTING_PRESETS, pickLightingPresetId()));

    Math.random = () => 0.5;
    assert.ok(Object.hasOwn(LIGHTING_PRESETS, pickLightingPresetId()));
  } finally {
    Math.random = original;
  }
});
