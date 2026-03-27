#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, 'tools', 'world-asset-presets.json');

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assetPath(baseDir, assetName) {
  return path.join(repoRoot, baseDir, `${assetName}.glb`);
}

function statBytes(filePath) {
  return fs.existsSync(filePath) ? fs.statSync(filePath).size : null;
}

function main() {
  const manifest = readJson(manifestPath);
  const defaults = manifest.defaults || {};
  const assets = Object.entries(manifest.assets || {});

  let hasFailure = false;
  for (const [name, assetConfig] of assets) {
    const merged = { ...defaults, ...assetConfig };
    const sourceBytes = statBytes(assetPath(merged.sourceDir, name));
    const decimatedBytes = statBytes(assetPath(merged.decimatedDir, name));
    const gameReadyBytes = statBytes(assetPath(merged.gameReadyDir, name));
    const budgetBytes = merged.sizeBudgetBytes;

    const sourceText = sourceBytes == null ? 'missing' : formatBytes(sourceBytes);
    const decimatedText = decimatedBytes == null ? 'missing' : formatBytes(decimatedBytes);
    const gameReadyText = gameReadyBytes == null ? 'missing' : formatBytes(gameReadyBytes);
    console.log(`${name}`);
    console.log(`  source     ${sourceText}`);
    console.log(`  decimated  ${decimatedText}`);
    console.log(`  game-ready ${gameReadyText}`);
    console.log(`  budget     ${formatBytes(budgetBytes)}`);

    if (gameReadyBytes == null) {
      hasFailure = true;
      console.log('  status     missing game-ready export');
      continue;
    }
    if (gameReadyBytes > budgetBytes) {
      hasFailure = true;
      console.log(`  status     over budget by ${formatBytes(gameReadyBytes - budgetBytes)}`);
      continue;
    }
    console.log('  status     ok');
  }

  if (hasFailure) {
    process.exit(1);
  }
}

main()
