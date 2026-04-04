type NumericSummary = {
    count: number;
    avg: number | null;
    min: number | null;
    p50: number | null;
    p95: number | null;
    max: number | null;
};

type TerrainSelectionSnapshot = {
    mode?: string | null;
    selectedLeafCount?: number | null;
    blockingLeafCount?: number | null;
    pendingBlockingLeafCount?: number | null;
    activeChunkCount?: number | null;
    blockingChunkCount?: number | null;
    selectedNodeCount?: number | null;
    blockingLeafStates?: unknown;
    quadtreeSelectionRegion?: unknown;
    queueDepths?: {
        pendingBaseChunkJobs?: number;
        pendingPropJobs?: number;
        pendingLeafBuilds?: number;
    } | null;
    leafResponsiveness?: {
        readyWaitMs?: { p95Ms?: number | null } | null;
        blockingReadyWaitMs?: { p95Ms?: number | null } | null;
        pendingAgeMs?: { p95Ms?: number | null } | null;
        pendingBlockingAgeMs?: { p95Ms?: number | null } | null;
    } | null;
    leafBuildBreakdown?: unknown;
    chunkBaseRole?: {
        currentVisibleChunkCount?: number | null;
        currentHiddenByReadyLeafCount?: number | null;
        hideByLeafReadyCount?: number | null;
        visibleDwellMs?: { p95Ms?: number | null } | null;
        buildStarts?: number | null;
        buildCompletes?: number | null;
    } | null;
    chunkStates?: unknown;
    worker?: {
        inFlightJobs?: number | null;
    } | null;
    generation?: unknown;
    timings?: unknown;
};

type AdaptiveQualitySnapshot = {
    enabled?: boolean | null;
    pixelRatio?: number | null;
    frameTimeEmaMs?: number | null;
};

type ProfilingSnapshot = {
    bootstrapComplete?: boolean | null;
    loaderHidden?: boolean | null;
    worldReady?: boolean | null;
    profilingReady?: boolean | null;
    profilingReadinessReason?: string | null;
    lastProgramsChangeMsAgo?: number | null;
    lastTexturesChangeMsAgo?: number | null;
    lastGeometriesChangeMsAgo?: number | null;
    quietWindowMs?: number | null;
    profilingReadyAtMs?: number | null;
    firstStableAtMs?: number | null;
    timeBlockedByProgramsMs?: number | null;
    timeBlockedByTexturesMs?: number | null;
    timeBlockedByGeometriesMs?: number | null;
    startupTimeline?: Record<string, number> | null;
    terrainSelection?: TerrainSelectionSnapshot | null;
};

type RenderPassTimingSnapshot = {
    renderScene?: number | null;
    smaa?: number | null;
    bloom?: number | null;
    total?: number | null;
};

type CollectorFrameRecord = {
    frameIndex: number;
    now: number | null;
    dt: number | null;
    frameMs: number | null;
    fps: number | null;
    physicsSteps: number;
    terrainUpdated: boolean;
    worldLodUpdated: boolean;
    hudUpdated: boolean;
    renderer: Record<string, unknown>;
    adaptive: Record<string, unknown>;
    profiling: Record<string, unknown>;
    renderPasses: Record<string, unknown>;
    phases: Record<string, number | null>;
};

type PerformanceWithMemory = Performance & {
    memory?: { usedJSHeapSize?: number };
};

type EndFrameOptions = {
    now?: number;
    physicsSteps?: number;
    terrainUpdated?: boolean;
    worldLodUpdated?: boolean;
    hudUpdated?: boolean;
};

type BeginFrameOptions = {
    now: number;
    dt: number;
};

/**
 * @param {number[]} sortedValues
 * @param {number} ratio
 * @returns {number | null}
 */
function percentile(sortedValues, ratio) {
    if (!sortedValues.length) return null;
    const index = Math.min(
        sortedValues.length - 1,
        Math.max(0, Math.ceil(sortedValues.length * ratio) - 1)
    );
    return sortedValues[index];
}

/**
 * @param {number[]} values
 * @returns {NumericSummary | null}
 */
function summarizeValues(values) {
    if (!values.length) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const total = values.reduce((sum, value) => sum + value, 0);

    return {
        count: values.length,
        avg: total / values.length,
        min: sorted[0],
        p50: percentile(sorted, 0.5),
        p95: percentile(sorted, 0.95),
        max: sorted[sorted.length - 1]
    };
}

/**
 * @param {number} value
 * @param {number} [digits]
 * @returns {number | null}
 */
function round(value, digits = 3) {
    if (!Number.isFinite(value)) return null;
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
}

/**
 * @param {NumericSummary | null} summary
 * @returns {NumericSummary | null}
 */
function roundSummary(summary) {
    if (!summary) return null;
    return {
        count: summary.count,
        avg: round(summary.avg),
        min: round(summary.min),
        p50: round(summary.p50),
        p95: round(summary.p95),
        max: round(summary.max)
    };
}

/**
 * @param {number} bytes
 * @returns {number | null}
 */
function formatBytesToMb(bytes) {
    if (!Number.isFinite(bytes)) return null;
    return round(bytes / (1024 * 1024), 3);
}

/**
 * @param {{
 *   renderer: import('three').WebGLRenderer,
 *   getAdaptiveQualitySnapshot?: () => AdaptiveQualitySnapshot,
 *   getProfilingSnapshot?: () => ProfilingSnapshot,
 *   getRenderPassTimings?: () => RenderPassTimingSnapshot
 * }} options
 */
export function createPerformanceCollector({
    renderer,
    getAdaptiveQualitySnapshot = (): AdaptiveQualitySnapshot => ({}),
    getProfilingSnapshot = (): ProfilingSnapshot => ({}),
    getRenderPassTimings = (): RenderPassTimingSnapshot => ({})
}) {
    const MAX_RECENT_FRAMES = 24;
    const MAX_WORST_FRAMES = 8;
    const phaseSamples = new Map();
    const metricSamples = new Map();
    const longTaskDurations = [];
    const recentFrames = [];
    const worstFrames = [];
    const metricNames = [
        'frameMs',
        'fps',
        'physicsSteps',
        'renderer.calls',
        'renderer.triangles',
        'renderer.lines',
        'renderer.points',
        'renderer.geometries',
        'renderer.textures',
        'renderer.programs',
        'memory.usedJsHeapMb',
        'adaptive.pixelRatio',
        'adaptive.frameTimeEmaMs',
        'terrain.pendingBaseChunkJobs',
        'terrain.pendingPropJobs',
        'terrain.pendingLeafBuilds',
        'terrain.pendingBlockingLeafCount',
        'terrain.inFlightWorkerJobs',
        'terrain.activeChunkCount',
        'terrain.leafReadyWaitP95Ms',
        'terrain.blockingLeafReadyWaitP95Ms',
        'terrain.pendingLeafAgeP95Ms',
        'terrain.pendingBlockingLeafAgeP95Ms',
        'terrain.chunkBaseVisibleChunks',
        'terrain.chunkBaseHiddenByReadyLeafCount',
        'terrain.chunkBaseHideByLeafReadyCount',
        'terrain.chunkBaseVisibleDwellP95Ms',
        'terrain.chunkBaseBuildStarts',
        'terrain.chunkBaseBuildCompletes',
        'render.sceneMs',
        'render.smaaMs',
        'render.bloomMs',
        'render.totalMs'
    ];

    let collection = null;
    let observer = null;
    /** @type {{ now: number, dt: number, cpuStartMs: number, phases: Record<string, number | null> } | null} */
    let currentFrame = null;
    let sessionCounter = 0;
    let framesCaptured = 0;
    let slowFrames = 0;
    let verySlowFrames = 0;
    /** @type {CollectorFrameRecord | null} */
    let lastFrame = null;
    const performanceWithMemory = performance as PerformanceWithMemory;

    renderer.info.autoReset = false;

    if (typeof PerformanceObserver !== 'undefined') {
        try {
            observer = new PerformanceObserver((list) => {
                if (!collection?.active) return;
                for (const entry of list.getEntries()) {
                    if (entry.entryType === 'longtask') {
                        longTaskDurations.push(entry.duration);
                    }
                }
            });
            observer.observe({ entryTypes: ['longtask'] });
        } catch {
            observer = null;
        }
    }

    /**
     * @param {{ scenario?: string, metadata?: Record<string, unknown> }} [options]
     */
    function reset({
        scenario = 'default',
        metadata = {}
    } = {}) {
        phaseSamples.clear();
        metricSamples.clear();
        longTaskDurations.length = 0;
        recentFrames.length = 0;
        worstFrames.length = 0;
        currentFrame = null;
        framesCaptured = 0;
        slowFrames = 0;
        verySlowFrames = 0;
        lastFrame = null;
        sessionCounter += 1;
        collection = {
            active: true,
            scenario,
            metadata,
            sessionId: sessionCounter,
            startedAtIso: new Date().toISOString(),
            startedAtMs: performance.now()
        };
        return getState();
    }

    /** @param {string} name */
    function ensureMetric(name) {
        if (!metricSamples.has(name)) {
            metricSamples.set(name, []);
        }
        return metricSamples.get(name);
    }

    /** @param {string} name */
    function ensurePhase(name) {
        if (!phaseSamples.has(name)) {
            phaseSamples.set(name, []);
        }
        return phaseSamples.get(name);
    }

    /** @param {{ now: number, dt: number }} options */
    function beginFrame({ now, dt }: BeginFrameOptions) {
        if (!collection?.active) return;
        renderer.info.reset();
        currentFrame = {
            now,
            dt,
            cpuStartMs: performance.now(),
            phases: {}
        };
    }

    /**
     * @param {string} name
     * @param {number} durationMs
     */
    function recordPhase(name, durationMs) {
        if (!collection?.active || !currentFrame || !Number.isFinite(durationMs)) return;
        ensurePhase(name).push(durationMs);
        currentFrame.phases[name] = round(durationMs);
    }

    /**
     * @param {string} name
     * @param {number} value
     */
    function recordMetric(name, value) {
        if (!collection?.active || !Number.isFinite(value)) return;
        ensureMetric(name).push(value);
    }

    /**
     * @param {{
     *   now?: number,
     *   physicsSteps?: number,
     *   terrainUpdated?: boolean,
     *   worldLodUpdated?: boolean,
     *   hudUpdated?: boolean
     * }} [options]
     */
    function endFrame({
        now,
        physicsSteps = 0,
        terrainUpdated = false,
        worldLodUpdated = false,
        hudUpdated = false
    }: EndFrameOptions = {}) {
        if (!collection?.active || !currentFrame) return;

        const frameMs = performance.now() - currentFrame.cpuStartMs;
        const fps = frameMs > 0 ? 1000 / frameMs : 0;
        const info = renderer.info;
        const adaptive = getAdaptiveQualitySnapshot() || {};
        const profiling = getProfilingSnapshot() || {};
        const renderPassTimings = getRenderPassTimings() || {};
        const memory = performanceWithMemory.memory
            ? performanceWithMemory.memory
            : null;

        recordMetric('frameMs', frameMs);
        recordMetric('fps', fps);
        recordMetric('physicsSteps', physicsSteps);
        recordMetric('renderer.calls', info.render.calls);
        recordMetric('renderer.triangles', info.render.triangles);
        recordMetric('renderer.lines', info.render.lines);
        recordMetric('renderer.points', info.render.points);
        recordMetric('renderer.geometries', info.memory.geometries);
        recordMetric('renderer.textures', info.memory.textures);
        recordMetric('renderer.programs', Array.isArray(info.programs) ? info.programs.length : 0);
        recordMetric('adaptive.pixelRatio', adaptive.pixelRatio);
        recordMetric('adaptive.frameTimeEmaMs', adaptive.frameTimeEmaMs);
        recordMetric('terrain.pendingBaseChunkJobs', profiling.terrainSelection?.queueDepths?.pendingBaseChunkJobs);
        recordMetric('terrain.pendingPropJobs', profiling.terrainSelection?.queueDepths?.pendingPropJobs);
        recordMetric('terrain.pendingLeafBuilds', profiling.terrainSelection?.queueDepths?.pendingLeafBuilds);
        recordMetric('terrain.pendingBlockingLeafCount', profiling.terrainSelection?.pendingBlockingLeafCount);
        recordMetric('terrain.inFlightWorkerJobs', profiling.terrainSelection?.worker?.inFlightJobs);
        recordMetric('terrain.activeChunkCount', profiling.terrainSelection?.activeChunkCount);
        recordMetric('terrain.leafReadyWaitP95Ms', profiling.terrainSelection?.leafResponsiveness?.readyWaitMs?.p95Ms);
        recordMetric('terrain.blockingLeafReadyWaitP95Ms', profiling.terrainSelection?.leafResponsiveness?.blockingReadyWaitMs?.p95Ms);
        recordMetric('terrain.pendingLeafAgeP95Ms', profiling.terrainSelection?.leafResponsiveness?.pendingAgeMs?.p95Ms);
        recordMetric('terrain.pendingBlockingLeafAgeP95Ms', profiling.terrainSelection?.leafResponsiveness?.pendingBlockingAgeMs?.p95Ms);
        recordMetric('terrain.chunkBaseVisibleChunks', profiling.terrainSelection?.chunkBaseRole?.currentVisibleChunkCount);
        recordMetric('terrain.chunkBaseHiddenByReadyLeafCount', profiling.terrainSelection?.chunkBaseRole?.currentHiddenByReadyLeafCount);
        recordMetric('terrain.chunkBaseHideByLeafReadyCount', profiling.terrainSelection?.chunkBaseRole?.hideByLeafReadyCount);
        recordMetric('terrain.chunkBaseVisibleDwellP95Ms', profiling.terrainSelection?.chunkBaseRole?.visibleDwellMs?.p95Ms);
        recordMetric('terrain.chunkBaseBuildStarts', profiling.terrainSelection?.chunkBaseRole?.buildStarts);
        recordMetric('terrain.chunkBaseBuildCompletes', profiling.terrainSelection?.chunkBaseRole?.buildCompletes);
        recordMetric('terrain.leafBuild.waterGeometryAvgMs', profiling.terrainSelection?.leafBuildBreakdown?.waterGeometryAvgMs);
        recordMetric('terrain.leafBuild.maxWaterGeometryMs', profiling.terrainSelection?.leafBuildBreakdown?.maxWaterGeometryMs);
        recordMetric('terrain.water.activeWaterMeshes', profiling.terrainSelection?.waterRuntime?.activeWaterMeshes);
        recordMetric('terrain.water.visibleWaterMeshes', profiling.terrainSelection?.waterRuntime?.visibleWaterMeshes);
        recordMetric('terrain.water.activeLeafWaterOverlayRenderers', profiling.terrainSelection?.waterRuntime?.activeLeafWaterOverlayRenderers);
        recordMetric('terrain.water.activeOceanWaterMeshes', profiling.terrainSelection?.waterRuntime?.activeOceanWaterMeshes);
        recordMetric('terrain.water.visibleOceanWaterMeshes', profiling.terrainSelection?.waterRuntime?.visibleOceanWaterMeshes);
        recordMetric('terrain.water.activeWaterDepthTextures', profiling.terrainSelection?.waterRuntime?.activeWaterDepthTextures);
        recordMetric('terrain.water.waterDepthAtlasAllocatedPages', profiling.terrainSelection?.waterRuntime?.waterDepthAtlasAllocatedPages);
        recordMetric('terrain.water.waterDepthAtlasFreePages', profiling.terrainSelection?.waterRuntime?.waterDepthAtlasFreePages);
        recordMetric('terrain.water.waterDepthAtlasUploadCount', profiling.terrainSelection?.waterRuntime?.waterDepthAtlasUploadCount);
        recordMetric('terrain.water.waterDepthAtlasReuseCount', profiling.terrainSelection?.waterRuntime?.waterDepthAtlasReuseCount);
        recordMetric('terrain.water.uniqueWaterMaterials', profiling.terrainSelection?.waterRuntime?.uniqueWaterMaterials);
        recordMetric('terrain.water.estimatedSeaLevelWaterDrawCalls', profiling.terrainSelection?.waterRuntime?.estimatedSeaLevelWaterDrawCalls);
        recordMetric('terrain.water.activeWaterVertices', profiling.terrainSelection?.waterRuntime?.activeWaterVertices);
        recordMetric('terrain.water.activeWaterTriangles', profiling.terrainSelection?.waterRuntime?.activeWaterTriangles);
        recordMetric('render.sceneMs', renderPassTimings.renderScene);
        recordMetric('render.smaaMs', renderPassTimings.smaa);
        recordMetric('render.bloomMs', renderPassTimings.bloom);
        recordMetric('render.totalMs', renderPassTimings.total);

        if (memory?.usedJSHeapSize) {
            recordMetric('memory.usedJsHeapMb', memory.usedJSHeapSize / (1024 * 1024));
        }

        const frameRecord = {
            frameIndex: framesCaptured,
            now: round(now ?? currentFrame.now),
            dt: round(currentFrame.dt * 1000),
            frameMs: round(frameMs),
            fps: round(fps),
            physicsSteps,
            terrainUpdated,
            worldLodUpdated,
            hudUpdated,
            renderer: {
                calls: info.render.calls,
                triangles: info.render.triangles,
                lines: info.render.lines,
                points: info.render.points,
                geometries: info.memory.geometries,
                textures: info.memory.textures,
                programs: Array.isArray(info.programs) ? info.programs.length : 0
            },
            adaptive: {
                enabled: adaptive.enabled ?? null,
                pixelRatio: round(adaptive.pixelRatio),
                frameTimeEmaMs: round(adaptive.frameTimeEmaMs)
            },
            profiling: {
                bootstrapComplete: profiling.bootstrapComplete ?? null,
                loaderHidden: profiling.loaderHidden ?? null,
                worldReady: profiling.worldReady ?? null,
                profilingReady: profiling.profilingReady ?? null,
                profilingReadinessReason: profiling.profilingReadinessReason ?? null,
                lastProgramsChangeMsAgo: round(profiling.lastProgramsChangeMsAgo),
                lastTexturesChangeMsAgo: round(profiling.lastTexturesChangeMsAgo),
                lastGeometriesChangeMsAgo: round(profiling.lastGeometriesChangeMsAgo),
                quietWindowMs: round(profiling.quietWindowMs),
                firstStableAtMs: round(profiling.firstStableAtMs),
                timeBlockedByProgramsMs: round(profiling.timeBlockedByProgramsMs),
                timeBlockedByTexturesMs: round(profiling.timeBlockedByTexturesMs),
                timeBlockedByGeometriesMs: round(profiling.timeBlockedByGeometriesMs),
                terrainSelection: profiling.terrainSelection ? {
                    mode: profiling.terrainSelection.mode ?? null,
                    selectedLeafCount: profiling.terrainSelection.selectedLeafCount ?? null,
                    blockingLeafCount: profiling.terrainSelection.blockingLeafCount ?? null,
                    pendingBlockingLeafCount: profiling.terrainSelection.pendingBlockingLeafCount ?? null,
                    activeChunkCount: profiling.terrainSelection.activeChunkCount ?? null,
                    blockingChunkCount: profiling.terrainSelection.blockingChunkCount ?? null,
                    selectedNodeCount: profiling.terrainSelection.selectedNodeCount ?? null,
                    queueDepths: profiling.terrainSelection.queueDepths ?? null,
                    leafResponsiveness: profiling.terrainSelection.leafResponsiveness ?? null,
                    leafBuildBreakdown: profiling.terrainSelection.leafBuildBreakdown ?? null,
                    waterRuntime: profiling.terrainSelection.waterRuntime ?? null,
                    chunkBaseRole: profiling.terrainSelection.chunkBaseRole ?? null,
                    chunkStates: profiling.terrainSelection.chunkStates ?? null,
                    worker: profiling.terrainSelection.worker ?? null,
                    generation: profiling.terrainSelection.generation ?? null,
                    timings: profiling.terrainSelection.timings ?? null
                } : null
            },
            renderPasses: {
                scene: round(renderPassTimings.renderScene),
                smaa: round(renderPassTimings.smaa),
                bloom: round(renderPassTimings.bloom),
                total: round(renderPassTimings.total)
            },
            phases: currentFrame.phases
        };

        framesCaptured += 1;
        if (frameMs >= 16.67) slowFrames += 1;
        if (frameMs >= 33.34) verySlowFrames += 1;
        lastFrame = frameRecord;
        recentFrames.push(frameRecord);
        if (recentFrames.length > MAX_RECENT_FRAMES) {
            recentFrames.shift();
        }

        worstFrames.push(frameRecord);
        worstFrames.sort((a, b) => {
            const aTotal = a.renderPasses?.total ?? a.phases?.render_total ?? a.phases?.render ?? -Infinity;
            const bTotal = b.renderPasses?.total ?? b.phases?.render_total ?? b.phases?.render ?? -Infinity;
            return bTotal - aTotal;
        });
        if (worstFrames.length > MAX_WORST_FRAMES) {
            worstFrames.length = MAX_WORST_FRAMES;
        }

        currentFrame = null;
    }

    /** @returns {{ active: boolean, scenario: string | null, framesCaptured: number }} */
    function getState() {
        return {
            active: Boolean(collection?.active),
            scenario: collection?.scenario ?? null,
            framesCaptured
        };
    }

    /** @returns {Record<string, unknown>} */
    function getReport() {
        if (!collection) {
            return {
                ok: false,
                error: 'No collection has been started.'
            };
        }

        const metrics: Record<string, NumericSummary | null> = {};
        for (const name of metricNames) {
            metrics[name] = roundSummary(summarizeValues(metricSamples.get(name) || []));
        }

        const phases: Record<string, NumericSummary | null> = {};
        for (const [name, values] of phaseSamples.entries()) {
            phases[name] = roundSummary(summarizeValues(values));
        }

        const sortedPhasesByP95 = Object.entries(phases)
            .filter(([, summary]) => summary?.p95 != null)
            .sort((a, b) => b[1].p95 - a[1].p95)
            .map(([name, summary]) => ({
                name,
                p95Ms: summary.p95,
                avgMs: summary.avg
            }));

        const longTaskSummary = roundSummary(summarizeValues(longTaskDurations));
        const worstRenderFrame = worstFrames[0] || null;
        const profiling = getProfilingSnapshot() || {};

        return {
            ok: true,
            scenario: collection.scenario,
            scenarioId: collection.metadata?.scenarioId ?? collection.scenario,
            sessionId: collection.sessionId,
            startedAtIso: collection.startedAtIso,
            durationMs: round(performance.now() - collection.startedAtMs),
            url: window.location.href,
            userAgent: navigator.userAgent,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
                devicePixelRatio: round(window.devicePixelRatio || 1)
            },
            framesCaptured,
            slowFrames,
            verySlowFrames,
            longTasks: {
                count: longTaskDurations.length,
                summary: longTaskSummary
            },
            metrics,
            phases,
            rankedPhases: sortedPhasesByP95,
            renderPasses: {
                scene: metrics['render.sceneMs'],
                smaa: metrics['render.smaaMs'],
                bloom: metrics['render.bloomMs'],
                total: metrics['render.totalMs']
            },
            renderer: lastFrame ? lastFrame.renderer : null,
            adaptiveQuality: lastFrame ? lastFrame.adaptive : null,
            profiling: {
                bootstrapComplete: profiling.bootstrapComplete ?? null,
                loaderHidden: profiling.loaderHidden ?? null,
                worldReady: profiling.worldReady ?? null,
                profilingReady: profiling.profilingReady ?? null,
                profilingReadinessReason: profiling.profilingReadinessReason ?? null,
                lastProgramsChangeMsAgo: round(profiling.lastProgramsChangeMsAgo),
                lastTexturesChangeMsAgo: round(profiling.lastTexturesChangeMsAgo),
                lastGeometriesChangeMsAgo: round(profiling.lastGeometriesChangeMsAgo),
                quietWindowMs: round(profiling.quietWindowMs),
                profilingReadyAtMs: round(profiling.profilingReadyAtMs),
                firstStableAtMs: round(profiling.firstStableAtMs),
                timeBlockedByProgramsMs: round(profiling.timeBlockedByProgramsMs),
                timeBlockedByTexturesMs: round(profiling.timeBlockedByTexturesMs),
                timeBlockedByGeometriesMs: round(profiling.timeBlockedByGeometriesMs),
                startupTimeline: profiling.startupTimeline ? Object.fromEntries(Object.entries(profiling.startupTimeline).map(([key, value]) => [key, round(value)])) : null,
                terrainSelection: profiling.terrainSelection ? {
                    mode: profiling.terrainSelection.mode ?? null,
                    selectedLeafCount: profiling.terrainSelection.selectedLeafCount ?? null,
                    blockingLeafCount: profiling.terrainSelection.blockingLeafCount ?? null,
                    pendingBlockingLeafCount: profiling.terrainSelection.pendingBlockingLeafCount ?? null,
                    activeChunkCount: profiling.terrainSelection.activeChunkCount ?? null,
                    blockingChunkCount: profiling.terrainSelection.blockingChunkCount ?? null,
                    selectedNodeCount: profiling.terrainSelection.selectedNodeCount ?? null,
                    blockingLeafStates: profiling.terrainSelection.blockingLeafStates ?? null,
                    selectionRegion: profiling.terrainSelection.quadtreeSelectionRegion ?? null,
                    queueDepths: profiling.terrainSelection.queueDepths ?? null,
                    leafResponsiveness: profiling.terrainSelection.leafResponsiveness ?? null,
                    leafBuildBreakdown: profiling.terrainSelection.leafBuildBreakdown ?? null,
                    waterRuntime: profiling.terrainSelection.waterRuntime ?? null,
                    chunkBaseRole: profiling.terrainSelection.chunkBaseRole ?? null,
                    chunkStates: profiling.terrainSelection.chunkStates ?? null,
                    worker: profiling.terrainSelection.worker ?? null,
                    generation: profiling.terrainSelection.generation ?? null,
                    timings: profiling.terrainSelection.timings ?? null
                } : null
            },
            memory: {
                usedJsHeapMb: formatBytesToMb(
                    performanceWithMemory.memory
                        ? performanceWithMemory.memory?.usedJSHeapSize
                        : Number.NaN
                )
            },
            metadata: collection.metadata,
            worstRenderFrame,
            worstFrames: [...worstFrames],
            recentFrames: recentFrames.slice(-12)
        };
    }

    /**
     * @param {{ scenario?: string, metadata?: Record<string, unknown>, warmupFrames?: number, sampleFrames?: number }} [options]
     * @returns {Promise<Record<string, unknown>>}
     */
    async function collectSample({
        scenario = 'default',
        metadata = {},
        warmupFrames = 60,
        sampleFrames = 180
    } = {}) {
        reset({ scenario, metadata });

        if (warmupFrames > 0) {
            await new Promise<void>((resolve) => {
                let remaining = warmupFrames;
                function tick() {
                    remaining -= 1;
                    if (remaining <= 0) {
                        reset({ scenario, metadata });
                        resolve();
                        return;
                    }
                    requestAnimationFrame(tick);
                }
                requestAnimationFrame(tick);
            });
        }

        await new Promise<void>((resolve) => {
            let remaining = sampleFrames;
            function tick() {
                remaining -= 1;
                if (remaining <= 0) {
                    resolve();
                    return;
                }
                requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
        });

        return getReport();
    }

    reset();

    return {
        beginFrame,
        recordMetric,
        recordPhase,
        endFrame,
        getReport,
        getState,
        reset,
        collectSample
    };
}
