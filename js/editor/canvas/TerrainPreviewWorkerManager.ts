type PendingJob = {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
};

type WorkerMessage = {
    type?: string;
    jobId?: number;
    result?: unknown;
    error?: string;
};

export function createTerrainPreviewWorkerManager() {
    const worker = new Worker(new URL('./TerrainPreviewWorker', import.meta.url), { type: 'module' });
    let nextJobId = 1;
    const pendingJobs = new Map<number, PendingJob>();

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const { type, jobId, result, error } = event.data || {};
        if (jobId == null) return;
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

    function buildPreview(payload: unknown) {
        return new Promise<unknown>((resolve, reject) => {
            const jobId = nextJobId++;
            pendingJobs.set(jobId, { resolve, reject });
            worker.postMessage({
                type: 'buildPreview',
                jobId,
                payload
            });
        });
    }

    function sampleOverlay(payload: unknown) {
        return new Promise<unknown>((resolve, reject) => {
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
