import { chromium } from 'playwright';

const PORT = Number(process.env.PORT || 4173);
const WAIT_AFTER_SETTLE_MS = Number(process.env.FSIM_PERF_SETTLE_MS || 10_000);
const WARMUP_FRAMES = Number(process.env.FSIM_PERF_WARMUP_FRAMES || 4);
const SAMPLE_FRAMES = Number(process.env.FSIM_PERF_SAMPLE_FRAMES || 8);
const SAMPLE_MS = Number(process.env.FSIM_PERF_SAMPLE_MS || 4_000);
const PROFILING_READY_TIMEOUT_MS = Number(process.env.FSIM_PERF_READY_TIMEOUT_MS || 45_000);

async function waitForSettled(page) {
  await page.waitForFunction(() => (
    window.fsimWorld?.PHYSICS != null &&
    window.fsimWorld?.cameraController != null &&
    window.fsimPerf != null
  ), null, { timeout: 60_000 });

  return page.evaluate(async ({ waitMs, readyTimeoutMs }) => {
    const start = performance.now();
    let captureStartMode = 'fallback_delay';
    let profilingReadyAtMs = null;

    await new Promise(resolve => {
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
        requestAnimationFrame(tick);
      }
      tick();
    });

    if (captureStartMode === 'fallback_delay') {
      await new Promise(resolve => setTimeout(resolve, waitMs));
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
    waitMs: WAIT_AFTER_SETTLE_MS,
    readyTimeoutMs: PROFILING_READY_TIMEOUT_MS
  });
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
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    const page = await context.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error(`[page:${msg.type()}] ${msg.text()}`);
      }
    });

    const url = `http://127.0.0.1:${PORT}/fsim.html?lighting=noon&fog=0&clouds=0`;
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
    const captureStart = await waitForSettled(page);

    await page.evaluate(() => {
      window.fsimWorld.cameraController.setRotation(0.35, -0.25);
      window.fsimWorld.cameraController.setDistance(95);
      window.fsimWorld.cameraController.snapToTarget();
    });

    const report = await page.evaluate(async ({
      warmupFrames,
      sampleFrames,
      sampleMs,
      settleDelayMs,
      captureStartMetadata
    }) => {
      const metadata = {
        captureStartMode: captureStartMetadata.captureStartMode,
        profilingReadyAtMs: captureStartMetadata.profilingReadyAtMs,
        readinessAtCaptureStart: captureStartMetadata.readiness,
        settleDelayMs,
        sampleMs,
        warmupFrames,
        sampleFrames,
        cameraMode: window.fsimWorld.cameraController.getMode(),
        aircraftPosition: {
          x: window.fsimWorld.PHYSICS.position.x,
          y: window.fsimWorld.PHYSICS.position.y,
          z: window.fsimWorld.PHYSICS.position.z
        }
      };

      if (sampleFrames > 0) {
        return window.fsimPerf.collectSample({
          scenario: 'direct_capture',
          warmupFrames,
          sampleFrames,
          metadata
        });
      }

      window.fsimPerf.reset({
        scenario: 'direct_capture_timeboxed',
        metadata
      });
      await new Promise(resolve => setTimeout(resolve, sampleMs));
      return window.fsimPerf.getReport();
    }, {
      warmupFrames: WARMUP_FRAMES,
      sampleFrames: SAMPLE_FRAMES,
      sampleMs: SAMPLE_MS,
      settleDelayMs: WAIT_AFTER_SETTLE_MS,
      captureStartMetadata: captureStart
    });

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
