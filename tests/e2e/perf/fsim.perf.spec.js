import { mkdirSync, writeFileSync } from 'node:fs';

import { expect, test } from 'playwright/test';

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

test.describe('fsim perf e2e', () => {
    test('captures a text-first render performance report', async ({ page, browserName }, testInfo) => {
        test.setTimeout(90_000);
        test.skip(browserName !== 'chromium', 'Perf metrics use Chromium CDP.');

        const client = await page.context().newCDPSession(page);
        await client.send('Performance.enable');

        await page.goto('/fsim.html?lighting=noon&fog=0&clouds=0');
        await page.waitForFunction(() => {
            return (
                window.fsimWorld?.PHYSICS != null &&
                window.fsimWorld?.cameraController != null &&
                window.fsimPerf != null
            );
        }, null, { timeout: 45_000 });
        await page.waitForTimeout(4_000);

        await page.evaluate(() => {
            window.fsimWorld.cameraController.setRotation(0.35, -0.25);
            window.fsimWorld.cameraController.setDistance(95);
            window.fsimWorld.cameraController.snapToTarget();
        });

        const beforeMetrics = metricsToObject((await client.send('Performance.getMetrics')).metrics);

        const report = await page.evaluate(() => window.fsimPerf.collectSample({
            scenario: 'steady_state_chase_camera',
            warmupFrames: 20,
            sampleFrames: 30,
            metadata: {
                cameraMode: window.fsimWorld.cameraController.getMode(),
                aircraftPosition: {
                    x: window.fsimWorld.PHYSICS.position.x,
                    y: window.fsimWorld.PHYSICS.position.y,
                    z: window.fsimWorld.PHYSICS.position.z
                }
            }
        }));

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
        expect(report.framesCaptured).toBeGreaterThanOrEqual(25);
        expect(report.metrics['frameMs']).not.toBeNull();
        expect(report.phases.render).not.toBeNull();
        expect(report.rankedPhases.length).toBeGreaterThan(0);
    });
});
