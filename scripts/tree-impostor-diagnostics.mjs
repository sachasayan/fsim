import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { chromium } from 'playwright';

const ROOT = process.cwd();
const DEFAULT_PORT = 4184;
const DEFAULT_SEQUENCES = [
  'frame_stability',
  'sun_response',
  'mesh_match',
  'seam_normal_atlas_raw',
  'seam_local_normal',
  'seam_view_normal'
];

function parseArgs(argv) {
  const options = {
    port: DEFAULT_PORT,
    sequences: [...DEFAULT_SEQUENCES],
    outputBase: path.resolve(ROOT, 'test-results', 'tree-impostor-diagnostics'),
    reuseServer: false
  };
  for (const arg of argv) {
    if (arg.startsWith('--port=')) {
      options.port = Number(arg.slice('--port='.length)) || DEFAULT_PORT;
    } else if (arg.startsWith('--sequence=')) {
      options.sequences = arg
        .slice('--sequence='.length)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    } else if (arg.startsWith('--output-base=')) {
      options.outputBase = path.resolve(ROOT, arg.slice('--output-base='.length));
    } else if (arg === '--reuse-server') {
      options.reuseServer = true;
    }
  }
  return options;
}

function timestampId() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join('')
  + '-'
  + [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join('');
}

async function waitForServer(url, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startServer(port) {
  const child = spawn('node', ['tools/dev-server.mjs'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(port)
    }
  });
  return child;
}

async function createDiffBuffer(page, beforeBuffer, afterBuffer) {
  const payload = await page.evaluate(async ({ beforeBase64, afterBase64 }) => {
    function loadImage(source) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to decode image: ${source.slice(0, 32)}...`));
        image.src = source;
      });
    }

    const before = await loadImage(`data:image/png;base64,${beforeBase64}`);
    const after = await loadImage(`data:image/png;base64,${afterBase64}`);
    const width = Math.max(before.width, after.width);
    const height = Math.max(before.height, after.height);

    const makeImageData = (image) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('2D canvas unavailable.');
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      return context.getImageData(0, 0, width, height);
    };

    const beforeData = makeImageData(before);
    const afterData = makeImageData(after);
    const diffCanvas = document.createElement('canvas');
    diffCanvas.width = width;
    diffCanvas.height = height;
    const diffContext = diffCanvas.getContext('2d');
    if (!diffContext) throw new Error('2D diff canvas unavailable.');
    const diffImage = diffContext.createImageData(width, height);
    for (let index = 0; index < diffImage.data.length; index += 4) {
      const r = Math.abs(beforeData.data[index] - afterData.data[index]);
      const g = Math.abs(beforeData.data[index + 1] - afterData.data[index + 1]);
      const b = Math.abs(beforeData.data[index + 2] - afterData.data[index + 2]);
      const maxChannel = Math.max(r, g, b);
      diffImage.data[index] = Math.min(255, r * 3);
      diffImage.data[index + 1] = Math.min(255, g * 3);
      diffImage.data[index + 2] = Math.min(255, b * 3 + Math.round(maxChannel * 0.5));
      diffImage.data[index + 3] = Math.max(80, maxChannel);
    }
    diffContext.putImageData(diffImage, 0, 0);
    return diffCanvas.toDataURL('image/png').split(',')[1];
  }, {
    beforeBase64: beforeBuffer.toString('base64'),
    afterBase64: afterBuffer.toString('base64')
  });
  return Buffer.from(payload, 'base64');
}

function createSequenceManifest(sequenceId, captures, summary, diffPairs) {
  return {
    sequenceId,
    generatedAt: new Date().toISOString(),
    captures: captures.map((capture) => ({
      name: capture.name,
      snapshotFile: `${capture.name}.json`,
      screenshotFile: `${capture.name}.png`,
      debugState: capture.debugState,
      snapshot: capture.snapshot,
      note: capture.note || null
    })),
    summary: {
      ...summary,
      orderedFrameSelections: captures.map((capture, index) => ({
        index,
        name: capture.name,
        primaryIndex: capture.snapshot.frameSelection.primaryIndex,
        secondaryIndex: capture.snapshot.frameSelection.secondaryIndex,
        blend: capture.snapshot.frameSelection.blend,
        frameTransitionOccurred: capture.snapshot.frameTransitionOccurred,
        framePairChanged: capture.snapshot.framePairChanged
      })),
      diffPairs
    }
  };
}

async function getViewerApi(page) {
  return page.evaluate(() => {
    const viewer = window.__TREE_IMPOSTOR_VIEWER__;
    if (!viewer) throw new Error('Viewer API unavailable.');
    return Boolean(viewer);
  });
}

async function callViewer(page, method, ...args) {
  return page.evaluate(([name, values]) => {
    const viewer = window.__TREE_IMPOSTOR_VIEWER__;
    if (!viewer || typeof viewer[name] !== 'function') {
      throw new Error(`Viewer API method is unavailable: ${name}`);
    }
    return viewer[name](...values);
  }, [method, args]);
}

function getNeighborDiffPairs(captures) {
  const pairs = [];
  for (let index = 1; index < captures.length; index += 1) {
    const previous = captures[index - 1];
    const current = captures[index];
    const previousToken = previous.name.split('_').at(-1) || String(index - 1).padStart(3, '0');
    const currentToken = current.name.split('_').at(-1) || String(index).padStart(3, '0');
    pairs.push({
      name: `${captures[0].name.split('_')[0]}_diff_${previousToken}_${currentToken}`,
      before: previous.name,
      after: current.name
    });
  }
  return pairs;
}

function getMeshMatchDiffPairs(captures) {
  const pairs = [];
  const lookup = new Map(captures.map((capture) => [capture.name, capture]));
  for (const prefix of ['frontlit', 'sidelit', 'backlit', 'seam']) {
    const mesh = `mesh-match_${prefix}_mesh`;
    const impostor = `mesh-match_${prefix}_impostor`;
    if (lookup.has(mesh) && lookup.has(impostor)) {
      pairs.push({
        name: `mesh-match_${prefix}_diff`,
        before: mesh,
        after: impostor
      });
    }
  }
  return pairs;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const baseUrl = `http://127.0.0.1:${options.port}`;
  const runDir = path.join(options.outputBase, timestampId());
  mkdirSync(runDir, { recursive: true });

  let server = null;
  if (!options.reuseServer) {
    server = startServer(options.port);
  }

  try {
    await waitForServer(`${baseUrl}/tree-impostor-viewer.html`);

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
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
      await page.goto(`${baseUrl}/tree-impostor-viewer.html`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => Boolean(window.__TREE_IMPOSTOR_VIEWER__), null, { timeout: 60_000 });
      await getViewerApi(page);
      await callViewer(page, 'waitUntilReady');

      const runManifest = {
        generatedAt: new Date().toISOString(),
        baseUrl,
        sequences: []
      };

      for (const sequenceId of options.sequences) {
        const sequenceDir = path.join(runDir, sequenceId);
        mkdirSync(sequenceDir, { recursive: true });
        const manifest = await callViewer(page, 'captureSequence', sequenceId);
        const captureBuffers = new Map();

        for (const capture of manifest.captures) {
          await callViewer(page, 'setDebugState', capture.debugState);
          await page.waitForTimeout(40);
          const screenshotBuffer = await page.screenshot({ type: 'png' });
          captureBuffers.set(capture.name, screenshotBuffer);
          writeFileSync(path.join(sequenceDir, `${capture.name}.png`), screenshotBuffer);
          writeFileSync(path.join(sequenceDir, `${capture.name}.json`), `${JSON.stringify(capture.snapshot, null, 2)}\n`, 'utf8');
        }

        const diffPairs = sequenceId === 'mesh_match'
          ? getMeshMatchDiffPairs(manifest.captures)
          : getNeighborDiffPairs(manifest.captures);
        for (const diffPair of diffPairs) {
          const before = captureBuffers.get(diffPair.before);
          const after = captureBuffers.get(diffPair.after);
          if (!before || !after) continue;
          const diffBuffer = await createDiffBuffer(page, before, after);
          writeFileSync(path.join(sequenceDir, `${diffPair.name}.png`), diffBuffer);
        }

        const sequenceManifest = createSequenceManifest(
          sequenceId,
          manifest.captures,
          manifest.summary,
          diffPairs.map((pair) => ({
            name: pair.name,
            before: `${pair.before}.png`,
            after: `${pair.after}.png`,
            diff: `${pair.name}.png`
          }))
        );
        writeFileSync(path.join(sequenceDir, 'manifest.json'), `${JSON.stringify(sequenceManifest, null, 2)}\n`, 'utf8');
        runManifest.sequences.push({
          sequenceId,
          folder: path.relative(runDir, sequenceDir),
          captureCount: manifest.captures.length
        });
      }

      writeFileSync(path.join(runDir, 'run-manifest.json'), `${JSON.stringify(runManifest, null, 2)}\n`, 'utf8');
      console.log(`Wrote tree impostor diagnostic artifacts to ${runDir}`);
    } finally {
      await browser.close();
    }
  } finally {
    if (server) {
      server.kill('SIGTERM');
      await new Promise((resolve) => server.once('exit', resolve));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
