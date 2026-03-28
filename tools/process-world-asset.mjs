#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, 'tools', 'world-asset-presets.json');
const targetHeightsPath = path.join(repoRoot, 'tools', 'world-asset-target-heights.json');
const blenderScriptPath = path.join(repoRoot, 'tools', 'blender', 'decimate_world_asset.py');

function parseArgs(argv) {
  const args = {
    all: false,
    assetNames: [],
    // On macOS, Blender is often installed at /Applications/Blender.app/Contents/MacOS/Blender
    // even when `blender` is not on PATH.
    blenderPath: process.env.BLENDER_BIN || 'blender',
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
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function loadManifest(filePath) {
  const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!manifest.assets || typeof manifest.assets !== 'object') {
    throw new Error(`Invalid manifest: ${filePath}`);
  }
  return manifest;
}

function loadTargetHeights(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const targetHeights = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return targetHeights && typeof targetHeights === 'object' ? targetHeights : {};
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function toAbsolute(p) {
  return path.isAbsolute(p) ? p : path.join(repoRoot, p);
}

function mergePreset(defaults, name, assetConfig) {
  const merged = {
    name,
    inputFile: `${name}.glb`,
    ...defaults,
    ...assetConfig
  };
  const category = typeof merged.category === 'string' && merged.category.length > 0 ? merged.category : '';
  return {
    ...merged,
    category,
    sourceDir: merged.sourceDir || defaults.sourceDir,
    decimatedDir: merged.decimatedDir || defaults.decimatedDir,
    gameReadyDir: merged.gameReadyDir || defaults.gameReadyDir
  };
}

function resolveAssetPaths(preset) {
  const sourceDir = toAbsolute(preset.category ? path.join(preset.sourceDir, preset.category) : preset.sourceDir);
  const decimatedDir = toAbsolute(preset.category ? path.join(preset.decimatedDir, preset.category) : preset.decimatedDir);
  const gameReadyDir = toAbsolute(preset.category ? path.join(preset.gameReadyDir, preset.category) : preset.gameReadyDir);
  const inputPath = toAbsolute(preset.inputPath || path.join(sourceDir, preset.inputFile));
  const decimatedPath = toAbsolute(preset.decimatedPath || path.join(decimatedDir, `${preset.name}.glb`));
  const gameReadyPath = toAbsolute(preset.gameReadyPath || path.join(gameReadyDir, `${preset.name}.glb`));
  const reportPath = `${decimatedPath}.report.json`;
  return { sourceDir, decimatedDir, gameReadyDir, inputPath, decimatedPath, gameReadyPath, reportPath };
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

function main() {
  const args = parseArgs(process.argv);
  const manifest = loadManifest(args.manifestPath || manifestPath);
  const targetHeights = loadTargetHeights(targetHeightsPath);
  const assetNames = args.all ? Object.keys(manifest.assets) : args.assetNames;

  if (assetNames.length === 0) {
    throw new Error('Choose at least one asset with --asset <name> or run with --all.');
  }

  for (const name of assetNames) {
    const assetConfig = manifest.assets[name];
    if (!assetConfig) {
      throw new Error(`Unknown asset '${name}'. Add it to tools/world-asset-presets.json first.`);
    }

    const preset = mergePreset(manifest.defaults || {}, name, {
      ...assetConfig,
      targetHeightMeters: Number(targetHeights[name] || assetConfig.targetHeightMeters || 0)
    });
    const resolved = resolveAssetPaths(preset);
    ensureDir(resolved.decimatedDir);
    ensureDir(resolved.gameReadyDir);

    if (!fs.existsSync(resolved.inputPath)) {
      throw new Error(`Missing source asset '${resolved.inputPath}'. Seed or copy the original asset into ${resolved.sourceDir}.`);
    }

    if (!args.force && fs.existsSync(resolved.decimatedPath)) {
      console.log(`\n[world-assets] ${preset.name}`);
      console.log(`  skipped   ${path.relative(repoRoot, resolved.decimatedPath)} already exists (use --force to rebuild)`);
    } else {
      runBlenderPipeline(args, preset, resolved);
    }

    if (args.stage && !args.dryRun) {
      stageGameReadyCopy(preset, resolved);
    }
  }
}

try {
  main();
} catch (error) {
  console.error(`[world-assets] ${error.message}`);
  process.exit(1);
}
