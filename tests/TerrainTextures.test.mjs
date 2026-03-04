import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWaterNormalMap } from '../js/modules/world/terrain/TerrainTextures.js';

function setupCanvasMock() {
    let canvasSize = 0;
    let putImageDataCalled = false;
    let imgDataObj = null;

    global.document = {
        createElement: (tag) => {
            if (tag === 'canvas') {
                return {
                    set width(val) { canvasSize = val; },
                    set height(val) { canvasSize = val; },
                    getContext: (type) => {
                        assert.equal(type, '2d');
                        return {
                            createImageData: (w, h) => {
                                imgDataObj = { data: new Uint8ClampedArray(w * h * 4) };
                                return imgDataObj;
                            },
                            putImageData: (imgData, x, y) => {
                                putImageDataCalled = true;
                                assert.equal(imgData, imgDataObj);
                                assert.equal(x, 0);
                                assert.equal(y, 0);
                            }
                        };
                    }
                };
            }
        }
    };

    return {
        getCanvasSize: () => canvasSize,
        getImgDataObj: () => imgDataObj,
        isPutImageDataCalled: () => putImageDataCalled
    };
}

test('createWaterNormalMap generates a valid texture with correct normal vectors', () => {
    const mockState = setupCanvasMock();

    const mockNoise = {
        fractal: (x, y, octaves, persistence, scale) => {
            // Simple linear gradient for predictable gradients
            return x + y;
        }
    };

    const texture = createWaterNormalMap(mockNoise);

    assert.equal(mockState.getCanvasSize(), 512, 'Canvas size should be 512x512');
    assert.ok(mockState.isPutImageDataCalled(), 'putImageData should be called to update canvas');
    assert.ok(texture instanceof THREE.CanvasTexture, 'Should return a THREE.CanvasTexture');
    assert.equal(texture.wrapS, THREE.RepeatWrapping, 'wrapS should be RepeatWrapping');
    assert.equal(texture.wrapT, THREE.RepeatWrapping, 'wrapT should be RepeatWrapping');
    assert.equal(texture.repeat.x, 256, 'Repeat X should be set to minimize grid effect');
    assert.equal(texture.repeat.y, 256, 'Repeat Y should be set to minimize grid effect');

    const imgDataObj = mockState.getImgDataObj();

    // The alpha channel should be 255 for all pixels
    assert.equal(imgDataObj.data[3], 255, 'Alpha channel should be fully opaque');

    // With fractal(x, y) = x + y:
    // x varies by (scale / size) per step, y varies by (scale / size) per step
    // dx = (hx - h0) * 15.0 = (((x+1)/size*scale + y/size*scale) - (x/size*scale + y/size*scale)) * 15.0
    // dx = (scale / size) * 15.0 = (4 / 512) * 15.0 = 0.1171875
    // dy = (scale / size) * 15.0 = 0.1171875
    // dz = 1.0
    // len = sqrt(dx^2 + dy^2 + dz^2) = sqrt(0.0137 + 0.0137 + 1) = sqrt(1.027) = 1.0136
    // R = (dx/len * 0.5 + 0.5) * 255 = (0.1171875/1.0136 * 0.5 + 0.5) * 255 = 142
    // G = (dy/len * 0.5 + 0.5) * 255 = 142
    // B = (dz/len * 0.5 + 0.5) * 255 = (1.0/1.0136 * 0.5 + 0.5) * 255 = 253

    // R value roughly 142
    assert.ok(imgDataObj.data[0] > 130 && imgDataObj.data[0] < 150, 'R channel should correspond to dx normal');
    // G value roughly 142
    assert.ok(imgDataObj.data[1] > 130 && imgDataObj.data[1] < 150, 'G channel should correspond to dy normal');
    // B value roughly 253
    assert.ok(imgDataObj.data[2] > 240 && imgDataObj.data[2] <= 255, 'B channel should correspond to dz normal');
});

test('createWaterNormalMap handles flat noise appropriately', () => {
    const mockState = setupCanvasMock();

    const flatNoise = {
        fractal: () => 0 // Flat surface
    };

    const texture = createWaterNormalMap(flatNoise);

    const imgDataObj = mockState.getImgDataObj();

    // Flat noise means dx = 0, dy = 0, dz = 1.0, len = 1.0
    // R = (0/1.0 * 0.5 + 0.5) * 255 = 127
    // G = (0/1.0 * 0.5 + 0.5) * 255 = 127
    // B = (1.0/1.0 * 0.5 + 0.5) * 255 = 255

    // Check first pixel values
    assert.equal(imgDataObj.data[0], 127, 'Flat normal R channel should be 127');
    assert.equal(imgDataObj.data[1], 127, 'Flat normal G channel should be 127');
    assert.equal(imgDataObj.data[2], 255, 'Flat normal B channel should be 255');
    assert.equal(imgDataObj.data[3], 255, 'Alpha channel should be 255');
});
