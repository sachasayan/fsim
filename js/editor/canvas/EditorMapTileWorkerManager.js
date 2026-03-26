export function createEditorMapTileWorkerManager({ workerCount = 2 } = {}) {
    const workers = Array.from({ length: Math.max(1, Math.floor(workerCount)) }, () => (
        new Worker(new URL('./EditorMapTileWorker.js', import.meta.url), { type: 'module' })
    ));
    let nextJobId = 1;
    const pendingJobs = new Map();
    let nextWorkerIndex = 0;

    function handleMessage(event) {
        const { type, jobId, result, error } = event.data || {};
        const pending = pendingJobs.get(jobId);
        if (!pending) return;
        pendingJobs.delete(jobId);
        if (type === 'renderTile_error' || error) {
            pending.reject(new Error(error || `Editor map tile worker failed for job ${jobId}`));
            return;
        }
        pending.resolve(result);
    }

    function handleError(event) {
        const message = event?.message || 'Editor map tile worker crashed';
        for (const { reject } of pendingJobs.values()) {
            reject(new Error(message));
        }
        pendingJobs.clear();
    }

    for (const worker of workers) {
        worker.onmessage = handleMessage;
        worker.onerror = handleError;
    }

    function renderTile(payload) {
        return new Promise((resolve, reject) => {
            const jobId = nextJobId++;
            pendingJobs.set(jobId, { resolve, reject });
            const worker = workers[nextWorkerIndex];
            nextWorkerIndex = (nextWorkerIndex + 1) % workers.length;
            worker.postMessage({
                type: 'renderTile',
                jobId,
                payload
            });
        });
    }

    function destroy() {
        for (const { reject } of pendingJobs.values()) {
            reject(new Error('Editor map tile worker terminated'));
        }
        pendingJobs.clear();
        for (const worker of workers) {
            worker.terminate();
        }
    }

    return {
        renderTile,
        destroy
    };
}
