export type WorldAssetFileInfo = {
    path: string;
    repoRelativePath: string | null;
    urlPath: string | null;
    exists: boolean;
    sizeBytes: number | null;
    mtimeMs: number | null;
};

export type WorldAssetCatalogEntry = {
    assetName: string;
    category: string;
    targetHeightMeters: number;
    targetTriangles: number;
    sizeBudgetBytes: number;
    hasImpostorBake: boolean;
    files: {
        source: WorldAssetFileInfo;
        decimated: WorldAssetFileInfo;
        gameReady: WorldAssetFileInfo;
        report: WorldAssetFileInfo;
        impostor: {
            baseDir: WorldAssetFileInfo;
            metadata: WorldAssetFileInfo;
            albedo: WorldAssetFileInfo;
            normal: WorldAssetFileInfo;
            depth: WorldAssetFileInfo;
        } | null;
    } | null;
};

export type WorldAssetDetail = {
    assetName: string;
    category: string;
    preset: Record<string, unknown> & {
        name: string;
        category: string;
        targetTriangles?: number;
        sizeBudgetBytes?: number;
        joinMeshes?: boolean;
        cleanupLooseGeometry?: boolean;
        preserveUVs?: boolean;
        decimateMethod?: string;
        impostorBake?: {
            enabled?: boolean;
            outputDir?: string;
            gridSize?: number;
            frameSize?: number;
        };
    };
    targetHeightMeters: number;
    paths: Record<string, string | null>;
    files: {
        unprocessed: WorldAssetFileInfo;
        source: WorldAssetFileInfo;
        decimated: WorldAssetFileInfo;
        gameReady: WorldAssetFileInfo;
        report: WorldAssetFileInfo;
        impostor: {
            baseDir: WorldAssetFileInfo;
            metadata: WorldAssetFileInfo;
            albedo: WorldAssetFileInfo;
            normal: WorldAssetFileInfo;
            depth: WorldAssetFileInfo;
        } | null;
    };
    reportData: Record<string, unknown> | null;
    measuredTriangles: {
        source: number | null;
        decimated: number | null;
        gameReady: number | null;
    };
    impostorMetadata: (Record<string, unknown> & {
        frameCount?: number;
        frameSize?: number;
        atlasWidth?: number;
        atlasHeight?: number;
        viewBlendMode?: string;
        frameBands?: string[];
        elevatedThreshold?: number;
        highCardinalThreshold?: number;
        captureOrthoScale?: number;
        contentRect?: {
            x?: number;
            y?: number;
            width?: number;
            height?: number;
        };
        visibleWidthRatio?: number;
        visibleHeightRatio?: number;
        padding?: {
            left?: number;
            right?: number;
            top?: number;
            bottom?: number;
        };
    }) | null;
};

export type ModelViewerPreviewRepresentation = 'source' | 'decimated' | 'gameReady' | 'impostor' | 'sideBySide';

export type ModelViewerPreviewState = {
    representation: ModelViewerPreviewRepresentation;
    cameraYaw: number;
    cameraPitch: number;
    cameraDistance: number;
    sunYaw: number;
    sunPitch: number;
    showGround: boolean;
};

export type ModelViewerCameraState = Pick<ModelViewerPreviewState, 'cameraYaw' | 'cameraPitch' | 'cameraDistance'>;

export type ModelViewerDraftState = {
    targetTriangles: number;
    targetHeightMeters: number;
    sizeBudgetBytes: number;
    joinMeshes: boolean;
    cleanupLooseGeometry: boolean;
    preserveUVs: boolean;
    decimateMethod: string;
    stage: boolean;
    impostorGridSize: number;
    impostorFrameSize: number;
    impostorOutputDir: string;
};

export type ModelViewerArtifactFile = {
    path: string;
    urlPath: string;
};

export type ModelViewerJob = {
    id: string;
    jobType: string;
    assetName: string;
    label: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    logs: string[];
    artifacts: {
        outputDir: string;
        files: ModelViewerArtifactFile[];
    } | null;
    error: string | null;
    createdAt: number;
    updatedAt: number;
};
