import { createSeededNoise, createTerrainSynthesizer } from '../../modules/world/terrain/TerrainSynthesis.js';
import { DEFAULT_WORLD_SIZE } from '../../modules/world/WorldConfig.js';

let synthCache = null;
let synthCacheKey = null;

function getSynthesizer(config, authoredBounds) {
    const nextKey = JSON.stringify({ config, authoredBounds });
    if (synthCache && synthCacheKey === nextKey) return synthCache;
    synthCacheKey = nextKey;
    synthCache = createTerrainSynthesizer({
        Noise: createSeededNoise(config?.seed),
        worldSize: DEFAULT_WORLD_SIZE,
        config,
        authoredBounds,
        applyRunwayFlattening: false
    });
    return synthCache;
}

self.onmessage = function (event) {
    const { type, jobId, payload } = event.data || {};

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
