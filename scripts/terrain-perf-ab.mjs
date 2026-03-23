import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { loadJson } from './perf-analysis.mjs';
import {
  TERRAIN_PERF_SCENARIOS,
  analyzeTerrainPerfPair,
  renderTerrainPerfMarkdown,
  summarizeTerrainPerfSuite
} from './terrain-perf-analysis.mjs';

function parseArgs(argv) {
  const options = {
    baseline: null,
    candidate: null,
    scenarios: [],
    writeJson: null,
    writeMd: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--baseline') options.baseline = argv[++i] || null;
    else if (arg === '--candidate') options.candidate = argv[++i] || null;
    else if (arg === '--scenario') options.scenarios.push(argv[++i] || '');
    else if (arg === '--write-json') options.writeJson = argv[++i] || null;
    else if (arg === '--write-md') options.writeMd = argv[++i] || null;
    else if (arg === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function helpText() {
  return [
    'Usage: node scripts/terrain-perf-ab.mjs --baseline <report-or-dir> --candidate <report-or-dir> [options]',
    '',
    'Options:',
    '  --baseline <path>      Baseline perf report JSON or directory containing <scenario>-latest.json files.',
    '  --candidate <path>     Candidate perf report JSON or directory containing <scenario>-latest.json files.',
    '  --scenario <id>        Scenario id to compare. Repeat to compare multiple scenarios.',
    '  --write-json <path>    Write machine-readable A/B summary JSON.',
    '  --write-md <path>      Write markdown summary.',
    '  --help                 Show this help text.'
  ].join('\n');
}

function isDirectoryPath(value) {
  return !/\.json$/i.test(value || '');
}

function loadScenarioReport(rootPath, scenarioId, cwd) {
  const resolved = path.resolve(cwd, rootPath);
  const reportPath = isDirectoryPath(rootPath)
    ? path.join(resolved, `${scenarioId}-latest.json`)
    : resolved;
  return loadJson(reportPath);
}

function writeOutput(filePath, payload) {
  const resolved = path.resolve(process.cwd(), filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, payload, 'utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(helpText());
    return;
  }

  if (!options.baseline || !options.candidate) {
    throw new Error('Both --baseline and --candidate are required.');
  }

  const cwd = process.cwd();
  const scenarios = options.scenarios.length ? options.scenarios : TERRAIN_PERF_SCENARIOS;
  const analyses = scenarios.map((scenarioId) => analyzeTerrainPerfPair(
    loadScenarioReport(options.baseline, scenarioId, cwd),
    loadScenarioReport(options.candidate, scenarioId, cwd)
  ));

  const summary = summarizeTerrainPerfSuite(analyses);
  const markdown = renderTerrainPerfMarkdown(summary);

  if (options.writeJson) {
    writeOutput(options.writeJson, `${JSON.stringify(summary, null, 2)}\n`);
  }
  if (options.writeMd) {
    writeOutput(options.writeMd, markdown);
  }

  console.log(markdown);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
