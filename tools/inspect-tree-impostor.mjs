import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const args = { asset: 'tree-1', frame: -1 };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--asset' && argv[i + 1]) {
      args.asset = argv[i + 1];
      i += 1;
    } else if (token === '--frame' && argv[i + 1]) {
      args.frame = Number.parseInt(argv[i + 1], 10);
      i += 1;
    }
  }
  return args;
}

function runMagick(args) {
  const result = spawnSync('magick', args, { encoding: 'utf8' });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `magick exited with status ${result.status}`);
  }
  return result.stdout.trim();
}

function printHeader(title) {
  console.log(`\n[${title}]`);
}

const { asset, frame } = parseArgs(process.argv);
const impostorDir = path.resolve('world/impostors', asset);
const metadataPath = path.join(impostorDir, 'metadata.json');

if (!fs.existsSync(metadataPath)) {
  throw new Error(`Missing metadata: ${metadataPath}`);
}

const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
const frameSize = Number(metadata.frameSize) || 0;
const gridCols = Number(metadata?.grid?.cols) || 1;

printHeader('Metadata');
console.log(JSON.stringify({
  asset,
  version: metadata.version,
  frameSize: metadata.frameSize,
  atlasWidth: metadata.atlasWidth,
  atlasHeight: metadata.atlasHeight,
  frameCount: metadata.frameCount,
  normalSpace: metadata.normalSpace,
  depthEncoding: metadata.depthEncoding,
  depthRange: metadata.depthRange
}, null, 2));

for (const name of ['albedo', 'normal', 'depth']) {
  const filePath = path.join(impostorDir, `${name}.png`);
  printHeader(`${name}.png`);
  console.log(runMagick([
    'identify',
    '-format',
    'size=%wx%h\\nmean=%[mean]\\nmin=%[min]\\nmax=%[max]',
    filePath
  ]));

  if (frame >= 0 && frameSize > 0) {
    const col = frame % gridCols;
    const row = Math.floor(frame / gridCols);
    const x = col * frameSize;
    const y = row * frameSize;
    printHeader(`${name}.png frame ${frame}`);
    console.log(runMagick([
      filePath,
      '-crop',
      `${frameSize}x${frameSize}+${x}+${y}`,
      '+repage',
      '-format',
      'mean=%[mean]\\nmin=%[min]\\nmax=%[max]',
      'info:'
    ]));
  }
}
