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

    console.log('[LiveReload] Initializing SSE connection...');

    // If we're on port 5173 (Game), connect to the Dev Server on 5174 for rebuild events
    const ssePort = window.location.port === '5173' ? '5174' : window.location.port;
    const es = new EventSource(`//${window.location.hostname}:${ssePort}/events`);

    es.addEventListener('reload-city', async (event) => {
        const data = JSON.parse(event.data);
        console.log(`[LiveReload] Received reload signal (timestamp: ${data.timestamp})`);

        try {
            // 1. Clear caches and reload static world (world.bin + metadata)
            const { loadStaticWorld, clearStaticWorldCache } = await import('../world/terrain/TerrainGeneration.js');
            const { setStaticSampler, QuadtreeMapSampler } = await import('../world/terrain/TerrainUtils.js');

            clearStaticWorldCache();
            const success = await loadStaticWorld();

            if (success) {
                const worldBinResp = await fetch(`//${window.location.hostname}:${ssePort}/world/world.bin`);
                const buf = await worldBinResp.arrayBuffer();
                setStaticSampler(new QuadtreeMapSampler(buf));
            }

            // 2. Reload city building meshes
            await terrainSystem.reloadCity();
            console.log('[LiveReload] Hot-swap complete.');
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
