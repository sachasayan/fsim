export function initWorkerManager(_staticWorldBuffer) {
    const maxWorkers = navigator.hardwareConcurrency ? Math.min(navigator.hardwareConcurrency, 4) : 2;
    const workers = [];
    const pendingJobs = new Map();
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
                const { resolve, reject } = pendingJobs.get(jobId);
                pendingJobs.delete(jobId);
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
                resolve: (res) => { clearTimeout(timeout); resolve(res); },
                reject: (err) => { clearTimeout(timeout); reject(err); }
            });

            const worker = workers[workerIdx];
            workerIdx = (workerIdx + 1) % workers.length;
            worker.postMessage({ type, payload, jobId }, transferables);
        });
    }

    return { workers, dispatchWorker };
}
