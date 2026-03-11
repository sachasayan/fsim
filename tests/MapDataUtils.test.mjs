import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeMapData } from '../js/modules/world/MapDataUtils.js';

test('normalizeMapData normalizes authored road polylines', () => {
    const data = {
        roads: [
            {
                kind: 'taxiway',
                center: [1000, 2000],
                width: 24,
                points: [[-200, 0], [0, 0], [200, 0]]
            }
        ]
    };

    normalizeMapData(data);

    assert.equal(data.roads.length, 1);
    assert.equal(data.roads[0].kind, 'taxiway');
    assert.equal(data.roads[0].surface, 'asphalt');
    assert.equal(data.roads[0].width, 24);
    assert.ok(Math.abs(data.roads[0].feather - 8.4) < 1e-9);
    assert.deepEqual(data.roads[0].center, [1000, 2000]);
    assert.deepEqual(data.roads[0].points, [[800, 2000], [1000, 2000], [1200, 2000]]);
});
