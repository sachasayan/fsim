import { mkdirSync, writeFileSync } from 'node:fs';

import { expect, test } from 'playwright/test';

import { buildScenarioQuery, getPerfScenario } from '../../../scripts/perf-scenarios.mjs';

const SCENARIO = getPerfScenario(process.env.FSIM_PERF_SCENARIO || 'startup_steady_state');
const TEST_CAPTURE = {
    sampleMs: 2_000
};

function metricsToObject(metrics) {
    return Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
}

function diffMetricSet(before, after, names) {
    const delta = {};
    for (const name of names) {
        if (typeof before[name] === 'number' && typeof after[name] === 'number') {
            delta[name] = Number((after[name] - before[name]).toFixed(3));
        }
    }
    return delta;
}

async function waitForProfilingStart(page, {
    profilingReadyTimeoutMs = 45_000,
    fallbackDelayMs = 10_000
} = {}) {
    return page.evaluate(async ({ profilingReadyTimeoutMs: readyTimeout, fallbackDelayMs: fallbackDelay }) => {
        const start = performance.now();
        let captureStartMode = 'fallback_delay';
        let profilingReadyAtMs = null;

        function profilingReady() {
            return window.fsimWorld?.profilingReady === true;
        }

        await new Promise(resolve => {
            function tick() {
                if (profilingReady()) {
                    captureStartMode = 'steady_state_gate';
                    profilingReadyAtMs = performance.now();
                    resolve();
                    return;
                }
                if ((performance.now() - start) >= readyTimeout) {
                    resolve();
                    return;
                }
                setTimeout(tick, 50);
            }
            tick();
        });

        if (captureStartMode === 'fallback_delay') {
            await new Promise(resolve => setTimeout(resolve, fallbackDelay));
        }

        return {
            captureStartMode,
            profilingReadyAtMs,
            readiness: {
                bootstrapComplete: window.fsimWorld?.bootstrapComplete ?? null,
                loaderHidden: window.fsimWorld?.loaderHidden ?? null,
                worldReady: window.fsimWorld?.worldReady ?? null,
                profilingReady: window.fsimWorld?.profilingReady ?? null,
                profilingReadinessReason: window.fsimWorld?.profilingReadinessReason ?? null
            }
        };
    }, {
        profilingReadyTimeoutMs,
        fallbackDelayMs
    });
}

test.describe('fsim perf e2e', () => {
    test('captures a text-first render performance report', async ({ page, browserName }, testInfo) => {
        test.setTimeout(90_000);
        test.skip(browserName !== 'chromium', 'Perf metrics use Chromium CDP.');

        const client = await page.context().newCDPSession(page);
        await client.send('Performance.enable');

        const query = buildScenarioQuery({
            ...SCENARIO,
            query: {
                ...(SCENARIO.query || {}),
                ...(SCENARIO.spawn ? {
                    x: SCENARIO.spawn.x,
                    y: SCENARIO.spawn.y,
                    z: SCENARIO.spawn.z
                } : {})
            }
        });

        await page.goto(`/fsim.html?${query.toString()}`);
        await page.waitForFunction(() => {
            return (
                window.fsimWorld?.PHYSICS != null &&
                window.fsimWorld?.cameraController != null &&
                window.fsimPerf != null
            );
        }, null, { timeout: 45_000 });

        await page.evaluate((activeScenario) => {
            if (activeScenario.runtime?.terrain && window.fsimWorld?.applyTerrainDebugSettings) {
                Object.assign(window.fsimWorld.terrainDebugSettings || {}, activeScenario.runtime.terrain);
                window.fsimWorld.applyTerrainDebugSettings({
                    rebuildProps: true,
                    refreshSelection: false
                });
                window.fsimWorld.updateTerrain?.();
            }
            window.fsimWorld.cameraController.setRotation(activeScenario.camera.rotationX, activeScenario.camera.rotationY);
            window.fsimWorld.cameraController.setDistance(activeScenario.camera.distance);
            window.fsimWorld.cameraController.snapToTarget();
        }, SCENARIO);
        const captureStart = await waitForProfilingStart(page, {
            profilingReadyTimeoutMs: 15_000,
            fallbackDelayMs: 2_000
        });

        const beforeMetrics = metricsToObject((await client.send('Performance.getMetrics')).metrics);

        const report = await page.evaluate(async ({ captureStartMetadata, activeScenario, testCapture }) => {
            window.fsimPerf.reset({
                scenario: activeScenario.id,
                metadata: {
                    scenarioId: activeScenario.id,
                    scenarioLabel: activeScenario.label,
                    captureStartMode: captureStartMetadata.captureStartMode,
                    profilingReadyAtMs: captureStartMetadata.profilingReadyAtMs,
                    settleDelayMs: 10_000,
                    readinessAtCaptureStart: captureStartMetadata.readiness,
                    query: window.location.search,
                    cameraMode: window.fsimWorld.cameraController.getMode(),
                    aircraftPosition: {
                        x: window.fsimWorld.PHYSICS.position.x,
                        y: window.fsimWorld.PHYSICS.position.y,
                        z: window.fsimWorld.PHYSICS.position.z
                    },
                    runtimeOverrides: activeScenario.runtime || {}
                }
            });
            await new Promise((resolve) => setTimeout(resolve, testCapture.sampleMs));
            return window.fsimPerf.getReport();
        }, {
            captureStartMetadata: captureStart,
            activeScenario: SCENARIO,
            testCapture: TEST_CAPTURE
        });

        const afterMetrics = metricsToObject((await client.send('Performance.getMetrics')).metrics);
        await client.send('Performance.disable');

        report.browserMetrics = {
            before: {
                JSHeapUsedSize: beforeMetrics.JSHeapUsedSize ?? null,
                Nodes: beforeMetrics.Nodes ?? null,
                LayoutCount: beforeMetrics.LayoutCount ?? null,
                RecalcStyleCount: beforeMetrics.RecalcStyleCount ?? null
            },
            after: {
                JSHeapUsedSize: afterMetrics.JSHeapUsedSize ?? null,
                Nodes: afterMetrics.Nodes ?? null,
                LayoutCount: afterMetrics.LayoutCount ?? null,
                RecalcStyleCount: afterMetrics.RecalcStyleCount ?? null
            },
            delta: diffMetricSet(beforeMetrics, afterMetrics, [
                'TaskDuration',
                'ScriptDuration',
                'LayoutDuration',
                'RecalcStyleDuration',
                'JSHeapUsedSize',
                'Nodes'
            ])
        };

        const outputPath = testInfo.outputPath('fsim-perf-report.json');
        mkdirSync(testInfo.outputDir, { recursive: true });
        writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

        await testInfo.attach('fsim-perf-report', {
            body: JSON.stringify(report, null, 2),
            contentType: 'application/json'
        });

        expect(report.ok).toBe(true);
        expect(report.scenarioId).toBe(SCENARIO.id);
        expect(report.framesCaptured).toBeGreaterThanOrEqual(0);
        expect(report.metadata.captureStartMode).toMatch(/steady_state_gate|fallback_delay/);
        expect(report.profiling).not.toBeNull();
        expect(report.profiling.terrainSelection.queueDepths).not.toBeNull();
        expect(report.profiling.startupTimeline).not.toBeNull();
        if (report.framesCaptured > 0) {
            expect(report.metrics['frameMs']).not.toBeNull();
            expect(report.phases.render_total).not.toBeNull();
            expect(report.renderPasses.total).not.toBeNull();
        }
    });
});
