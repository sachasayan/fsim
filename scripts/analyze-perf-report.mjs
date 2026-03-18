import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  analyzePerfReport,
  defaultBaselinePath,
  findLatestPerfReport,
  loadJson,
  renderAnalysisMarkdown,
  saveBaselineCopy
} from './perf-analysis.mjs';

function parseArgs(argv) {
  const options = {
    input: null,
    baseline: null,
    baselineDir: null,
    writeJson: null,
    writeMd: null,
    saveBaseline: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') options.input = argv[++i] || null;
    else if (arg === '--baseline') options.baseline = argv[++i] || null;
    else if (arg === '--baseline-dir') options.baselineDir = argv[++i] || null;
    else if (arg === '--write-json') options.writeJson = argv[++i] || null;
    else if (arg === '--write-md') options.writeMd = argv[++i] || null;
    else if (arg === '--save-baseline') options.saveBaseline = true;
    else if (arg === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function helpText() {
  return [
    'Usage: node scripts/analyze-perf-report.mjs [options]',
    '',
    'Options:',
    '  --input <path>         Perf report JSON to analyze. Defaults to the latest known report.',
    '  --baseline <path>      Explicit baseline JSON to compare against.',
    '  --baseline-dir <path>  Directory used for auto baseline lookup/save.',
    '  --save-baseline        Save the input report as the default baseline for its scenario/backend.',
    '  --write-json <path>    Write machine-readable analysis JSON.',
    '  --write-md <path>      Write markdown summary output.',
    '  --help                 Show this help text.'
  ].join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(helpText());
    return;
  }

  const cwd = process.cwd();
  const inputPath = options.input ? path.resolve(cwd, options.input) : findLatestPerfReport(cwd);
  if (!inputPath) {
    throw new Error('No perf report was found. Pass --input or generate a report first.');
  }

  const report = loadJson(inputPath);
  const inferredBaselinePath = defaultBaselinePath(cwd, report, options.baselineDir ? path.resolve(cwd, options.baselineDir) : undefined);
  const baselinePath = options.baseline
    ? path.resolve(cwd, options.baseline)
    : inferredBaselinePath;
  const baseline = baselinePath && baselinePath !== inputPath
    ? (() => {
        try {
          return loadJson(baselinePath);
        } catch {
          return null;
        }
      })()
    : null;

  const analysis = analyzePerfReport(report, baseline);
  const markdown = renderAnalysisMarkdown(analysis, baseline ? baselinePath : null);

  if (options.writeJson) {
    const outputPath = path.resolve(cwd, options.writeJson);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify({
      inputPath,
      baselinePath: baseline ? baselinePath : null,
      analysis
    }, null, 2)}\n`, 'utf8');
  }

  if (options.writeMd) {
    const outputPath = path.resolve(cwd, options.writeMd);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, markdown, 'utf8');
  }

  if (options.saveBaseline) {
    saveBaselineCopy(inputPath, inferredBaselinePath);
  }

  console.log(markdown);
  if (!baseline) {
    console.log(`No baseline loaded. Default baseline path: ${inferredBaselinePath}`);
  }
  if (options.saveBaseline) {
    console.log(`Saved baseline to ${inferredBaselinePath}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
