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

test('MapTileManager prioritizes active-lod jobs ahead of warmed jobs', () => {
    const manager = new MapTileManager({
        sampleTerrainHeight() {
            return 0;
        }
    });

    manager.renderQueue = [
        { tx: 0, tz: 0, lod: 32, key: 'warm', priorityBand: 1 },
        { tx: 10, tz: 10, lod: 8, key: 'active', priorityBand: 0 }
    ];
    manager.queuePriorityDirty = true;

    manager.prioritizeQueue(0, 0, 8);

    assert.equal(manager.renderQueue[0].key, 'active');
});

test('MapTileManager defers queue processing while collecting frame requests', () => {
    globalThis.document = {
        createElement() {
            return {
                width: 0,
                height: 0,
                getContext() {
                    return {
                        createImageData(width, height) {
                            return { data: new Uint8ClampedArray(width * height * 4) };
                        },
                        putImageData() {}
                    };
                }
            };
        }
    };

    try {
        const manager = new MapTileManager({
            sampleTerrainHeight() {
                return 0;
            }
        });
        let processCalls = 0;
        manager.processQueue = () => {
            processCalls += 1;
        };

        manager.collectingFrameRequests = true;
        manager.getTile(0, 0, 8, 'active');

        assert.equal(processCalls, 0);
        assert.equal(manager.renderQueue.length, 1);
    } finally {
        delete globalThis.document;
    }
});

test('MapTileManager promotes queued warmed tiles when they become visible', () => {
    globalThis.document = {
        createElement() {
            return {
                width: 0,
                height: 0,
                getContext() {
                    return {
                        createImageData(width, height) {
                            return { data: new Uint8ClampedArray(width * height * 4) };
                        },
                        putImageData() {}
                    };
                }
            };
        }
    };

    try {
        const manager = new MapTileManager({
            sampleTerrainHeight() {
                return 0;
            }
        });
        manager.collectingFrameRequests = true;
        manager.getTile(0, 0, 8, 'warm');
        manager.getTile(0, 0, 8, 'active');

        assert.equal(manager.renderQueue.length, 1);
        assert.equal(manager.renderQueue[0].priorityBand, 0);
    } finally {
        delete globalThis.document;
    }
});

test('MapTileManager can dispatch multiple tile renders concurrently', async () => {
    globalThis.requestAnimationFrame = (callback) => {
        setTimeout(callback, 0);
        return 1;
    };
    globalThis.document = {
        createElement() {
            return {
                width: 0,
                height: 0,
                getContext() {
                    return {
                        createImageData(width, height) {
                            return { data: new Uint8ClampedArray(width * height * 4) };
                        },
                        putImageData() {}
                    };
                }
            };
        }
    };

    try {
        let active = 0;
        let peak = 0;
        const releases = [];
        const manager = new MapTileManager({
            sampleTerrainHeight() {
                return 0;
            },
            maxConcurrentRenders: 2,
            renderTileAsync: async () => {
                active += 1;
                peak = Math.max(peak, active);
                await new Promise(resolve => setTimeout(resolve, 10));
                active -= 1;
                releases.push('done');
                return {
                    pixels: new Uint8ClampedArray([1, 2, 3, 255]),
                    width: 1,
                    height: 1
                };
            }
        });

        manager.getTile(0, 0, 8);
        manager.getTile(1, 0, 8);
        manager.getTile(2, 0, 8);
        const deadline = Date.now() + 250;
        while (releases.length < 3 && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 5));
        }

        assert.equal(peak, 2);
        assert.equal(releases.length, 3);
    } finally {
        delete globalThis.document;
        delete globalThis.requestAnimationFrame;
    }
});

test('MapTileManager snaps editor terrain tiles to a fixed four-level LOD ladder', () => {
    const manager = new MapTileManager({
        sampleTerrainHeight() {
            return 0;
        }
    });

    assert.equal(manager.getNearestLod(1.4), 2);
    assert.equal(manager.getNearestLod(6), 8);
    assert.equal(manager.getNearestLod(21), 32);
    assert.equal(manager.getNearestLod(90), 128);
});

test('MapTileManager applies hysteresis before switching to adjacent LOD bands', () => {
    const manager = new MapTileManager({
        sampleTerrainHeight() {
            return 0;
        }
    });

    assert.equal(manager.getNearestLod(5.0, 8), 8);
    assert.equal(manager.getNearestLod(4.2, 8), 2);
    assert.equal(manager.getNearestLod(22.8, 8), 8);
    assert.equal(manager.getNearestLod(24.5, 8), 32);
});

test('MapTileManager warms neighboring coarse and fine LODs for the current viewport', () => {
    const manager = new MapTileManager({
        sampleTerrainHeight() {
            return 0;
        }
    });

    const calls = [];
    manager.getTile = (tx, tz, lod) => {
        calls.push(`${lod}_${tx}_${tz}`);
        return null;
    };
    manager.prioritizeQueue = () => {};

    manager.draw({ drawImage() {} }, 0, 0, 0.125, 256, 256);

    assert.ok(calls.some(key => key.startsWith('8_')), 'expected visible target-lod requests');
    assert.ok(calls.some(key => key.startsWith('32_')), 'expected coarse-lod warming requests');
    assert.ok(calls.some(key => key.startsWith('2_')), 'expected fine-lod warming requests');
});

test('MapTileManager can bias tile detail relative to zoom for faster rendering', () => {
    const manager = new MapTileManager({
        sampleTerrainHeight() {
            return 0;
        },
        lodDetailScale: 2
    });

    const calls = [];
    manager.getTile = (tx, tz, lod) => {
        calls.push(`${lod}_${tx}_${tz}`);
        return null;
    };
    manager.prioritizeQueue = () => {};

    manager.draw({ drawImage() {} }, 0, 0, 0.25, 256, 256);

    assert.ok(calls.some(key => key.startsWith('8_')), 'expected coarser active lod when detail scale is reduced');
});

test('MapTileManager crossfades refreshed tiles before releasing the previous canvas', () => {
    const manager = new MapTileManager({
        sampleTerrainHeight() {
            return 0;
        },
        tileFadeDurationMs: 100
    });

    const released = [];
    manager.releaseCanvas = (canvas) => {
        released.push(canvas.id);
    };

    const entry = {
        canvas: { id: 'new' },
        transitionCanvas: { id: 'old' },
        transitionStartAt: 0,
        transitionEndAt: 100
    };
    const drawCalls = [];
    const ctx = {
        globalAlpha: 1,
        drawImage(canvas, sx, sy, sw, sh) {
            drawCalls.push({ canvas: canvas.id, alpha: this.globalAlpha, sx, sy, sw, sh });
        },
        save() {},
        restore() {
            this.globalAlpha = 1;
        }
    };

    const originalPerformance = globalThis.performance;
    globalThis.performance = { now: () => 50 };
    try {
        manager.drawTileEntry(ctx, entry, 10, 20, 30);
        assert.deepEqual(drawCalls, [
            { canvas: 'old', alpha: 1, sx: 10, sy: 20, sw: 30, sh: 30 },
            { canvas: 'new', alpha: 0.5, sx: 10, sy: 20, sw: 30, sh: 30 }
        ]);
        assert.equal(entry.transitionCanvas.id, 'old');

        globalThis.performance = { now: () => 120 };
        manager.drawTileEntry(ctx, entry, 10, 20, 30);
        assert.equal(entry.transitionCanvas, null);
        assert.deepEqual(released, ['old']);
    } finally {
        globalThis.performance = originalPerformance;
    }
});

test('MapTileManager exposes debug tile stats for queue, state, and pool inspection', () => {
    const manager = new MapTileManager({
        sampleTerrainHeight() {
            return 0;
        }
    });

    manager.stats.created = 3;
    manager.stats.enqueued = 5;
    manager.stats.rerendered = 2;
    manager.stats.invalidated = 1;
    manager.stats.lastVisible = 4;
    manager.stats.lastFrameLod = 16;
    manager.currentLod = 16;
    manager.canvasPool.push({}, {});
    manager.renderQueue.push({ key: 'pending-job' });
    manager.tiles.set('16_0_0', { status: 'ready' });
    manager.tiles.set('16_0_1', { status: 'stale' });
    manager.tiles.set('16_1_0', { status: 'pending' });

    assert.deepEqual(manager.getDebugStats(), {
        created: 3,
        enqueued: 5,
        rerendered: 2,
        invalidated: 1,
        lastVisible: 4,
        lastFrameLod: 16,
        ready: 1,
        stale: 1,
        pending: 1,
        total: 3,
        queued: 1,
        pooledCanvases: 2,
        currentLod: 16
    });
});

test('MapTileManager reuses pooled canvases after clearing the tile cache', () => {
    const createdCanvases = [];
    globalThis.document = {
        createElement(tag) {
            assert.equal(tag, 'canvas');
            const canvas = {
                width: 0,
                height: 0,
                getContext() {
                    return {
                        createImageData(width, height) {
                            return { data: new Uint8ClampedArray(width * height * 4) };
                        },
                        putImageData() {}
                    };
                }
            };
            createdCanvases.push(canvas);
            return canvas;
        }
    };

    try {
        const manager = new MapTileManager({
            sampleTerrainHeight() {
                return 0;
            }
        });
        manager.processQueue = () => {};

        const firstCanvas = manager.getTile(0, 0, 4);
        assert.equal(firstCanvas, null);
        assert.equal(createdCanvases.length, 1);

        manager.clearCache();
        const secondCanvas = manager.getTile(1, 0, 4);
        assert.equal(secondCanvas, null);
        assert.equal(createdCanvases.length, 1);
        assert.equal(manager.tiles.get('4_1_0').canvas, createdCanvases[0]);
    } finally {
        delete globalThis.document;
    }
});

test('MapTileManager keeps stale tile pixels visible while re-rendering invalidated tiles', async () => {
    globalThis.requestAnimationFrame = (callback) => {
        setTimeout(callback, 0);
        return 1;
    };

    try {
        const paintedFrames = [];
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
                                paintedFrames.push(Array.from(imageData.data));
                            }
                        };
                    }
                };
            }
        };

        let renderCount = 0;
        const manager = new MapTileManager({
            sampleTerrainHeight() {
                return 0;
            },
            tileSize: 1,
            pixelRatio: 1,
            renderTileAsync: async () => {
                renderCount += 1;
                const value = renderCount === 1 ? 1 : 9;
                return {
                    pixels: new Uint8ClampedArray([value, 2, 3, 255]),
                    width: 1,
                    height: 1
                };
            }
        });

        manager.getTile(0, 0, 1);
        await new Promise(resolve => setTimeout(resolve, 20));
        const entry = manager.tiles.get('1_0_0');
        assert.equal(entry.status, 'ready');
        assert.equal(entry.hasPixels, true);

        manager.invalidateWorldRect(0, 0, 1, 1);
        assert.equal(entry.status, 'stale');
        const visibleCanvas = manager.getTile(0, 0, 1);
        assert.equal(visibleCanvas, entry.canvas);

        await new Promise(resolve => setTimeout(resolve, 20));
        assert.equal(entry.status, 'ready');
        assert.deepEqual(paintedFrames, [
            [1, 2, 3, 255],
            [9, 2, 3, 255]
        ]);
    } finally {
        delete globalThis.document;
        delete globalThis.requestAnimationFrame;
    }
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
