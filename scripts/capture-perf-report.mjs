import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright';

import {
  buildScenarioQuery,
  getPerfScenario,
  listPerfSweeps,
  mergeScenarioVariant
} from './perf-scenarios.mjs';

const PORT = Number(process.env.PORT || 4173);
const QUERY_SUFFIX = process.env.FSIM_PERF_QUERY || '';
const SCENARIO_ID = process.env.FSIM_PERF_SCENARIO || 'startup_steady_state';
const RUN_SWEEP = process.env.FSIM_PERF_SWEEP === '1';
const DEEP_PROFILE_MODE = process.env.FSIM_PERF_DEEP_PROFILE || '';
const ARTIFACT_DIR = process.env.FSIM_PERF_ARTIFACT_DIR || path.join(process.cwd(), 'artifacts', 'perf');

function envNumber(name, fallback) {
  const value = process.env[name];
  if (value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
}

function applyCaptureEnvOverrides(scenario) {
  const next = structuredClone(scenario);
  next.capture = {
    ...next.capture,
    settleDelayMs: envNumber('FSIM_PERF_SETTLE_MS', next.capture?.settleDelayMs ?? 10_000),
    warmupFrames: envNumber('FSIM_PERF_WARMUP_FRAMES', next.capture?.warmupFrames ?? 20),
    sampleFrames: envNumber('FSIM_PERF_SAMPLE_FRAMES', next.capture?.sampleFrames ?? 30),
    sampleMs: envNumber('FSIM_PERF_SAMPLE_MS', next.capture?.sampleMs ?? 4_000),
    profilingReadyTimeoutMs: envNumber('FSIM_PERF_READY_TIMEOUT_MS', next.capture?.profilingReadyTimeoutMs ?? 45_000)
  };
  return next;
}

async function waitForPageReady(page) {
  await page.waitForFunction(() => (
    window.fsimWorld?.PHYSICS != null &&
    window.fsimWorld?.cameraController != null &&
    window.fsimPerf != null
  ), null, { timeout: 60_000 });
}

async function applyScenarioRuntime(page, scenario) {
  await page.evaluate((activeScenario) => {
    const runtime = activeScenario.runtime || {};
    const terrain = runtime.terrain || {};

    if (window.fsimWorld?.applyTerrainDebugSettings && Object.keys(terrain).length > 0) {
      Object.assign(window.fsimWorld.terrainDebugSettings || {}, terrain);
      window.fsimWorld.applyTerrainDebugSettings({
        rebuildProps: true,
        refreshSelection: false
      });
      window.fsimWorld.updateTerrain?.();
    }

    if (runtime.hidePlane === true && window.fsimWorld?.planeGroup) {
      window.fsimWorld.planeGroup.visible = false;
    }
    if (runtime.hidePlane === false && window.fsimWorld?.planeGroup) {
      window.fsimWorld.planeGroup.visible = true;
    }

    if (activeScenario.camera && window.fsimWorld?.cameraController) {
      window.fsimWorld.cameraController.setRotation(activeScenario.camera.rotationX, activeScenario.camera.rotationY);
      window.fsimWorld.cameraController.setDistance(activeScenario.camera.distance);
      window.fsimWorld.cameraController.snapToTarget();
    }
  }, scenario);
}

async function waitForSettled(page, captureConfig) {
  return page.evaluate(async ({ waitMs, readyTimeoutMs }) => {
    const start = performance.now();
    let captureStartMode = 'fallback_delay';
    let profilingReadyAtMs = null;

    await new Promise((resolve) => {
      function tick() {
        if (window.fsimWorld?.profilingReady === true) {
          captureStartMode = 'steady_state_gate';
          profilingReadyAtMs = performance.now();
          resolve();
          return;
        }
        if ((performance.now() - start) >= readyTimeoutMs) {
          resolve();
          return;
        }
        setTimeout(tick, 50);
      }
      tick();
    });

    if (captureStartMode === 'fallback_delay') {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
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
    waitMs: captureConfig.settleDelayMs,
    readyTimeoutMs: captureConfig.profilingReadyTimeoutMs
  });
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
  const captureStart = await waitForSettled(page, captureConfig);

  const { report, deepProfile } = await maybeCaptureDeepProfile(page, scenarioRun, async () => page.evaluate(async ({
    activeScenario,
    captureStartMetadata
  }) => {
    function startScenarioDriver(scenario) {
      const movement = scenario.movement || { type: 'none' };
      if (movement.type === 'none') return () => {};

      const { PHYSICS, planeGroup, physicsAdapter, cameraController } = window.fsimWorld;
      if (!PHYSICS || !planeGroup || !physicsAdapter) return () => {};

      const origin = scenario.spawn || {
        x: PHYSICS.position.x,
        y: PHYSICS.position.y,
        z: PHYSICS.position.z
      };
      const initialTimeMs = performance.now();
      let active = true;

      function tick(now) {
        if (!active) return;
        const elapsed = (now - initialTimeMs) / 1000;

        if (movement.type === 'path') {
          const dx = Math.cos(movement.yawRad || 0) * movement.speedMps * elapsed;
          const dz = Math.sin(movement.yawRad || 0) * movement.speedMps * elapsed;
          PHYSICS.position.set(origin.x + dx, origin.y, origin.z + dz);
          PHYSICS.velocity.set(Math.cos(movement.yawRad || 0) * movement.speedMps, 0, Math.sin(movement.yawRad || 0) * movement.speedMps);
          planeGroup.rotation.set(0, -(movement.yawRad || 0), 0);
        } else if (movement.type === 'orbit') {
          const angle = elapsed * (movement.angularSpeedRadPerSec || 0.2);
          const radius = movement.radius || 250;
          const altitude = movement.altitude || origin.y;
          PHYSICS.position.set(
            origin.x + Math.cos(angle) * radius,
            altitude,
            origin.z + Math.sin(angle) * radius
          );
          PHYSICS.velocity.set(
            -Math.sin(angle) * radius * (movement.angularSpeedRadPerSec || 0.2),
            0,
            Math.cos(angle) * radius * (movement.angularSpeedRadPerSec || 0.2)
          );
          planeGroup.rotation.set(0, -angle + Math.PI * 0.5, 0);
        }

        planeGroup.position.copy(PHYSICS.position);
        PHYSICS.angularVelocity.set(0, 0, 0);
        PHYSICS.externalForce.set(0, 0, 0);
        PHYSICS.externalTorque.set(0, 0, 0);
        physicsAdapter.syncFromState();
        cameraController?.snapToTarget?.();
        requestAnimationFrame(tick);
      }

      requestAnimationFrame(tick);
      return () => {
        active = false;
      };
    }

    const stopDriver = startScenarioDriver(activeScenario);
    const metadata = {
      scenarioId: activeScenario.id,
      scenarioLabel: activeScenario.label,
      sweepId: activeScenario.sweepId ?? null,
      sweepLabel: activeScenario.sweepLabel ?? null,
      captureStartMode: captureStartMetadata.captureStartMode,
      profilingReadyAtMs: captureStartMetadata.profilingReadyAtMs,
      readinessAtCaptureStart: captureStartMetadata.readiness,
      settleDelayMs: activeScenario.capture?.settleDelayMs ?? null,
      sampleMs: activeScenario.capture?.sampleMs ?? null,
      warmupFrames: activeScenario.capture?.warmupFrames ?? null,
      sampleFrames: activeScenario.capture?.sampleFrames ?? null,
      query: window.location.search,
      cameraMode: window.fsimWorld.cameraController.getMode(),
      camera: activeScenario.camera,
      rendererConfig: window.fsimWorld.rendererConfig,
      runtimeOverrides: activeScenario.runtime ?? {},
      movement: activeScenario.movement ?? { type: 'none' },
      aircraftPosition: {
        x: window.fsimWorld.PHYSICS.position.x,
        y: window.fsimWorld.PHYSICS.position.y,
        z: window.fsimWorld.PHYSICS.position.z
      }
    };

    try {
      if ((activeScenario.capture?.sampleFrames ?? 0) > 0) {
        return await window.fsimPerf.collectSample({
          scenario: activeScenario.id,
          warmupFrames: activeScenario.capture.warmupFrames,
          sampleFrames: activeScenario.capture.sampleFrames,
          metadata
        });
      }

      window.fsimPerf.reset({
        scenario: activeScenario.id,
        metadata
      });
      await new Promise((resolve) => setTimeout(resolve, activeScenario.capture.sampleMs));
      return window.fsimPerf.getReport();
    } finally {
      stopDriver();
    }
  }, {
    activeScenario: scenarioRun,
    captureStartMetadata: captureStart
  }));

  report.deepProfile = deepProfile;
  return report;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--window-size=1920,1080'
    ]
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

    console.log(JSON.stringify(sweepReport, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
