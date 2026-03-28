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
  const entries = fs.readdirSync(runtimeObjectsDir, { withFileTypes: true });
  const pending = entries.map((entry) => ({
    runtimeDir: runtimeObjectsDir,
    entry
  }));
  const glbFiles = [];

  while (pending.length > 0) {
    const { runtimeDir: currentDir, entry } = pending.pop();
    const fromPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      const childEntries = fs.readdirSync(fromPath, { withFileTypes: true });
      pending.push(...childEntries.map((child) => ({
        runtimeDir: fromPath,
        entry: child
      })));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) {
      glbFiles.push(fromPath);
    }
  }

  if (glbFiles.length === 0) {
    console.log('[world-assets] No runtime .glb files found to seed.');
    return;
  }

  for (const fromPath of glbFiles) {
    const relativePath = path.relative(runtimeObjectsDir, fromPath);
    const toPath = path.join(sourceDir, relativePath);
    ensureDir(path.dirname(toPath));
    if (fs.existsSync(toPath)) {
      console.log(`[world-assets] Keeping existing source asset ${path.relative(repoRoot, toPath)}`);
      continue;
    }
    fs.copyFileSync(fromPath, toPath);
    console.log(`[world-assets] Seeded ${path.relative(repoRoot, toPath)}`);
  }
}

main()
