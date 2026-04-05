import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildWorldAssetCatalog, buildWorldAssetDetail } from '../tools/lib/WorldAssetCatalog.mjs';
import { createBakeImpostorJobSpec, createProcessAssetJobSpec } from '../tools/lib/ModelViewerSupport.mjs';
import { clampCameraState, fitDistanceForRadius } from '../js/editor/model-viewer/cameraState.ts';

const root = process.cwd();

test('world asset catalog resolves preset-backed entries with derived file info', () => {
  const catalog = buildWorldAssetCatalog(root);
  assert.ok(catalog.length >= 20);

  const treeAsset = catalog.find((entry) => entry.assetName === 'tree-1');
  assert.ok(treeAsset);
  assert.equal(treeAsset.category, 'scenery');
  assert.equal(treeAsset.hasImpostorBake, true);
  assert.ok(treeAsset.files?.decimated.repoRelativePath?.endsWith('world/assets/decimated/scenery/tree-1.glb'));
});

test('world asset detail exposes impostor metadata for impostor-enabled assets', () => {
  const detail = buildWorldAssetDetail(root, 'tree-1');
  assert.ok(detail);
  assert.equal(detail.assetName, 'tree-1');
  assert.equal(detail.targetHeightMeters, 1.0295);
  assert.equal(detail.files.impostor?.metadata.exists, true);
  assert.equal(detail.impostorMetadata?.viewBlendMode, 'direction-weighted');
  assert.equal(detail.measuredTriangles.source, 49664);
  assert.equal(detail.measuredTriangles.decimated, 12000);
  assert.equal(detail.measuredTriangles.gameReady, null);
});

test('process asset job spec writes temp manifest and target-height overrides', () => {
  const spec = createProcessAssetJobSpec(root, {
    assetName: 'tree-1',
    dryRun: true,
    processOverrides: {
      targetTriangles: 7777,
      targetHeightMeters: 1.5
    },
    impostorOverrides: {
      gridSize: 4,
      frameSize: 512,
      outputDir: 'world/impostors/tree-1'
    }
  });

  try {
    assert.ok(spec.args.includes('--manifest'));
    assert.ok(spec.args.includes('--target-heights'));
    assert.ok(spec.args.includes('--dry-run'));

    const manifestPath = spec.args[spec.args.indexOf('--manifest') + 1];
    const targetHeightsPath = spec.args[spec.args.indexOf('--target-heights') + 1];
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const targetHeights = JSON.parse(fs.readFileSync(targetHeightsPath, 'utf8'));

    assert.deepEqual(Object.keys(manifest.assets), ['tree-1']);
    assert.equal(manifest.assets['tree-1'].targetTriangles, 7777);
    assert.equal(manifest.assets['tree-1'].impostorBake.frameSize, 512);
    assert.equal(targetHeights['tree-1'], 1.5);
  } finally {
    spec.cleanup?.();
  }
});

test('bake impostor job spec uses temp manifest overrides without rewriting tracked presets', () => {
  const spec = createBakeImpostorJobSpec(root, {
    assetName: 'tree-1',
    dryRun: true,
    impostorOverrides: {
      gridSize: 6,
      frameSize: 384,
      outputDir: 'world/impostors/tree-1-dev'
    }
  });

  try {
    assert.ok(spec.args.includes('--manifest'));
    assert.ok(spec.args.includes('--dry-run'));
    const manifestPath = spec.args[spec.args.indexOf('--manifest') + 1];
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.assets['tree-1'].impostorBake.gridSize, 6);
    assert.equal(manifest.assets['tree-1'].impostorBake.frameSize, 384);
    assert.equal(manifest.assets['tree-1'].impostorBake.outputDir, 'world/impostors/tree-1-dev');
  } finally {
    spec.cleanup?.();
  }
});

test('camera helpers clamp orbit state and compute bounded fit distances', () => {
  assert.deepEqual(clampCameraState({
    cameraYaw: 725,
    cameraPitch: 120,
    cameraDistance: 0.25
  }), {
    cameraYaw: 5,
    cameraPitch: 85,
    cameraDistance: 2
  });

  const fitDistance = fitDistanceForRadius(1.8, 42);
  assert.ok(fitDistance >= 2);
  assert.ok(fitDistance <= 18);
});
