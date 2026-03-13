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
const PORT = Number(process.env.PORT || 5173);
const IS_EDITOR_E2E = process.env.FSIM_EDITOR_E2E === '1';
const EDITOR_E2E_FIXTURES = {
    'tools/map.json': path.join(ROOT, 'tests', 'e2e', 'fixtures', 'editor-map.json'),
    'config/vantage_points.json': path.join(ROOT, 'tests', 'e2e', 'fixtures', 'editor-vantage-points.json')
};
const editorE2eData = new Map();

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

function injectRuntimeFlags(filePath, content) {
    const scripts = [];
    if (path.basename(filePath) === 'fsim.html') {
        scripts.push('<script>window.__FSIM_RUNTIME__={mode:"dev",showDebugUi:true};</script>');
    }
    if (IS_EDITOR_E2E && path.basename(filePath) === 'editor.html') {
        scripts.push('<script>window.__FSIM_EDITOR_E2E__=true;</script>');
    }
    if (scripts.length === 0) return content;
    return content.replace('</head>', `    ${scripts.join('\n    ')}\n</head>`);
}

function safeResolve(urlPath) {
    const decoded = decodeURIComponent(urlPath.split('?')[0]);
    if (decoded === '/favicon.ico') {
        return path.resolve(ROOT, 'assets', 'icons', 'favicon.ico');
    }
    const requestPath = decoded === '/' ? '/fsim.html' : decoded;
    const absolutePath = path.resolve(ROOT, `.${requestPath}`);
    if (!absolutePath.startsWith(ROOT)) return null;
    return absolutePath;
}

const clients = new Set();
function broadcast(event, data) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) client.res.write(msg);
}

async function initializeEditorE2eData() {
    if (!IS_EDITOR_E2E) return;
    for (const [routePath, fixturePath] of Object.entries(EDITOR_E2E_FIXTURES)) {
        const content = JSON.parse(await readFile(fixturePath, 'utf8'));
        editorE2eData.set(routePath, content);
    }
}

function sendJson(res, payload, statusCode = 200) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify(payload));
}

const MAP_FILE = path.join(ROOT, 'tools', 'map.json');
let buildLock = false;
let rebuildQueued = false;
let rebuildDebounce = null;
let suppressWatcherUntil = 0;

async function rebuildWorld(reason) {
    if (buildLock) {
        rebuildQueued = true;
        return;
    }

    buildLock = true;
    console.log(`\n🔄 ${reason}, rebuilding world...`);
    try {
        const { stdout } = await execAsync(`${process.execPath} tools/commit-map-save.mjs`);
        console.log(stdout);
        broadcast('reload-city', { timestamp: Date.now() });
    } catch (err) {
        console.error(`❌ Build failed:`, err.message);
    } finally {
        setTimeout(() => {
            buildLock = false;
            if (rebuildQueued) {
                rebuildQueued = false;
                rebuildWorld('Queued map change');
            }
        }, 1000);
    }
}

function scheduleWorldRebuild(reason) {
    if (rebuildDebounce) clearTimeout(rebuildDebounce);
    rebuildDebounce = setTimeout(() => {
        rebuildDebounce = null;
        rebuildWorld(reason);
    }, 150);
}

if (!IS_EDITOR_E2E && existsSync(MAP_FILE)) {
    console.log(`Watching ${path.dirname(MAP_FILE)} for ${path.basename(MAP_FILE)} changes...`);
    const watcher = watch(path.dirname(MAP_FILE));
    (async () => {
        try {
            for await (const event of watcher) {
                const changedPath = event.filename
                    ? path.resolve(path.dirname(MAP_FILE), event.filename.toString())
                    : null;
                if (changedPath !== MAP_FILE) continue;
                if (Date.now() < suppressWatcherUntil) continue;
                if (event.eventType !== 'change' && event.eventType !== 'rename') continue;
                scheduleWorldRebuild(`map.json ${event.eventType} detected`);
            }
        } catch (err) {
            console.error('Watcher error:', err);
        }
    })();
}

await initializeEditorE2eData();

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

        if (IS_EDITOR_E2E && req.method === 'GET') {
            const fixtureKey = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
            if (editorE2eData.has(fixtureKey)) {
                sendJson(res, editorE2eData.get(fixtureKey));
                return;
            }
        }

        // MAP SAVE API
        if ((url.pathname === '/save' || url.pathname === '/save/') && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    if (data.path && data.content !== undefined) {
                        const targetPath = path.resolve(ROOT, data.path);
                        if (!targetPath.startsWith(ROOT)) {
                            res.writeHead(403); res.end('Forbidden');
                            return;
                        }
                        console.log(`💾 Saving ${data.path}...`);
                        if (IS_EDITOR_E2E) {
                            editorE2eData.set(data.path, structuredClone(data.content));
                            console.log(`✅ Saved ${data.path} to in-memory E2E fixture store`);
                        } else {
                            await writeFile(targetPath, JSON.stringify(data.content, null, 4));
                            console.log(`✅ Saved ${data.path}`);
                            if (targetPath === MAP_FILE) {
                                suppressWatcherUntil = Date.now() + 2000;
                                await rebuildWorld('map.json saved via API');
                            }
                        }
                        sendJson(res, { success: true });
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

        // Static Files
        const absolutePath = safeResolve(req.url || '/');
        if (!absolutePath || !existsSync(absolutePath)) {
            res.writeHead(404); res.end('Not Found');
            return;
        }

        const ext = path.extname(absolutePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const rawContent = await readFile(absolutePath);
        const content = ext === '.html'
            ? injectRuntimeFlags(absolutePath, rawContent.toString('utf8'))
            : rawContent;
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
