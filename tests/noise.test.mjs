import test from 'node:test';
import assert from 'node:assert/strict';

import { Noise } from '../js/modules/noise.js';

test('fade endpoints are clamped at 0 and 1', () => {
  assert.equal(Noise.fade(0), 0);
  assert.equal(Noise.fade(1), 1);
});

test('noise output stays within expected Perlin range', () => {
  let min = Infinity;
  let max = -Infinity;

  for (let x = 0; x < 24; x++) {
    for (let z = 0; z < 24; z++) {
      const n = Noise.noise(x * 0.17, 0, z * 0.23);
      min = Math.min(min, n);
      max = Math.max(max, n);
      assert.ok(Number.isFinite(n));
      assert.ok(n >= -1.2 && n <= 1.2, `noise sample out of range: ${n}`);
    }
  }

  assert.ok(min < 0.15);
  assert.ok(max > -0.15);
});

test('fractal output is normalized to approximately [-1, 1]', () => {
  for (let x = 0; x < 20; x++) {
    for (let z = 0; z < 20; z++) {
      const f = Noise.fractal(x * 0.11, z * 0.09, 5, 0.5, 0.8);
      assert.ok(Number.isFinite(f));
      assert.ok(f >= -1.05 && f <= 1.05, `fractal sample out of range: ${f}`);
    }
  }
});
