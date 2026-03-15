function createJobSummary() {
    return {
        completed: 0,
        failed: 0,
        avgDurationMs: 0,
        maxDurationMs: 0,
        lastDurationMs: null
    };
}

export function initWorkerManager(_staticWorldBuffer) {
    const maxWorkers = navigator.hardwareConcurrency ? Math.min(navigator.hardwareConcurrency, 4) : 2;
    const workers = [];
    const pendingJobs = new Map();
    const inFlightByType = new Map();
    const jobSummaries = new Map();
    let jobIdCounter = 0;
    let workerIdx = 0;

    for (let i = 0; i < maxWorkers; i++) {
        const worker = new Worker(new URL('./TerrainWorker.js', import.meta.url), { type: 'module' });
        workers.push(worker);

        worker.onmessage = (e) => {
            const { jobId, type, result, error } = e.data;
            if (type === 'workerReady' && _staticWorldBuffer) {
                worker.postMessage({ type: 'initStaticMap', payload: _staticWorldBuffer });
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

    function dispatchWorker(type, payload, transferables = []) {
        return new Promise((resolve, reject) => {
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

            const worker = workers[workerIdx];
            workerIdx = (workerIdx + 1) % workers.length;
            worker.postMessage({ type, payload, jobId }, transferables);
        });
    }

    function getDiagnostics() {
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
