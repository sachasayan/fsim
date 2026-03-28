import { createSeededNoise, createTerrainSynthesizer } from '../../modules/world/terrain/TerrainSynthesis.js';
import { DEFAULT_WORLD_SIZE } from '../../modules/world/WorldConfig';
import type { EditorBounds, EditorTerrainGenerator } from '../core/types';

type TerrainPreviewOverlay =
    | 'height'
    | 'rivers'
    | 'lakes'
    | 'moisture'
    | 'flow'
    | 'erosion'
    | 'gorge'
    | 'cliff'
    | 'floodplain'
    | 'talus';

type TerrainPreviewSnapshot = {
    pixels: Uint8ClampedArray;
};

type TerrainSynthesizer = {
    buildViewportPreview: (
        bounds: EditorBounds,
        options: {
            overlayKind?: TerrainPreviewOverlay;
            resolution?: number;
            opacity?: number;
            showContours?: boolean;
        }
    ) => TerrainPreviewSnapshot;
    getMetadata: () => unknown;
    sampleOverlay: (x: number, z: number, overlayKind?: TerrainPreviewOverlay) => number;
};

const createPreviewTerrainSynthesizer = createTerrainSynthesizer as unknown as (args: {
    Noise: ReturnType<typeof createSeededNoise>;
    worldSize: number;
    config: EditorTerrainGenerator;
    authoredBounds: EditorBounds | null;
    applyRunwayFlattening: boolean;
}) => TerrainSynthesizer;

type WorkerMessage =
    | {
        type: 'buildPreview';
        jobId: number;
        payload: {
            config: EditorTerrainGenerator;
            authoredBounds?: EditorBounds | null;
            bounds: EditorBounds;
            overlayKind?: TerrainPreviewOverlay;
            resolution?: number;
            opacity?: number;
            showContours?: boolean;
        };
    }
    | {
        type: 'sampleOverlay';
        jobId: number;
        payload: {
            config: EditorTerrainGenerator;
            authoredBounds?: EditorBounds | null;
            x: number;
            z: number;
            overlayKind?: TerrainPreviewOverlay;
        };
    };

let synthCache: TerrainSynthesizer | null = null;
let synthCacheKey: string | null = null;

function getSynthesizer(config: EditorTerrainGenerator, authoredBounds: EditorBounds | null) {
    const nextKey = JSON.stringify({ config, authoredBounds });
    if (synthCache && synthCacheKey === nextKey) return synthCache;
    synthCacheKey = nextKey;
    synthCache = createPreviewTerrainSynthesizer({
        Noise: createSeededNoise(config?.seed),
        worldSize: DEFAULT_WORLD_SIZE,
        config,
        authoredBounds,
        applyRunwayFlattening: false
    });
    return synthCache;
}

self.onmessage = function (event: MessageEvent<WorkerMessage>) {
    const { type, jobId, payload } = event.data || {};
    if (!payload) return;

    try {
        const synthesizer = getSynthesizer(payload.config, payload.authoredBounds || null);
        if (type === 'buildPreview') {
            const snapshot = synthesizer.buildViewportPreview(payload.bounds, {
                overlayKind: payload.overlayKind,
                resolution: payload.resolution,
                opacity: payload.opacity,
                showContours: payload.showContours
            });
            const metadata = synthesizer.getMetadata();
            self.postMessage({
                type: 'buildPreview_done',
                jobId,
                result: {
                    snapshot,
                    metadata
                }
            }, [snapshot.pixels.buffer]);
            return;
        }

        if (type === 'sampleOverlay') {
            const value = synthesizer.sampleOverlay(payload.x, payload.z, payload.overlayKind);
            self.postMessage({
                type: 'sampleOverlay_done',
                jobId,
                result: { value }
            });
        }
    } catch (error) {
        self.postMessage({
            type: `${type}_error`,
            jobId,
            error: error instanceof Error ? error.message : String(error)
        });
    }
};
