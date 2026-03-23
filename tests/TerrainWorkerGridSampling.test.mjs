import test from 'node:test';
import assert from 'node:assert/strict';

import { buildWaterDepthTextureData, sampleHeightGridBilinear } from '../js/modules/world/terrain/TerrainWorker.js';

test('sampleHeightGridBilinear interpolates across a regular height grid', () => {
    const stride = 2;
    const heights = new Float32Array([
        0, 10,
        20, 30
    ]);

    assert.equal(sampleHeightGridBilinear(heights, stride, 0, 0), 0);
    assert.equal(sampleHeightGridBilinear(heights, stride, 1, 1), 30);
    assert.equal(sampleHeightGridBilinear(heights, stride, 0.5, 0.5), 15);
});

test('buildWaterDepthTextureData can derive depth from the decoded leaf height grid without sampler lookups', () => {
    const node = { minX: 0, minZ: 0, size: 100 };
    const sampler = {
        getAltitudeAt() {
            throw new Error('sampler should not be used when source heights are provided');
        }
    };

    const result = buildWaterDepthTextureData(node, sampler, 4, {
        heights: new Float32Array([
            -200, -200,
            -200, -200
        ]),
        stride: 2
    });

    assert.equal(result.size, 4);
    assert.equal(result.data.length, 4 * 4 * 4);
    assert.equal(result.data[3], 255);
});
