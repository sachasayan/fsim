import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const args = {
    asset: 'tree-1',
    frame: -1,
    outputDir: '',
    contactSheet: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--asset' && argv[i + 1]) {
      args.asset = argv[i + 1];
      i += 1;
    } else if (token === '--frame' && argv[i + 1]) {
      args.frame = Number.parseInt(argv[i + 1], 10);
      i += 1;
    } else if (token === '--output-dir' && argv[i + 1]) {
      args.outputDir = path.resolve(argv[i + 1]);
      i += 1;
    } else if (token === '--contact-sheet') {
      args.contactSheet = true;
    }
  }
  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function printHeader(title) {
  console.log(`\n[${title}]`);
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

function fileToDataUri(filePath) {
  const ext = path.extname(filePath).toLowerCase() === '.png' ? 'image/png' : 'application/octet-stream';
  return `data:${ext};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function round(value) {
  return Number(Number(value || 0).toFixed(6));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function clampPositive(value, fallback = 1) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) && nextValue > 1e-6 ? nextValue : fallback;
}

function normalizeContentRect(contentRect) {
  if (!contentRect || typeof contentRect !== 'object') return null;
  const x = clamp01(Number(contentRect.x));
  const y = clamp01(Number(contentRect.y));
  const widthValue = Number(contentRect.width);
  const heightValue = Number(contentRect.height);
  const width = Math.max(1e-6, Math.min(1 - x, Number.isFinite(widthValue) ? widthValue : 1));
  const height = Math.max(1e-6, Math.min(1 - y, Number.isFinite(heightValue) ? heightValue : 1));
  return { x, y, width, height };
}

function resolveImpostorFraming(metadata) {
  const boundsMin = Array.isArray(metadata?.boundsMin) ? metadata.boundsMin : [-0.5, 0, -0.5];
  const boundsMax = Array.isArray(metadata?.boundsMax) ? metadata.boundsMax : [0.5, 1, 0.5];
  const width = Math.max(0, Number(boundsMax[0]) - Number(boundsMin[0])) || 0;
  const height = Math.max(0, Number(boundsMax[1]) - Number(boundsMin[1])) || 0;
  const depth = Math.max(0, Number(boundsMax[2]) - Number(boundsMin[2])) || 0;
  const captureOrthoScale = clampPositive(
    metadata?.captureOrthoScale,
    Math.max(width, height, depth, 1) * 1.9
  );
  const contentRect = normalizeContentRect(metadata?.contentRect) || {
    x: (1 - Math.max(1e-6, Math.min(1, Math.max(width, depth) / captureOrthoScale))) * 0.5,
    y: (1 - Math.max(1e-6, Math.min(1, height / captureOrthoScale))) * 0.5,
    width: Math.max(1e-6, Math.min(1, Math.max(width, depth) / captureOrthoScale)),
    height: Math.max(1e-6, Math.min(1, height / captureOrthoScale))
  };
  return {
    captureOrthoScale: round(captureOrthoScale),
    contentRect: {
      x: round(contentRect.x),
      y: round(contentRect.y),
      width: round(contentRect.width),
      height: round(contentRect.height)
    },
    visibleWidthRatio: round(contentRect.width),
    visibleHeightRatio: round(contentRect.height),
    padding: {
      left: round(contentRect.x),
      right: round(1 - (contentRect.x + contentRect.width)),
      bottom: round(contentRect.y),
      top: round(1 - (contentRect.y + contentRect.height))
    }
  };
}

function buildFrameManifest(metadata) {
  const frameCount = Number(metadata.frameCount) || 0;
  const cols = Number(metadata?.grid?.cols) || 1;
  const rows = Number(metadata?.grid?.rows) || 1;
  const frameSize = Number(metadata.frameSize) || 0;
  const directions = Array.isArray(metadata.directions) ? metadata.directions : [];
  const frameBands = Array.isArray(metadata.frameBands) ? metadata.frameBands : [];
  const frames = [];
  for (let index = 0; index < frameCount; index += 1) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const direction = directions[index] || [0, 0, 0];
    frames.push({
      index,
      row,
      col,
      crop: {
        x: col * frameSize,
        y: row * frameSize,
        width: frameSize,
        height: frameSize
      },
      frameBand: frameBands[index] || 'horizon',
      direction: [
        round(direction[0]),
        round(direction[1]),
        round(direction[2])
      ]
    });
  }
  return frames;
}

function buildAtlasTruthHtml({ asset, metadata, frames, albedoDataUri, normalDataUri }) {
  const framing = resolveImpostorFraming(metadata);
  const frameCards = frames.map((frame) => {
    const backgroundStyle = `background-size:${metadata.atlasWidth}px ${metadata.atlasHeight}px;background-position:-${frame.crop.x}px -${frame.crop.y}px;`;
    return `
      <article class="frame-card">
        <header>
          <h2>Frame ${frame.index}</h2>
          <p>dir=(${frame.direction[0]}, ${frame.direction[1]}, ${frame.direction[2]})</p>
          <p>band=${frame.frameBand}</p>
        </header>
        <div class="thumb-row">
          <div class="thumb-wrap">
            <span>Albedo</span>
            <div class="thumb" style="background-image:url('${albedoDataUri}');${backgroundStyle}"></div>
          </div>
          <div class="thumb-wrap">
            <span>Normal</span>
            <div class="thumb" style="background-image:url('${normalDataUri}');${backgroundStyle}"></div>
          </div>
        </div>
        <p class="meta">row=${frame.row} col=${frame.col}</p>
      </article>
    `;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${asset} atlas truth</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0d131a;
      --panel: #17212b;
      --line: rgba(214, 232, 248, 0.14);
      --text: #edf5fc;
      --muted: #b7c7d9;
    }
    body {
      margin: 0;
      padding: 20px;
      background: radial-gradient(circle at top, #1b2633 0%, var(--bg) 70%);
      color: var(--text);
      font-family: "SF Mono", "Monaco", "Inconsolata", monospace;
    }
    h1, h2, p { margin: 0; }
    .lead { margin: 6px 0 18px; color: var(--muted); }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 14px;
    }
    .frame-card {
      padding: 12px;
      border-radius: 14px;
      background: rgba(18, 27, 35, 0.85);
      border: 1px solid var(--line);
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22);
    }
    .frame-card header {
      margin-bottom: 10px;
    }
    .frame-card header p,
    .meta {
      color: var(--muted);
      font-size: 12px;
      margin-top: 4px;
    }
    .thumb-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .thumb-wrap span {
      display: block;
      margin-bottom: 6px;
      font-size: 11px;
      color: var(--muted);
    }
    .thumb {
      width: 100%;
      aspect-ratio: 1;
      border-radius: 10px;
      border: 1px solid var(--line);
      background-repeat: no-repeat;
      image-rendering: auto;
    }
  </style>
</head>
<body>
  <h1>${asset} atlas truth</h1>
  <p class="lead">frameCount=${metadata.frameCount}, frameSize=${metadata.frameSize}, blendMode=${metadata.viewBlendMode || 'unknown'}, elevatedThreshold=${metadata.elevatedThreshold ?? 'n/a'}, highCardinalThreshold=${metadata.highCardinalThreshold ?? 'n/a'}</p>
  <p class="lead">contentRect=(${framing.contentRect.x}, ${framing.contentRect.y}, ${framing.contentRect.width}, ${framing.contentRect.height}), visibleHeight=${framing.visibleHeightRatio}, bottomPadding=${framing.padding.bottom}</p>
  <section class="grid">
    ${frameCards}
  </section>
</body>
</html>`;
}

const { asset, frame, outputDir, contactSheet } = parseArgs(process.argv);
const impostorDir = path.resolve('world/impostors', asset);
const metadataPath = path.join(impostorDir, 'metadata.json');

if (!fs.existsSync(metadataPath)) {
  throw new Error(`Missing metadata: ${metadataPath}`);
}

const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
const framing = resolveImpostorFraming(metadata);
const frameSize = Number(metadata.frameSize) || 0;
const gridCols = Number(metadata?.grid?.cols) || 1;
const frames = buildFrameManifest(metadata);

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
  depthRange: metadata.depthRange,
  viewBlendMode: metadata.viewBlendMode,
  elevatedThreshold: metadata.elevatedThreshold,
  highCardinalThreshold: metadata.highCardinalThreshold,
  captureOrthoScale: framing.captureOrthoScale,
  contentRect: framing.contentRect,
  visibleWidthRatio: framing.visibleWidthRatio,
  visibleHeightRatio: framing.visibleHeightRatio,
  padding: framing.padding
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

if (outputDir) {
  ensureDir(outputDir);
  const truthManifest = {
    asset,
    generatedAt: new Date().toISOString(),
    metadata: {
      version: metadata.version,
      frameSize: metadata.frameSize,
      atlasWidth: metadata.atlasWidth,
      atlasHeight: metadata.atlasHeight,
      frameCount: metadata.frameCount,
      grid: metadata.grid,
      normalSpace: metadata.normalSpace,
      depthEncoding: metadata.depthEncoding,
      depthRange: metadata.depthRange,
      viewBlendMode: metadata.viewBlendMode,
      elevatedThreshold: metadata.elevatedThreshold,
      highCardinalThreshold: metadata.highCardinalThreshold,
      frameBands: metadata.frameBands || [],
      captureOrthoScale: framing.captureOrthoScale,
      contentRect: framing.contentRect,
      visibleWidthRatio: framing.visibleWidthRatio,
      visibleHeightRatio: framing.visibleHeightRatio,
      padding: framing.padding
    },
    frames
  };
  fs.writeFileSync(path.join(outputDir, 'atlas-truth.json'), `${JSON.stringify(truthManifest, null, 2)}\n`, 'utf8');

  if (contactSheet) {
    const html = buildAtlasTruthHtml({
      asset,
      metadata,
      frames,
      albedoDataUri: fileToDataUri(path.join(impostorDir, 'albedo.png')),
      normalDataUri: fileToDataUri(path.join(impostorDir, 'normal.png'))
    });
    fs.writeFileSync(path.join(outputDir, 'atlas-truth.html'), html, 'utf8');
  }

  printHeader('Artifacts');
  console.log(JSON.stringify({
    outputDir,
    contactSheet: Boolean(contactSheet),
    files: contactSheet
      ? ['atlas-truth.json', 'atlas-truth.html']
      : ['atlas-truth.json']
  }, null, 2));
}
