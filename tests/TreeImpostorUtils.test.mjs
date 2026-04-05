import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  buildSilhouetteFriendlyFrameLayout,
  buildOctahedralFrameDirections,
  decodeOctahedralDirection,
  encodeOctahedralDirection,
  findTwoNearestImpostorFrames,
  findWeightedImpostorFrames,
  resolveTreeImpostorFraming
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

test('silhouette-friendly frame layout uses unique directions and semantic frame bands', () => {
  const layout = buildSilhouetteFriendlyFrameLayout();
  assert.equal(layout.directions.length, 16);
  assert.equal(layout.frameBands.length, 16);
  assert.equal(layout.viewBlendMode, 'direction-weighted');
  assert.equal(layout.gridCols, 4);
  assert.equal(layout.gridRows, 4);
  assert.equal(layout.elevatedThreshold, 0.52);
  assert.equal(layout.highCardinalThreshold, 0.82);

  const counts = layout.frameBands.reduce((acc, band) => {
    acc[band] = (acc[band] || 0) + 1;
    return acc;
  }, {});
  assert.deepEqual(counts, {
    horizon: 8,
    elevated: 4,
    'high-cardinal': 4
  });

  const uniqueDirections = new Set(layout.directions.map((direction) => (
    direction.toArray().map((value) => value.toFixed(6)).join(',')
  )));
  assert.equal(uniqueDirections.size, 16, 'Expected all silhouette-friendly frame directions to be unique');
});

test('resolveTreeImpostorFraming honors explicit contentRect values', () => {
  const framing = resolveTreeImpostorFraming({
    boundsMin: [-0.4, -0.2, -0.3],
    boundsMax: [0.4, 0.8, 0.5],
    captureOrthoScale: 2,
    contentRect: {
      x: 0.2,
      y: 0.15,
      width: 0.6,
      height: 0.7
    }
  });

  assert.equal(framing.captureOrthoScale, 2);
  assert.deepEqual(framing.contentRect, {
    x: 0.2,
    y: 0.15,
    width: 0.6,
    height: 0.7
  });
  assert.equal(framing.padding.bottom, 0.15);
  assert.equal(framing.visibleHeightRatio, 0.7);
});

test('resolveTreeImpostorFraming derives legacy framing from bounds and capture size', () => {
  const framing = resolveTreeImpostorFraming({
    boundsMin: [-0.47694703936576843, -0.48308199644088745, -0.0073930732905864716],
    boundsMax: [0.4342121183872223, 0.5290279984474182, 1.032127857208252]
  });

  assert.ok(Math.abs(framing.captureOrthoScale - 1.975089767947793) < 1e-9);
  assert.ok(Math.abs(framing.contentRect.x - 0.2368421052631579) < 1e-9);
  assert.ok(Math.abs(framing.contentRect.y - 0.24378126723325255) < 1e-9);
  assert.ok(Math.abs(framing.contentRect.width - 0.5263157894736842) < 1e-9);
  assert.ok(Math.abs(framing.contentRect.height - 0.5124374655334949) < 1e-9);
});

test('direction-weighted selection keeps low side-front views in the horizon band', () => {
  const layout = buildSilhouetteFriendlyFrameLayout();
  const sideFront = new THREE.Vector3(0.62, 0.18, 0.76).normalize();
  const selection = findWeightedImpostorFrames(sideFront, layout);

  assert.equal(layout.frameBands[selection.primaryIndex], 'horizon');
  assert.ok([4, 5].includes(selection.primaryIndex), `Expected side-front primary frame to stay on horizon ring, got ${selection.primaryIndex}`);

  const horizonWeight = selection.frameWeights.reduce((sum, entry) => (
    layout.frameBands[entry.index] === 'horizon' ? sum + entry.weight : sum
  ), 0);
  const elevatedWeight = selection.frameWeights.reduce((sum, entry) => (
    layout.frameBands[entry.index] === 'elevated' ? sum + entry.weight : sum
  ), 0);
  const highCardinalWeight = selection.frameWeights.reduce((sum, entry) => (
    layout.frameBands[entry.index] === 'high-cardinal' ? sum + entry.weight : sum
  ), 0);

  assert.ok(horizonWeight > elevatedWeight, `Expected horizon frames to outweigh elevated ones (${horizonWeight} vs ${elevatedWeight})`);
  assert.ok(horizonWeight > highCardinalWeight, `Expected horizon frames to outweigh high-cardinal ones (${horizonWeight} vs ${highCardinalWeight})`);
});

test('direction-weighted selection promotes elevated frames only once view pitch rises', () => {
  const layout = buildSilhouetteFriendlyFrameLayout();
  const elevatedSideFront = new THREE.Vector3(0.46, 0.72, 0.52).normalize();
  const selection = findWeightedImpostorFrames(elevatedSideFront, layout);

  assert.equal(layout.frameBands[selection.primaryIndex], 'elevated');
  assert.ok([10, 14].includes(selection.primaryIndex), `Expected elevated side-front to choose an elevated-compatible frame, got ${selection.primaryIndex}`);
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
  const layout = buildSilhouetteFriendlyFrameLayout();
  const metadata = {
    frameCount: layout.directions.length,
    grid: { cols: layout.gridCols, rows: layout.gridRows },
    directions: layout.directions,
    frameBands: layout.frameBands,
    viewBlendMode: layout.viewBlendMode,
    elevatedThreshold: layout.elevatedThreshold,
    highCardinalThreshold: layout.highCardinalThreshold
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
  const layout = buildSilhouetteFriendlyFrameLayout();
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
      directions: layout.directions,
      frameBands: layout.frameBands,
      gridCols: layout.gridCols,
      gridRows: layout.gridRows,
      atlasTexelSize: [1 / 1024, 1 / 1024],
      contentRect: { x: 0.2, y: 0.1, width: 0.6, height: 0.75 },
      depthStrength: 4,
      viewBlendMode: layout.viewBlendMode,
      elevatedThreshold: layout.elevatedThreshold,
      highCardinalThreshold: layout.highCardinalThreshold
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
  assert.match(shader.fragmentShader, /uTreeImpostorContentRect/);
  assert.match(shader.fragmentShader, /contentUv = uTreeImpostorContentRect\.xy \+ \(clamp\(baseUv, 0\.0, 1\.0\) \* uTreeImpostorContentRect\.zw\)/);
  assert.match(shader.fragmentShader, /uTreeLightDirWorld/);
  assert.match(shader.vertexShader, /uTreeImpostorFrameBands/);
  assert.match(shader.vertexShader, /uTreeImpostorElevatedThreshold/);
  assert.match(shader.vertexShader, /uTreeImpostorHighCardinalThreshold/);
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
  const layout = buildSilhouetteFriendlyFrameLayout();
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
      directions: layout.directions,
      frameBands: layout.frameBands,
      gridCols: layout.gridCols,
      gridRows: layout.gridRows,
      atlasTexelSize: [1 / 1024, 1 / 1024],
      contentRect: { x: 0.2, y: 0.1, width: 0.6, height: 0.75 },
      depthStrength: 4,
      viewBlendMode: layout.viewBlendMode,
      elevatedThreshold: layout.elevatedThreshold,
      highCardinalThreshold: layout.highCardinalThreshold
    }
  });

  assert.match(shader.vertexShader, /uTreeLightDirWorld/);
  assert.match(shader.vertexShader, /uTreeImpostorFrameBands/);
  assert.match(shader.vertexShader, /dot\(lightDir, instanceXAxis\)/);
  assert.match(shader.fragmentShader, /uTreeImpostorDepthTex/);
  assert.match(shader.fragmentShader, /uTreeImpostorContentRect/);
  assert.match(shader.fragmentShader, /contentUv = uTreeImpostorContentRect\.xy \+ \(clamp\(baseUv, 0\.0, 1\.0\) \* uTreeImpostorContentRect\.zw\)/);
});
