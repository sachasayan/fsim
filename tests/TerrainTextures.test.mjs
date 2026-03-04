import test from 'node:test';
import assert from 'node:assert/strict';

import { createTreeBillboardTexture } from '../js/modules/world/terrain/TerrainTextures.js';
import * as THREE from 'three';

test('createTreeBillboardTexture creates texture with correct properties for different kinds', () => {
    // We need to mock document.createElement for canvas because we're running in Node
    const originalDocument = globalThis.document;

    // Store drawing calls to verify behavior
    let drawingCalls = [];

    globalThis.document = {
        createElement: (tag) => {
            if (tag === 'canvas') {
                return {
                    width: 0,
                    height: 0,
                    getContext: (type) => {
                        if (type === '2d') {
                            return {
                                clearRect: (...args) => drawingCalls.push({ method: 'clearRect', args }),
                                fillRect: (...args) => drawingCalls.push({ method: 'fillRect', args }),
                                beginPath: (...args) => drawingCalls.push({ method: 'beginPath', args }),
                                moveTo: (...args) => drawingCalls.push({ method: 'moveTo', args }),
                                lineTo: (...args) => drawingCalls.push({ method: 'lineTo', args }),
                                closePath: (...args) => drawingCalls.push({ method: 'closePath', args }),
                                fill: (...args) => drawingCalls.push({ method: 'fill', args }),
                                ellipse: (...args) => drawingCalls.push({ method: 'ellipse', args }),
                                arc: (...args) => drawingCalls.push({ method: 'arc', args }),
                                stroke: (...args) => drawingCalls.push({ method: 'stroke', args }),
                                set fillStyle(v) { drawingCalls.push({ method: 'fillStyle', val: v }); },
                                set strokeStyle(v) { drawingCalls.push({ method: 'strokeStyle', val: v }); },
                                set lineWidth(v) { drawingCalls.push({ method: 'lineWidth', val: v }); }
                            };
                        }
                        return null;
                    }
                };
            }
            return null;
        }
    };

    try {
        const kinds = ['conifer', 'poplar', 'dry', 'broadleaf'];

        for (const kind of kinds) {
            drawingCalls = [];
            const texture = createTreeBillboardTexture(kind);

            assert.ok(texture instanceof THREE.CanvasTexture, `Expected CanvasTexture for ${kind}`);

            // Verify Three.js texture properties
            assert.equal(texture.generateMipmaps, true, `generateMipmaps should be true for ${kind}`);
            assert.equal(texture.colorSpace, THREE.SRGBColorSpace, `colorSpace should be SRGBColorSpace for ${kind}`);
            assert.equal(texture.minFilter, THREE.LinearMipMapLinearFilter, `minFilter should be LinearMipMapLinearFilter for ${kind}`);
            assert.equal(texture.magFilter, THREE.LinearFilter, `magFilter should be LinearFilter for ${kind}`);

            // Verify canvas API was called appropriately
            assert.ok(drawingCalls.length > 0, `Canvas context methods should be called for ${kind}`);
            assert.equal(drawingCalls[0].method, 'clearRect', `Should clear canvas first for ${kind}`);
            assert.equal(drawingCalls[0].args[2], 128, `Width should be 128 for ${kind}`);
            assert.equal(drawingCalls[0].args[3], 256, `Height should be 256 for ${kind}`);

            // Trunk is always drawn
            const fillStyles = drawingCalls.filter(c => c.method === 'fillStyle').map(c => c.val);
            if (kind === 'dry') {
                assert.ok(fillStyles.includes('#6f5b45'), `Dry tree should have correct trunk color`);
                assert.ok(drawingCalls.some(c => c.method === 'stroke'), `Dry tree should draw branches with stroke`);
            } else {
                assert.ok(fillStyles.includes('#5a4029'), `Tree should have correct trunk color`);
                if (kind === 'conifer') {
                    assert.ok(drawingCalls.some(c => c.method === 'moveTo'), `Conifer should use path drawing`);
                } else if (kind === 'poplar') {
                    assert.ok(drawingCalls.some(c => c.method === 'ellipse'), `Poplar should use ellipse`);
                } else {
                    assert.ok(drawingCalls.some(c => c.method === 'arc'), `Broadleaf should use arc`);
                }
            }
        }
    } finally {
        globalThis.document = originalDocument;
    }
});
