import test from 'node:test';
import assert from 'node:assert/strict';

import { clearDistrictCache, loadDistrictChunk } from '../js/modules/world/terrain/CityChunkLoader.js';
import { DISTRICT_PROP_TYPES, serializeChunk } from '../tools/lib/WorldBuilderSerial.mjs';

function toArrayBuffer(buffer) {
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

test('loadDistrictChunk reads windmill prop streams from v4 chunks', async () => {
    const originalFetch = globalThis.fetch;
    clearDistrictCache();

    const chunkBuffer = serializeChunk(
        [{ x: 100, y: 12, z: 140, w: 18, h: 40, d: 16, angle: 0.3, classId: 2, colorIdx: 1 }],
        [{ x: 160, y: 18, z: 200, height: 110, rotorRadius: 22, angle: 1.2, phase: 0.7, typeId: DISTRICT_PROP_TYPES.windmill }]
    );

    globalThis.fetch = async () => ({
        ok: true,
        arrayBuffer: async () => toArrayBuffer(chunkBuffer)
    });

    try {
        const chunk = await loadDistrictChunk('district_windmill_test');
        assert.ok(chunk);
        assert.equal(chunk.buildings['0,0'].length, 1);
        assert.equal(chunk.props['0,0'].length, 1);
        assert.equal(chunk.props['0,0'][0].typeId, DISTRICT_PROP_TYPES.windmill);
        assert.equal(chunk.props['0,0'][0].rotorRadius, 22);
    } finally {
        globalThis.fetch = originalFetch;
        clearDistrictCache();
    }
});

test('loadDistrictChunk preserves compatibility with legacy chunks without props', async () => {
    const originalFetch = globalThis.fetch;
    clearDistrictCache();

    const chunkBuffer = serializeChunk(
        [{ x: 4100, y: 10, z: 4200, w: 14, h: 22, d: 12, angle: 0.6, classId: 4, colorIdx: 2 }],
        []
    );
    chunkBuffer.writeInt32LE(3, 4);

    globalThis.fetch = async () => ({
        ok: true,
        arrayBuffer: async () => toArrayBuffer(chunkBuffer)
    });

    try {
        const chunk = await loadDistrictChunk('district_legacy_test');
        assert.ok(chunk);
        assert.equal(chunk.buildings['1,1'].length, 1);
        assert.deepEqual(chunk.props, {});
    } finally {
        globalThis.fetch = originalFetch;
        clearDistrictCache();
    }
});
