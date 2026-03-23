function round(value, digits = 3) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function computeDelta(baselineValue, candidateValue) {
  if (!Number.isFinite(baselineValue) || !Number.isFinite(candidateValue)) {
    return { absolute: null, percent: null };
  }
  const absolute = candidateValue - baselineValue;
  const percent = baselineValue === 0 ? null : (absolute / baselineValue) * 100;
  return {
    absolute: round(absolute),
    percent: round(percent)
  };
}

function classifyDelta(delta, threshold) {
  if (!Number.isFinite(delta?.absolute)) return 'unknown';
  const absolute = Math.abs(delta.absolute);
  const percent = Math.abs(delta.percent ?? 0);
  if (delta.absolute > 0 && (absolute >= threshold.abs || percent >= threshold.pct)) {
    return 'regression';
  }
  if (delta.absolute < 0 && (absolute >= threshold.abs || percent >= threshold.pct)) {
    return 'improvement';
  }
  return 'neutral';
}

function metricP95(report, name) {
  const value = report?.metrics?.[name]?.p95;
  return Number.isFinite(value) ? value : null;
}

function profilingValue(report, path) {
  let current = report?.profiling?.terrainSelection;
  for (const segment of path) {
    current = current?.[segment];
  }
  return Number.isFinite(current) ? current : null;
}

export const TERRAIN_PERF_SCENARIOS = [
  'terrain_streaming_low_alt',
  'terrain_streaming_high_alt',
  'cpu_isolation'
];

export const TERRAIN_PERF_SIGNALS = [
  {
    label: 'frameMs',
    source: 'metric',
    key: 'frameMs',
    threshold: { abs: 1.0, pct: 10 }
  },
  {
    label: 'render.totalMs',
    source: 'metric',
    key: 'render.totalMs',
    threshold: { abs: 0.75, pct: 10 }
  },
  {
    label: 'terrain.pendingLeafBuilds',
    source: 'metric',
    key: 'terrain.pendingLeafBuilds',
    threshold: { abs: 4, pct: 10 }
  },
  {
    label: 'terrain.pendingBlockingLeafCount',
    source: 'metric',
    key: 'terrain.pendingBlockingLeafCount',
    threshold: { abs: 2, pct: 10 }
  },
  {
    label: 'terrain.inFlightWorkerJobs',
    source: 'metric',
    key: 'terrain.inFlightWorkerJobs',
    threshold: { abs: 2, pct: 20 }
  },
  {
    label: 'terrain.leafReadyWaitP95Ms',
    source: 'metric',
    key: 'terrain.leafReadyWaitP95Ms',
    threshold: { abs: 750, pct: 10 }
  },
  {
    label: 'terrain.blockingLeafReadyWaitP95Ms',
    source: 'metric',
    key: 'terrain.blockingLeafReadyWaitP95Ms',
    threshold: { abs: 750, pct: 10 }
  },
  {
    label: 'terrain.pendingLeafAgeP95Ms',
    source: 'metric',
    key: 'terrain.pendingLeafAgeP95Ms',
    threshold: { abs: 750, pct: 10 }
  },
  {
    label: 'leafBuildBreakdown.totalAvgMs',
    source: 'profiling',
    key: ['leafBuildBreakdown', 'totalAvgMs'],
    threshold: { abs: 1.0, pct: 10 }
  },
  {
    label: 'leafBuildBreakdown.workerComputeAvgMs',
    source: 'profiling',
    key: ['leafBuildBreakdown', 'workerComputeAvgMs'],
    threshold: { abs: 1.0, pct: 10 }
  },
  {
    label: 'timings.leafBuildMs',
    source: 'profiling',
    key: ['timings', 'leafBuildMs'],
    threshold: { abs: 2.0, pct: 10 }
  },
  {
    label: 'timings.leafBuildApplyMs',
    source: 'profiling',
    key: ['timings', 'leafBuildApplyMs'],
    threshold: { abs: 1.0, pct: 10 }
  }
];

export function readTerrainSignal(report, signal) {
  if (signal.source === 'metric') {
    return metricP95(report, signal.key);
  }
  if (signal.source === 'profiling') {
    return profilingValue(report, signal.key);
  }
  return null;
}

export function analyzeTerrainPerfPair(baseline, candidate) {
  const metrics = TERRAIN_PERF_SIGNALS.map((signal) => {
    const baselineValue = readTerrainSignal(baseline, signal);
    const candidateValue = readTerrainSignal(candidate, signal);
    const delta = computeDelta(baselineValue, candidateValue);
    return {
      metric: signal.label,
      baseline: baselineValue,
      candidate: candidateValue,
      delta: delta.absolute,
      deltaPercent: delta.percent,
      classification: classifyDelta(delta, signal.threshold)
    };
  });

  const regressions = metrics.filter((entry) => entry.classification === 'regression');
  const improvements = metrics.filter((entry) => entry.classification === 'improvement');

  return {
    scenarioId: candidate?.scenarioId || baseline?.scenarioId || null,
    baselineScenarioId: baseline?.scenarioId || null,
    candidateScenarioId: candidate?.scenarioId || null,
    metrics,
    regressions,
    improvements,
    baselineStable: baseline?.capture?.stable ?? null,
    candidateStable: candidate?.capture?.stable ?? null
  };
}

export function summarizeTerrainPerfSuite(entries) {
  const scenarios = entries.map((entry) => ({
    scenarioId: entry.scenarioId,
    regressions: entry.regressions.length,
    improvements: entry.improvements.length,
    analysis: entry
  }));

  const totalRegressions = scenarios.reduce((sum, scenario) => sum + scenario.regressions, 0);
  const totalImprovements = scenarios.reduce((sum, scenario) => sum + scenario.improvements, 0);

  return {
    scenarios,
    totalRegressions,
    totalImprovements,
    status: totalRegressions > 0 ? 'regression' : (totalImprovements > 0 ? 'improvement' : 'neutral')
  };
}

export function renderTerrainPerfMarkdown(summary) {
  const lines = [];
  lines.push('# Terrain Perf A/B');
  lines.push('');
  lines.push(`- Status: ${summary.status}`);
  lines.push(`- Scenarios compared: ${summary.scenarios.length}`);
  lines.push(`- Regressions: ${summary.totalRegressions}`);
  lines.push(`- Improvements: ${summary.totalImprovements}`);

  for (const scenario of summary.scenarios) {
    lines.push('');
    lines.push(`## ${scenario.scenarioId || 'unknown scenario'}`);
    const analysis = scenario.analysis;
    lines.push(`- Baseline stable: ${analysis.baselineStable}`);
    lines.push(`- Candidate stable: ${analysis.candidateStable}`);

    const interesting = [...analysis.regressions, ...analysis.improvements];
    if (!interesting.length) {
      lines.push('- No material terrain metric changes detected.');
      continue;
    }

    for (const item of interesting) {
      lines.push(`- ${item.metric}: ${item.classification} (baseline=${item.baseline}, candidate=${item.candidate}, delta=${item.delta}, deltaPct=${item.deltaPercent})`);
    }
  }

  return `${lines.join('\n')}\n`;
}
