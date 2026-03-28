type WorkerFactory = () => Worker;

type PendingJob = {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
    timeoutId: number | null;
    workerIndex: number;
    worker: Worker;
};

type WorkerMessage = {
    type?: string;
    jobId?: number;
    result?: unknown;
    error?: string;
};

function createDefaultWorker(): Worker {
    return new Worker(new URL('./EditorMapTileWorker', import.meta.url), { type: 'module' });
}

export function createEditorMapTileWorkerManager({
    workerCount = 2,
    jobTimeoutMs = 15000,
    createWorker = createDefaultWorker
}: {
    workerCount?: number;
    jobTimeoutMs?: number;
    createWorker?: WorkerFactory;
} = {}) {
    const workers: Worker[] = new Array(Math.max(1, Math.floor(workerCount)));
    let nextJobId = 1;
    const pendingJobs = new Map<number, PendingJob>();
    let nextWorkerIndex = 0;
    let isDestroyed = false;

    function clearPendingJob(jobId: number | undefined) {
        if (jobId == null) return null;
        const pending = pendingJobs.get(jobId);
        if (!pending) return null;
        pendingJobs.delete(jobId);
        if (pending.timeoutId != null) {
            clearTimeout(pending.timeoutId);
        }
        return pending;
    }

    function terminateWorker(worker: Worker | undefined) {
        if (!worker || typeof worker.terminate !== 'function') return;
        worker.terminate();
    }

    function respawnWorker(workerIndex: number, failedWorker = workers[workerIndex]) {
        if (isDestroyed) return;
        if (failedWorker && workers[workerIndex] !== failedWorker) return;
        terminateWorker(workers[workerIndex]);
        const worker = createWorker();
        workers[workerIndex] = worker;
        worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
            handleMessage(event);
        };
        worker.onerror = (event) => {
            handleError(workerIndex, worker, event);
        };
    }

    function handleMessage(event: MessageEvent<WorkerMessage>) {
        const { type, jobId, result, error } = event.data || {};
        const pending = clearPendingJob(jobId);
        if (!pending) return;
        if (type === 'renderTile_error' || error) {
            pending.reject(new Error(error || `Editor map tile worker failed for job ${jobId}`));
            return;
        }
        pending.resolve(result);
    }

    function handleError(workerIndex: number, failedWorker: Worker, event: ErrorEvent) {
        const message = event?.message || 'Editor map tile worker crashed';
        for (const [jobId, pending] of pendingJobs.entries()) {
            if (pending.workerIndex !== workerIndex || pending.worker !== failedWorker) continue;
            clearPendingJob(jobId);
            pending.reject(new Error(message));
        }
        respawnWorker(workerIndex, failedWorker);
    }

    for (let workerIndex = 0; workerIndex < workers.length; workerIndex += 1) {
        respawnWorker(workerIndex, undefined);
    }

    function renderTile(payload: unknown) {
        return new Promise<unknown>((resolve, reject) => {
            const jobId = nextJobId++;
            const workerIndex = nextWorkerIndex;
            const worker = workers[workerIndex];
            nextWorkerIndex = (nextWorkerIndex + 1) % workers.length;
            const timeoutId = Number.isFinite(jobTimeoutMs) && jobTimeoutMs > 0
                ? window.setTimeout(() => {
                    const pending = clearPendingJob(jobId);
                    if (!pending) return;
                    pending.reject(new Error(`Editor map tile worker timed out after ${jobTimeoutMs}ms`));
                    respawnWorker(workerIndex, worker);
                }, jobTimeoutMs)
                : null;
            pendingJobs.set(jobId, { resolve, reject, timeoutId, workerIndex, worker });
            try {
                worker.postMessage({
                    type: 'renderTile',
                    jobId,
                    payload
                });
            } catch (error) {
                clearPendingJob(jobId);
                reject(error instanceof Error ? error : new Error(String(error)));
                respawnWorker(workerIndex, worker);
            }
        });
    }

    function destroy() {
        isDestroyed = true;
        for (const pending of pendingJobs.values()) {
            if (pending.timeoutId != null) {
                clearTimeout(pending.timeoutId);
            }
        }
        for (const { reject } of pendingJobs.values()) {
            reject(new Error('Editor map tile worker terminated'));
        }
        pendingJobs.clear();
        for (const worker of workers) {
            terminateWorker(worker);
        }
    }

    return {
        renderTile,
        destroy
    };
}
