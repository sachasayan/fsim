import http from 'node:http';
import path from 'node:path';
import { readFile, watch, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isBuildStale } from './lib/BuildFreshness.mjs';
import {
    createBakeImpostorJobSpec,
    createDiagnosticsJobSpec,
    createInspectImpostorJobSpec,
    createProcessAssetJobSpec,
    getModelViewerAssetDetail,
    getModelViewerCatalog,
    sanitizeAssetName
} from './lib/ModelViewerSupport.mjs';

// Path to project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 5173);
const SIM_DIST_INDEX = path.resolve(ROOT, 'sim-dist', 'index.html');
const SIM_DIST_TREE_IMPOSTOR_VIEWER = path.resolve(ROOT, 'sim-dist', 'tree-impostor-viewer.html');
const EDITOR_DIST_INDEX = path.resolve(ROOT, 'editor-dist', 'index.html');
const EDITOR_DIST_MODEL_VIEWER = path.resolve(ROOT, 'editor-dist', 'model-viewer.html');
const VITE_BIN = path.resolve(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const IS_EDITOR_E2E = process.env.FSIM_EDITOR_E2E === '1';
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
const EDITOR_E2E_FIXTURES = {
    'tools/map.json': path.join(ROOT, 'tests', 'e2e', 'fixtures', 'editor-map.json'),
    'config/vantage_points.json': path.join(ROOT, 'tests', 'e2e', 'fixtures', 'editor-vantage-points.json')
};
const editorE2eData = new Map();

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
    if (
        decoded === '/tree-impostor-viewer'
        || decoded === '/tree-impostor-viewer/'
        || decoded === '/tree-impostor-viewer.html'
        || decoded === '/tree-impostor-viewer.html/'
    ) {
        ensureBuiltSim();
        return SIM_DIST_TREE_IMPOSTOR_VIEWER;
    }
    if (decoded === '/editor' || decoded === '/editor/' || decoded === '/editor.html' || decoded === '/editor.html/') {
        return ensureBuiltEditor();
    }
    if (
        decoded === '/model-viewer'
        || decoded === '/model-viewer/'
        || decoded === '/model-viewer.html'
        || decoded === '/model-viewer.html/'
    ) {
        ensureBuiltEditor();
        return EDITOR_DIST_MODEL_VIEWER;
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

        const child = spawn(process.execPath, ['--import', 'tsx/esm', 'tools/commit-map-save.mjs'], {
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

let nextModelViewerJobId = 1;
const modelViewerJobs = new Map();

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk.toString();
        });
        req.on('end', () => {
            if (!body) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(body));
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}

function createModelViewerJob(jobType, assetName, label) {
    const id = `model_viewer_job_${nextModelViewerJobId++}`;
    const job = {
        id,
        jobType,
        assetName,
        label,
        status: 'queued',
        logs: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        artifacts: null,
        error: null
    };
    modelViewerJobs.set(id, job);
    return job;
}

function emitModelViewerJobProgress(job, payload = {}) {
    job.updatedAt = Date.now();
    Object.assign(job, payload);
    broadcast('model-viewer-job-progress', {
        jobId: job.id,
        jobType: job.jobType,
        assetName: job.assetName,
        label: job.label,
        status: job.status,
        logs: job.logs.slice(-200),
        artifacts: job.artifacts,
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt
    });
}

function relativeArtifactPath(filePath) {
    return filePath.startsWith(ROOT)
        ? `/${path.relative(ROOT, filePath).split(path.sep).join('/')}`
        : filePath;
}

function collectArtifactDirectory(dirPath) {
    if (!dirPath || !existsSync(dirPath)) return [];
    /** @type {string[]} */
    const files = [];
    const queue = [dirPath];
    while (queue.length > 0) {
        const current = queue.shift();
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const absolute = path.join(current, entry.name);
            if (entry.isDirectory()) queue.push(absolute);
            else files.push(absolute);
        }
    }
    return files.sort().map((filePath) => ({
        path: filePath,
        urlPath: relativeArtifactPath(filePath)
    }));
}

function buildModelViewerJobArtifacts(jobSpec) {
    if (jobSpec.outputDir) {
        return {
            outputDir: relativeArtifactPath(jobSpec.outputDir),
            files: collectArtifactDirectory(jobSpec.outputDir)
        };
    }
    if (jobSpec.outputBase) {
        const entries = existsSync(jobSpec.outputBase)
            ? readdirSync(jobSpec.outputBase, { withFileTypes: true })
                .filter((entry) => entry.isDirectory())
                .map((entry) => path.join(jobSpec.outputBase, entry.name))
                .sort()
            : [];
        const latest = entries.at(-1) || null;
        return latest
            ? {
                outputDir: relativeArtifactPath(latest),
                files: collectArtifactDirectory(latest)
            }
            : {
                outputDir: relativeArtifactPath(jobSpec.outputBase),
                files: []
            };
    }
    return null;
}

function startModelViewerJob(job, jobSpec) {
    emitModelViewerJobProgress(job, { status: 'running', error: null });
    const child = spawn(jobSpec.command, jobSpec.args, {
        cwd: jobSpec.cwd || ROOT,
        env: { ...process.env, PORT: String(PORT) },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    const appendLog = (streamName, chunk) => {
        const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
        if (lines.length === 0) return;
        job.logs.push(...lines.map((line) => `[${streamName}] ${line}`));
        if (job.logs.length > 400) {
            job.logs.splice(0, job.logs.length - 400);
        }
        emitModelViewerJobProgress(job, {});
    };

    child.stdout?.on('data', (chunk) => appendLog('stdout', chunk));
    child.stderr?.on('data', (chunk) => appendLog('stderr', chunk));

    child.on('close', (code) => {
        try {
            if (code === 0) {
                emitModelViewerJobProgress(job, {
                    status: 'completed',
                    artifacts: buildModelViewerJobArtifacts(jobSpec),
                    error: null
                });
            } else {
                emitModelViewerJobProgress(job, {
                    status: 'failed',
                    error: `Job exited with code ${code ?? 'unknown'}`
                });
            }
        } finally {
            try {
                jobSpec.cleanup?.();
            } catch (error) {
                console.error('[ModelViewer] Failed to clean up temp files', error);
            }
        }
    });

    child.on('error', (error) => {
        try {
            emitModelViewerJobProgress(job, {
                status: 'failed',
                error: error.message
            });
        } finally {
            try {
                jobSpec.cleanup?.();
            } catch {}
        }
    });

    return job;
}

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

        if ((url.pathname === '/api/model-viewer/catalog' || url.pathname === '/api/model-viewer/catalog/') && req.method === 'GET') {
            sendJson(res, {
                assets: getModelViewerCatalog(ROOT)
            });
            return;
        }

        if (url.pathname.startsWith('/api/model-viewer/assets/') && req.method === 'GET') {
            const assetName = decodeURIComponent(url.pathname.split('/').pop() || '');
            const detail = getModelViewerAssetDetail(ROOT, assetName, {
                impostorOverrides: {
                    outputDir: url.searchParams.get('impostorOutputDir') || ''
                }
            });
            if (!detail) {
                sendJson(res, { error: `Unknown asset '${assetName}'.` }, 404);
                return;
            }
            sendJson(res, detail);
            return;
        }

        if (url.pathname.startsWith('/api/model-viewer/jobs/') && req.method === 'GET') {
            const jobId = decodeURIComponent(url.pathname.split('/').pop() || '');
            const job = modelViewerJobs.get(jobId);
            if (!job) {
                sendJson(res, { error: `Unknown job '${jobId}'.` }, 404);
                return;
            }
            sendJson(res, job);
            return;
        }

        if ((url.pathname === '/api/model-viewer/jobs/process-asset' || url.pathname === '/api/model-viewer/jobs/process-asset/') && req.method === 'POST') {
            const body = await readJsonBody(req);
            const assetName = sanitizeAssetName(body.assetName);
            const job = createModelViewerJob('process-asset', assetName, `Process asset: ${assetName}`);
            const jobSpec = createProcessAssetJobSpec(ROOT, {
                assetName,
                blenderPath: body.blenderPath || process.env.BLENDER_BIN || '/Applications/Blender.app/Contents/MacOS/Blender',
                dryRun: body.dryRun === true,
                force: body.force !== false,
                stage: body.stage === true,
                processOverrides: body.processOverrides || {},
                impostorOverrides: body.impostorOverrides || {}
            });
            startModelViewerJob(job, jobSpec);
            sendJson(res, { success: true, jobId: job.id, status: job.status });
            return;
        }

        if ((url.pathname === '/api/model-viewer/jobs/bake-impostor' || url.pathname === '/api/model-viewer/jobs/bake-impostor/') && req.method === 'POST') {
            const body = await readJsonBody(req);
            const assetName = sanitizeAssetName(body.assetName);
            const job = createModelViewerJob('bake-impostor', assetName, `Bake impostor: ${assetName}`);
            const jobSpec = createBakeImpostorJobSpec(ROOT, {
                assetName,
                blenderPath: body.blenderPath || process.env.BLENDER_BIN || '/Applications/Blender.app/Contents/MacOS/Blender',
                dryRun: body.dryRun === true,
                force: body.force !== false,
                processOverrides: body.processOverrides || {},
                impostorOverrides: body.impostorOverrides || {}
            });
            startModelViewerJob(job, jobSpec);
            sendJson(res, { success: true, jobId: job.id, status: job.status });
            return;
        }

        if ((url.pathname === '/api/model-viewer/jobs/inspect-impostor' || url.pathname === '/api/model-viewer/jobs/inspect-impostor/') && req.method === 'POST') {
            const body = await readJsonBody(req);
            const assetName = sanitizeAssetName(body.assetName);
            const job = createModelViewerJob('inspect-impostor', assetName, `Inspect impostor: ${assetName}`);
            const jobSpec = createInspectImpostorJobSpec(ROOT, {
                assetName,
                frame: body.frame,
                contactSheet: body.contactSheet !== false,
                impostorOutputDir: body.impostorOverrides?.outputDir || ''
            });
            startModelViewerJob(job, jobSpec);
            sendJson(res, { success: true, jobId: job.id, status: job.status });
            return;
        }

        if ((url.pathname === '/api/model-viewer/jobs/run-diagnostics' || url.pathname === '/api/model-viewer/jobs/run-diagnostics/') && req.method === 'POST') {
            const body = await readJsonBody(req);
            const assetName = sanitizeAssetName(body.assetName);
            const job = createModelViewerJob('run-diagnostics', assetName, `Run diagnostics: ${assetName}`);
            const jobSpec = createDiagnosticsJobSpec(ROOT, {
                assetName,
                sequences: Array.isArray(body.sequences) ? body.sequences : [],
                port: PORT,
                impostorOutputDir: body.impostorOverrides?.outputDir || ''
            });
            startModelViewerJob(job, jobSpec);
            sendJson(res, { success: true, jobId: job.id, status: job.status });
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
    console.log(`\n🚀 fsim backend server running at http://127.0.0.1:${PORT}`);
    console.log('🔁 Save/rebuild APIs, world data, assets, and SSE reloads are available on the backend');
    console.log('🛩️  Sim dev UI: http://127.0.0.1:5175/');
    console.log('🗺️  Editor dev UI: http://127.0.0.1:5174/\n');
});
