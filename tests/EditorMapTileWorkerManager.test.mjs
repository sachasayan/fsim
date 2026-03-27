import test from 'node:test';
import assert from 'node:assert/strict';

import { createEditorMapTileWorkerManager } from '../js/editor/canvas/EditorMapTileWorkerManager.js';

function createFakeWorkerFactory() {
    const createdWorkers = [];

    return {
        createdWorkers,
        createWorker() {
            const worker = {
                terminated: false,
                postedMessages: [],
                onmessage: null,
                onerror: null,
                postMessage(message) {
                    this.postedMessages.push(message);
                },
                terminate() {
                    this.terminated = true;
                }
            };
            createdWorkers.push(worker);
            return worker;
        }
    };
}

test('EditorMapTileWorkerManager respawns crashed workers so later tile jobs can complete', async () => {
    const factory = createFakeWorkerFactory();
    const manager = createEditorMapTileWorkerManager({
        workerCount: 1,
        createWorker: () => factory.createWorker()
    });

    try {
        const firstJob = manager.renderTile({ tx: 0, tz: 0, lod: 8 });
        const firstWorker = factory.createdWorkers[0];
        assert.equal(firstWorker.postedMessages.length, 1);
        firstWorker.onerror({ message: 'boom' });
        await assert.rejects(firstJob, /boom/);
        assert.equal(firstWorker.terminated, true);

        const secondJob = manager.renderTile({ tx: 1, tz: 0, lod: 8 });
        const secondWorker = factory.createdWorkers[1];
        assert.notEqual(secondWorker, firstWorker);
        assert.equal(secondWorker.postedMessages.length, 1);
        const [{ jobId }] = secondWorker.postedMessages;
        secondWorker.onmessage({
            data: {
                type: 'renderTile_done',
                jobId,
                result: { pixels: new Uint8ClampedArray([1, 2, 3, 255]), width: 1, height: 1 }
            }
        });

        await assert.doesNotReject(secondJob);
    } finally {
        manager.destroy();
    }
});

test('EditorMapTileWorkerManager times out hung jobs and recovers with a fresh worker', async () => {
    const factory = createFakeWorkerFactory();
    const manager = createEditorMapTileWorkerManager({
        workerCount: 1,
        jobTimeoutMs: 10,
        createWorker: () => factory.createWorker()
    });

    try {
        const firstJob = manager.renderTile({ tx: 0, tz: 0, lod: 8 });
        const firstWorker = factory.createdWorkers[0];
        assert.equal(firstWorker.postedMessages.length, 1);
        await assert.rejects(firstJob, /timed out after 10ms/);
        assert.equal(firstWorker.terminated, true);

        const secondJob = manager.renderTile({ tx: 1, tz: 1, lod: 8 });
        const secondWorker = factory.createdWorkers[1];
        const [{ jobId }] = secondWorker.postedMessages;
        secondWorker.onmessage({
            data: {
                type: 'renderTile_done',
                jobId,
                result: { pixels: new Uint8ClampedArray([9, 8, 7, 255]), width: 1, height: 1 }
            }
        });

        const result = await secondJob;
        assert.deepEqual(Array.from(result.pixels), [9, 8, 7, 255]);
    } finally {
        manager.destroy();
    }
});
