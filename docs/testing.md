# Testing Guide

## Run Commands

- `npm run test:unit` runs fast unit tests for deterministic simulation and cloud-noise logic.
- `npm run smoke` validates syntax and basic server asset delivery.
- `npm run test:perf` runs CPU microbenchmarks for graphics-heavy procedural noise paths.
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
