// @ts-check

import { mkdirSync, writeFileSync } from 'node:fs';

import { expect, test } from 'playwright/test';

import { buildScenarioQuery, getPerfScenario } from '../../../scripts/perf-scenarios.mjs';
import {
  addCaptureDiagnostics,
  applyScenarioRuntime,
  collectPerfReportInPage,
  getRendererBackendMetadata,
  startScenarioDriverInPage,
  stopScenarioDriverInPage,
  waitForPageReady,
  waitForProfilingReadiness
} from '../../../scripts/perf-harness.mjs';

const TERRAIN_SCENARIOS = [
  'terrain_streaming_low_alt',
  'terrain_streaming_high_alt'
];

test.describe.serial('terrain perf e2e', () => {
  for (const scenarioId of TERRAIN_SCENARIOS) {
    test(`captures terrain diagnostics for ${scenarioId}`, async ({ page, browserName }, testInfo) => {
      test.setTimeout(180_000);
      test.skip(browserName !== 'chromium', 'Perf metrics use Chromium CDP.');

      const scenario = getPerfScenario(scenarioId);
      const query = buildScenarioQuery({
        ...scenario,
        query: {
          ...(scenario.query || {}),
          ...(scenario.spawn ? {
            x: scenario.spawn.x,
            y: scenario.spawn.y,
            z: scenario.spawn.z
          } : {})
        }
      });

      await page.goto(`/fsim.html?${query.toString()}`);
      await waitForPageReady(page);
      await applyScenarioRuntime(page, scenario);
      await startScenarioDriverInPage(page, scenario);

      let report;
      let captureStart;
      let rendererBackend;
      try {
        captureStart = await waitForProfilingReadiness(page, {
          profilingReadyTimeoutMs: scenario.capture?.profilingReadyTimeoutMs ?? 45_000,
          settleDelayMs: scenario.capture?.settleDelayMs ?? 10_000,
          requireSteadyState: false
        });
        rendererBackend = await getRendererBackendMetadata(page);

        report = await collectPerfReportInPage(page, {
          scenario: {
            ...scenario,
            capture: {
              ...(scenario.capture || {}),
              sampleFrames: 0,
              sampleMs: 2_500
            }
          },
          captureStartMetadata: captureStart,
          metadata: {
            rendererBackend,
            rendererMode: 'playwright_terrain_perf'
          }
        });
      } finally {
        try {
          await stopScenarioDriverInPage(page);
        } catch {
          // Playwright closes the page when the test times out; cleanup is best-effort.
        }
      }

      addCaptureDiagnostics(report, captureStart, rendererBackend);

      const outputPath = testInfo.outputPath(`${scenarioId}-terrain-perf-report.json`);
      mkdirSync(testInfo.outputDir, { recursive: true });
      writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

      await testInfo.attach(`${scenarioId}-terrain-perf-report`, {
        body: JSON.stringify(report, null, 2),
        contentType: 'application/json'
      });

      expect(report.ok).toBe(true);
      expect(report.scenarioId).toBe(scenarioId);
      expect(report.capture.requiredSteadyState).toBe(false);
      expect(report.profiling?.terrainSelection).not.toBeNull();
      expect(report.profiling.terrainSelection.queueDepths).not.toBeNull();
      expect(report.profiling.terrainSelection.leafResponsiveness).not.toBeNull();
      expect(report.profiling.terrainSelection.leafBuildBreakdown).not.toBeNull();
      expect(report.profiling.terrainSelection.timings).not.toBeNull();
      expect(report.metrics['terrain.pendingLeafBuilds']).not.toBeNull();
      expect(report.metrics['terrain.leafReadyWaitP95Ms']).not.toBeNull();
      expect(report.metrics['terrain.pendingLeafAgeP95Ms']).not.toBeNull();
    });
  }
});
