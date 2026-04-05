import { mkdirSync, writeFileSync } from 'node:fs';

import { expect, test } from 'playwright/test';

type DebugMode =
  | 'lit'
  | 'albedo_only'
  | 'normal_atlas_raw'
  | 'depth_raw'
  | 'frame_dir_a'
  | 'frame_dir_b'
  | 'blend_weight'
  | 'local_normal'
  | 'world_normal'
  | 'view_normal'
  | 'light_dir_view'
  | 'ndotl'
  | 'backlight'
  | 'selected_frame_id'
  | 'atlas_tile_preview'
  | 'atlas_tile_pair_preview'
  | 'frame_direction_world'
  | 'camera_direction_local'
  | 'encoded_octahedral_uv'
  | 'frame_grid_overlay';

type RepresentationMode = 'mesh-only' | 'impostor-only' | 'side-by-side' | 'overlay';

type DebugState = {
  mode: DebugMode;
  freezeFrameIndex: number;
  disableFrameBlend: boolean;
  flipNormalX: boolean;
  flipNormalY: boolean;
  flipNormalZ: boolean;
  flipFrameDir: boolean;
  flipLightDir: boolean;
  flipBasisRight: boolean;
  flipBasisUp: boolean;
  disableDepthNormal: boolean;
  disableAtlasNormal: boolean;
  representation: RepresentationMode;
  sunYaw: number;
  sunPitch: number;
  cameraYaw: number;
  cameraPitch: number;
  cameraDistance: number;
};

type DebugSnapshot = {
  ready: boolean;
  debugState: DebugState;
  primaryIndex: number;
  secondaryIndex: number;
  frameSelection: {
    primaryIndex: number;
    secondaryIndex: number;
    blend: number;
  };
  framePairChanged: boolean;
  previousFrameSelection: {
    primaryIndex: number;
    secondaryIndex: number;
    blend: number;
  } | null;
  frameTransitionOccurred: boolean;
  frameWeights: Array<{ index: number; weight: number }>;
  cameraDirectionLocal: [number, number, number];
  encodedOctUv: [number, number];
  selectedFrameDirections: Array<{
    index: number;
    weight: number;
    direction: [number, number, number];
  }>;
  atlas: {
    frameCount: number;
    gridCols: number;
    gridRows: number;
    directions?: Array<[number, number, number]>;
  };
};

type SequenceCapture = {
  name: string;
  debugState: DebugState;
  snapshot: DebugSnapshot;
  note?: string;
};

type SequenceManifest = {
  sequenceId:
    | 'frame_stability'
    | 'sun_response'
    | 'mesh_match'
    | 'seam_normal_atlas_raw'
    | 'seam_local_normal'
    | 'seam_view_normal'
    | 'selector_cardinals'
    | 'selector_stability'
    | 'selector_seam_probe'
    | 'selector_silhouette_compare';
  captures: SequenceCapture[];
  summary: {
    sequenceId: SequenceManifest['sequenceId'];
    captureCount: number;
    frameTransitionCount: number;
    framePairChangeCount: number;
    maxBlendDelta: number;
    seamTransitionIndices: number[];
  };
};

type ViewerWindow = Window & {
  __TREE_IMPOSTOR_VIEWER__?: {
    waitUntilReady: () => Promise<DebugSnapshot>;
    setDebugState: (partial: Partial<DebugState>) => Promise<DebugSnapshot>;
    getDebugState: () => DebugState;
    captureDebugSnapshot: () => DebugSnapshot;
    captureSelectorSnapshot: () => DebugSnapshot;
    runCapturePreset: (presetId: string) => Promise<SequenceCapture>;
    captureSequence: (sequenceId: SequenceManifest['sequenceId']) => Promise<SequenceManifest>;
    captureFrameSelectionSweep: (sequenceId: 'selector_cardinals' | 'selector_stability' | 'selector_seam_probe' | 'selector_silhouette_compare') => Promise<SequenceManifest>;
    captureAtlasSelectionPair: (options?: Partial<DebugState> & {
      preset?: 'front' | 'back' | 'left' | 'right' | 'elevated-front' | 'elevated-side' | 'top-down' | 'seam';
    }) => Promise<SequenceManifest>;
    captureComparisonPair: (options?: Partial<DebugState> & {
      preset?: 'frontlit' | 'sidelit' | 'backlit' | 'seam';
    }) => Promise<SequenceManifest>;
  };
};

async function gotoViewer(page: import('playwright/test').Page) {
  await page.goto('/tree-impostor-viewer.html');
  await page.waitForFunction(() => Boolean((window as ViewerWindow).__TREE_IMPOSTOR_VIEWER__), null, { timeout: 60_000 });
  await page.evaluate(async () => {
    const viewer = (window as ViewerWindow).__TREE_IMPOSTOR_VIEWER__;
    if (!viewer) throw new Error('Viewer API is unavailable.');
    await viewer.waitUntilReady();
  });
}

async function setDebugState(page: import('playwright/test').Page, partial: Partial<DebugState>) {
  return page.evaluate(async (nextState) => {
    const viewer = (window as ViewerWindow).__TREE_IMPOSTOR_VIEWER__;
    if (!viewer) throw new Error('Viewer API is unavailable.');
    return viewer.setDebugState(nextState);
  }, partial);
}

async function captureSnapshot(page: import('playwright/test').Page) {
  return page.evaluate(() => {
    const viewer = (window as ViewerWindow).__TREE_IMPOSTOR_VIEWER__;
    if (!viewer) throw new Error('Viewer API is unavailable.');
    return viewer.captureDebugSnapshot();
  });
}

async function writeCaptureArtifacts(
  page: import('playwright/test').Page,
  testInfo: import('playwright/test').TestInfo,
  folderName: string,
  artifactName: string
) {
  const outputDir = testInfo.outputPath(folderName);
  mkdirSync(outputDir, { recursive: true });
  const screenshotPath = `${outputDir}/${artifactName}.png`;
  const snapshot = await captureSnapshot(page);
  writeFileSync(`${outputDir}/${artifactName}.json`, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await page.screenshot({ path: screenshotPath });
  await testInfo.attach(`${folderName}-${artifactName}-json`, {
    body: JSON.stringify(snapshot, null, 2),
    contentType: 'application/json'
  });
  await testInfo.attach(`${folderName}-${artifactName}-png`, {
    path: screenshotPath,
    contentType: 'image/png'
  });
}

test.describe.serial('tree impostor debug viewer', () => {
  test('viewer loads and exposes deterministic debug controls', async ({ page }) => {
    await gotoViewer(page);

    const snapshot = await captureSnapshot(page);
    expect(snapshot.ready).toBe(true);
    expect(snapshot.atlas.frameCount).toBeGreaterThan(0);
    expect(snapshot.atlas.gridCols).toBeGreaterThan(0);
    expect(snapshot.selectedFrameDirections.length).toBeGreaterThan(0);

    const frozen = await setDebugState(page, {
      mode: 'atlas_tile_pair_preview',
      freezeFrameIndex: 3,
      disableFrameBlend: true,
      representation: 'impostor-only'
    });
    expect(frozen.debugState.mode).toBe('atlas_tile_pair_preview');
    expect(frozen.frameSelection.primaryIndex).toBe(3);
    expect(frozen.frameSelection.secondaryIndex).toBe(3);
    expect(frozen.frameSelection.blend).toBe(0);
    expect(frozen.primaryIndex).toBe(3);
    expect(frozen.secondaryIndex).toBe(3);
    expect(frozen.encodedOctUv).toHaveLength(2);

    const selectorSnapshot = await page.evaluate(() => {
      const viewer = (window as ViewerWindow).__TREE_IMPOSTOR_VIEWER__;
      if (!viewer) throw new Error('Viewer API is unavailable.');
      return viewer.captureSelectorSnapshot();
    });
    expect(selectorSnapshot.selectedFrameDirections.length).toBeGreaterThan(0);
    expect(selectorSnapshot.cameraDirectionLocal).toHaveLength(3);
  });

  test('returns deterministic preset and sequence manifests', async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await gotoViewer(page);

    const preset = await page.evaluate(async () => {
      const viewer = (window as ViewerWindow).__TREE_IMPOSTOR_VIEWER__;
      if (!viewer) throw new Error('Viewer API is unavailable.');
      return viewer.runCapturePreset('frame_frozen_single_frame');
    });
    expect(preset.snapshot.frameSelection.primaryIndex).toBe(0);
    expect(preset.snapshot.frameSelection.secondaryIndex).toBe(0);
    expect(preset.snapshot.frameSelection.blend).toBe(0);

    const frameStability = await page.evaluate(async () => {
      const viewer = (window as ViewerWindow).__TREE_IMPOSTOR_VIEWER__;
      if (!viewer) throw new Error('Viewer API is unavailable.');
      return viewer.captureSequence('frame_stability');
    });
    expect(frameStability.captures.length).toBeGreaterThan(10);
    expect(frameStability.summary.captureCount).toBe(frameStability.captures.length);
    expect(frameStability.summary.sequenceId).toBe('frame_stability');
    for (const capture of frameStability.captures) {
      expect(Number.isFinite(capture.snapshot.frameSelection.blend)).toBe(true);
    }

    const seamNormals = await page.evaluate(async () => {
      const viewer = (window as ViewerWindow).__TREE_IMPOSTOR_VIEWER__;
      if (!viewer) throw new Error('Viewer API is unavailable.');
      return viewer.captureSequence('seam_normal_atlas_raw');
    });
    expect(seamNormals.captures.length).toBe(5);
    expect(seamNormals.summary.sequenceId).toBe('seam_normal_atlas_raw');

    const selectorCardinals = await page.evaluate(async () => {
      const viewer = (window as ViewerWindow).__TREE_IMPOSTOR_VIEWER__;
      if (!viewer) throw new Error('Viewer API is unavailable.');
      return viewer.captureFrameSelectionSweep('selector_cardinals');
    });
    expect(selectorCardinals.captures.length).toBe(7);
    expect(selectorCardinals.summary.sequenceId).toBe('selector_cardinals');

    const selectorStability = await page.evaluate(async () => {
      const viewer = (window as ViewerWindow).__TREE_IMPOSTOR_VIEWER__;
      if (!viewer) throw new Error('Viewer API is unavailable.');
      return viewer.captureSequence('selector_stability');
    });
    expect(selectorStability.captures.length).toBeGreaterThan(10);
    expect(selectorStability.summary.framePairChangeCount).toBeGreaterThan(0);

    const selectorSilhouette = await page.evaluate(async () => {
      const viewer = (window as ViewerWindow).__TREE_IMPOSTOR_VIEWER__;
      if (!viewer) throw new Error('Viewer API is unavailable.');
      return viewer.captureFrameSelectionSweep('selector_silhouette_compare');
    });
    expect(selectorSilhouette.captures.length).toBe(6);

    const atlasPair = await page.evaluate(async () => {
      const viewer = (window as ViewerWindow).__TREE_IMPOSTOR_VIEWER__;
      if (!viewer) throw new Error('Viewer API is unavailable.');
      return viewer.captureAtlasSelectionPair({ preset: 'right' });
    });
    expect(atlasPair.captures).toHaveLength(2);

    const comparison = await page.evaluate(async () => {
      const viewer = (window as ViewerWindow).__TREE_IMPOSTOR_VIEWER__;
      if (!viewer) throw new Error('Viewer API is unavailable.');
      return viewer.captureComparisonPair({ preset: 'frontlit' });
    });
    expect(comparison.captures).toHaveLength(2);
    expect(comparison.captures[0]?.name).toContain('mesh');
    expect(comparison.captures[1]?.name).toContain('impostor');

    mkdirSync(testInfo.outputPath('viewer-sequence-sanity'), { recursive: true });
    writeFileSync(
      testInfo.outputPath('viewer-sequence-sanity/frame_stability.json'),
      `${JSON.stringify(frameStability, null, 2)}\n`,
      'utf8'
    );
    await writeCaptureArtifacts(page, testInfo, 'viewer-sequence-sanity', 'frontlit-comparison-current-view');
  });
});
