// @ts-check

import { mkdirSync, writeFileSync } from 'node:fs';

import { expect, test } from 'playwright/test';

import { buildScenarioQuery, getPerfScenario } from '../../../scripts/perf-scenarios.mjs';
import {
    addCaptureDiagnostics,
    applyScenarioRuntime,
    buildBrowserMetricDelta,
    collectPerfReportInPage,
    getRendererBackendMetadata,
    startScenarioDriverInPage,
    stopScenarioDriverInPage,
    waitForPageReady,
    waitForProfilingReadiness
} from '../../../scripts/perf-harness.mjs';

const SCENARIO = getPerfScenario(process.env.FSIM_PERF_SCENARIO || 'startup_steady_state');
const TEST_CAPTURE = {
    sampleMs: 2_000
};

function metricsToObject(metrics) {
    return Object.fromEntries(metrics.map(({ name, value }) => [name, value]));
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
        await waitForPageReady(page);
        await applyScenarioRuntime(page, SCENARIO);
        await startScenarioDriverInPage(page, SCENARIO);
        let report;
        let captureStart;
        let rendererBackend;
        let beforeMetrics;
        let afterMetrics;
        try {
            captureStart = await waitForProfilingReadiness(page, {
                profilingReadyTimeoutMs: SCENARIO.capture?.profilingReadyTimeoutMs ?? 45_000,
                settleDelayMs: SCENARIO.capture?.settleDelayMs ?? 10_000,
                requireSteadyState: false
            });
            rendererBackend = await getRendererBackendMetadata(page);

            beforeMetrics = metricsToObject((await client.send('Performance.getMetrics')).metrics);

            report = await collectPerfReportInPage(page, {
                scenario: {
                    ...SCENARIO,
                    capture: {
                        ...(SCENARIO.capture || {}),
                        sampleFrames: 0,
                        sampleMs: TEST_CAPTURE.sampleMs
                    }
                },
                captureStartMetadata: captureStart,
                metadata: {
                    rendererBackend,
                    rendererMode: 'playwright_test'
                }
            });

            afterMetrics = metricsToObject((await client.send('Performance.getMetrics')).metrics);
        } finally {
            await stopScenarioDriverInPage(page);
        }
        await client.send('Performance.disable');

        report.environment = {
            ...(report.environment || {}),
            rendererMode: 'playwright_test'
        };
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
            delta: buildBrowserMetricDelta(beforeMetrics, afterMetrics, [
                'TaskDuration',
                'ScriptDuration',
                'LayoutDuration',
                'RecalcStyleDuration',
                'JSHeapUsedSize',
                'Nodes'
            ])
        };
        addCaptureDiagnostics(report, captureStart, rendererBackend);

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
        expect(report.capture.startMode).toMatch(/steady_state_gate|fallback_delay/);
        expect(typeof report.capture.stable).toBe('boolean');
        expect(report.capture.requiredSteadyState).toBe(false);
        expect(report.profiling).not.toBeNull();
        expect(report.profiling.terrainSelection.queueDepths).not.toBeNull();
        expect(report.profiling.terrainSelection.leafResponsiveness).not.toBeNull();
        expect(report.profiling.startupTimeline).not.toBeNull();
        expect(report.environment.rendererBackend).not.toBeNull();
        if (report.framesCaptured > 0) {
            expect(report.metrics['frameMs']).not.toBeNull();
            expect(report.phases.render_total).not.toBeNull();
            expect(report.renderPasses.total).not.toBeNull();
        }
    });
});
