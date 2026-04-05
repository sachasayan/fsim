#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { DEFAULT_MANIFEST_PATH, buildWorldAssetPresetMap } from './lib/WorldAssetCatalog.mjs';

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, DEFAULT_MANIFEST_PATH);
const blenderScriptPath = path.join(repoRoot, 'tools', 'blender', 'bake_tree_impostor.py');

function parseArgs(argv) {
  const args = {
    asset: 'tree-1',
    blenderPath: process.env.BLENDER_BIN || '/Applications/Blender.app/Contents/MacOS/Blender',
    manifestPath,
    force: false,
    dryRun: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--asset' && argv[index + 1]) {
      args.asset = argv[++index];
    } else if (token === '--blender' && argv[index + 1]) {
      args.blenderPath = argv[++index];
    } else if (token === '--manifest' && argv[index + 1]) {
      args.manifestPath = path.resolve(repoRoot, argv[++index]);
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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
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
  const presetMap = buildWorldAssetPresetMap(repoRoot, {
    manifestPath: args.manifestPath || manifestPath
  });
  const entry = presetMap.presets.get(args.asset);
  if (!entry) {
    throw new Error(`Unknown asset '${args.asset}'.`);
  }
  const { preset, paths } = entry;
  const impostorConfig = preset.impostorBake || null;
  if (!impostorConfig?.enabled) {
    throw new Error(`Asset '${args.asset}' does not declare impostorBake.enabled.`);
  }
  const resolved = {
    inputPath: paths.decimatedPath,
    outputDir: paths.impostorOutputDir,
    frameSize: Math.max(64, Number(impostorConfig.frameSize) || 256),
    gridSize: Math.max(1, Number(impostorConfig.gridSize) || 4)
  };
  runBake(args, resolved);
}

try {
  main();
} catch (error) {
  console.error(`[tree-impostor] ${error.message || error}`);
  process.exit(1);
}
