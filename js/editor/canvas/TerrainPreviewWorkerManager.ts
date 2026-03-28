import type {
    EditorBounds,
    EditorTerrainGenerator,
    EditorTerrainLabMetadata,
    EditorTerrainPreviewSnapshot
} from '../core/types.js';

type BuildPreviewPayload = {
    config: EditorTerrainGenerator;
    authoredBounds?: EditorBounds | null;
    bounds: EditorBounds;
    overlayKind?: string;
    resolution?: number;
    opacity?: number;
    showContours?: boolean;
};

type BuildPreviewResult = {
    snapshot: EditorTerrainPreviewSnapshot;
    metadata: EditorTerrainLabMetadata | null;
};

type SampleOverlayPayload = {
    config: EditorTerrainGenerator;
    authoredBounds?: EditorBounds | null;
    x: number;
    z: number;
    overlayKind?: string;
};

type SampleOverlayResult = {
    value: number;
};

type PendingJob<T> = {
    resolve: (value: T) => void;
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
    const pendingJobs = new Map<number, PendingJob<unknown>>();

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const { type, jobId, result, error } = event.data || {};
        if (jobId == null) return;
        const pending = pendingJobs.get(jobId);
        if (!pending) return;
        pendingJobs.delete(jobId);
        if (type === 'buildPreview_error' || type === 'sampleOverlay_error' || error) {
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

    function runJob<T>(type: 'buildPreview' | 'sampleOverlay', payload: BuildPreviewPayload | SampleOverlayPayload) {
        return new Promise<T>((resolve, reject) => {
            const jobId = nextJobId++;
            pendingJobs.set(jobId, { resolve, reject });
            worker.postMessage({
                type,
                jobId,
                payload
            });
        });
    }

    function buildPreview(payload: BuildPreviewPayload) {
        return runJob<BuildPreviewResult>('buildPreview', payload);
    }

    function sampleOverlay(payload: SampleOverlayPayload) {
        return runJob<SampleOverlayResult>('sampleOverlay', payload);
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
