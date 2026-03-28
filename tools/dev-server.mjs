import http from 'node:http';
import path from 'node:path';
import { readFile, watch, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
    '.txt': 'text/plain; charset=utf-8',
    '.wasm': 'application/wasm'
};

function injectRuntimeFlags(filePath, content) {
    const scripts = [];
    if (
        path.basename(filePath) === 'fsim.html'
        || filePath === path.join(ROOT, 'sim-dist', 'index.html')
    ) {
        scripts.push('<script>window.__FSIM_RUNTIME__={mode:"dev",showDebugUi:true};</script>');
    }
    if (IS_EDITOR_E2E && (
        path.basename(filePath) === 'editor.html'
        || path.basename(filePath) === 'editor'
        || filePath === path.join(ROOT, 'editor-dist', 'index.html')
    )) {
        scripts.push('<script>window.__FSIM_EDITOR_E2E__=true;</script>');
    }
    if (scripts.length === 0) return content;
    return content.replace('</head>', `    ${scripts.join('\n    ')}\n</head>`);
}

function safeResolve(urlPath) {
    const decoded = decodeURIComponent(urlPath.split('?')[0]);
    if (decoded === '/' || decoded === '/fsim.html' || decoded === '/fsim.html/') {
        const builtSimPath = path.resolve(ROOT, 'sim-dist', 'index.html');
        if (existsSync(builtSimPath)) return builtSimPath;
        return path.resolve(ROOT, 'fsim.html');
    }
    if (decoded === '/editor' || decoded === '/editor/' || decoded === '/editor.html' || decoded === '/editor.html/') {
        const builtEditorPath = path.resolve(ROOT, 'editor-dist', 'index.html');
        if (existsSync(builtEditorPath)) return builtEditorPath;
        return path.resolve(ROOT, 'editor.html');
    }
    if (decoded === '/favicon.ico') {
        return path.resolve(ROOT, 'assets', 'icons', 'favicon.ico');
    }
    const requestPath = decoded;
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
let rebuildDebounce = null;
let suppressWatcherUntil = 0;
let currentBuildJob = null;
let queuedBuildJob = null;
let nextBuildJobId = 1;

function createBuildJob(reason, { forceClean = false, requestId = null, source = 'auto' } = {}) {
    return {
        id: `build_${nextBuildJobId++}`,
        reason,
        forceClean,
        requestIds: requestId ? new Set([requestId]) : new Set(),
        source
    };
}

function emitBuildProgress(job, payload) {
    broadcast('editor-build-progress', {
        jobId: job.id,
        requestIds: [...job.requestIds],
        forceClean: job.forceClean,
        source: job.source,
        timestamp: Date.now(),
        ...payload
    });
}

function mirrorStreamLines(stream, onLine) {
    let buffer = '';
    stream.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const line of lines) {
            onLine(line);
        }
    });
    stream.on('end', () => {
        if (buffer) onLine(buffer);
    });
}

async function runBuildJob(job) {
    currentBuildJob = job;
    try {
        console.log(`\n🔄 ${job.reason}, rebuilding world (${job.forceClean ? 'CLEAN' : 'AUTO'})...`);
        emitBuildProgress(job, { status: 'running', step: 1, total: 4, label: 'Preparing rebuild' });

        const env = { ...process.env };
        if (job.forceClean) env.FSIM_CLEAN_REBUILD = '1';

        const child = spawn(process.execPath, ['tools/commit-map-save.mjs'], {
            cwd: ROOT,
            env,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        mirrorStreamLines(child.stdout, (line) => {
            if (!line) return;
            if (line.startsWith('[FSIM_PROGRESS] ')) {
                try {
                    const payload = JSON.parse(line.slice('[FSIM_PROGRESS] '.length));
                    emitBuildProgress(job, { status: 'running', ...payload });
                } catch (error) {
                    console.error('Failed to parse build progress line:', error);
                }
                return;
            }
            console.log(line);
        });
        mirrorStreamLines(child.stderr, (line) => {
            if (!line) return;
            console.error(line);
        });

        const exitCode = await new Promise((resolve, reject) => {
            child.on('error', reject);
            child.on('close', resolve);
        });

        if (exitCode === 0) {
            emitBuildProgress(job, { status: 'completed', step: 4, total: 4, label: 'Rebuild complete' });
            broadcast('reload-city', { timestamp: Date.now() });
        } else {
            emitBuildProgress(job, {
                status: 'failed',
                step: 4,
                total: 4,
                label: 'Rebuild failed',
                error: `commit-map-save exited with code ${exitCode}`
            });
            console.error(`❌ Build failed with exit code ${exitCode}`);
        }
    } catch (error) {
        emitBuildProgress(job, {
            status: 'failed',
            step: 4,
            total: 4,
            label: 'Rebuild failed',
            error: error.message
        });
        console.error(`❌ Build failed: ${error.message}`);
    } finally {
        currentBuildJob = null;
        if (queuedBuildJob) {
            const nextJob = queuedBuildJob;
            queuedBuildJob = null;
            void runBuildJob(nextJob);
        }
    }
}

function queueWorldRebuild(reason, options = {}) {
    const { forceClean = false, requestId = null, source = 'auto' } = options;

    if (currentBuildJob) {
        if (!queuedBuildJob) {
            queuedBuildJob = createBuildJob(reason, { forceClean, requestId, source });
        } else {
            queuedBuildJob.forceClean = queuedBuildJob.forceClean || forceClean;
            queuedBuildJob.reason = reason;
            queuedBuildJob.source = source;
            if (requestId) queuedBuildJob.requestIds.add(requestId);
        }
        emitBuildProgress(queuedBuildJob, { status: 'queued', step: 0, total: 4, label: 'Queued rebuild' });
        return { jobId: queuedBuildJob.id, queued: true };
    }

    const job = createBuildJob(reason, { forceClean, requestId, source });
    emitBuildProgress(job, { status: 'queued', step: 0, total: 4, label: 'Queued rebuild' });
    void runBuildJob(job);
    return { jobId: job.id, queued: false };
}

function scheduleWorldRebuild(reason) {
    if (rebuildDebounce) clearTimeout(rebuildDebounce);
    rebuildDebounce = setTimeout(() => {
        rebuildDebounce = null;
        queueWorldRebuild(reason, { source: 'watcher' });
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
                        const nextSerialized = JSON.stringify(data.content, null, 4);
                        let changed = true;
                        if (IS_EDITOR_E2E) {
                            const previousSerialized = JSON.stringify(editorE2eData.get(data.path) ?? null, null, 4);
                            changed = previousSerialized !== nextSerialized;
                            if (changed) {
                                editorE2eData.set(data.path, structuredClone(data.content));
                                console.log(`✅ Saved ${data.path} to in-memory E2E fixture store`);
                            } else {
                                console.log(`⏭️ Skipped unchanged save for ${data.path}`);
                            }
                        } else {
                            const previousSerialized = existsSync(targetPath)
                                ? await readFile(targetPath, 'utf8')
                                : null;
                            changed = previousSerialized !== nextSerialized;
                            if (changed) {
                                await writeFile(targetPath, nextSerialized);
                                console.log(`✅ Saved ${data.path}`);
                            } else {
                                console.log(`⏭️ Skipped unchanged save for ${data.path}`);
                            }
                            if (changed && targetPath === MAP_FILE) {
                                suppressWatcherUntil = Date.now() + 2000;
                            }
                        }
                        const rebuild = (!IS_EDITOR_E2E && changed && targetPath === MAP_FILE)
                            ? queueWorldRebuild('map.json saved via API', { requestId: data.requestId || null, source: 'save' })
                            : null;
                        sendJson(res, {
                            success: true,
                            changed,
                            rebuildQueued: rebuild?.queued === true,
                            rebuildJobId: rebuild?.jobId || null
                        });
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

        if ((url.pathname === '/rebuild-world' || url.pathname === '/rebuild-world/') && req.method === 'POST') {
            if (IS_EDITOR_E2E) {
                sendJson(res, { success: true, skipped: true });
                return;
            }
            const forceClean = url.searchParams.get('clean') === '1';
            const requestId = url.searchParams.get('requestId') || null;
            const rebuild = queueWorldRebuild('manual rebuild requested', { forceClean, requestId, source: 'manual' });
            sendJson(res, { success: true, queued: rebuild.queued, rebuildJobId: rebuild.jobId });
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
    console.log(`🗺️  Map Editor: http://127.0.0.1:${PORT}/editor\n`);
});
