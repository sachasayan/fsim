import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function sanitizeKey(value) {
  return String(value || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';
}

function metricSummary(report, name) {
  return report?.metrics?.[name] || null;
}

function metricValue(report, name, field = 'p95') {
  const summary = metricSummary(report, name);
  if (!summary || typeof summary !== 'object') return null;
  const value = summary[field];
  return Number.isFinite(value) ? value : null;
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

function classifyDelta(metric, delta, baselineValue) {
  if (!Number.isFinite(delta?.absolute)) return null;
  const percent = Math.abs(delta.percent ?? 0);
  const absolute = Math.abs(delta.absolute);

  const thresholds = {
    'frameMs': { abs: 1.0, pct: 10 },
    'render.totalMs': { abs: 0.75, pct: 10 },
    'render.sceneMs': { abs: 0.75, pct: 10 },
    'renderer.calls': { abs: 75, pct: 10 },
    'renderer.triangles': { abs: 25000, pct: 8 },
    'terrain.pendingBaseChunkJobs': { abs: 10, pct: 10 },
    'terrain.pendingPropJobs': { abs: 6, pct: 10 },
    'terrain.leafReadyWaitP95Ms': { abs: 1000, pct: 10 }
  }[metric] || { abs: Math.max(1, (baselineValue || 0) * 0.1), pct: 10 };

  if (delta.absolute > 0 && (absolute >= thresholds.abs || percent >= thresholds.pct)) {
    return 'regression';
  }
  if (delta.absolute < 0 && (absolute >= thresholds.abs || percent >= thresholds.pct)) {
    return 'improvement';
  }
  return 'neutral';
}

function topPhases(report, count = 3) {
  return (report?.rankedPhases || []).slice(0, count);
}

function deriveSubsystemHints(report) {
  const phases = topPhases(report, 5);
  const hints = [];
  for (const phase of phases) {
    const name = phase?.name || '';
    if (name.startsWith('terrain_') || name === 'terrain_lod') {
      hints.push('terrain_streaming');
    } else if (name.startsWith('render_') || name === 'render') {
      hints.push('render_pipeline');
    } else if (name === 'shadow_setup') {
      hints.push('shadows');
    } else if (name === 'particles') {
      hints.push('particles');
    } else if (name === 'weather' || name === 'water_animation') {
      hints.push('environment');
    }
  }
  return [...new Set(hints)];
}

function summarizeCaptureHealth(report) {
  const capture = report?.capture || {};
  const profiling = report?.profiling || {};
  if (capture.stable === false) {
    return {
      status: 'unstable',
      message: `Capture started before steady state (${capture.unstableReason || profiling.profilingReadinessReason || 'unknown reason'}).`
    };
  }
  if (capture.stable === true) {
    return {
      status: 'stable',
      message: 'Capture started from a steady-state condition.'
    };
  }
  return {
    status: 'unknown',
    message: 'Capture stability metadata was not present.'
  };
}

export function buildBackendKey(report) {
  const mode = sanitizeKey(report?.environment?.rendererMode || 'unknown');
  const renderer = sanitizeKey(report?.environment?.rendererBackend?.renderer || report?.environment?.rendererBackend?.vendor || 'unknown');
  return `${mode}__${renderer}`;
}

export function defaultBaselinePath(cwd, report, baselineDir = path.join(cwd, 'artifacts', 'perf', 'baselines')) {
  const scenarioId = sanitizeKey(report?.scenarioId || report?.scenario || 'unknown_scenario');
  const backendKey = buildBackendKey(report);
  return path.join(baselineDir, scenarioId, `${backendKey}.json`);
}

export function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function walkFiles(rootDir, results = []) {
  if (!existsSync(rootDir)) return results;
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, results);
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

export function findLatestPerfReport(cwd) {
  const candidates = [];
  const preferred = [
    path.join(cwd, 'artifacts', 'perf'),
    path.join(cwd, 'test-results')
  ];

  for (const dir of preferred) {
    for (const file of walkFiles(dir)) {
      if (!/perf-report\.json$/i.test(file) && !/latest\.json$/i.test(file)) continue;
      const stats = statSync(file);
      candidates.push({ file, mtimeMs: stats.mtimeMs });
    }
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.file || null;
}

export function analyzePerfReport(report, baseline = null) {
  const health = summarizeCaptureHealth(report);
  const keyMetrics = [
    'frameMs',
    'render.totalMs',
    'render.sceneMs',
    'renderer.calls',
    'renderer.triangles',
    'terrain.pendingBaseChunkJobs',
    'terrain.pendingPropJobs',
    'terrain.leafReadyWaitP95Ms'
  ];

  const comparison = baseline ? keyMetrics.map((name) => {
    const candidate = metricValue(report, name);
    const previous = metricValue(baseline, name);
    const delta = computeDelta(previous, candidate);
    return {
      metric: name,
      baseline: previous,
      candidate,
      deltaMsOrCount: delta.absolute,
      deltaPercent: delta.percent,
      classification: classifyDelta(name, delta, previous)
    };
  }) : [];

  const regressions = comparison.filter((item) => item.classification === 'regression');
  const improvements = comparison.filter((item) => item.classification === 'improvement');
  const hints = deriveSubsystemHints(report);
  const observations = [];
  const recommendations = [];

  observations.push(health.message);

  const frameP95 = metricValue(report, 'frameMs');
  const renderP95 = metricValue(report, 'render.totalMs');
  if (Number.isFinite(frameP95)) {
    observations.push(`Frame p95 is ${frameP95}ms${frameP95 > 16.67 ? ', above a 60 FPS frame budget.' : '.'}`);
  }
  if (Number.isFinite(renderP95)) {
    observations.push(`Render total p95 is ${renderP95}ms.`);
  }
  if ((report?.longTasks?.count ?? 0) > 0) {
    observations.push(`Observed ${report.longTasks.count} long task(s) during the sample.`);
  }

  if (health.status === 'unstable') {
    recommendations.push('Fix steady-state readiness first; startup churn makes perf deltas hard to trust.');
  }
  if (regressions.some((item) => item.metric === 'frameMs' || item.metric === 'render.totalMs' || item.metric === 'render.sceneMs')) {
    recommendations.push('Start with the top ranked render/loop phases and confirm whether the regression is CPU-side orchestration or render-pass cost.');
  }
  if (regressions.some((item) => item.metric.startsWith('terrain.')) || hints.includes('terrain_streaming')) {
    recommendations.push('Inspect terrain queue depth, leaf wait percentiles, and worst frames to see whether streaming backlog is dominating capture cost.');
  }
  if (hints.includes('render_pipeline')) {
    recommendations.push('Use a deep CPU profile or render-pass isolation sweep if render phases dominate the ranked phase list.');
  }
  if (recommendations.length === 0) {
    recommendations.push('No major regression signal was detected; keep this report as a candidate baseline if the scenario and backend are representative.');
  }

  return {
    reportInfo: {
      scenarioId: report?.scenarioId || report?.scenario || null,
      rendererMode: report?.environment?.rendererMode || null,
      rendererBackend: report?.environment?.rendererBackend || null,
      framesCaptured: report?.framesCaptured ?? null,
      durationMs: report?.durationMs ?? null
    },
    captureHealth: health,
    headlineMetrics: {
      frameMsP95: frameP95,
      renderTotalP95: renderP95,
      slowFrames: report?.slowFrames ?? null,
      verySlowFrames: report?.verySlowFrames ?? null,
      longTaskCount: report?.longTasks?.count ?? null
    },
    topPhases: topPhases(report, 5),
    regressions,
    improvements,
    observations,
    recommendations
  };
}

export function renderAnalysisMarkdown(analysis, baselinePath = null) {
  const lines = [];
  const info = analysis.reportInfo;
  lines.push(`# Perf Analysis: ${info.scenarioId || 'unknown scenario'}`);
  lines.push('');
  lines.push(`- Backend: ${info.rendererMode || 'unknown'} / ${info.rendererBackend?.renderer || info.rendererBackend?.vendor || 'unknown'}`);
  lines.push(`- Frames captured: ${info.framesCaptured ?? 'unknown'}`);
  lines.push(`- Capture health: ${analysis.captureHealth.status}`);
  if (baselinePath) {
    lines.push(`- Baseline: ${baselinePath}`);
  }
  lines.push('');
  lines.push('## Observations');
  for (const observation of analysis.observations) {
    lines.push(`- ${observation}`);
  }
  lines.push('');
  lines.push('## Top Phases');
  for (const phase of analysis.topPhases) {
    lines.push(`- ${phase.name}: p95=${phase.p95Ms}ms, avg=${phase.avgMs}ms`);
  }
  if (!analysis.topPhases.length) {
    lines.push('- No ranked phase data was present.');
  }
  if (analysis.regressions.length || analysis.improvements.length) {
    lines.push('');
    lines.push('## Baseline Comparison');
    for (const item of [...analysis.regressions, ...analysis.improvements]) {
      lines.push(`- ${item.metric}: ${item.classification} (baseline=${item.baseline}, candidate=${item.candidate}, delta=${item.deltaMsOrCount}, deltaPct=${item.deltaPercent})`);
    }
  }
  lines.push('');
  lines.push('## Recommended Next Actions');
  for (const recommendation of analysis.recommendations) {
    lines.push(`- ${recommendation}`);
  }
  return `${lines.join('\n')}\n`;
}

export function saveBaselineCopy(sourcePath, targetPath) {
  mkdirSync(path.dirname(targetPath), { recursive: true });
  cpSync(sourcePath, targetPath);
}
