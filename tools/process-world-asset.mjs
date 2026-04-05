#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  DEFAULT_MANIFEST_PATH,
  DEFAULT_TARGET_HEIGHTS_PATH,
  buildWorldAssetPresetMap
} from './lib/WorldAssetCatalog.mjs';

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, DEFAULT_MANIFEST_PATH);
const targetHeightsPath = path.join(repoRoot, DEFAULT_TARGET_HEIGHTS_PATH);
const blenderScriptPath = path.join(repoRoot, 'tools', 'blender', 'decimate_world_asset.py');
const treeImpostorBakeScriptPath = path.join(repoRoot, 'tools', 'bake-tree-impostor.mjs');

function parseArgs(argv) {
  const args = {
    all: false,
    assetNames: [],
    // On macOS, Blender is often installed at /Applications/Blender.app/Contents/MacOS/Blender
    // even when `blender` is not on PATH.
    blenderPath: process.env.BLENDER_BIN || '/Applications/Blender.app/Contents/MacOS/Blender',
    stage: false,
    dryRun: false,
    force: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--all') args.all = true;
    else if (token === '--stage') args.stage = true;
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--force') args.force = true;
    else if (token === '--asset' && argv[i + 1]) {
      args.assetNames.push(argv[i + 1]);
      i += 1;
    } else if (token === '--blender' && argv[i + 1]) {
      args.blenderPath = argv[i + 1];
      i += 1;
    } else if (token === '--manifest' && argv[i + 1]) {
      args.manifestPath = path.resolve(repoRoot, argv[i + 1]);
      i += 1;
    } else if (token === '--target-heights' && argv[i + 1]) {
      args.targetHeightsPath = path.resolve(repoRoot, argv[i + 1]);
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureSourceAssetAvailable(preset, resolved) {
  if (fs.existsSync(resolved.inputPath)) {
    return;
  }

  if (!fs.existsSync(resolved.unprocessedPath)) {
    throw new Error(
      `Missing source asset '${resolved.inputPath}'. Put the raw asset in ${resolved.unprocessedDir} for first-time processing or restore it in ${resolved.sourceDir}.`
    );
  }

  ensureDir(path.dirname(resolved.inputPath));
  fs.renameSync(resolved.unprocessedPath, resolved.inputPath);
  console.log(`  imported  ${path.relative(repoRoot, resolved.unprocessedPath)} -> ${path.relative(repoRoot, resolved.inputPath)}`);
}

function runBlenderPipeline(args, preset, resolved) {
  const blenderArgs = [
    '-b',
    '-P',
    blenderScriptPath,
    '--',
    '--input',
    resolved.inputPath,
    '--output',
    resolved.decimatedPath,
    '--report',
    resolved.reportPath,
    '--targetTriangles',
    String(preset.targetTriangles),
    '--targetHeightMeters',
    String(Number.isFinite(preset.targetHeightMeters) ? preset.targetHeightMeters : 0),
    '--joinMeshes',
    String(Boolean(preset.joinMeshes)),
    '--cleanupLooseGeometry',
    String(Boolean(preset.cleanupLooseGeometry)),
    '--preserveUVs',
    String(Boolean(preset.preserveUVs)),
    '--decimateMethod',
    String(preset.decimateMethod || 'COLLAPSE')
  ];

  console.log(`\n[world-assets] ${preset.name}`);
  console.log(`  source    ${path.relative(repoRoot, resolved.inputPath)}`);
  console.log(`  decimated ${path.relative(repoRoot, resolved.decimatedPath)}`);

  if (args.dryRun) {
    console.log(`  blender   ${args.blenderPath} ${blenderArgs.join(' ')}`);
    return;
  }

  const result = spawnSync(args.blenderPath, blenderArgs, {
    cwd: repoRoot,
    stdio: 'inherit'
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Blender failed for '${preset.name}' with exit code ${result.status}.`);
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function stageGameReadyCopy(preset, resolved) {
  if (!fs.existsSync(resolved.decimatedPath)) {
    throw new Error(`Missing decimated output: ${resolved.decimatedPath}`);
  }

  const bytes = fs.statSync(resolved.decimatedPath).size;
  if (bytes > preset.sizeBudgetBytes) {
    throw new Error(
      `Refusing to stage '${preset.name}' because ${formatBytes(bytes)} exceeds the ${formatBytes(preset.sizeBudgetBytes)} budget.`
    );
  }

  ensureDir(path.dirname(resolved.gameReadyPath));
  fs.copyFileSync(resolved.decimatedPath, resolved.gameReadyPath);
  console.log(`  staged    ${path.relative(repoRoot, resolved.gameReadyPath)} (${formatBytes(bytes)})`);
}

function runTreeImpostorBake(args, preset) {
  if (!preset?.impostorBake?.enabled) return;
  const bakeArgs = [
    treeImpostorBakeScriptPath,
    '--asset',
    preset.name,
    '--blender',
    args.blenderPath
  ];
  if (args.manifestPath) bakeArgs.push('--manifest', args.manifestPath);
  if (args.force) bakeArgs.push('--force');
  if (args.dryRun) bakeArgs.push('--dry-run');
  const result = spawnSync(process.execPath, bakeArgs, {
    cwd: repoRoot,
    stdio: 'inherit'
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Tree impostor bake failed for '${preset.name}' with exit code ${result.status}.`);
  }
}

function main() {
  const args = parseArgs(process.argv);
  const presetMap = buildWorldAssetPresetMap(repoRoot, {
    manifestPath: args.manifestPath || manifestPath,
    targetHeightsPath: args.targetHeightsPath || targetHeightsPath
  });
  const assetNames = args.all ? Array.from(presetMap.presets.keys()) : args.assetNames;

  if (assetNames.length === 0) {
    throw new Error('Choose at least one asset with --asset <name> or run with --all.');
  }

  for (const name of assetNames) {
    const entry = presetMap.presets.get(name);
    if (!entry) {
      throw new Error(`Unknown asset '${name}'. Add it to tools/world-asset-presets.json first.`);
    }
    const { preset, paths: resolved } = entry;
    ensureDir(resolved.unprocessedDir);
    ensureDir(resolved.decimatedDir);
    ensureDir(resolved.gameReadyDir);
    ensureSourceAssetAvailable(preset, resolved);

    if (!args.force && fs.existsSync(resolved.decimatedPath)) {
      console.log(`\n[world-assets] ${preset.name}`);
      console.log(`  skipped   ${path.relative(repoRoot, resolved.decimatedPath)} already exists (use --force to rebuild)`);
    } else {
      runBlenderPipeline(args, preset, resolved);
    }

    if (args.stage && !args.dryRun) {
      stageGameReadyCopy(preset, resolved);
    }

    runTreeImpostorBake(args, preset);
  }
}

try {
  main();
} catch (error) {
  console.error(`[world-assets] ${error.message}`);
  process.exit(1);
}
