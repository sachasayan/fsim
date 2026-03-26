import { MAP_COLORS } from './MapColors.js';

/**
 * Manages map tiles for the minimap and editor.
 * Uses async tile rendering with placeholder fallback so zoom/pan never stutter.
 */
export class MapTileManager {
    constructor({ sampleTerrainHeight = null, getTerrainHeight = null, tileSize = 256, pixelRatio = 1, useHillshading = false, Noise = null, onTileReady = null, renderTileAsync = null, lodLevels = null, lodHysteresisRatio = 0.15, tileFadeDurationMs = 120, lodDetailScale = 1, maxConcurrentRenders = 1 }) {
        this.sampleTerrainHeight = this.resolveTerrainSampler({ sampleTerrainHeight, getTerrainHeight, Noise });
        this.tileSize = tileSize;
        this.pixelRatio = pixelRatio;
        this.useHillshading = useHillshading;
        this.Noise = Noise;
        this.onTileReady = onTileReady; // Callback to trigger re-render when tile is ready
        this.renderTileAsync = typeof renderTileAsync === 'function' ? renderTileAsync : null;
        this.lodLevels = this.normalizeLodLevels(lodLevels);
        this.lodHysteresisRatio = Math.max(0, Math.min(0.45, Number.isFinite(lodHysteresisRatio) ? lodHysteresisRatio : 0.15));
        this.tileFadeDurationMs = Math.max(0, Number.isFinite(tileFadeDurationMs) ? tileFadeDurationMs : 120);
        this.lodDetailScale = Math.max(0.25, Number.isFinite(lodDetailScale) ? lodDetailScale : 1);
        this.maxConcurrentRenders = Math.max(1, Math.floor(Number.isFinite(maxConcurrentRenders) ? maxConcurrentRenders : 1));

        this.tiles = new Map();       // key -> { canvas, status: 'ready'|'pending' }
        this.renderQueue = [];        // tiles waiting to render
        this.queuedKeys = new Set();
        this.isProcessingQueue = false;
        this.activeRenderCount = 0;
        this.collectingFrameRequests = false;
        this.maxCacheSize = 512;
        this.queuePriorityDirty = false;
        this.lastPriorityKey = null;
        this.canvasPool = [];
        this.tileVersionSerial = 0;
        this.currentLod = null;
        this.stats = {
            created: 0,
            enqueued: 0,
            rerendered: 0,
            invalidated: 0,
            lastVisible: 0,
            lastFrameLod: null
        };
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

    normalizeLodLevels(levels) {
        // Tuned around the editor's practical zoom bands:
        // close inspection (~0.4 zoom), normal editing (~0.1-0.2),
        // reset/overview (~0.05), and wide framing (~0.01).
        const defaults = [2, 8, 32, 128];
        if (!Array.isArray(levels) || levels.length === 0) return defaults;
        const normalized = levels
            .map(value => Number(value))
            .filter(value => Number.isFinite(value) && value > 0)
            .sort((a, b) => a - b);
        return normalized.length > 0 ? [...new Set(normalized)] : defaults;
    }

    acquireCanvas() {
        const canvas = this.canvasPool.pop() || document.createElement('canvas');
        const cw = Math.max(1, Math.round(this.tileSize * this.pixelRatio));
        canvas.width = cw;
        canvas.height = cw;
        return canvas;
    }

    releaseCanvas(canvas) {
        if (!canvas) return;
        this.canvasPool.push(canvas);
    }

    releaseTileEntry(entry) {
        if (!entry) return;
        if (entry.canvas) this.releaseCanvas(entry.canvas);
        if (entry.transitionCanvas) this.releaseCanvas(entry.transitionCanvas);
        entry.transitionCanvas = null;
    }

    beginTileTransition(entry, nextCanvas) {
        if (!entry) return;
        if (entry.transitionCanvas) {
            this.releaseCanvas(entry.transitionCanvas);
        }
        entry.transitionCanvas = entry.canvas;
        entry.canvas = nextCanvas;
        if (this.tileFadeDurationMs <= 0) {
            this.releaseCanvas(entry.transitionCanvas);
            entry.transitionCanvas = null;
            entry.transitionStartAt = 0;
            entry.transitionEndAt = 0;
            return;
        }
        const now = performance.now();
        entry.transitionStartAt = now;
        entry.transitionEndAt = now + this.tileFadeDurationMs;
    }

    finalizeTileTransition(entry) {
        if (!entry?.transitionCanvas) return;
        this.releaseCanvas(entry.transitionCanvas);
        entry.transitionCanvas = null;
        entry.transitionStartAt = 0;
        entry.transitionEndAt = 0;
    }

    nextTileVersion() {
        this.tileVersionSerial += 1;
        return this.tileVersionSerial;
    }

    getJobPriorityBand(priority) {
        return priority === 'warm' ? 1 : 0;
    }

    updateQueuedJobPriority(key, priority) {
        if (!this.queuedKeys.has(key)) return;
        const nextBand = this.getJobPriorityBand(priority);
        for (const job of this.renderQueue) {
            if (job.key !== key) continue;
            if (nextBand < job.priorityBand) {
                job.priorityBand = nextBand;
                this.queuePriorityDirty = true;
            }
            return;
        }
    }

    enqueueTileRender(tx, tz, lod, key, version, priority = 'active') {
        if (this.queuedKeys.has(key)) {
            this.updateQueuedJobPriority(key, priority);
            return;
        }
        const entry = this.tiles.get(key);
        this.renderQueue.push({
            tx,
            tz,
            lod,
            key,
            version,
            priorityBand: this.getJobPriorityBand(priority)
        });
        this.queuedKeys.add(key);
        this.queuePriorityDirty = true;
        this.stats.enqueued += 1;
        if (entry?.hasPixels) {
            this.stats.rerendered += 1;
        }
        if (!this.collectingFrameRequests) {
            this.processQueue();
        }
    }

    markTileStale(key, entry, version) {
        if (!entry) return;
        entry.version = version;
        entry.status = entry.hasPixels ? 'stale' : 'pending';
        this.queuedKeys.delete(key);
        this.renderQueue = this.renderQueue.filter(job => job.key !== key);
    }

    /**
     * Get or schedule a tile. Returns canvas if ready, null if pending.
     * tx, tz: tile coordinates, lod: meters per pixel
     */
    getTile(tx, tz, lod, priority = 'active') {
        const key = `${lod}_${tx}_${tz}`;
        const entry = this.tiles.get(key);

        if (entry) {
            entry.lastUsed = performance.now();
            if (entry.status === 'stale') {
                this.enqueueTileRender(tx, tz, lod, key, entry.version, priority);
            } else {
                this.updateQueuedJobPriority(key, priority);
            }
            return entry.hasPixels ? entry.canvas : null;
        }

        // Create placeholder and schedule render
        const canvas = this.acquireCanvas();

        const newEntry = {
            canvas,
            status: 'pending',
            lastUsed: performance.now(),
            version: this.nextTileVersion(),
            hasPixels: false,
            transitionCanvas: null,
            transitionStartAt: 0,
            transitionEndAt: 0
        };
        this.stats.created += 1;
        this.evictIfNeeded();
        this.tiles.set(key, newEntry);
        this.enqueueTileRender(tx, tz, lod, key, newEntry.version, priority);

        return null; // Not ready yet
    }

    processQueue() {
        if (this.collectingFrameRequests) return;
        if (this.renderQueue.length === 0 && this.activeRenderCount === 0) {
            this.isProcessingQueue = false;
            return;
        }
        if (this.isProcessingQueue && this.activeRenderCount >= this.maxConcurrentRenders) return;
        this.isProcessingQueue = true;

        while (this.activeRenderCount < this.maxConcurrentRenders && this.renderQueue.length > 0) {
            const { tx, tz, lod, key, version } = this.renderQueue.shift();
            this.queuedKeys.delete(key);
            const entry = this.tiles.get(key);
            if (!entry || entry.version !== version || (entry.status !== 'pending' && entry.status !== 'stale')) {
                continue;
            }
            this.activeRenderCount += 1;
            this.renderTileJob({ tx, tz, lod, key, version, entry }).finally(() => {
                this.activeRenderCount -= 1;
                requestAnimationFrame(() => {
                    this.processQueue();
                });
            });
        }

        if (this.activeRenderCount === 0 && this.renderQueue.length === 0) {
            this.isProcessingQueue = false;
        }
    }

    async renderTileJob({ tx, tz, lod, key, version, entry }) {
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
                if (this.tiles.get(key) === entry && entry.version === version) {
                    if (entry.hasPixels) {
                        const nextCanvas = this.acquireCanvas();
                        const ctx = nextCanvas.getContext('2d');
                        this.paintTileImage(ctx, tileImage.pixels, tileImage.width, tileImage.height);
                        this.beginTileTransition(entry, nextCanvas);
                    } else {
                        const ctx = entry.canvas.getContext('2d');
                        this.paintTileImage(ctx, tileImage.pixels, tileImage.width, tileImage.height);
                    }
                    entry.status = 'ready';
                    entry.hasPixels = true;
                    if (this.onTileReady) this.onTileReady();
                }
            } else {
                if (entry.hasPixels) {
                    const nextCanvas = this.acquireCanvas();
                    const ctx = nextCanvas.getContext('2d');
                    this.renderTile(ctx, tx, tz, lod, nextCanvas.width, nextCanvas.height);
                    this.beginTileTransition(entry, nextCanvas);
                } else {
                    const ctx = entry.canvas.getContext('2d');
                    this.renderTile(ctx, tx, tz, lod, entry.canvas.width, entry.canvas.height);
                }
                entry.status = 'ready';
                entry.hasPixels = true;
                if (this.onTileReady) this.onTileReady();
            }
        } catch (error) {
            console.error('Failed to render map tile', error);
            if (this.tiles.get(key) === entry && entry.version === version) {
                if (entry.hasPixels) {
                    entry.status = 'stale';
                } else {
                    this.tiles.delete(key);
                    this.releaseTileEntry(entry);
                }
            }
        }
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
        const coarseLod = this.getAdjacentLod(lod, 1);
        if (coarseLod != null) {
            const scale = lod / coarseLod;
            const coarseTx = Math.floor(tx * scale);
            const coarseTz = Math.floor(tz * scale);
            const coarseKey = `${coarseLod}_${coarseTx}_${coarseTz}`;
            const coarseEntry = this.tiles.get(coarseKey);
            if (coarseEntry && coarseEntry.status === 'ready') {
                return {
                    canvas: coarseEntry.canvas,
                    srcX: tx * scale - coarseTx,
                    srcZ: tz * scale - coarseTz,
                    scale
                };
            }
        }

        const fineLod = this.getAdjacentLod(lod, -1);
        if (fineLod != null) {
            const scale = lod / fineLod;
            for (let dz = 0; dz < scale; dz++) {
                for (let dx = 0; dx < scale; dx++) {
                    const fineTx = tx * scale + dx;
                    const fineTz = tz * scale + dz;
                    const fineKey = `${fineLod}_${fineTx}_${fineTz}`;
                    const fineEntry = this.tiles.get(fineKey);
                    if (fineEntry && fineEntry.status === 'ready') {
                        return {
                            canvas: fineEntry.canvas,
                            srcX: dx / scale,
                            srcZ: dz / scale,
                            scale
                        };
                    }
                }
            }
        }

        return null;
    }

    clearCache() {
        for (const entry of this.tiles.values()) {
            this.releaseTileEntry(entry);
        }
        this.tiles.clear();
        this.renderQueue.length = 0;
        this.queuedKeys.clear();
        this.queuePriorityDirty = false;
        this.lastPriorityKey = null;
        this.currentLod = null;
        this.activeRenderCount = 0;
        this.collectingFrameRequests = false;
    }

    destroy() {
        this.clearCache();
    }

    invalidateWorldRect(minX, minZ, maxX, maxZ) {
        const version = this.nextTileVersion();
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
            this.markTileStale(key, this.tiles.get(key), version);
            this.stats.invalidated += 1;
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

    invalidateAll() {
        const version = this.nextTileVersion();
        for (const [key, entry] of this.tiles.entries()) {
            this.markTileStale(key, entry, version);
            this.stats.invalidated += 1;
        }
        this.queuePriorityDirty = true;
        this.lastPriorityKey = null;
    }

    warmLodRange(startX, endX, startZ, endZ, lod) {
        for (let tz = startZ; tz <= endZ; tz++) {
            for (let tx = startX; tx <= endX; tx++) {
                this.getTile(tx, tz, lod, 'warm');
            }
        }
    }

    warmAdjacentLods(cameraX, cameraZ, zoom, canvasWidth, canvasHeight, targetLod) {
        const coarseLod = this.getAdjacentLod(targetLod, 1);
        if (coarseLod != null) {
            const coarseWorldTileSize = this.tileSize * coarseLod;
            const coarseStartX = Math.floor((cameraX - (canvasWidth / 2) / zoom) / coarseWorldTileSize);
            const coarseEndX = Math.ceil((cameraX + (canvasWidth / 2) / zoom) / coarseWorldTileSize);
            const coarseStartZ = Math.floor((cameraZ - (canvasHeight / 2) / zoom) / coarseWorldTileSize);
            const coarseEndZ = Math.ceil((cameraZ + (canvasHeight / 2) / zoom) / coarseWorldTileSize);
            this.warmLodRange(coarseStartX, coarseEndX, coarseStartZ, coarseEndZ, coarseLod);
        }

        const fineLod = this.getAdjacentLod(targetLod, -1);
        if (fineLod != null) {
            const focusScale = 0.35;
            const fineWorldTileSize = this.tileSize * fineLod;
            const focusHalfWidth = (canvasWidth / 2 / zoom) * focusScale;
            const focusHalfHeight = (canvasHeight / 2 / zoom) * focusScale;
            const fineStartX = Math.floor((cameraX - focusHalfWidth) / fineWorldTileSize);
            const fineEndX = Math.ceil((cameraX + focusHalfWidth) / fineWorldTileSize);
            const fineStartZ = Math.floor((cameraZ - focusHalfHeight) / fineWorldTileSize);
            const fineEndZ = Math.ceil((cameraZ + focusHalfHeight) / fineWorldTileSize);
            this.warmLodRange(fineStartX, fineEndX, fineStartZ, fineEndZ, fineLod);
        }
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
        if (oldestKey) {
            this.releaseTileEntry(this.tiles.get(oldestKey));
            this.tiles.delete(oldestKey);
        }
    }

    drawTileEntry(mainCtx, entry, sx, sy, sSize) {
        if (!entry?.canvas) return false;
        const now = performance.now();
        if (entry.transitionCanvas) {
            const fadeProgress = entry.transitionEndAt <= entry.transitionStartAt
                ? 1
                : Math.max(0, Math.min(1, (now - entry.transitionStartAt) / (entry.transitionEndAt - entry.transitionStartAt)));
            mainCtx.drawImage(entry.transitionCanvas, sx, sy, sSize, sSize);
            mainCtx.save();
            mainCtx.globalAlpha = fadeProgress;
            mainCtx.drawImage(entry.canvas, sx, sy, sSize, sSize);
            mainCtx.restore();
            if (fadeProgress >= 1) {
                this.finalizeTileTransition(entry);
            }
            return true;
        }
        mainCtx.drawImage(entry.canvas, sx, sy, sSize, sSize);
        return true;
    }

    /**
     * Draw all visible tiles to a canvas context.
     * Smoothly handles missing tiles using placeholder scaling.
     */
    draw(mainCtx, cameraX, cameraZ, zoom, canvasWidth, canvasHeight) {
        const lod = (1 / zoom) * this.lodDetailScale;
        const targetLod = this.getNearestLod(lod, this.currentLod);
        this.currentLod = targetLod;
        let visibleCount = 0;
        const worldTileSize = this.tileSize * targetLod;
        this.collectingFrameRequests = true;

        const startX = Math.floor((cameraX - (canvasWidth / 2) / zoom) / worldTileSize);
        const endX = Math.ceil((cameraX + (canvasWidth / 2) / zoom) / worldTileSize);
        const startZ = Math.floor((cameraZ - (canvasHeight / 2) / zoom) / worldTileSize);
        const endZ = Math.ceil((cameraZ + (canvasHeight / 2) / zoom) / worldTileSize);

        for (let tz = startZ; tz <= endZ; tz++) {
            for (let tx = startX; tx <= endX; tx++) {
                const key = `${targetLod}_${tx}_${tz}`;
                const tileCanvas = this.getTile(tx, tz, targetLod, 'active');
                const tileEntry = this.tiles.get(key);

                const worldX = tx * worldTileSize;
                const worldZ = tz * worldTileSize;
                const sx = canvasWidth / 2 + (worldX - cameraX) * zoom;
                const sy = canvasHeight / 2 + (worldZ - cameraZ) * zoom;
                const sSize = worldTileSize * zoom;
                visibleCount += 1;

                if (tileCanvas) {
                    this.drawTileEntry(mainCtx, tileEntry, sx, sy, sSize);
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
                }
            }
        }
        this.stats.lastVisible = visibleCount;
        this.stats.lastFrameLod = targetLod;
        this.warmAdjacentLods(cameraX, cameraZ, zoom, canvasWidth, canvasHeight, targetLod);
        this.prioritizeQueue(cameraX, cameraZ, targetLod);
        this.collectingFrameRequests = false;
        this.processQueue();
    }

    getDebugStats() {
        let ready = 0;
        let stale = 0;
        let pending = 0;
        for (const entry of this.tiles.values()) {
            if (entry.status === 'ready') ready += 1;
            else if (entry.status === 'stale') stale += 1;
            else pending += 1;
        }
        return {
            ...this.stats,
            ready,
            stale,
            pending,
            total: this.tiles.size,
            queued: this.renderQueue.length,
            pooledCanvases: this.canvasPool.length,
            currentLod: this.currentLod
        };
    }

    getNearestLod(lod, currentLod = null) {
        let nearest = this.lodLevels[0];
        let nearestDistance = Math.abs(lod - nearest);
        for (let index = 1; index < this.lodLevels.length; index++) {
            const candidate = this.lodLevels[index];
            const distance = Math.abs(lod - candidate);
            if (distance < nearestDistance) {
                nearest = candidate;
                nearestDistance = distance;
            }
        }
        if (currentLod == null) return nearest;
        const currentIndex = this.lodLevels.indexOf(currentLod);
        if (currentIndex === -1) return nearest;

        const lowerLod = currentIndex > 0 ? this.lodLevels[currentIndex - 1] : null;
        const upperLod = currentIndex < this.lodLevels.length - 1 ? this.lodLevels[currentIndex + 1] : null;
        const lowerBoundary = lowerLod == null
            ? -Infinity
            : ((lowerLod + currentLod) * 0.5) * (1 - this.lodHysteresisRatio);
        const upperBoundary = upperLod == null
            ? Infinity
            : ((currentLod + upperLod) * 0.5) * (1 + this.lodHysteresisRatio);

        if (lod >= lowerBoundary && lod <= upperBoundary) {
            return currentLod;
        }

        return nearest;
    }

    getAdjacentLod(lod, direction) {
        const index = this.lodLevels.indexOf(lod);
        if (index === -1) return null;
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= this.lodLevels.length) return null;
        return this.lodLevels[nextIndex];
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
            if (a.priorityBand !== b.priorityBand) {
                return a.priorityBand - b.priorityBand;
            }
            if (a.lod === lod && b.lod !== lod) return -1;
            if (a.lod !== lod && b.lod === lod) return 1;
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
