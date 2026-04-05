import type {
    ModelViewerDraftState,
    ModelViewerJob,
    WorldAssetCatalogEntry,
    WorldAssetDetail
} from './types';

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
    const response = await fetch(input, init);
    if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Request failed: ${response.status}`);
    }
    return response.json() as Promise<T>;
}

export async function fetchModelViewerCatalog(): Promise<{ assets: WorldAssetCatalogEntry[] }> {
    return requestJson('/api/model-viewer/catalog');
}

export async function fetchModelViewerAssetDetail(assetName: string): Promise<WorldAssetDetail> {
    return requestJson(`/api/model-viewer/assets/${encodeURIComponent(assetName)}`);
}

type JobStartResponse = {
    success: boolean;
    jobId: string;
    status: string;
};

type DraftPayload = {
    processOverrides: {
        targetTriangles: number;
        targetHeightMeters: number;
        sizeBudgetBytes: number;
        joinMeshes: boolean;
        cleanupLooseGeometry: boolean;
        preserveUVs: boolean;
        decimateMethod: string;
    };
    impostorOverrides: {
        gridSize: number;
        frameSize: number;
        outputDir: string;
    };
};

function buildDraftPayload(draft: ModelViewerDraftState): DraftPayload {
    return {
        processOverrides: {
            targetTriangles: draft.targetTriangles,
            targetHeightMeters: draft.targetHeightMeters,
            sizeBudgetBytes: draft.sizeBudgetBytes,
            joinMeshes: draft.joinMeshes,
            cleanupLooseGeometry: draft.cleanupLooseGeometry,
            preserveUVs: draft.preserveUVs,
            decimateMethod: draft.decimateMethod
        },
        impostorOverrides: {
            gridSize: draft.impostorGridSize,
            frameSize: draft.impostorFrameSize,
            outputDir: draft.impostorOutputDir
        }
    };
}

export async function startProcessAssetJob(assetName: string, draft: ModelViewerDraftState): Promise<JobStartResponse> {
    return requestJson('/api/model-viewer/jobs/process-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            assetName,
            stage: draft.stage,
            ...buildDraftPayload(draft)
        })
    });
}

export async function startBakeImpostorJob(assetName: string, draft: ModelViewerDraftState): Promise<JobStartResponse> {
    return requestJson('/api/model-viewer/jobs/bake-impostor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            assetName,
            ...buildDraftPayload(draft)
        })
    });
}

export async function startInspectImpostorJob(assetName: string): Promise<JobStartResponse> {
    return requestJson('/api/model-viewer/jobs/inspect-impostor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            assetName,
            contactSheet: true
        })
    });
}

export async function startDiagnosticsJob(assetName: string, sequences: string[]): Promise<JobStartResponse> {
    return requestJson('/api/model-viewer/jobs/run-diagnostics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            assetName,
            sequences
        })
    });
}

export async function fetchModelViewerJob(jobId: string): Promise<ModelViewerJob> {
    return requestJson(`/api/model-viewer/jobs/${encodeURIComponent(jobId)}`);
}
