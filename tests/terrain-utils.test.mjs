import test from 'node:test';
import assert from 'node:assert/strict';

import { pickWeighted } from '../js/modules/world/terrain/TerrainUtils.js';

test('pickWeighted returns the correct key based on value01', () => {
    const weights = { a: 1, b: 2, c: 1 }; // sum = 4

    assert.equal(pickWeighted(0, weights), 'a');
    assert.equal(pickWeighted(0.25, weights), 'a');

    assert.equal(pickWeighted(0.26, weights), 'b');
    assert.equal(pickWeighted(0.5, weights), 'b');
    assert.equal(pickWeighted(0.75, weights), 'b');

    assert.equal(pickWeighted(0.76, weights), 'c');
    assert.equal(pickWeighted(1.0, weights), 'c');
});

test('pickWeighted returns the first key if sum of weights is <= 0', () => {
    const weights = { a: 0, b: -1, c: 0 };
    assert.equal(pickWeighted(0.5, weights), 'a');
});

test('pickWeighted returns the last key as a fallback if value01 is large', () => {
    const weights = { a: 1, b: 2 }; // sum = 3
    assert.equal(pickWeighted(1.5, weights), 'b');
});

test('pickWeighted handles fractional weights correctly', () => {
    const weights = { x: 0.1, y: 0.2, z: 0.7 }; // sum = 1.0
    assert.equal(pickWeighted(0.05, weights), 'x');
    assert.equal(pickWeighted(0.2, weights), 'y');
    assert.equal(pickWeighted(0.9, weights), 'z');
});
