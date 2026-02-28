import { performance } from 'node:perf_hooks';

import { Noise } from '../js/modules/noise.js';
import { CLOUD_NOISE } from '../js/modules/world/cloudNoise.js';

function envNumber(name, fallback) {
  const value = process.env[name];
  if (value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for ${name}: ${value}`);
  }
  return parsed;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function benchmark(label, iterations, fn) {
  const samples = [];
  let sink = 0;

  // Warmup to reduce JIT noise in the measured runs.
  for (let i = 0; i < Math.floor(iterations * 0.08); i++) sink += fn(i);

  for (let run = 0; run < 5; run++) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) sink += fn(i + run * iterations);
    samples.push(performance.now() - start);
  }

  if (!Number.isFinite(sink)) {
    throw new Error(`${label} produced non-finite values`);
  }

  return {
    label,
    medianMs: median(samples),
    p95Ms: [...samples].sort((a, b) => a - b)[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))],
    samples
  };
}

function formatResult(result, budgetMs) {
  const sampleText = result.samples.map((x) => x.toFixed(2)).join(', ');
  return `${result.label}: median=${result.medianMs.toFixed(2)}ms, p95=${result.p95Ms.toFixed(2)}ms, budget=${budgetMs.toFixed(2)}ms, samples=[${sampleText}]`;
}

function assertBudget(result, budgetMs) {
  if (result.medianMs > budgetMs) {
    throw new Error(`Performance budget exceeded. ${formatResult(result, budgetMs)}`);
  }
}

function run() {
  const noiseIterations = Math.max(10_000, Math.floor(envNumber('FSIM_PERF_NOISE_ITERATIONS', 160_000)));
  const cloudIterations = Math.max(10_000, Math.floor(envNumber('FSIM_PERF_CLOUD_ITERATIONS', 180_000)));

  const noiseBudgetMs = envNumber('FSIM_PERF_BUDGET_NOISE_MS', 110);
  const cloudBudgetMs = envNumber('FSIM_PERF_BUDGET_CLOUD_MS', 135);

  const noiseResult = benchmark('Noise.fractal', noiseIterations, (i) => {
    const x = (i % 1000) * 0.0097;
    const z = ((i * 7) % 1200) * 0.0083;
    return Noise.fractal(x, z, 5, 0.5, 0.9);
  });

  const cloudResult = benchmark('CLOUD_NOISE.fbm2D', cloudIterations, (i) => {
    const x = (i % 1300) * 0.0059;
    const z = ((i * 11) % 900) * 0.0064;
    return CLOUD_NOISE.fbm2D(x, z, 4, 2.0, 0.5, 29);
  });

  console.log(formatResult(noiseResult, noiseBudgetMs));
  console.log(formatResult(cloudResult, cloudBudgetMs));

  assertBudget(noiseResult, noiseBudgetMs);
  assertBudget(cloudResult, cloudBudgetMs);

  console.log('Performance checks passed');
}

run();
