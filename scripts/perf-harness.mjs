function round(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
}

export async function waitForPageReady(page) {
  await page.waitForFunction(() => (
    window.fsimWorld?.PHYSICS != null &&
    window.fsimWorld?.cameraController != null &&
    window.fsimPerf != null
  ), null, { timeout: 60_000 });
}

export async function applyScenarioRuntime(page, scenario) {
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

export async function waitForProfilingReadiness(page, captureConfig = {}) {
  return page.evaluate(async ({
    settleDelayMs,
    profilingReadyTimeoutMs,
    requireSteadyState
  }) => {
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
        if ((performance.now() - start) >= profilingReadyTimeoutMs) {
          resolve();
          return;
        }
        setTimeout(tick, 50);
      }
      tick();
    });

    if (captureStartMode === 'fallback_delay') {
      await new Promise((resolve) => setTimeout(resolve, settleDelayMs));
    }

    const readiness = {
      bootstrapComplete: window.fsimWorld?.bootstrapComplete ?? null,
      loaderHidden: window.fsimWorld?.loaderHidden ?? null,
      worldReady: window.fsimWorld?.worldReady ?? null,
      profilingReady: window.fsimWorld?.profilingReady ?? null,
      profilingReadinessReason: window.fsimWorld?.profilingReadinessReason ?? null
    };
    const stableAtCaptureStart = readiness.profilingReady === true;

    return {
      captureStartMode,
      profilingReadyAtMs,
      readiness,
      stability: {
        stableAtCaptureStart,
        requiredSteadyState: requireSteadyState === true,
        unstableReason: stableAtCaptureStart
          ? null
          : (readiness.profilingReadinessReason || 'profiling_ready_timeout')
      }
    };
  }, {
    settleDelayMs: captureConfig.settleDelayMs ?? 10_000,
    profilingReadyTimeoutMs: captureConfig.profilingReadyTimeoutMs ?? 45_000,
    requireSteadyState: captureConfig.requireSteadyState === true
  });
}

export async function getRendererBackendMetadata(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
      return {
        api: null,
        vendor: null,
        renderer: null,
        shaderVersion: null
      };
    }

    const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = debugExt
      ? gl.getParameter(debugExt.UNMASKED_VENDOR_WEBGL)
      : gl.getParameter(gl.VENDOR);
    const renderer = debugExt
      ? gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);

    return {
      api: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl',
      vendor: vendor || null,
      renderer: renderer || null,
      shaderVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION) || null
    };
  });
}

export async function collectPerfReportInPage(page, {
  scenario,
  captureStartMetadata,
  metadata = {}
}) {
  return page.evaluate(async ({
    activeScenario,
    captureStart,
    extraMetadata
  }) => {
    function startScenarioDriver(scenarioConfig) {
      const movement = scenarioConfig.movement || { type: 'none' };
      if (movement.type === 'none') return () => {};

      const { PHYSICS, planeGroup, physicsAdapter, cameraController } = window.fsimWorld;
      if (!PHYSICS || !planeGroup || !physicsAdapter) return () => {};

      const origin = scenarioConfig.spawn || {
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
    const scenarioMetadata = {
      scenarioId: activeScenario.id,
      scenarioLabel: activeScenario.label,
      sweepId: activeScenario.sweepId ?? null,
      sweepLabel: activeScenario.sweepLabel ?? null,
      captureStartMode: captureStart.captureStartMode,
      profilingReadyAtMs: captureStart.profilingReadyAtMs,
      readinessAtCaptureStart: captureStart.readiness,
      captureStability: captureStart.stability,
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
      },
      ...extraMetadata
    };

    try {
      if ((activeScenario.capture?.sampleFrames ?? 0) > 0) {
        return await window.fsimPerf.collectSample({
          scenario: activeScenario.id,
          warmupFrames: activeScenario.capture.warmupFrames,
          sampleFrames: activeScenario.capture.sampleFrames,
          metadata: scenarioMetadata
        });
      }

      window.fsimPerf.reset({
        scenario: activeScenario.id,
        metadata: scenarioMetadata
      });
      await new Promise((resolve) => setTimeout(resolve, activeScenario.capture.sampleMs));
      return window.fsimPerf.getReport();
    } finally {
      stopDriver();
    }
  }, {
    activeScenario: scenario,
    captureStart: captureStartMetadata,
    extraMetadata: metadata
  });
}

export function assertCaptureStability(captureStartMetadata, scenario) {
  if (!captureStartMetadata?.stability?.requiredSteadyState) {
    return;
  }
  if (captureStartMetadata.stability.stableAtCaptureStart) {
    return;
  }

  const reason = captureStartMetadata.stability.unstableReason || 'profiling_ready_timeout';
  throw new Error(`Scenario "${scenario.id}" did not reach steady state before capture: ${reason}`);
}

export function addCaptureDiagnostics(report, captureStartMetadata, backend) {
  report.capture = {
    startMode: captureStartMetadata.captureStartMode,
    stable: captureStartMetadata.stability?.stableAtCaptureStart ?? null,
    requiredSteadyState: captureStartMetadata.stability?.requiredSteadyState ?? null,
    unstableReason: captureStartMetadata.stability?.unstableReason ?? null
  };
  report.environment = {
    ...report.environment,
    rendererBackend: backend || null
  };
  report.summary = {
    ...report.summary,
    stableCapture: report.capture.stable
  };
  return report;
}

export function buildBrowserMetricDelta(beforeMetrics, afterMetrics, names) {
  const delta = {};
  for (const name of names) {
    if (typeof beforeMetrics[name] === 'number' && typeof afterMetrics[name] === 'number') {
      delta[name] = round(afterMetrics[name] - beforeMetrics[name]);
    }
  }
  return delta;
}
