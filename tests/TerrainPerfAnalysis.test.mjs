import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TERRAIN_PERF_SCENARIOS,
  analyzeTerrainPerfPair,
  renderTerrainPerfMarkdown,
  summarizeTerrainPerfSuite
} from '../scripts/terrain-perf-analysis.mjs';

function makeReport({
  scenarioId = 'terrain_streaming_low_alt',
  frameMs = 12,
  renderTotalMs = 7,
  pendingLeafBuilds = 4,
  pendingBlockingLeafCount = 1,
  inFlightWorkerJobs = 2,
  leafReadyWaitP95Ms = 1400,
  blockingLeafReadyWaitP95Ms = 900,
  pendingLeafAgeP95Ms = 1200,
  leafBuildTotalAvgMs = 10,
  leafBuildWorkerComputeAvgMs = 5,
  leafBuildMs = 18,
  leafBuildApplyMs = 4,
  stable = true
} = {}) {
  return {
    scenarioId,
    capture: { stable },
    metrics: {
      frameMs: { p95: frameMs },
      'render.totalMs': { p95: renderTotalMs },
      'terrain.pendingLeafBuilds': { p95: pendingLeafBuilds },
      'terrain.pendingBlockingLeafCount': { p95: pendingBlockingLeafCount },
      'terrain.inFlightWorkerJobs': { p95: inFlightWorkerJobs },
      'terrain.leafReadyWaitP95Ms': { p95: leafReadyWaitP95Ms },
      'terrain.blockingLeafReadyWaitP95Ms': { p95: blockingLeafReadyWaitP95Ms },
      'terrain.pendingLeafAgeP95Ms': { p95: pendingLeafAgeP95Ms }
    },
    profiling: {
      terrainSelection: {
        leafBuildBreakdown: {
          totalAvgMs: leafBuildTotalAvgMs,
          workerComputeAvgMs: leafBuildWorkerComputeAvgMs
        },
        timings: {
          leafBuildMs,
          leafBuildApplyMs
        }
      }
    }
  };
}

test('terrain perf suite exposes the expected default scenarios', () => {
  assert.deepEqual(TERRAIN_PERF_SCENARIOS, [
    'terrain_streaming_low_alt',
    'terrain_streaming_high_alt',
    'cpu_isolation'
  ]);
});

test('terrain perf analysis classifies significant slower terrain signals as regressions', () => {
  const baseline = makeReport();
  const candidate = makeReport({
    frameMs: 15,
    renderTotalMs: 8.5,
    pendingLeafBuilds: 9,
    leafReadyWaitP95Ms: 2400,
    leafBuildTotalAvgMs: 13
  });

  const analysis = analyzeTerrainPerfPair(baseline, candidate);

  assert.equal(analysis.scenarioId, 'terrain_streaming_low_alt');
  assert.ok(analysis.regressions.some((entry) => entry.metric === 'frameMs'));
  assert.ok(analysis.regressions.some((entry) => entry.metric === 'terrain.leafReadyWaitP95Ms'));
  assert.ok(analysis.regressions.some((entry) => entry.metric === 'leafBuildBreakdown.totalAvgMs'));
});

test('terrain perf analysis surfaces improvements and renders markdown', () => {
  const baseline = makeReport({ frameMs: 16, pendingLeafBuilds: 8, leafBuildMs: 22 });
  const candidate = makeReport({ frameMs: 13, pendingLeafBuilds: 3, leafBuildMs: 16 });

  const summary = summarizeTerrainPerfSuite([analyzeTerrainPerfPair(baseline, candidate)]);
  const markdown = renderTerrainPerfMarkdown(summary);

  assert.equal(summary.status, 'improvement');
  assert.match(markdown, /Terrain Perf A\/B/);
  assert.match(markdown, /frameMs: improvement/);
});
