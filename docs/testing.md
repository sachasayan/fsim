# Testing Guide

## Run Commands

- `npm run test:unit` runs fast unit tests for deterministic simulation and cloud-noise logic.
- `npm run smoke` validates syntax and basic server asset delivery.
- `npm run test:perf` runs CPU microbenchmarks for graphics-heavy procedural noise paths.
- `npm run test:e2e:perf` captures a browser-side render performance report for `fsim.html`.
- `npm run perf:capture` runs the standalone perf harness and saves `artifacts/perf/latest.json`.
- `npm run perf:analyze` analyzes the latest saved perf report and compares it to a scenario/backend baseline if one exists.
- `npm test` runs unit + smoke.

## Performance Test Philosophy

For graphics code, pure unit tests should verify correctness and ranges, not FPS.

- Use unit tests for deterministic math contracts (value bounds, finite output, stable mappings).
- Use dedicated perf tests for hot kernels (noise generation, cloud density synthesis, terrain sampling).
- Use machine-local performance budgets for baseline regression detection.

`npm run test:perf` currently covers:

- `Noise.fractal`
- `CLOUD_NOISE.fbm2D`

Each benchmark runs multiple samples and validates the median against a budget.

## Perf Budget Tuning

You can tune thresholds and workload with environment variables:

- `FSIM_PERF_BUDGET_NOISE_MS` (default `110`)
- `FSIM_PERF_BUDGET_CLOUD_MS` (default `135`)
- `FSIM_PERF_NOISE_ITERATIONS` (default `160000`)
- `FSIM_PERF_CLOUD_ITERATIONS` (default `180000`)

Example:

```bash
FSIM_PERF_BUDGET_NOISE_MS=95 FSIM_PERF_BUDGET_CLOUD_MS=120 npm run test:perf
```

## Recommendation For Full Graphics Performance

Unit tests are not enough for real rendering performance.

The browser perf E2E writes a JSON artifact with:

- per-frame CPU timing
- named render-loop phase summaries
- render sub-pass timing for scene, SMAA, bloom, and total render time
- `THREE.WebGLRenderer.info` counters
- adaptive quality / pixel ratio snapshots
- profiling readiness state and resource stabilization timing
- explicit capture stability metadata (`stable`, `requiredSteadyState`, `unstableReason`)
- renderer backend metadata so reports show which WebGL backend produced them
- Chromium performance metrics gathered through Playwright CDP

Use it as machine-local regression feedback and as structured input for LLM analysis.

The perf capture intentionally waits for startup to settle before sampling:

- prefer the in-app `profilingReady` signal
- `profilingReady` requires bootstrap complete, loader hidden, world ready, and no program/texture/geometry growth for 3 seconds
- steady-state scenarios fail if true steady state never arrives before the harness timeout
- set `FSIM_PERF_ALLOW_UNSTABLE=1` only when you intentionally want an exploratory unstable capture

The standalone perf harness uses hardware-backed Chromium by default. To run the old deterministic software path explicitly:

```bash
FSIM_PERF_RENDERER_MODE=software node scripts/capture-perf-report.mjs
```

The standalone capture defaults to headless mode, but you can make the exact same capture visible with:

```bash
FSIM_PERF_HEADLESS=0 npm run perf:capture
```

## Suggested Perf Workflow

1. Capture a run:

```bash
npm run perf:capture
```

Example flight scenarios:

```bash
FSIM_PERF_SCENARIO=level_flight_low_alt npm run perf:capture
FSIM_PERF_SCENARIO=level_flight_cruise npm run perf:capture
```

These two standardized flight captures use deterministic straight-line level flight and 10 second sample windows:

- `level_flight_low_alt`: 1000 m altitude
- `level_flight_cruise`: 8000 m altitude

2. Analyze the latest report:

```bash
npm run perf:analyze
```

3. If the run is representative, save it as the baseline for that scenario/backend:

```bash
npm run perf:analyze -- --save-baseline
```

4. Optional: write analysis artifacts for sharing or agent review:

```bash
npm run perf:analyze -- --write-md artifacts/perf/latest-summary.md --write-json artifacts/perf/latest-analysis.json
```

The analyzer summarizes:

- capture stability and whether the sample was trustworthy
- top-ranked expensive phases
- regressions and improvements against the baseline
- suggested next actions based on the dominant subsystem signals
