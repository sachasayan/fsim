// @ts-check

import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isBuildStale } from './tools/lib/BuildFreshness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = Number(process.env.PORT || 5173);
const SIM_DIST_INDEX = path.resolve(ROOT, 'sim-dist', 'index.html');
const EDITOR_DIST_INDEX = path.resolve(ROOT, 'editor-dist', 'index.html');
const VITE_BIN = path.resolve(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const SIM_BUILD_SOURCES = [
  'src/sim-app',
  'js',
  'styles',
  'assets',
  'vite.sim.config.mjs',
  'package.json',
  'tsconfig.json'
];
const EDITOR_BUILD_SOURCES = [
  'src/editor-app',
  'js/editor',
  'js/modules/editor',
  'vite.editor.config.mjs',
  'package.json',
  'tsconfig.json',
  'components.json'
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ts': 'text/javascript; charset=utf-8',
  '.tsx': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm'
};

function injectRuntimeFlags(filePath, content) {
  const scripts = [];
  if (
    path.basename(filePath) === 'fsim.html'
    || filePath === path.join(ROOT, 'sim-dist', 'index.html')
  ) {
    scripts.push('<script>window.__FSIM_RUNTIME__={mode:"serve",showDebugUi:false};</script>');
  }
  if (scripts.length === 0) return content;
  return content.replace('</head>', `    ${scripts.join('\n    ')}\n</head>`);
}

function ensureBuiltSim() {
  const shouldRebuild = isBuildStale({
    root: ROOT,
    indexPath: SIM_DIST_INDEX,
    sourcePaths: SIM_BUILD_SOURCES
  });
  if (!shouldRebuild) return SIM_DIST_INDEX;
  const result = spawnSync(process.execPath, [VITE_BIN, 'build', '--config', 'vite.sim.config.mjs'], {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit'
  });
  if (result.status !== 0 || !existsSync(SIM_DIST_INDEX)) {
    throw new Error('Failed to build sim-dist before serving the sim runtime');
  }
  return SIM_DIST_INDEX;
}

function ensureBuiltEditor() {
  const shouldRebuild = isBuildStale({
    root: ROOT,
    indexPath: EDITOR_DIST_INDEX,
    sourcePaths: EDITOR_BUILD_SOURCES
  });
  if (!shouldRebuild) return EDITOR_DIST_INDEX;
  const result = spawnSync(process.execPath, [VITE_BIN, 'build', '--config', 'vite.editor.config.mjs'], {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit'
  });
  if (result.status !== 0 || !existsSync(EDITOR_DIST_INDEX)) {
    throw new Error('Failed to build editor-dist before serving the editor runtime');
  }
  return EDITOR_DIST_INDEX;
}

function safeResolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  if (decoded === '/' || decoded === '/fsim.html' || decoded === '/fsim.html/') {
    return ensureBuiltSim();
  }
  if (decoded === '/editor' || decoded === '/editor/' || decoded === '/editor.html' || decoded === '/editor.html/') {
    return ensureBuiltEditor();
  }
  if (decoded === '/favicon.ico') {
    return path.resolve(ROOT, 'assets', 'icons', 'favicon.ico');
  }
  let requestPath = decoded;
  const absolutePath = path.resolve(ROOT, `.${requestPath}`);
  if (!absolutePath.startsWith(ROOT)) return null;
  return absolutePath;
}

const server = http.createServer(async (req, res) => {
  try {
    const absolutePath = safeResolve(req.url || '/');
    if (!absolutePath || !existsSync(absolutePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const rawContent = await readFile(absolutePath);
    const content = ext === '.html'
      ? injectRuntimeFlags(absolutePath, rawContent.toString('utf8'))
      : rawContent;

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`fsim game server running at http://127.0.0.1:${PORT}`);
});
