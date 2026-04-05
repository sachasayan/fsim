#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, 'tools', 'world-asset-presets.json');
const blenderScriptPath = path.join(repoRoot, 'tools', 'blender', 'bake_tree_impostor.py');

function parseArgs(argv) {
  const args = {
    asset: 'tree-1',
    blenderPath: process.env.BLENDER_BIN || '/Applications/Blender.app/Contents/MacOS/Blender',
    force: false,
    dryRun: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--asset' && argv[index + 1]) {
      args.asset = argv[++index];
    } else if (token === '--blender' && argv[index + 1]) {
      args.blenderPath = argv[++index];
    } else if (token === '--force') {
      args.force = true;
    } else if (token === '--dry-run') {
      args.dryRun = true;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  return args;
}

function loadManifest(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function toAbsolute(targetPath) {
  return path.isAbsolute(targetPath) ? targetPath : path.join(repoRoot, targetPath);
}

function resolveAssetConfig(manifest, assetName) {
  const defaults = manifest.defaults || {};
  const assetConfig = manifest.assets?.[assetName];
  if (!assetConfig) {
    throw new Error(`Unknown asset '${assetName}'.`);
  }
  const category = assetConfig.category || '';
  const decimatedDir = toAbsolute(category ? path.join(assetConfig.decimatedDir || defaults.decimatedDir, category) : (assetConfig.decimatedDir || defaults.decimatedDir));
  const inputPath = toAbsolute(assetConfig.decimatedPath || path.join(decimatedDir, `${assetName}.glb`));
  const impostorConfig = assetConfig.impostorBake || null;
  if (!impostorConfig?.enabled) {
    throw new Error(`Asset '${assetName}' does not declare impostorBake.enabled.`);
  }
  const outputDir = toAbsolute(impostorConfig.outputDir);
  return {
    inputPath,
    outputDir,
    frameSize: Math.max(64, Number(impostorConfig.frameSize) || 256),
    gridSize: Math.max(1, Number(impostorConfig.gridSize) || 4)
  };
}

function runBake(args, resolved) {
  ensureDir(resolved.outputDir);
  const metadataPath = path.join(resolved.outputDir, 'metadata.json');
  if (!args.force && fs.existsSync(metadataPath)) {
    console.log(`[tree-impostor] skipped ${path.relative(repoRoot, metadataPath)} already exists (use --force to rebuild)`);
    return;
  }

  const blenderArgs = [
    '-b',
    '-P',
    blenderScriptPath,
    '--',
    '--input',
    resolved.inputPath,
    '--outputDir',
    resolved.outputDir,
    '--frameSize',
    String(resolved.frameSize),
    '--gridSize',
    String(resolved.gridSize)
  ];

  if (args.dryRun) {
    console.log(`${args.blenderPath} ${blenderArgs.join(' ')}`);
    return;
  }

  const result = spawnSync(args.blenderPath, blenderArgs, {
    cwd: repoRoot,
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Blender impostor bake failed with exit code ${result.status}.`);
  }
}

function main() {
  const args = parseArgs(process.argv);
  const manifest = loadManifest(manifestPath);
  const resolved = resolveAssetConfig(manifest, args.asset);
  runBake(args, resolved);
}

try {
  main();
} catch (error) {
  console.error(`[tree-impostor] ${error.message || error}`);
  process.exit(1);
}
