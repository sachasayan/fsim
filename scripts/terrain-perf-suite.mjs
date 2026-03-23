import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { TERRAIN_PERF_SCENARIOS } from './terrain-perf-analysis.mjs';

function parseArgs(argv) {
  const options = {
    outputDir: path.join(process.cwd(), 'artifacts', 'terrain-perf-suite'),
    port: 4190,
    repeat: 3,
    scenarios: [],
    sampleMs: 2500,
    settleMs: 1000,
    readyTimeoutMs: 20000,
    allowUnstable: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output-dir') options.outputDir = path.resolve(process.cwd(), argv[++index] || options.outputDir);
    else if (arg === '--port') options.port = Number(argv[++index] || options.port);
    else if (arg === '--repeat') options.repeat = Number(argv[++index] || options.repeat);
    else if (arg === '--scenario') options.scenarios.push(argv[++index] || '');
    else if (arg === '--sample-ms') options.sampleMs = Number(argv[++index] || options.sampleMs);
    else if (arg === '--settle-ms') options.settleMs = Number(argv[++index] || options.settleMs);
    else if (arg === '--ready-timeout-ms') options.readyTimeoutMs = Number(argv[++index] || options.readyTimeoutMs);
    else if (arg === '--allow-unstable') options.allowUnstable = true;
    else if (arg === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function helpText() {
  return [
    'Usage: node scripts/terrain-perf-suite.mjs [options]',
    '',
    'Options:',
    '  --output-dir <path>       Directory for captured reports.',
    '  --port <number>           Dev server port. Default: 4190.',
    '  --repeat <count>          Runs per scenario. Default: 3.',
    '  --scenario <id>           Scenario to capture. Repeat to narrow the suite.',
    '  --sample-ms <number>      Sample window in ms. Default: 2500.',
    '  --settle-ms <number>      Settle delay in ms. Default: 1000.',
    '  --ready-timeout-ms <num>  Profiling readiness timeout in ms. Default: 20000.',
    '  --allow-unstable          Skip steady-state enforcement for exploratory captures.',
    '  --help                    Show this help text.'
  ].join('\n');
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runNodeScript(scriptPath, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || `Command failed with exit code ${code}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(helpText());
    return;
  }

  const scenarios = options.scenarios.length ? options.scenarios : TERRAIN_PERF_SCENARIOS;
  mkdirSync(options.outputDir, { recursive: true });

  const serverLogPath = path.join(options.outputDir, 'dev-server.log');
  const serverLog = [];
  const server = spawn(process.execPath, ['tools/dev-server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(options.port)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', (chunk) => {
    serverLog.push(chunk.toString());
  });
  server.stderr.on('data', (chunk) => {
    serverLog.push(chunk.toString());
  });

  try {
    await wait(2000);
    for (const scenario of scenarios) {
      for (let run = 1; run <= options.repeat; run += 1) {
        const { stdout } = await runNodeScript(path.join('scripts', 'capture-perf-report.mjs'), {
          PORT: String(options.port),
          FSIM_PERF_SCENARIO: scenario,
          FSIM_PERF_READY_TIMEOUT_MS: String(options.readyTimeoutMs),
          FSIM_PERF_SETTLE_MS: String(options.settleMs),
          FSIM_PERF_WARMUP_FRAMES: '0',
          FSIM_PERF_SAMPLE_FRAMES: '0',
          FSIM_PERF_SAMPLE_MS: String(options.sampleMs),
          FSIM_PERF_ARTIFACT_DIR: options.outputDir
          ,
          ...(options.allowUnstable ? { FSIM_PERF_ALLOW_UNSTABLE: '1' } : {})
        });
        const report = JSON.parse(stdout);
        const runPath = path.join(options.outputDir, `${scenario}-run${run}.json`);
        const latestPath = path.join(options.outputDir, `${scenario}-latest.json`);
        writeFileSync(runPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
        writeFileSync(latestPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      }
    }
  } finally {
    server.kill('SIGTERM');
    writeFileSync(serverLogPath, serverLog.join(''), 'utf8');
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
