import test from 'node:test';
import assert from 'node:assert/strict';

import { CLOUD_NOISE } from '../js/modules/world/cloudNoise.js';

test('cloud hash2D is deterministic and bounded', () => {
  const a = CLOUD_NOISE.hash2D(12.25, -9.5, 42);
  const b = CLOUD_NOISE.hash2D(12.25, -9.5, 42);
  assert.equal(a, b);
  assert.ok(a >= 0 && a < 1);
});

test('cloud smoothstep clamps endpoints', () => {
  assert.equal(CLOUD_NOISE.smoothstep(0), 0);
  assert.equal(CLOUD_NOISE.smoothstep(1), 1);
});

test('value noise and fbm produce finite, normalized values', () => {
  for (let i = 0; i < 300; i++) {
    const x = i * 0.091;
    const z = i * 0.073;

    const v = CLOUD_NOISE.valueNoise2D(x, z, 11);
    assert.ok(Number.isFinite(v));
    assert.ok(v >= 0 && v <= 1, `value noise out of range: ${v}`);

    const f = CLOUD_NOISE.fbm2D(x, z, 4, 2.0, 0.5, 29);
    assert.ok(Number.isFinite(f));
    assert.ok(f >= 0 && f <= 1, `fbm out of range: ${f}`);
  }
});
