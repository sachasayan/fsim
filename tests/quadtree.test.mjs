import test from 'node:test';
import assert from 'node:assert/strict';
import { QuadtreeMapSampler } from '../js/modules/world/terrain/TerrainUtils.js';

/**
 * Helper to create a minimal 1-level Quadtree buffer (1 Root + 4 Leaves)
 * Total Nodes = 5
 */
function createMockQuadtreeBuffer() {
    const HEADER_SIZE = 32;
    const NODE_SIZE = 32;
    const LEAF_RES = 64;
    const STRIDE = LEAF_RES + 1;
    const BLOCK_SIZE = STRIDE * STRIDE * 2;

    const buffer = new ArrayBuffer(HEADER_SIZE + 5 * NODE_SIZE + 4 * BLOCK_SIZE);
    const view = new DataView(buffer);

    view.setUint32(0, 0x51545245, true); // Magic
    view.setUint32(4, 1, true);          // Version
    view.setFloat32(8, 1000, true);      // WorldSize = 1000m
    view.setUint32(12, 5, true);         // TotalNodes = 5
    view.setUint32(16, 0, true);         // MetaOff (None)
    view.setUint32(20, 0, true);         // MetaSize (0)

    // Node 0: Root (Branch)
    const NODE0_OFF = HEADER_SIZE;
    view.setUint32(NODE0_OFF, 0, true);         // type: Branch
    view.setFloat32(NODE0_OFF + 4, -500, true); // x
    view.setFloat32(NODE0_OFF + 8, -500, true); // z
    view.setFloat32(NODE0_OFF + 12, 1000, true);// size
    view.setUint32(NODE0_OFF + 16, 1, true);    // child 0
    view.setUint32(NODE0_OFF + 20, 2, true);    // child 1
    view.setUint32(NODE0_OFF + 24, 3, true);    // child 2
    view.setUint32(NODE0_OFF + 28, 4, true);    // child 3

    let dataOff = HEADER_SIZE + 5 * NODE_SIZE;

    // Nodes 1-4: Leaves
    const subSize = 500;
    const coords = [
        [-500, -500], [0, -500], [-500, 0], [0, 0]
    ];

    for (let i = 0; i < 4; i++) {
        const off = HEADER_SIZE + (i + 1) * NODE_SIZE;
        view.setUint32(off, 1, true);              // type: Leaf
        view.setFloat32(off + 4, coords[i][0], true);
        view.setFloat32(off + 8, coords[i][1], true);
        view.setFloat32(off + 12, subSize, true);
        view.setUint32(off + 16, dataOff, true);   // dataOffset

        // Fill data block with a recognizable value for each quadrant
        const data = new Uint16Array(buffer, dataOff, STRIDE * STRIDE);
        const fillVal = (i + 1) * 10000; // 10000, 20000, 30000, 40000
        data.fill(fillVal);

        dataOff += BLOCK_SIZE;
    }

    return buffer;
}

test('QuadtreeMapSampler: Loads header correctly', () => {
    const buffer = createMockQuadtreeBuffer();
    const sampler = new QuadtreeMapSampler(buffer);
    assert.equal(sampler.worldSize, 1000);
    assert.equal(sampler.numNodes, 5);
});

test('QuadtreeMapSampler: Samples correct quadrant', () => {
    const buffer = createMockQuadtreeBuffer();
    const sampler = new QuadtreeMapSampler(buffer);

    // Quad 1: Top-Left (-250, -250) -> should be ~10000
    // Denormalization: (h / 65535) * 2000 - 200
    const h1 = sampler.getAltitudeAt(-250, -250);
    const expected1 = (10000 / 65535) * 2000 - 200;
    assert.ok(Math.abs(h1 - expected1) < 0.01);

    // Quad 2: Top-Right (250, -250) -> should be ~20000
    const h2 = sampler.getAltitudeAt(250, -250);
    const expected2 = (20000 / 65535) * 2000 - 200;
    assert.ok(Math.abs(h2 - expected2) < 0.01);

    // Quad 4: Bottom-Right (250, 250) -> should be ~40000
    const h4 = sampler.getAltitudeAt(250, 250);
    const expected4 = (40000 / 65535) * 2000 - 200;
    assert.ok(Math.abs(h4 - expected4) < 0.01);
});

test('QuadtreeMapSampler: Handles out of bounds', () => {
    const buffer = createMockQuadtreeBuffer();
    const sampler = new QuadtreeMapSampler(buffer);
    assert.equal(sampler.getAltitudeAt(1000, 0), -100);
    assert.equal(sampler.getAltitudeAt(0, -1000), -100);
});

test('QuadtreeMapSampler: Bilinear interpolation check', () => {
    const HEADER_SIZE = 32;
    const NODE_SIZE = 32;
    const LEAF_RES = 64;
    const STRIDE = LEAF_RES + 1;
    const BLOCK_SIZE = STRIDE * STRIDE * 2;

    const buffer = new ArrayBuffer(HEADER_SIZE + NODE_SIZE + BLOCK_SIZE);
    const view = new DataView(buffer);
    view.setUint32(0, 0x51545245, true);
    view.setUint32(4, 1, true);
    view.setFloat32(8, 1000, true);
    view.setUint32(12, 1, true); // 1 node
    view.setUint32(16, 0, true); // MetaOff
    view.setUint32(20, 0, true); // MetaSize

    view.setUint32(HEADER_SIZE, 1, true); // Leaf
    view.setFloat32(HEADER_SIZE + 4, -500, true);
    view.setFloat32(HEADER_SIZE + 8, -500, true);
    view.setFloat32(HEADER_SIZE + 12, 1000, true);
    view.setUint32(HEADER_SIZE + 16, HEADER_SIZE + NODE_SIZE, true);

    const data = new Uint16Array(buffer, HEADER_SIZE + NODE_SIZE, STRIDE * STRIDE);
    data.fill(0);
    // Set (0,0) = 0, (1,0) = 65535
    data[0] = 0;
    data[1] = 65535;

    const sampler = new QuadtreeMapSampler(buffer);

    // Sample exactly on (0,0) relative to leaf
    // World (-500, -500)
    assert.equal(sampler.getAltitudeAt(-500, -500), -200);

    // Sample half-way between pixels (0.5, 0) relative to leaf resolution
    // Pixel width = Size/LEAF_RES = 1000/64 = 15.625m
    // Half way = 7.8125m
    const midX = -500 + 7.8125;
    const hMid = sampler.getAltitudeAt(midX, -500);
    // (0.5 * 65535 / 65535) * 2000 - 200 = 0.5 * 2000 - 200 = 800
    assert.ok(Math.abs(hMid - 800) < 1.0);
});
