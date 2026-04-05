import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  buildOctahedralFrameDirections,
  decodeOctahedralDirection,
  encodeOctahedralDirection,
  findTwoNearestImpostorFrames,
  findWeightedImpostorFrames
} from '../js/modules/world/terrain/TreeImpostorUtils.js';
import { createRuntimeLodSettings } from '../js/modules/world/LodSystem.js';
import { makeTreeOctahedralDepthMaterial, makeTreeOctahedralMaterial } from '../js/modules/world/terrain/TerrainMaterials.js';
import { applyTreeOctahedralShaderPatch as applyColorPatch, applyTreeOctahedralDepthShaderPatch as applyDepthPatch } from '../js/modules/world/terrain/TerrainShaderPatches.ts';

test('octahedral encode/decode stays stable at poles and cardinal directions', () => {
  const directions = [
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1)
  ];

  for (const direction of directions) {
    const decoded = decodeOctahedralDirection(encodeOctahedralDirection(direction));
    assert.ok(decoded.dot(direction) > 0.98, `Expected ${decoded.toArray()} to match ${direction.toArray()}`);
  }
});

test('octahedral frame selection stays continuous across nearby seam directions', () => {
  const frames = buildOctahedralFrameDirections(4);
  const left = new THREE.Vector3(0.02, 0.78, 0.62).normalize();
  const right = new THREE.Vector3(-0.02, 0.78, 0.62).normalize();

  const leftSelection = findTwoNearestImpostorFrames(left, frames);
  const rightSelection = findTwoNearestImpostorFrames(right, frames);

  const leftSet = new Set([leftSelection.primaryIndex, leftSelection.secondaryIndex]);
  const rightSet = new Set([rightSelection.primaryIndex, rightSelection.secondaryIndex]);
  const overlap = [...leftSet].filter((index) => rightSet.has(index));
  assert.ok(overlap.length >= 1, 'Expected adjacent seam samples to share at least one impostor frame');
});

test('weighted impostor selection uses a stable local neighborhood in octahedral grid space', () => {
  const left = new THREE.Vector3(0.02, 0.78, 0.62).normalize();
  const right = new THREE.Vector3(-0.02, 0.78, 0.62).normalize();

  const leftSelection = findWeightedImpostorFrames(left, 4, 4);
  const rightSelection = findWeightedImpostorFrames(right, 4, 4);

  assert.ok(leftSelection.frameWeights.length >= 2);
  assert.ok(rightSelection.frameWeights.length >= 2);

  const leftSet = new Set(leftSelection.frameWeights.map((entry) => entry.index));
  const rightSet = new Set(rightSelection.frameWeights.map((entry) => entry.index));
  const overlap = [...leftSet].filter((index) => rightSet.has(index));
  assert.ok(overlap.length >= 2, 'Expected seam-adjacent weighted samples to share at least two neighborhood frames');

  const leftWeightSum = leftSelection.frameWeights.reduce((sum, entry) => sum + entry.weight, 0);
  const rightWeightSum = rightSelection.frameWeights.reduce((sum, entry) => sum + entry.weight, 0);
  assert.ok(Math.abs(leftWeightSum - 1) < 1e-6);
  assert.ok(Math.abs(rightWeightSum - 1) < 1e-6);
});

test('runtime LOD defaults resolve to octahedral then octahedral then disabled', () => {
  const lodSettings = createRuntimeLodSettings();
  assert.equal(lodSettings.terrain.lodLevels[0].treeRenderMode, 'octahedral');
  assert.equal(lodSettings.terrain.lodLevels[1].treeRenderMode, 'octahedral');
  assert.equal(lodSettings.terrain.lodLevels[2].treeRenderMode, 'disabled');
  assert.equal(lodSettings.terrain.lodLevels[3].treeRenderMode, 'disabled');
  assert.deepEqual(lodSettings.terrain.ringThresholds, [0, 3, 8]);
});

test('octahedral tree materials build shader pipeline metadata', () => {
  const colorTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  colorTexture.needsUpdate = true;
  colorTexture.colorSpace = THREE.SRGBColorSpace;
  const normalTexture = new THREE.DataTexture(new Uint8Array([128, 255, 128, 255]), 1, 1, THREE.RGBAFormat);
  normalTexture.needsUpdate = true;
  const depthTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  depthTexture.needsUpdate = true;
  const metadata = {
    frameCount: 4,
    grid: { cols: 2, rows: 2 },
    directions: buildOctahedralFrameDirections(2)
  };

  const colorMaterial = makeTreeOctahedralMaterial(colorTexture, normalTexture, depthTexture, metadata);
  const depthMaterial = makeTreeOctahedralDepthMaterial(
    colorTexture,
    depthTexture,
    { value: new THREE.Vector3() },
    { value: new THREE.Vector3(0.25, 0.85, 0.45).normalize() },
    metadata
  );

  assert.match(colorMaterial.userData?.shaderPipeline?.baseCacheKey || '', /tree-octahedral/);
  assert.match(depthMaterial.userData?.shaderPipeline?.baseCacheKey || '', /tree-octahedral-depth/);
  assert.equal(colorMaterial.alphaMap, null);
  assert.equal(depthMaterial.alphaMap, colorTexture);
});

test('octahedral shader patches wire lighting uniforms without duplicate vertex varyings', () => {
  const directions = buildOctahedralFrameDirections(2);
  const baseVertexShader = `
#include <common>
#include <begin_vertex>
#include <beginnormal_vertex>
#include <project_vertex>
`;
  const baseFragmentShader = `
#include <common>
#include <map_fragment>
#include <normal_fragment_maps>
vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
`;
  const shader = {
    uniforms: {},
    vertexShader: baseVertexShader,
    fragmentShader: baseFragmentShader
  };

  applyColorPatch(shader, {
    impostor: {
      directions,
      gridCols: 2,
      gridRows: 2,
      atlasTexelSize: [1 / 1024, 1 / 1024],
      depthStrength: 4
    },
    lighting: {
      lightDirUniform: { value: new THREE.Vector3(0.25, 0.85, 0.45).normalize() },
      lightColorUniform: { value: new THREE.Color(0xffffff) },
      lightIntensityUniform: { value: 1 },
      depthTexture: new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat)
    },
    debug: {
      modeUniform: { value: 11 },
      freezeFrameIndexUniform: { value: 1 },
      disableFrameBlendUniform: { value: 1 },
      flipNormalZUniform: { value: 1 }
    }
  });

  assert.equal((shader.vertexShader.match(/varying vec3 vTreeInstanceXAxis;/g) || []).length, 1);
  assert.match(shader.fragmentShader, /uTreeImpostorDepthTex/);
  assert.match(shader.fragmentShader, /uTreeLightDirWorld/);
  assert.match(shader.vertexShader, /uTreeImpostorDebugFreezeFrameIndex/);
  assert.match(shader.vertexShader, /uTreeImpostorDebugDisableFrameBlend/);
  assert.match(shader.vertexShader, /frozenIndex = clamp\(floor\(uTreeImpostorDebugFreezeFrameIndex \+ 0\.5\)/);
  assert.match(shader.fragmentShader, /uTreeImpostorDebugMode/);
  assert.match(shader.fragmentShader, /uTreeImpostorDebugFlipNormalZ/);
  assert.match(shader.fragmentShader, /fsimTreeDebugRawNormalColor/);
  assert.match(shader.fragmentShader, /fsimTreeDebugLocalNormal/);
  assert.match(shader.fragmentShader, /fsimTreeDebugWorldNormal/);
  assert.match(shader.fragmentShader, /fsimTreeDebugViewNormal/);
  assert.match(shader.vertexShader, /vTreeImpostorIndices/);
  assert.match(shader.vertexShader, /vTreeImpostorWeights/);
  assert.match(shader.fragmentShader, /normal = normalize\(\(viewMatrix \* vec4\(worldNormal, 0\.0\)\)\.xyz\);/);
  assert.match(shader.fragmentShader, /vec3 treeLightDirWorld = uTreeLightDirWorld \* \(uTreeImpostorDebugFlipLightDir > 0\.5 \? -1\.0 : 1\.0\);/);
  assert.match(shader.fragmentShader, /vec3 treeLightDir = normalize\(mat3\(viewMatrix\) \* treeLightDirWorld\);/);
  assert.match(shader.fragmentShader, /if \(uTreeImpostorDebugMode > 0\.5\)/);
});

test('octahedral depth patch uses light-driven shadow selection', () => {
  const directions = buildOctahedralFrameDirections(2);
  const shader = {
    uniforms: {},
    defines: {},
    vertexShader: `
#include <common>
#include <begin_vertex>
#include <project_vertex>
`,
    fragmentShader: `
#include <common>
#include <alphamap_fragment>
`
  };

  applyDepthPatch(shader, {
    mainCameraPosUniform: { value: new THREE.Vector3() },
    lightDirUniform: { value: new THREE.Vector3(0.25, 0.85, 0.45).normalize() },
    depthTexture: new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat),
    impostor: {
      directions,
      gridCols: 2,
      gridRows: 2,
      atlasTexelSize: [1 / 1024, 1 / 1024],
      depthStrength: 4
    }
  });

  assert.match(shader.vertexShader, /uTreeLightDirWorld/);
  assert.match(shader.vertexShader, /dot\(lightDir, instanceXAxis\)/);
  assert.match(shader.fragmentShader, /uTreeImpostorDepthTex/);
});
