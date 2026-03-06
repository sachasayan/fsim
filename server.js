import http from 'node:http';
import path from 'node:path';
import { readFile, watch } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 5173);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
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
  '.txt': 'text/plain; charset=utf-8'
};

function safeResolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  let requestPath = decoded;

  if (requestPath === '/') {
    requestPath = '/fsim.html';
  }

  const absolutePath = path.resolve(ROOT, `.${requestPath}`);
  if (!absolutePath.startsWith(ROOT)) {
    return null;
  }

  return absolutePath;
}

const clients = new Set();

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    client.res.write(msg);
  }
}

// Watch tools/map.json
const MAP_FILE = path.join(ROOT, 'tools', 'map.json');
let buildLock = false;

if (existsSync(MAP_FILE)) {
  console.log(`Watching ${MAP_FILE} for changes...`);
  const watcher = watch(MAP_FILE);
  (async () => {
    try {
      for await (const event of watcher) {
        if (event.eventType === 'change' && !buildLock) {
          buildLock = true;
          console.log(`\n🔄 map.json changed, rebuilding world...`);
          try {
            const { stdout } = await execAsync('npm run build:world');
            console.log(stdout);
            broadcast('reload-city', { timestamp: Date.now() });
          } catch (err) {
            console.error(`❌ Build failed:`, err.message);
          } finally {
            setTimeout(() => { buildLock = false; }, 1000); // Debounce
          }
        }
      }
    } catch (err) {
      console.error('Watcher error:', err);
    }
  })();
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      const client = { res };
      clients.add(client);
      req.on('close', () => clients.delete(client));
      return;
    }

    if (url.pathname === '/save' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk.toString(); });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          if (data.path && data.content) {
            const targetPath = path.resolve(ROOT, data.path);
            if (!targetPath.startsWith(ROOT)) {
              res.writeHead(403);
              res.end('Forbidden');
              return;
            }
            const { writeFile } = await import('node:fs/promises');
            await writeFile(targetPath, JSON.stringify(data.content, null, 4));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } else {
            res.writeHead(400);
            res.end('Bad Request: Missing path or content');
          }
        } catch (err) {
          res.writeHead(500);
          res.end('Error: ' + err.message);
        }
      });
      return;
    }

    const absolutePath = safeResolve(req.url || '/');
    if (!absolutePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    let filePath = absolutePath;
    if (!existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = await readFile(filePath);

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
  console.log(`fsim server running at http://127.0.0.1:${PORT}`);
});
