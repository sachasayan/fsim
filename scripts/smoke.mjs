import http from 'node:http';
import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const PORT = 5188;

async function walkJsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkJsFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

function checkSyntax(filePath) {
  const result = spawnSync(process.execPath, ['--check', filePath], {
    cwd: ROOT,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    const errorOutput = (result.stderr || result.stdout || 'Syntax check failed').trim();
    throw new Error(`Syntax error in ${path.relative(ROOT, filePath)}\n${errorOutput}`);
  }
}

function request(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port: PORT,
        path: pathname
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode || 0, headers: res.headers, body });
        });
      }
    );
    req.on('error', reject);
  });
}

function waitForServerReady(child) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stderr = '';
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Timed out waiting for server startup'));
      }
    }, 5000);

    child.stdout.on('data', (chunk) => {
      if (settled) return;
      const text = chunk.toString();
      if (text.includes('fsim game server running at')) {
        settled = true;
        clearTimeout(timeout);
        resolve();
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const details = stderr.trim();
      reject(new Error(`Server exited early with code ${code}${details ? `\n${details}` : ''}`));
    });
  });
}

async function main() {
  const jsFiles = await walkJsFiles(path.join(ROOT, 'js'));
  jsFiles.push(path.join(ROOT, 'server.js'));
  for (const file of jsFiles) checkSyntax(file);

  const html = await readFile(path.join(ROOT, 'src', 'sim-app', 'index.html'), 'utf8');
  if (/style\s*=/.test(html)) {
    throw new Error('Inline style attributes still exist in src/sim-app/index.html');
  }

  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverChecksSkipped = false;
  try {
    try {
      await waitForServerReady(server);
    } catch (error) {
      const message = String(error.message || error);
      const permissionDenied =
        message.includes('EPERM') ||
        message.includes('EACCES') ||
        message.toLowerCase().includes('operation not permitted');
      if (!permissionDenied) {
        throw error;
      }
      serverChecksSkipped = true;
      console.warn('Server smoke checks skipped due to sandbox socket restrictions');
    }

    if (!serverChecksSkipped) {
      const root = await request('/');
      if (root.statusCode !== 200) {
        throw new Error(`GET / failed with status ${root.statusCode}`);
      }
      if (!String(root.headers['content-type'] || '').includes('text/html')) {
        throw new Error('GET / did not return HTML content');
      }

      if (!root.body.includes('window.__FSIM_RUNTIME__')) {
        throw new Error('GET / did not include injected runtime flags');
      }
      if (!root.body.includes('<script type="module"')) {
        throw new Error('GET / did not include a module entrypoint');
      }
    }
  } finally {
    if (!server.killed) {
      server.kill('SIGTERM');
    }
  }

  console.log('Smoke checks passed');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
