import { debugLog } from './logging.js';

/**
 * LiveReload.js
 *
 * Connects to the server's SSE endpoint and listens for 'reload-city' events.
 * When triggered, it tells the terrain system to hot-swap city meshes.
 */

export function initLiveReload(terrainSystem) {
    if (!terrainSystem || !terrainSystem.reloadCity) {
        console.warn('[LiveReload] Terrain system not ready or missing reloadCity function.');
        return;
    }

    debugLog('[LiveReload] Initializing SSE connection...');

    const serverOrigin = window.location.origin;
    const es = new EventSource(`${serverOrigin}/events`);

    es.addEventListener('reload-city', async (event) => {
        const data = JSON.parse(event.data);
        debugLog(`[LiveReload] Received reload signal (timestamp: ${data.timestamp})`);

        try {
            // 1. Clear caches and reload static world (world.bin + metadata)
            const { loadStaticWorld, clearStaticWorldCache } = await import('../world/terrain/TerrainGeneration.js');
            const { setStaticSampler, QuadtreeMapSampler } = await import('../world/terrain/TerrainUtils.js');

            clearStaticWorldCache();
            const success = await loadStaticWorld();

            if (success) {
                const worldBinResp = await fetch(`${serverOrigin}/world/world.bin`);
                const buf = await worldBinResp.arrayBuffer();
                setStaticSampler(new QuadtreeMapSampler(buf));
            }

            // 2. Reload city building meshes
            await terrainSystem.reloadCity();
            debugLog('[LiveReload] Hot-swap complete.');
        } catch (err) {
            console.error('[LiveReload] Hot-swap failed:', err);
        }
    });

    es.onerror = (err) => {
        console.error('[LiveReload] SSE Error:', err);
    };

    window.addEventListener('beforeunload', () => {
        es.close();
    });
}
