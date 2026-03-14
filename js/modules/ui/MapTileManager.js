import { MAP_COLORS } from './MapColors.js';

/**
 * Manages map tiles for the minimap and editor.
 * Uses async tile rendering with placeholder fallback so zoom/pan never stutter.
 */
export class MapTileManager {
    constructor({ sampleTerrainHeight = null, getTerrainHeight = null, tileSize = 256, pixelRatio = 1, useHillshading = false, Noise = null, onTileReady = null, renderTileAsync = null }) {
        this.sampleTerrainHeight = this.resolveTerrainSampler({ sampleTerrainHeight, getTerrainHeight, Noise });
        this.tileSize = tileSize;
        this.pixelRatio = pixelRatio;
        this.useHillshading = useHillshading;
        this.Noise = Noise;
        this.onTileReady = onTileReady; // Callback to trigger re-render when tile is ready
        this.renderTileAsync = typeof renderTileAsync === 'function' ? renderTileAsync : null;

        this.tiles = new Map();       // key -> { canvas, status: 'ready'|'pending' }
        this.renderQueue = [];        // tiles waiting to render
        this.queuedKeys = new Set();
        this.isProcessingQueue = false;
        this.maxCacheSize = 512;
        this.cacheGeneration = 0;
        this.queuePriorityDirty = false;
        this.lastPriorityKey = null;
    }

    resolveTerrainSampler({ sampleTerrainHeight, getTerrainHeight, Noise }) {
        if (typeof sampleTerrainHeight === 'function') return sampleTerrainHeight;
        if (typeof getTerrainHeight !== 'function') {
            throw new Error('MapTileManager requires a terrain height sampler');
        }

        if (Noise != null && getTerrainHeight.length >= 3) {
            return (x, z) => getTerrainHeight(x, z, Noise);
        }

        return (x, z) => getTerrainHeight(x, z);
    }

    /**
     * Get or schedule a tile. Returns canvas if ready, null if pending.
     * tx, tz: tile coordinates, lod: meters per pixel
     */
    getTile(tx, tz, lod) {
        const key = `${lod}_${tx}_${tz}`;
        const entry = this.tiles.get(key);

        if (entry) {
            entry.lastUsed = performance.now();
            return entry.status === 'ready' ? entry.canvas : null;
        }

        // Create placeholder and schedule render
        const canvas = document.createElement('canvas');
        const cw = Math.max(1, Math.round(this.tileSize * this.pixelRatio));
        canvas.width = cw;
        canvas.height = cw;

        const newEntry = { canvas, status: 'pending', lastUsed: performance.now() };
        this.evictIfNeeded();
        this.tiles.set(key, newEntry);

        if (!this.queuedKeys.has(key)) {
            this.renderQueue.push({ tx, tz, lod, key, generation: this.cacheGeneration });
            this.queuedKeys.add(key);
            this.queuePriorityDirty = true;
        }
        this.processQueue();

        return null; // Not ready yet
    }

    processQueue() {
        if (this.isProcessingQueue || this.renderQueue.length === 0) return;
        this.isProcessingQueue = true;

        // Use setTimeout(0) to yield to the browser between tiles
        const renderNext = async () => {
            if (this.renderQueue.length === 0) {
                this.isProcessingQueue = false;
                return;
            }
            const { tx, tz, lod, key, generation } = this.renderQueue.shift();
            this.queuedKeys.delete(key);
            const entry = this.tiles.get(key);
            if (generation === this.cacheGeneration && entry && entry.status === 'pending') {
                try {
                    if (this.renderTileAsync) {
                        const tileImage = await this.renderTileAsync({
                            tx,
                            tz,
                            lod,
                            canvasW: entry.canvas.width,
                            canvasH: entry.canvas.height,
                            tileSize: this.tileSize,
                            pixelRatio: this.pixelRatio,
                            useHillshading: this.useHillshading
                        });
                        if (generation === this.cacheGeneration && this.tiles.get(key) === entry && entry.status === 'pending') {
                            const ctx = entry.canvas.getContext('2d');
                            this.paintTileImage(ctx, tileImage.pixels, tileImage.width, tileImage.height);
                            entry.status = 'ready';
                            if (this.onTileReady) this.onTileReady();
                        }
                    } else {
                        const ctx = entry.canvas.getContext('2d');
                        this.renderTile(ctx, tx, tz, lod, entry.canvas.width, entry.canvas.height);
                        entry.status = 'ready';
                        if (this.onTileReady) this.onTileReady();
                    }
                } catch (error) {
                    console.error('Failed to render map tile', error);
                    if (this.tiles.get(key) === entry && entry.status === 'pending') {
                        this.tiles.delete(key);
                    }
                }
            }
            requestAnimationFrame(renderNext);
        };

        requestAnimationFrame(renderNext);
    }

    renderTile(ctx, tx, tz, lod, canvasW, canvasH) {
        const worldTileSize = this.tileSize * lod;
        const startX = tx * worldTileSize;
        const startZ = tz * worldTileSize;
        const slopeDist = lod;

        const imgData = ctx.createImageData(canvasW, canvasH);
        const buf = imgData.data;

        for (let py = 0; py < canvasH; py++) {
            for (let px = 0; px < canvasW; px++) {
                const wx = startX + (px / this.pixelRatio) * lod;
                const wz = startZ + (py / this.pixelRatio) * lod;

                const h = this.sampleTerrainHeight(wx, wz);
                let r, g, b;

                if (this.useHillshading) {
                    const hRight = this.sampleTerrainHeight(wx + slopeDist, wz);
                    const hDown = this.sampleTerrainHeight(wx, wz + slopeDist);
                    [r, g, b] = MAP_COLORS.getTerrainColorArray(h, (hRight - h) / slopeDist, (hDown - h) / slopeDist);
                } else {
                    [r, g, b] = MAP_COLORS.getTerrainColorArray(h, 0, 0);
                }

                const idx = (py * canvasW + px) * 4;
                buf[idx] = r;
                buf[idx + 1] = g;
                buf[idx + 2] = b;
                buf[idx + 3] = 255;
            }
        }

        ctx.putImageData(imgData, 0, 0);
    }

    paintTileImage(ctx, pixels, width, height) {
        const imgData = ctx.createImageData(width, height);
        imgData.data.set(pixels);
        ctx.putImageData(imgData, 0, 0);
    }

    /**
     * Find the best available placeholder for a tile that isn't ready yet.
     * Tries one LOD coarser first (scales up a 2x smaller tile), then uses nothing.
     */
    getPlaceholderTile(tx, tz, lod) {
        // Try one LOD coarser (2x the lod = half the tile count)
        const coarseLod = lod * 2;
        const coarseTx = Math.floor(tx / 2);
        const coarseTz = Math.floor(tz / 2);
        const coarseKey = `${coarseLod}_${coarseTx}_${coarseTz}`;
        const coarseEntry = this.tiles.get(coarseKey);
        if (coarseEntry && coarseEntry.status === 'ready') {
            return { canvas: coarseEntry.canvas, srcX: (tx % 2) * 0.5, srcZ: (tz % 2) * 0.5, scale: 0.5 };
        }

        // Try one LOD finer (0.5x the lod)
        const fineLod = lod / 2;
        for (let dz = 0; dz < 2; dz++) {
            for (let dx = 0; dx < 2; dx++) {
                const fineTx = tx * 2 + dx;
                const fineTz = tz * 2 + dz;
                const fineKey = `${fineLod}_${fineTx}_${fineTz}`;
                const fineEntry = this.tiles.get(fineKey);
                if (fineEntry && fineEntry.status === 'ready') {
                    return { canvas: fineEntry.canvas, srcX: dx * 0.5, srcZ: dz * 0.5, scale: 2 };
                }
            }
        }

        return null;
    }

    clearCache() {
        this.tiles.clear();
        this.renderQueue.length = 0;
        this.queuedKeys.clear();
        this.cacheGeneration++;
        this.queuePriorityDirty = false;
        this.lastPriorityKey = null;
    }

    destroy() {
        this.clearCache();
    }

    invalidateWorldRect(minX, minZ, maxX, maxZ) {
        for (const [key] of this.tiles.entries()) {
            const [lodStr, txStr, tzStr] = key.split('_');
            const lod = Number(lodStr);
            const tx = Number(txStr);
            const tz = Number(tzStr);
            const worldTileSize = this.tileSize * lod;
            const tileMinX = tx * worldTileSize;
            const tileMinZ = tz * worldTileSize;
            const tileMaxX = tileMinX + worldTileSize;
            const tileMaxZ = tileMinZ + worldTileSize;
            if (tileMaxX < minX || tileMinX > maxX || tileMaxZ < minZ || tileMinZ > maxZ) continue;
            this.tiles.delete(key);
        }
        this.renderQueue = this.renderQueue.filter(job => {
            const worldTileSize = this.tileSize * job.lod;
            const tileMinX = job.tx * worldTileSize;
            const tileMinZ = job.tz * worldTileSize;
            const tileMaxX = tileMinX + worldTileSize;
            const tileMaxZ = tileMinZ + worldTileSize;
            const keep = tileMaxX < minX || tileMinX > maxX || tileMaxZ < minZ || tileMinZ > maxZ;
            if (!keep) this.queuedKeys.delete(job.key);
            return keep;
        });
        this.queuePriorityDirty = true;
        this.lastPriorityKey = null;
    }

    evictIfNeeded() {
        if (this.tiles.size < this.maxCacheSize) return;
        let oldestKey = null;
        let oldestTime = Infinity;
        for (const [k, v] of this.tiles.entries()) {
            if (v.lastUsed < oldestTime) {
                oldestTime = v.lastUsed;
                oldestKey = k;
            }
        }
        if (oldestKey) this.tiles.delete(oldestKey);
    }

    /**
     * Draw all visible tiles to a canvas context.
     * Smoothly handles missing tiles using placeholder scaling.
     */
    draw(mainCtx, cameraX, cameraZ, zoom, canvasWidth, canvasHeight) {
        const lod = 1 / zoom;
        const targetLod = this.getNearestLod(lod);
        const worldTileSize = this.tileSize * targetLod;

        const startX = Math.floor((cameraX - (canvasWidth / 2) / zoom) / worldTileSize);
        const endX = Math.ceil((cameraX + (canvasWidth / 2) / zoom) / worldTileSize);
        const startZ = Math.floor((cameraZ - (canvasHeight / 2) / zoom) / worldTileSize);
        const endZ = Math.ceil((cameraZ + (canvasHeight / 2) / zoom) / worldTileSize);

        for (let tz = startZ; tz <= endZ; tz++) {
            for (let tx = startX; tx <= endX; tx++) {
                const tileCanvas = this.getTile(tx, tz, targetLod);

                const worldX = tx * worldTileSize;
                const worldZ = tz * worldTileSize;
                const sx = canvasWidth / 2 + (worldX - cameraX) * zoom;
                const sy = canvasHeight / 2 + (worldZ - cameraZ) * zoom;
                const sSize = worldTileSize * zoom;

                if (tileCanvas) {
                    mainCtx.drawImage(tileCanvas, sx, sy, sSize, sSize);
                } else {
                    // Draw best available placeholder to avoid blank flickering
                    const placeholder = this.getPlaceholderTile(tx, tz, targetLod);
                    if (placeholder) {
                        const { canvas, srcX, srcZ, scale } = placeholder;
                        const srcSize = canvas.width * scale;
                        mainCtx.drawImage(
                            canvas,
                            srcX * canvas.width, srcZ * canvas.height,
                            srcSize, srcSize,
                            sx, sy, sSize, sSize
                        );
                    }
                    // Schedule adjacent LODs to also be fetched for future placeholders
                    this.getTile(Math.floor(tx / 2), Math.floor(tz / 2), targetLod * 2);
                }
            }
        }
        this.prioritizeQueue(cameraX, cameraZ, targetLod);
    }

    getNearestLod(lod) {
        return Math.pow(2, Math.ceil(Math.log2(Math.max(lod, 0.5))));
    }

    prioritizeQueue(cameraX, cameraZ, lod) {
        if (this.renderQueue.length <= 1) {
            this.queuePriorityDirty = false;
            this.lastPriorityKey = `${lod}_${Math.floor(cameraX / (this.tileSize * lod))}_${Math.floor(cameraZ / (this.tileSize * lod))}`;
            return;
        }

        const worldTileSize = this.tileSize * lod;
        const priorityKey = `${lod}_${Math.floor(cameraX / worldTileSize)}_${Math.floor(cameraZ / worldTileSize)}`;
        if (!this.queuePriorityDirty && this.lastPriorityKey === priorityKey) return;

        this.renderQueue.sort((a, b) => {
            const aWorldTileSize = this.tileSize * a.lod;
            const bWorldTileSize = this.tileSize * b.lod;
            const aDx = (a.tx + 0.5) * aWorldTileSize - cameraX;
            const aDz = (a.tz + 0.5) * aWorldTileSize - cameraZ;
            const bDx = (b.tx + 0.5) * bWorldTileSize - cameraX;
            const bDz = (b.tz + 0.5) * bWorldTileSize - cameraZ;
            return (aDx * aDx + aDz * aDz) - (bDx * bDx + bDz * bDz);
        });
        this.queuePriorityDirty = false;
        this.lastPriorityKey = priorityKey;
    }
}
