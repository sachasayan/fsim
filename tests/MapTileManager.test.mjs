import test from 'node:test';
import assert from 'node:assert/strict';

import { MapTileManager } from '../js/modules/ui/MapTileManager.js';

function createMockContext() {
    let lastImageData = null;

    return {
        ctx: {
            createImageData(width, height) {
                lastImageData = { data: new Uint8ClampedArray(width * height * 4) };
                return lastImageData;
            },
            putImageData(imageData, x, y) {
                assert.equal(imageData, lastImageData);
                assert.equal(x, 0);
                assert.equal(y, 0);
            }
        },
        getImageData() {
            return lastImageData;
        }
    };
}

test('MapTileManager uses explicit terrain samplers without injecting a legacy Noise argument', () => {
    const calls = [];
    const { ctx, getImageData } = createMockContext();
    const manager = new MapTileManager({
        sampleTerrainHeight(x, z, octaves = 6) {
            calls.push([x, z, octaves]);
            return octaves === 6 ? 50 : NaN;
        },
        tileSize: 1,
        pixelRatio: 1
    });

    manager.renderTile(ctx, 0, 0, 1, 1, 1);

    assert.deepEqual(calls, [[0, 0, 6]]);
    assert.deepEqual(Array.from(getImageData().data), [42, 75, 42, 255]);
});

test('MapTileManager still binds Noise for legacy getTerrainHeight samplers that require it', () => {
    const calls = [];
    const { ctx, getImageData } = createMockContext();
    const noise = { tag: 'legacy-noise' };
    const manager = new MapTileManager({
        getTerrainHeight(x, z, boundNoise) {
            calls.push([x, z, boundNoise]);
            return -20;
        },
        Noise: noise,
        tileSize: 1,
        pixelRatio: 1
    });

    manager.renderTile(ctx, 0, 0, 1, 1, 1);

    assert.deepEqual(calls, [[0, 0, noise]]);
    assert.equal(getImageData().data[3], 255);
});
