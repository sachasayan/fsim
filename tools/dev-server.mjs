import http from 'node:http';
import path from 'node:path';
import { readFile, watch, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execAsync = promisify(exec);

// Path to project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 5174);

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
    const absolutePath = path.resolve(ROOT, `.${decoded}`);
    if (!absolutePath.startsWith(ROOT)) return null;
    return absolutePath;
}

const clients = new Set();
function broadcast(event, data) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) client.res.write(msg);
}

// Watch tools/map.json -> triggers world bake
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
                        setTimeout(() => { buildLock = false; }, 1000);
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
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        console.log(`[DevServer] ${req.method} ${url.pathname}`);

        // SSE for hot-reload
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

        // MAP SAVE API
        if ((url.pathname === '/save' || url.pathname === '/save/') && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    if (data.path && data.content) {
                        const targetPath = path.resolve(ROOT, data.path);
                        if (!targetPath.startsWith(ROOT)) {
                            res.writeHead(403); res.end('Forbidden');
                            return;
                        }
                        console.log(`💾 Saving ${data.path}...`);
                        await writeFile(targetPath, JSON.stringify(data.content, null, 4));
                        console.log(`✅ Saved ${data.path}`);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true }));
                    } else {
                        res.writeHead(400); res.end('Bad Request');
                    }
                } catch (err) {
                    console.error(`❌ Save failed:`, err.message);
                    res.writeHead(500); res.end('Error: ' + err.message);
                }
            });
            return;
        }

        // Landing Page
        if (url.pathname === '/') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
        <body style="font-family: Inter, sans-serif; background: #111; color: #eee; padding: 2rem;">
          <h1>🚀 fsim Build & Tools Server</h1>
          <p>This server handles map saving and world baking. It is NOT the game server.</p>
          <hr style="border: 0; border-top: 1px solid #333; margin: 2rem 0;">
          <a href="/editor.html" style="color: #4cc9f0; font-weight: bold; font-size: 1.2rem;">Open Map Editor &rarr;</a>
        </body>
      `);
            return;
        }

        // Static Files
        const absolutePath = safeResolve(req.url || '/');
        if (!absolutePath || !existsSync(absolutePath)) {
            res.writeHead(404); res.end('Not Found');
            return;
        }

        const ext = path.extname(absolutePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const content = await readFile(absolutePath);
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
        res.end(content);

    } catch (error) {
        console.error(`[DevServer Error]`, error);
        res.writeHead(500); res.end('Internal Server Error');
    }
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`\n🚀 fsim Build Server running at http://127.0.0.1:${PORT}`);
    console.log(`🗺️  Map Editor: http://127.0.0.1:${PORT}/editor.html\n`);
});
