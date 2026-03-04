import test from 'node:test';
import assert from 'node:assert/strict';

import { getLodForRingDistance } from '../js/modules/world/terrain/TerrainUtils.js';

test('getLodForRingDistance without currentLod (default behavior)', () => {
    assert.equal(getLodForRingDistance(0), 0);
    assert.equal(getLodForRingDistance(1), 0);
    assert.equal(getLodForRingDistance(1.5), 1);
    assert.equal(getLodForRingDistance(3), 1);
    assert.equal(getLodForRingDistance(3.5), 2);
    assert.equal(getLodForRingDistance(6), 2);
    assert.equal(getLodForRingDistance(6.5), 3);
    assert.equal(getLodForRingDistance(10), 3);
});

test('getLodForRingDistance with currentLod = 0', () => {
    assert.equal(getLodForRingDistance(0, 0), 0);
    assert.equal(getLodForRingDistance(1, 0), 0);
    assert.equal(getLodForRingDistance(1.5, 0), 1);
    assert.equal(getLodForRingDistance(3, 0), 1);
    assert.equal(getLodForRingDistance(3.5, 0), 2);
    assert.equal(getLodForRingDistance(6, 0), 2);
    assert.equal(getLodForRingDistance(6.5, 0), 3);
});

test('getLodForRingDistance with currentLod = 1', () => {
    assert.equal(getLodForRingDistance(1, 1), 0);
    assert.equal(getLodForRingDistance(1.5, 1), 1);
    assert.equal(getLodForRingDistance(4, 1), 1);
    assert.equal(getLodForRingDistance(4.5, 1), 2);
    assert.equal(getLodForRingDistance(7, 1), 2);
    assert.equal(getLodForRingDistance(7.5, 1), 3);
});

test('getLodForRingDistance with currentLod = 2', () => {
    assert.equal(getLodForRingDistance(2, 2), 1);
    assert.equal(getLodForRingDistance(2.5, 2), 2);
    assert.equal(getLodForRingDistance(7, 2), 2);
    assert.equal(getLodForRingDistance(7.5, 2), 3);
});

test('getLodForRingDistance with currentLod = 3', () => {
    assert.equal(getLodForRingDistance(6, 3), 2);
    assert.equal(getLodForRingDistance(6.5, 3), 3);
    assert.equal(getLodForRingDistance(10, 3), 3);
});
