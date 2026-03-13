function percentile(sortedValues, ratio) {
    if (!sortedValues.length) return null;
    const index = Math.min(
        sortedValues.length - 1,
        Math.max(0, Math.ceil(sortedValues.length * ratio) - 1)
    );
    return sortedValues[index];
}

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

function round(value, digits = 3) {
    if (!Number.isFinite(value)) return null;
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
}

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

function formatBytesToMb(bytes) {
    if (!Number.isFinite(bytes)) return null;
    return round(bytes / (1024 * 1024), 3);
}

export function createPerformanceCollector({
    renderer,
    getAdaptiveQualitySnapshot = () => ({}),
    getProfilingSnapshot = () => ({}),
    getRenderPassTimings = () => ({})
}) {
    const phaseSamples = new Map();
    const metricSamples = new Map();
    const longTaskDurations = [];
    const frameRecords = [];
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
        'render.sceneMs',
        'render.smaaMs',
        'render.bloomMs',
        'render.totalMs'
    ];

    let collection = null;
    let observer = null;
    let currentFrame = null;
    let sessionCounter = 0;

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

    function reset({
        scenario = 'default',
        metadata = {}
    } = {}) {
        phaseSamples.clear();
        metricSamples.clear();
        longTaskDurations.length = 0;
        frameRecords.length = 0;
        currentFrame = null;
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

    function ensureMetric(name) {
        if (!metricSamples.has(name)) {
            metricSamples.set(name, []);
        }
        return metricSamples.get(name);
    }

    function ensurePhase(name) {
        if (!phaseSamples.has(name)) {
            phaseSamples.set(name, []);
        }
        return phaseSamples.get(name);
    }

    function beginFrame({ now, dt }) {
        if (!collection?.active) return;
        renderer.info.reset();
        currentFrame = {
            now,
            dt,
            cpuStartMs: performance.now(),
            phases: {}
        };
    }

    function recordPhase(name, durationMs) {
        if (!collection?.active || !currentFrame || !Number.isFinite(durationMs)) return;
        ensurePhase(name).push(durationMs);
        currentFrame.phases[name] = round(durationMs);
    }

    function recordMetric(name, value) {
        if (!collection?.active || !Number.isFinite(value)) return;
        ensureMetric(name).push(value);
    }

    function endFrame({
        now,
        physicsSteps = 0,
        terrainUpdated = false,
        worldLodUpdated = false,
        hudUpdated = false
    } = {}) {
        if (!collection?.active || !currentFrame) return;

        const frameMs = performance.now() - currentFrame.cpuStartMs;
        const fps = frameMs > 0 ? 1000 / frameMs : 0;
        const info = renderer.info;
        const adaptive = getAdaptiveQualitySnapshot() || {};
        const profiling = getProfilingSnapshot() || {};
        const renderPassTimings = getRenderPassTimings() || {};
        const memory = typeof performance !== 'undefined' && performance.memory
            ? performance.memory
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
        recordMetric('render.sceneMs', renderPassTimings.renderScene);
        recordMetric('render.smaaMs', renderPassTimings.smaa);
        recordMetric('render.bloomMs', renderPassTimings.bloom);
        recordMetric('render.totalMs', renderPassTimings.total);

        if (memory?.usedJSHeapSize) {
            recordMetric('memory.usedJsHeapMb', memory.usedJSHeapSize / (1024 * 1024));
        }

        frameRecords.push({
            frameIndex: frameRecords.length,
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
                quietWindowMs: round(profiling.quietWindowMs)
            },
            renderPasses: {
                scene: round(renderPassTimings.renderScene),
                smaa: round(renderPassTimings.smaa),
                bloom: round(renderPassTimings.bloom),
                total: round(renderPassTimings.total)
            },
            phases: currentFrame.phases
        });

        currentFrame = null;
    }

    function getState() {
        return {
            active: Boolean(collection?.active),
            scenario: collection?.scenario ?? null,
            framesCaptured: frameRecords.length
        };
    }

    function getReport() {
        if (!collection) {
            return {
                ok: false,
                error: 'No collection has been started.'
            };
        }

        const metrics = {};
        for (const name of metricNames) {
            metrics[name] = roundSummary(summarizeValues(metricSamples.get(name) || []));
        }

        const phases = {};
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
        const slowFrames = frameRecords.filter((frame) => frame.frameMs >= 16.67).length;
        const verySlowFrames = frameRecords.filter((frame) => frame.frameMs >= 33.34).length;
        const lastFrame = frameRecords[frameRecords.length - 1] || null;
        const worstRenderFrame = frameRecords.reduce((worst, frame) => {
            const total = frame.renderPasses?.total ?? frame.phases?.render_total ?? frame.phases?.render ?? -Infinity;
            if (!worst) return frame;
            const worstTotal = worst.renderPasses?.total ?? worst.phases?.render_total ?? worst.phases?.render ?? -Infinity;
            return total > worstTotal ? frame : worst;
        }, null);
        const profiling = getProfilingSnapshot() || {};

        return {
            ok: true,
            scenario: collection.scenario,
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
            framesCaptured: frameRecords.length,
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
                profilingReadyAtMs: round(profiling.profilingReadyAtMs)
            },
            memory: {
                usedJsHeapMb: formatBytesToMb(
                    typeof performance !== 'undefined' && performance.memory
                        ? performance.memory.usedJSHeapSize
                        : Number.NaN
                )
            },
            metadata: collection.metadata,
            worstRenderFrame,
            recentFrames: frameRecords.slice(-12)
        };
    }

    async function collectSample({
        scenario = 'default',
        metadata = {},
        warmupFrames = 60,
        sampleFrames = 180
    } = {}) {
        reset({ scenario, metadata });

        if (warmupFrames > 0) {
            await new Promise((resolve) => {
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

        await new Promise((resolve) => {
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
