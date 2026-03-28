// @ts-check

export function createTerrainPreviewWorkerManager() {
    const worker = new Worker(new URL('./TerrainPreviewWorker.js', import.meta.url), { type: 'module' });
    let nextJobId = 1;
    const pendingJobs = new Map();

    worker.onmessage = (event) => {
        const { type, jobId, result, error } = event.data || {};
        const pending = pendingJobs.get(jobId);
        if (!pending) return;
        pendingJobs.delete(jobId);
        if (type === 'buildPreview_error' || error) {
            pending.reject(new Error(error || `Terrain preview worker failed for job ${jobId}`));
            return;
        }
        pending.resolve(result);
    };

    worker.onerror = (event) => {
        const message = event?.message || 'Terrain preview worker crashed';
        for (const { reject } of pendingJobs.values()) {
            reject(new Error(message));
        }
        pendingJobs.clear();
    };

    function buildPreview(payload) {
        return new Promise((resolve, reject) => {
            const jobId = nextJobId++;
            pendingJobs.set(jobId, { resolve, reject });
            worker.postMessage({
                type: 'buildPreview',
                jobId,
                payload
            });
        });
    }

    function sampleOverlay(payload) {
        return new Promise((resolve, reject) => {
            const jobId = nextJobId++;
            pendingJobs.set(jobId, { resolve, reject });
            worker.postMessage({
                type: 'sampleOverlay',
                jobId,
                payload
            });
        });
    }

    function destroy() {
        for (const { reject } of pendingJobs.values()) {
            reject(new Error('Terrain preview worker terminated'));
        }
        pendingJobs.clear();
        worker.terminate();
    }

    return {
        buildPreview,
        sampleOverlay,
        destroy
    };
}
