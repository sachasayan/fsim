import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildWorldAssetCatalog, buildWorldAssetDetail } from '../tools/lib/WorldAssetCatalog.mjs';
import { createBakeImpostorJobSpec, createDiagnosticsJobSpec, createInspectImpostorJobSpec, createProcessAssetJobSpec } from '../tools/lib/ModelViewerSupport.mjs';
import { clampCameraState, fitDistanceForRadius } from '../js/editor/model-viewer/cameraState.ts';
import { normalizeTreeImpostorMetadata } from '../js/modules/world/terrain/TreeImpostorUtils.js';

const root = process.cwd();

test('world asset catalog resolves preset-backed entries with derived file info', () => {
  const catalog = buildWorldAssetCatalog(root);
  assert.ok(catalog.length >= 20);

  const treeAsset = catalog.find((entry) => entry.assetName === 'tree-1');
  const barnAsset = catalog.find((entry) => entry.assetName === 'barn');
  assert.ok(treeAsset);
  assert.ok(barnAsset);
  assert.equal(treeAsset.category, 'scenery');
  assert.equal(treeAsset.hasImpostorBake, true);
  assert.ok(treeAsset.files?.decimated.repoRelativePath?.endsWith('world/assets/decimated/scenery/tree-1.glb'));
  assert.equal(barnAsset.hasImpostorBake, true);
  assert.ok(barnAsset.files?.impostor?.baseDir.repoRelativePath?.endsWith('world/impostors/barn'));
});

test('world asset detail exposes impostor metadata for impostor-enabled assets', () => {
  const detail = buildWorldAssetDetail(root, 'tree-1');
  assert.ok(detail);
  assert.equal(detail.assetName, 'tree-1');
  assert.equal(detail.targetHeightMeters, 1.0295);
  assert.equal(detail.files.impostor?.metadata.exists, true);
  assert.equal(detail.impostorMetadata?.viewBlendMode, 'direction-weighted');
  assert.ok(Number.isFinite(detail.impostorMetadata?.captureOrthoScale));
  assert.ok(Number.isFinite(detail.impostorMetadata?.contentRect?.y));
  assert.ok(Number.isFinite(detail.impostorMetadata?.padding?.bottom));
  assert.equal(detail.measuredTriangles.source, 49664);
  assert.equal(detail.measuredTriangles.decimated, 12000);
  assert.equal(detail.measuredTriangles.gameReady, null);
});

test('world asset detail derives impostor bake defaults for non-tree assets', () => {
  const detail = buildWorldAssetDetail(root, 'barn');
  assert.ok(detail);
  assert.equal(detail.preset.impostorBake?.enabled, true);
  assert.equal(detail.preset.impostorBake?.gridSize, 4);
  assert.equal(detail.preset.impostorBake?.frameSize, 256);
  assert.equal(detail.preset.impostorBake?.outputDir, 'world/impostors/barn');
  assert.equal(detail.files.impostor?.metadata.exists, false);
});

test('world asset detail can resolve impostor files from a draft output override', () => {
  const detail = buildWorldAssetDetail(root, 'barn', {
    impostorOverrides: {
      outputDir: 'world/impostors/tree-1'
    }
  });

  assert.ok(detail);
  assert.equal(detail.preset.impostorBake?.outputDir, 'world/impostors/tree-1');
  assert.equal(detail.files.impostor?.metadata.exists, true);
  assert.equal(detail.impostorMetadata?.viewBlendMode, 'direction-weighted');
});

test('world asset detail normalizes impostor metadata with the shared runtime contract', () => {
  const detail = buildWorldAssetDetail(root, 'tree-1');
  const rawMetadata = JSON.parse(fs.readFileSync(`${root}/world/impostors/tree-1/metadata.json`, 'utf8'));
  const normalized = normalizeTreeImpostorMetadata(rawMetadata);

  assert.ok(detail?.impostorMetadata);
  assert.equal(detail.impostorMetadata.viewBlendMode, normalized.viewBlendMode);
  assert.deepEqual(detail.impostorMetadata.frameBands, normalized.frameBands);
  assert.equal(detail.impostorMetadata.frameCount, normalized.frameCount);
  assert.equal(detail.impostorMetadata.elevatedThreshold, normalized.elevatedThreshold);
  assert.equal(detail.impostorMetadata.highCardinalThreshold, normalized.highCardinalThreshold);
  assert.deepEqual(detail.impostorMetadata.contentRect, normalized.contentRect);
  assert.deepEqual(detail.impostorMetadata.padding, normalized.padding);
  assert.equal(detail.impostorMetadata.directions.length, normalized.directions.length);
  for (let index = 0; index < normalized.directions.length; index += 1) {
    assert.ok(
      detail.impostorMetadata.directions[index].distanceTo(normalized.directions[index]) < 1e-9,
      `Expected normalized direction ${index} to match the shared runtime contract`
    );
  }
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

test('inspect and diagnostics job specs honor draft impostor output overrides', () => {
  const inspectSpec = createInspectImpostorJobSpec(root, {
    assetName: 'barn',
    impostorOutputDir: 'world/impostors/barn-dev'
  });
  assert.ok(inspectSpec.args.includes('--impostor-dir'));
  assert.ok(inspectSpec.args.includes(`${root}/world/impostors/barn-dev`));

  const diagnosticsSpec = createDiagnosticsJobSpec(root, {
    assetName: 'barn',
    port: 4173,
    impostorOutputDir: 'world/impostors/barn-dev'
  });
  assert.ok(diagnosticsSpec.args.includes('--impostor-base-url'));
  assert.ok(diagnosticsSpec.args.includes('/world/impostors/barn-dev'));
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
