#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const repoRoot = process.cwd();
const runtimeObjectsDir = path.join(repoRoot, 'world', 'objects');
const sourceDir = path.join(repoRoot, 'world', 'assets', 'source');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function main() {
  ensureDir(sourceDir);
  const entries = fs.readdirSync(runtimeObjectsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.glb'));

  if (entries.length === 0) {
    console.log('[world-assets] No runtime .glb files found to seed.');
    return;
  }

  for (const entry of entries) {
    const fromPath = path.join(runtimeObjectsDir, entry.name);
    const toPath = path.join(sourceDir, entry.name);
    if (fs.existsSync(toPath)) {
      console.log(`[world-assets] Keeping existing source asset ${path.relative(repoRoot, toPath)}`);
      continue;
    }
    fs.copyFileSync(fromPath, toPath);
    console.log(`[world-assets] Seeded ${path.relative(repoRoot, toPath)}`);
  }
}

main()
