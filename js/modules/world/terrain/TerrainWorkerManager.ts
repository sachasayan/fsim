// @ts-check

/**
 * @typedef {{
 *   completed: number,
 *   failed: number,
 *   avgDurationMs: number,
 *   maxDurationMs: number,
 *   lastDurationMs: number | null
 * }} TerrainWorkerJobSummary
 */

/**
 * @typedef {{
 *   type: string,
 *   startedAtMs: number,
 *   resolve: (result: unknown) => void,
 *   reject: (error: Error) => void
 * }} PendingTerrainWorkerJob
 */

/**
 * @typedef {{
 *   activeWorkerCount: number,
 *   inFlightJobs: number,
 *   inFlightByType: Record<string, number>,
 *   jobs: Record<string, {
 *     completed: number,
 *     failed: number,
 *     avgDurationMs: number | null,
 *     maxDurationMs: number | null,
 *     lastDurationMs: number | null,
 *     inFlight: number
 *   }>
 * }} TerrainWorkerDiagnostics
 */

/**
 * @typedef {{
 *   type: 'workerReady'
 * } | {
 *   type: 'initStaticMap_done'
 * } | {
 *   jobId: number,
 *   type: 'chunkBase_done' | 'chunkProps_done' | 'leafSurface_done',
 *   result: unknown,
 *   error?: undefined
 * } | {
 *   jobId?: number,
 *   error: string
 * }} TerrainWorkerMessage
 */

function createJobSummary() {
    /** @type {TerrainWorkerJobSummary} */
    return {
        completed: 0,
        failed: 0,
        avgDurationMs: 0,
        maxDurationMs: 0,
        lastDurationMs: null
    };
}

/**
 * @param {ArrayBuffer | null | undefined} _staticWorldBuffer
 */
export function initWorkerManager(_staticWorldBuffer) {
    const maxWorkers = navigator.hardwareConcurrency ? Math.min(navigator.hardwareConcurrency, 4) : 2;
    /** @type {Worker[]} */
    const workers = [];
    /** @type {Set<Worker>} */
    const readyWorkers = new Set();
    /** @type {Map<number, PendingTerrainWorkerJob>} */
    const pendingJobs = new Map();
    /** @type {Map<string, number>} */
    const inFlightByType = new Map();
    /** @type {Map<string, TerrainWorkerJobSummary>} */
    const jobSummaries = new Map();
    let jobIdCounter = 0;
    let workerIdx = 0;
    /** @type {Array<() => void>} */
    const pendingDispatches = [];

    function flushPendingDispatches() {
        while (readyWorkers.size > 0 && pendingDispatches.length > 0) {
            const launch = pendingDispatches.shift();
            launch();
        }
    }

    for (let i = 0; i < maxWorkers; i++) {
        const worker = new Worker(new URL('./TerrainWorker.js', import.meta.url), { type: 'module' });
        workers.push(worker);

        /**
         * @param {MessageEvent<TerrainWorkerMessage>} e
         */
        worker.onmessage = (e) => {
            const message = /** @type {{ jobId?: number, type?: string, result?: unknown, error?: string }} */ (e.data);
            const { jobId, type, result, error } = message;
            if (type === 'workerReady' && _staticWorldBuffer) {
                readyWorkers.delete(worker);
                worker.postMessage({ type: 'initStaticMap', payload: _staticWorldBuffer });
                return;
            }
            if (type === 'workerReady') {
                readyWorkers.add(worker);
                flushPendingDispatches();
                return;
            }
            if (type === 'initStaticMap_done') {
                readyWorkers.add(worker);
                flushPendingDispatches();
                return;
            }
            if (pendingJobs.has(jobId)) {
                const { resolve, reject, type: jobType, startedAtMs } = pendingJobs.get(jobId);
                pendingJobs.delete(jobId);
                inFlightByType.set(jobType, Math.max(0, (inFlightByType.get(jobType) || 0) - 1));

                const durationMs = Math.max(0, performance.now() - startedAtMs);
                const summary = jobSummaries.get(jobType) || createJobSummary();
                if (!error) {
                    const completedRuns = summary.completed + 1;
                    const totalDurationMs = summary.avgDurationMs * summary.completed + durationMs;
                    summary.completed = completedRuns;
                    summary.avgDurationMs = completedRuns > 0 ? totalDurationMs / completedRuns : summary.avgDurationMs;
                }
                summary.failed += error ? 1 : 0;
                summary.maxDurationMs = Math.max(summary.maxDurationMs, durationMs);
                summary.lastDurationMs = durationMs;
                jobSummaries.set(jobType, summary);

                if (error) reject(new Error(error));
                else resolve(result);
            }
        };
        worker.onerror = (e) => console.error("TerrainWorker Error: ", e);
    }

    /**
     * @param {string} type
     * @param {unknown} payload
     * @param {Transferable[]} [transferables]
     * @returns {Promise<unknown>}
     */
    function dispatchWorker(type, payload, transferables = []) {
        return new Promise((resolve, reject) => {
            const launch = () => {
                const readyList = workers.filter((worker) => readyWorkers.has(worker));
                if (readyList.length === 0) {
                    pendingDispatches.push(launch);
                    return;
                }

                const worker = readyList[workerIdx % readyList.length];
                workerIdx = (workerIdx + 1) % Math.max(1, readyList.length);
                const jobId = jobIdCounter++;
                const timeout = setTimeout(() => {
                    if (pendingJobs.has(jobId)) {
                        pendingJobs.delete(jobId);
                        reject(new Error(`Worker job ${type} timed out after 60s`));
                    }
                }, 60000);

                pendingJobs.set(jobId, {
                    type,
                    startedAtMs: performance.now(),
                    resolve: (res) => { clearTimeout(timeout); resolve(res); },
                    reject: (err) => { clearTimeout(timeout); reject(err); }
                });
                inFlightByType.set(type, (inFlightByType.get(type) || 0) + 1);
                worker.postMessage({ type, payload, jobId }, transferables);
            };

            if (readyWorkers.size === 0) {
                pendingDispatches.push(launch);
            } else {
                launch();
            }
        });
    }

    /**
     * @returns {TerrainWorkerDiagnostics}
     */
    function getDiagnostics() {
        /** @type {TerrainWorkerDiagnostics['jobs']} */
        const jobs = {};
        for (const [type, summary] of jobSummaries.entries()) {
            jobs[type] = {
                completed: summary.completed,
                failed: summary.failed,
                avgDurationMs: Number.isFinite(summary.avgDurationMs) ? Math.round(summary.avgDurationMs * 1000) / 1000 : null,
                maxDurationMs: Number.isFinite(summary.maxDurationMs) ? Math.round(summary.maxDurationMs * 1000) / 1000 : null,
                lastDurationMs: Number.isFinite(summary.lastDurationMs) ? Math.round(summary.lastDurationMs * 1000) / 1000 : null,
                inFlight: inFlightByType.get(type) || 0
            };
        }

        return {
            activeWorkerCount: workers.length,
            inFlightJobs: pendingJobs.size,
            inFlightByType: Object.fromEntries(inFlightByType.entries()),
            jobs
        };
    }

    return { workers, dispatchWorker, getDiagnostics };
}
