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

test('MapTileManager only re-sorts queued tiles when the queue or camera tile changes', () => {
    const manager = new MapTileManager({
        sampleTerrainHeight() {
            return 0;
        }
    });

    manager.renderQueue = [
        { tx: 5, tz: 5, lod: 2 },
        { tx: 1, tz: 1, lod: 2 },
        { tx: 3, tz: 3, lod: 2 }
    ];
    manager.queuePriorityDirty = true;

    let sortCalls = 0;
    const originalSort = manager.renderQueue.sort.bind(manager.renderQueue);
    manager.renderQueue.sort = (compareFn) => {
        sortCalls++;
        return originalSort(compareFn);
    };

    manager.prioritizeQueue(100, 100, 2);
    manager.prioritizeQueue(110, 120, 2);
    assert.equal(sortCalls, 1);

    manager.prioritizeQueue(800, 120, 2);
    assert.equal(sortCalls, 2);

    manager.queuePriorityDirty = true;
    manager.prioritizeQueue(800, 120, 2);
    assert.equal(sortCalls, 3);
});

test('MapTileManager can paint asynchronously rendered tile data', async () => {
    globalThis.requestAnimationFrame = (callback) => {
        setTimeout(callback, 0);
        return 1;
    };

    try {
        let paints = 0;
        globalThis.document = {
            createElement(tag) {
                assert.equal(tag, 'canvas');
                return {
                    width: 0,
                    height: 0,
                    getContext() {
                        return {
                            createImageData(width, height) {
                                return { data: new Uint8ClampedArray(width * height * 4) };
                            },
                            putImageData(imageData) {
                                paints++;
                                assert.deepEqual(Array.from(imageData.data), [1, 2, 3, 255]);
                            }
                        };
                    }
                };
            }
        };

        const manager = new MapTileManager({
            sampleTerrainHeight() {
                return 0;
            },
            tileSize: 1,
            pixelRatio: 1,
            renderTileAsync: async () => ({
                pixels: new Uint8ClampedArray([1, 2, 3, 255]),
                width: 1,
                height: 1
            })
        });

        manager.getTile(0, 0, 1);
        await new Promise(resolve => setTimeout(resolve, 20));

        assert.equal(paints, 1);
        const entry = manager.tiles.get('1_0_0');
        assert.equal(entry.status, 'ready');
    } finally {
        delete globalThis.document;
        delete globalThis.requestAnimationFrame;
    }
});
