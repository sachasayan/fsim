import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// Provide a mock document and canvas environment since this runs in Node.js
global.document = {
  createElement: (tag) => {
    if (tag === 'canvas') {
      const canvas = {
        width: 0,
        height: 0,
        getContext: (type) => {
          if (type === '2d') {
            return {
              createImageData: (w, h) => {
                return {
                  data: new Uint8ClampedArray(w * h * 4),
                  width: w,
                  height: h
                };
              },
              putImageData: () => {},
              clearRect: () => {},
              fillRect: () => {},
              beginPath: () => {},
              moveTo: () => {},
              lineTo: () => {},
              closePath: () => {},
              fill: () => {},
              ellipse: () => {},
              stroke: () => {},
              arc: () => {}
            };
          }
          return null;
        }
      };
      return canvas;
    }
    return {};
  }
};

import { createPackedTerrainDetailTexture, createWaterNormalMap, createTreeBillboardTexture } from '../js/modules/world/terrain/TerrainTextures.js';

test('createPackedTerrainDetailTexture - creates a texture with expected properties', () => {
  const tex = createPackedTerrainDetailTexture();

  // Verify it's a CanvasTexture
  assert.ok(tex instanceof THREE.CanvasTexture);

  // Verify wrapping is set to repeat
  assert.equal(tex.wrapS, THREE.RepeatWrapping);
  assert.equal(tex.wrapT, THREE.RepeatWrapping);

  // Verify color space is NoColorSpace because it's a data texture
  assert.equal(tex.colorSpace, THREE.NoColorSpace);

  // Verify filtering
  assert.equal(tex.minFilter, THREE.LinearMipMapLinearFilter);
  assert.equal(tex.magFilter, THREE.LinearFilter);

  // Verify mipmaps are generated
  assert.equal(tex.generateMipmaps, true);
});

test('createPackedTerrainDetailTexture - writes correctly shaped data to canvas', () => {
  let putImageDataCalled = false;
  let imgDataPassed = null;
  let canvasSize = { width: 0, height: 0 };

  // Create a more specific mock just for this test
  const originalCreateElement = global.document.createElement;
  global.document.createElement = (tag) => {
    if (tag === 'canvas') {
      const canvas = {
        width: 0,
        height: 0,
        getContext: (type) => {
          if (type === '2d') {
            return {
              createImageData: (w, h) => {
                canvasSize.width = w;
                canvasSize.height = h;
                return {
                  data: new Uint8ClampedArray(w * h * 4),
                  width: w,
                  height: h
                };
              },
              putImageData: (imgData, x, y) => {
                putImageDataCalled = true;
                imgDataPassed = imgData;
                assert.equal(x, 0);
                assert.equal(y, 0);
              }
            };
          }
          return null;
        }
      };
      return canvas;
    }
    return originalCreateElement(tag);
  };

  try {
    createPackedTerrainDetailTexture();

    assert.ok(putImageDataCalled, 'putImageData should be called');
    assert.ok(imgDataPassed, 'Should have passed ImageData to putImageData');

    // Verify texture size is 128x128
    assert.equal(canvasSize.width, 128);
    assert.equal(canvasSize.height, 128);

    // Verify that data was actually written (not all zeros)
    let hasNonZero = false;
    for (let i = 0; i < imgDataPassed.data.length; i++) {
      if (imgDataPassed.data[i] !== 0) {
        hasNonZero = true;
        break;
      }
    }
    assert.ok(hasNonZero, 'ImageData should contain generated noise data, not just zeros');

  } finally {
    global.document.createElement = originalCreateElement;
  }
});

test('createWaterNormalMap - creates a texture with expected properties', () => {
  let putImageDataCalled = false;
  let imgDataPassed = null;
  let canvasSize = { width: 0, height: 0 };

  // Mock Noise for deterministic values
  const mockNoise = {
    fractal: (x, y, octaves, persistence, lacunarity) => {
      // Mock some deterministic, varying fractal noise value
      return (Math.sin(x) * Math.cos(y) + 1) / 2;
    }
  };

  const originalCreateElement = global.document.createElement;
  global.document.createElement = (tag) => {
    if (tag === 'canvas') {
      const canvas = {
        width: 0,
        height: 0,
        getContext: (type) => {
          if (type === '2d') {
            return {
              createImageData: (w, h) => {
                canvasSize.width = w;
                canvasSize.height = h;
                return {
                  data: new Uint8ClampedArray(w * h * 4),
                  width: w,
                  height: h
                };
              },
              putImageData: (imgData, x, y) => {
                putImageDataCalled = true;
                imgDataPassed = imgData;
                assert.equal(x, 0);
                assert.equal(y, 0);
              }
            };
          }
          return null;
        }
      };
      return canvas;
    }
    return originalCreateElement(tag);
  };

  try {
    const tex = createWaterNormalMap(mockNoise);

    assert.ok(tex instanceof THREE.CanvasTexture);

    // Verify wrapping and repetition
    assert.equal(tex.wrapS, THREE.RepeatWrapping);
    assert.equal(tex.wrapT, THREE.RepeatWrapping);
    assert.equal(tex.repeat.x, 256);
    assert.equal(tex.repeat.y, 256);

    // Verify correct dimension and data
    assert.ok(putImageDataCalled, 'putImageData should be called');
    assert.ok(imgDataPassed, 'Should have passed ImageData to putImageData');

    // Verify texture size is 512x512
    assert.equal(canvasSize.width, 512);
    assert.equal(canvasSize.height, 512);

    let hasNonZero = false;
    for (let i = 0; i < imgDataPassed.data.length; i++) {
      if (imgDataPassed.data[i] !== 0) {
        hasNonZero = true;
        break;
      }
    }
    assert.ok(hasNonZero, 'ImageData should contain generated water normal map data, not just zeros');
  } finally {
    global.document.createElement = originalCreateElement;
  }
});

test('createTreeBillboardTexture - creates a texture for different tree kinds', () => {
  const treeKinds = ['conifer', 'poplar', 'dry', 'broadleaf'];

  for (const kind of treeKinds) {
    const tex = createTreeBillboardTexture(kind);

    assert.ok(tex instanceof THREE.CanvasTexture);

    assert.equal(tex.colorSpace, THREE.SRGBColorSpace);
    assert.equal(tex.minFilter, THREE.LinearMipMapLinearFilter);
    assert.equal(tex.magFilter, THREE.LinearFilter);
    assert.equal(tex.generateMipmaps, true);
  }
});
