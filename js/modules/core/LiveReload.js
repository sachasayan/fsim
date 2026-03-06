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
    const es = new EventSource('/events');

    es.addEventListener('reload-city', async (event) => {
        const data = JSON.parse(event.data);
        console.log(`[LiveReload] Received reload signal (timestamp: ${data.timestamp})`);

        try {
            // Reload all cities for simplicity, or we could pass specific IDs if server sent them
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
