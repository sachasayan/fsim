import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright';

import {
  buildScenarioQuery,
  getPerfScenario,
  listPerfSweeps,
  mergeScenarioVariant
} from './perf-scenarios.mjs';
import {
  addCaptureDiagnostics,
  applyScenarioRuntime,
  assertCaptureStability,
  collectPerfReportInPage,
  getRendererBackendMetadata,
  startScenarioDriverInPage,
  stopScenarioDriverInPage,
  waitForPageReady,
  waitForProfilingReadiness
} from './perf-harness.mjs';

const PORT = Number(process.env.PORT || 4173);
const QUERY_SUFFIX = process.env.FSIM_PERF_QUERY || '';
const SCENARIO_ID = process.env.FSIM_PERF_SCENARIO || 'startup_steady_state';
const RUN_SWEEP = process.env.FSIM_PERF_SWEEP === '1';
const DEEP_PROFILE_MODE = process.env.FSIM_PERF_DEEP_PROFILE || '';
const ARTIFACT_DIR = process.env.FSIM_PERF_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'perf');
const RENDERER_MODE = process.env.FSIM_PERF_RENDERER_MODE || 'hardware';
const HEADLESS = process.env.FSIM_PERF_HEADLESS === '0' ? false : true;

function envNumber(name, fallback) {
  const value = process.env[name];
  if (value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
}

function persistReportArtifact(fileName, payload) {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const outputPath = path.join(ARTIFACT_DIR, fileName);
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return outputPath;
}

function applyCaptureEnvOverrides(scenario) {
  const next = structuredClone(scenario);
  next.capture = {
    ...next.capture,
    settleDelayMs: envNumber('FSIM_PERF_SETTLE_MS', next.capture?.settleDelayMs ?? 10_000),
    warmupFrames: envNumber('FSIM_PERF_WARMUP_FRAMES', next.capture?.warmupFrames ?? 20),
    sampleFrames: envNumber('FSIM_PERF_SAMPLE_FRAMES', next.capture?.sampleFrames ?? 30),
    sampleMs: envNumber('FSIM_PERF_SAMPLE_MS', next.capture?.sampleMs ?? 4_000),
    profilingReadyTimeoutMs: envNumber('FSIM_PERF_READY_TIMEOUT_MS', next.capture?.profilingReadyTimeoutMs ?? 45_000),
    requireSteadyState: process.env.FSIM_PERF_ALLOW_UNSTABLE === '1'
      ? false
      : (next.capture?.requireSteadyState ?? true)
  };
  return next;
}

function buildReportDeltas(baseline, candidate) {
  const pairs = [
    ['frameMs', 'frameMs'],
    ['renderTotal', 'render.totalMs'],
    ['renderScene', 'render.sceneMs'],
    ['rendererCalls', 'renderer.calls'],
    ['rendererTriangles', 'renderer.triangles'],
    ['pendingBaseChunkJobs', 'terrain.pendingBaseChunkJobs'],
    ['pendingPropJobs', 'terrain.pendingPropJobs'],
    ['inFlightWorkerJobs', 'terrain.inFlightWorkerJobs']
  ];
  const delta = {};

  for (const [label, metricName] of pairs) {
    const before = baseline.metrics?.[metricName] || null;
    const after = candidate.metrics?.[metricName] || null;
    delta[label] = {
      p50DeltaMs: round((after?.p50 ?? 0) - (before?.p50 ?? 0)),
      p95DeltaMs: round((after?.p95 ?? 0) - (before?.p95 ?? 0))
    };
  }

  delta.longTasks = {
    countDelta: (candidate.longTasks?.count ?? 0) - (baseline.longTasks?.count ?? 0),
    p95DeltaMs: round((candidate.longTasks?.summary?.p95 ?? 0) - (baseline.longTasks?.summary?.p95 ?? 0))
  };

  return delta;
}

async function maybeCaptureDeepProfile(page, scenarioRun, fn) {
  if (!DEEP_PROFILE_MODE) {
    return { report: await fn(), deepProfile: null };
  }

  const client = await page.context().newCDPSession(page);
  await client.send('Profiler.enable');
  await client.send('Profiler.start');

  const report = await fn();
  const profile = await client.send('Profiler.stop');
  await client.send('Profiler.disable');

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const artifactPath = path.join(ARTIFACT_DIR, `${scenarioRun.id.replace(/[^a-z0-9:_-]+/gi, '_')}-cpu-profile.json`);
  writeFileSync(artifactPath, `${JSON.stringify(profile.profile, null, 2)}\n`, 'utf8');

  return {
    report,
    deepProfile: {
      mode: DEEP_PROFILE_MODE,
      artifactPath,
      startedAtIso: new Date().toISOString()
    }
  };
}

async function collectScenarioReport(page, scenarioRun) {
  const captureConfig = scenarioRun.capture || {};
  const query = buildScenarioQuery({
    ...scenarioRun,
    query: {
      ...(scenarioRun.query || {}),
      ...(scenarioRun.spawn ? {
        x: scenarioRun.spawn.x,
        y: scenarioRun.spawn.y,
        z: scenarioRun.spawn.z
      } : {})
    }
  }, QUERY_SUFFIX);
  const url = `http://127.0.0.1:${PORT}/fsim.html?${query.toString()}`;

  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  await waitForPageReady(page);
  await applyScenarioRuntime(page, scenarioRun);
  await startScenarioDriverInPage(page, scenarioRun);
  try {
    const captureStart = await waitForProfilingReadiness(page, captureConfig);
    const rendererBackend = await getRendererBackendMetadata(page);
    assertCaptureStability(captureStart, scenarioRun);

    const { report, deepProfile } = await maybeCaptureDeepProfile(
      page,
      scenarioRun,
      async () => collectPerfReportInPage(page, {
        scenario: scenarioRun,
        captureStartMetadata: captureStart,
        metadata: {
          rendererBackend,
          rendererMode: RENDERER_MODE,
          headless: HEADLESS
        }
      })
    );

    report.deepProfile = deepProfile;
    report.environment = {
      ...(report.environment || {}),
      rendererMode: RENDERER_MODE,
      headless: HEADLESS
    };
    return addCaptureDiagnostics(report, captureStart, rendererBackend);
  } finally {
    await stopScenarioDriverInPage(page);
  }
}

async function main() {
  const browserArgs = [
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--window-size=1920,1080'
  ];
  if (RENDERER_MODE === 'software') {
    browserArgs.unshift('--use-angle=swiftshader');
    browserArgs.unshift('--use-gl=angle');
  } else {
    browserArgs.unshift('--enable-gpu');
  }

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: browserArgs
  });

  try {
    const baseScenario = applyCaptureEnvOverrides(getPerfScenario(SCENARIO_ID));
    const scenariosToRun = RUN_SWEEP
      ? listPerfSweeps().map((sweep) => applyCaptureEnvOverrides(mergeScenarioVariant(baseScenario, sweep)))
      : [baseScenario];

    const reports = [];
    for (const scenarioRun of scenariosToRun) {
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 }
      });
      const page = await context.newPage();

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          console.error(`[page:${msg.type()}][${scenarioRun.id}] ${msg.text()}`);
        }
      });

      try {
        reports.push(await collectScenarioReport(page, scenarioRun));
      } finally {
        await context.close();
      }
    }

    if (!RUN_SWEEP) {
      const latestPath = persistReportArtifact('latest.json', reports[0]);
      const scenarioPath = persistReportArtifact(`${baseScenario.id}-latest.json`, reports[0]);
      reports[0].artifacts = {
        ...(reports[0].artifacts || {}),
        latestReportPath: latestPath,
        scenarioReportPath: scenarioPath
      };
      console.log(JSON.stringify(reports[0], null, 2));
      return;
    }

    const baseline = reports[0];
    const sweepReport = {
      ok: reports.every((report) => report.ok === true),
      mode: 'toggle_sweep',
      scenarioId: baseScenario.id,
      baseline,
      variants: reports.slice(1).map((report) => ({
        id: report.metadata?.sweepId || report.scenarioId,
        label: report.metadata?.sweepLabel || report.scenarioId,
        report,
        deltaFromBaseline: buildReportDeltas(baseline, report)
      }))
    };

    const latestPath = persistReportArtifact('latest-sweep.json', sweepReport);
    const scenarioPath = persistReportArtifact(`${baseScenario.id}-sweep-latest.json`, sweepReport);
    sweepReport.artifacts = {
      latestReportPath: latestPath,
      scenarioReportPath: scenarioPath
    };
    console.log(JSON.stringify(sweepReport, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
