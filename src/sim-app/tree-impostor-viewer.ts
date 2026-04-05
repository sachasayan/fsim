import * as THREE from 'three';

import '../../styles/tree-impostor-viewer.css';
import { getTreeAssetBundle } from '../../js/modules/world/terrain/TreeAssetLoader.ts';
import {
  makeTreeOctahedralDepthMaterial,
  makeTreeOctahedralMaterial
} from '../../js/modules/world/terrain/TerrainMaterials.ts';
import { findWeightedImpostorFrames } from '../../js/modules/world/terrain/TreeImpostorUtils.ts';

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
  | 'backlight';

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

type FrameSelection = {
  primaryIndex: number;
  secondaryIndex: number;
  blend: number;
};

type DebugSnapshot = {
  ready: boolean;
  debugState: DebugState;
  frameSelection: FrameSelection;
  framePairChanged: boolean;
  previousFrameSelection: FrameSelection | null;
  frameTransitionOccurred: boolean;
  frameWeights: Array<{ index: number; weight: number }>;
  sunDirectionWorld: [number, number, number];
  cameraDirectionWorld: [number, number, number];
  cameraPositionWorld: [number, number, number];
  impostorPositionWorld: [number, number, number];
  atlas: {
    frameCount: number;
    gridCols: number;
    gridRows: number;
    atlasWidth: number;
    atlasHeight: number;
    normalSpace: string;
    depthEncoding: string;
    depthRange: { near: number; far: number };
  };
  toggles: Record<string, boolean>;
};

type ViewerPresetId =
  | 'fixed_sun_orbit_camera'
  | 'fixed_camera_rotate_sun'
  | 'frame_frozen_single_frame'
  | 'free_running_frame_selection';

type ViewerSequenceId =
  | 'frame_stability'
  | 'sun_response'
  | 'mesh_match'
  | 'seam_normal_atlas_raw'
  | 'seam_local_normal'
  | 'seam_view_normal';

type SequenceCapture = {
  name: string;
  debugState: DebugState;
  snapshot: DebugSnapshot;
  note?: string;
};

type SequenceSummary = {
  sequenceId: ViewerSequenceId;
  captureCount: number;
  frameTransitionCount: number;
  framePairChangeCount: number;
  maxBlendDelta: number;
  seamTransitionIndices: number[];
};

type SequenceManifest = {
  sequenceId: ViewerSequenceId;
  captures: SequenceCapture[];
  summary: SequenceSummary;
};

declare global {
  interface Window {
    __TREE_IMPOSTOR_VIEWER__?: {
      waitUntilReady: () => Promise<DebugSnapshot>;
      setDebugState: (partial: Partial<DebugState>) => Promise<DebugSnapshot>;
      getDebugState: () => DebugState;
      captureDebugSnapshot: () => DebugSnapshot;
      runCapturePreset: (presetId: ViewerPresetId) => Promise<SequenceCapture>;
      captureSequence: (sequenceId: ViewerSequenceId) => Promise<SequenceManifest>;
      captureComparisonPair: (options?: Partial<DebugState> & {
        preset?: 'frontlit' | 'sidelit' | 'backlit' | 'seam';
      }) => Promise<SequenceManifest>;
    };
  }
}

const DEBUG_MODE_VALUES: Record<DebugMode, number> = {
  lit: 0,
  albedo_only: 1,
  normal_atlas_raw: 2,
  depth_raw: 3,
  frame_dir_a: 4,
  frame_dir_b: 5,
  blend_weight: 6,
  local_normal: 7,
  world_normal: 8,
  view_normal: 9,
  light_dir_view: 10,
  ndotl: 11,
  backlight: 12
};

const defaultState: DebugState = {
  mode: 'lit',
  freezeFrameIndex: -1,
  disableFrameBlend: false,
  flipNormalX: false,
  flipNormalY: false,
  flipNormalZ: false,
  flipFrameDir: false,
  flipLightDir: false,
  flipBasisRight: false,
  flipBasisUp: false,
  disableDepthNormal: false,
  disableAtlasNormal: false,
  representation: 'side-by-side',
  sunYaw: -40,
  sunPitch: 34,
  cameraYaw: 28,
  cameraPitch: 12,
  cameraDistance: 5.8
};

const viewerRoot = document.getElementById('viewer-root');
const statePre = document.getElementById('viewer-state');
if (!(viewerRoot instanceof HTMLDivElement) || !(statePre instanceof HTMLPreElement)) {
  throw new Error('Tree impostor viewer DOM roots are missing.');
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(viewerRoot.clientWidth || window.innerWidth, viewerRoot.clientHeight || window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewerRoot.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10161d);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.position.set(2.8, 2.0, 5.4);

const ambientLight = new THREE.HemisphereLight(0xdbe6f0, 0x22303b, 0.45);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 2.4);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.near = 0.1;
dirLight.shadow.camera.far = 40;
dirLight.shadow.camera.left = -10;
dirLight.shadow.camera.right = 10;
dirLight.shadow.camera.top = 10;
dirLight.shadow.camera.bottom = -10;
scene.add(dirLight);
scene.add(dirLight.target);

const fillLight = new THREE.DirectionalLight(0x9bb6d2, 0.28);
scene.add(fillLight);
scene.add(fillLight.target);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(12, 64),
  new THREE.MeshStandardMaterial({ color: 0x53606e, roughness: 0.98, metalness: 0.0 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.002;
ground.receiveShadow = true;
scene.add(ground);

const backdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(24, 16),
  new THREE.MeshBasicMaterial({ color: 0x16202a })
);
backdrop.position.set(0, 5.5, -9);
scene.add(backdrop);

const grid = new THREE.GridHelper(16, 16, 0x314150, 0x22303b);
grid.position.y = 0.001;
scene.add(grid);

const rootGroup = new THREE.Group();
scene.add(rootGroup);

const meshGroup = new THREE.Group();
meshGroup.name = 'tree-mesh-reference';
rootGroup.add(meshGroup);

const impostorGroup = new THREE.Group();
impostorGroup.name = 'tree-impostor';
rootGroup.add(impostorGroup);

const targetCenter = new THREE.Vector3(0, 0.85, 0);
const cameraDirection = new THREE.Vector3();
const sunDirectionWorld = new THREE.Vector3();
const tempVector = new THREE.Vector3();
const tempSpherical = new THREE.Spherical();

const lightDirUniform = { value: new THREE.Vector3(0.25, 0.85, 0.45).normalize() };
const lightColorUniform = { value: new THREE.Color(0xffffff) };
const lightIntensityUniform = { value: dirLight.intensity };
const mainCameraPosUniform = { value: new THREE.Vector3() };
const debugUniforms = {
  modeUniform: { value: DEBUG_MODE_VALUES.lit },
  freezeFrameIndexUniform: { value: -1 },
  disableFrameBlendUniform: { value: 0 },
  flipNormalXUniform: { value: 0 },
  flipNormalYUniform: { value: 0 },
  flipNormalZUniform: { value: 0 },
  flipFrameDirUniform: { value: 0 },
  flipLightDirUniform: { value: 0 },
  flipBasisRightUniform: { value: 0 },
  flipBasisUpUniform: { value: 0 },
  disableDepthNormalUniform: { value: 0 },
  disableAtlasNormalUniform: { value: 0 }
};

let debugState: DebugState = { ...defaultState };
let bundleMetadata: DebugSnapshot['atlas'] | null = null;
let modelWidthToHeight = 1;
let viewerReady = false;
let resolveReady: ((snapshot: DebugSnapshot) => void) | null = null;
const readyPromise = new Promise<DebugSnapshot>((resolve) => {
  resolveReady = resolve;
});
let previousFrameSelection: FrameSelection | null = null;

let impostorMesh: THREE.InstancedMesh | null = null;
let impostorDepthMaterial: THREE.Material | null = null;

function degToRad(value: number) {
  return value * (Math.PI / 180);
}

function toRoundedTuple(vector: THREE.Vector3): [number, number, number] {
  return [
    Number(vector.x.toFixed(6)),
    Number(vector.y.toFixed(6)),
    Number(vector.z.toFixed(6))
  ];
}

function setInstancedMatrix(mesh: THREE.InstancedMesh, position: THREE.Vector3, scale: THREE.Vector3) {
  const matrix = new THREE.Matrix4().compose(
    position.clone(),
    new THREE.Quaternion(),
    scale.clone()
  );
  mesh.setMatrixAt(0, matrix);
  mesh.instanceMatrix.needsUpdate = true;
}

function updateRepresentationLayout(modelWidthToHeight: number) {
  const sideOffset = 1.7;
  const impostorScale = new THREE.Vector3(modelWidthToHeight, 1, 1);

  if (impostorMesh) {
    impostorMesh.visible = debugState.representation !== 'mesh-only';
  }
  meshGroup.visible = debugState.representation !== 'impostor-only';

  if (debugState.representation === 'side-by-side') {
    meshGroup.position.set(-sideOffset, 0, 0);
    impostorGroup.position.set(sideOffset, 0, 0);
  } else {
    meshGroup.position.set(0, 0, 0);
    impostorGroup.position.set(0, 0, 0);
  }

  if (impostorMesh) {
    tempVector.copy(impostorGroup.position);
    setInstancedMatrix(impostorMesh, tempVector, impostorScale);
  }
}

function applySunAndCamera() {
  tempSpherical.set(
    debugState.cameraDistance,
    Math.PI / 2 - degToRad(debugState.cameraPitch),
    degToRad(debugState.cameraYaw)
  );
  camera.position.setFromSpherical(tempSpherical).add(targetCenter);
  camera.lookAt(targetCenter);
  camera.updateMatrixWorld(true);
  cameraDirection.copy(camera.position).sub(targetCenter).normalize();

  const sunDistance = 9;
  tempSpherical.set(
    sunDistance,
    Math.PI / 2 - degToRad(debugState.sunPitch),
    degToRad(debugState.sunYaw)
  );
  dirLight.position.setFromSpherical(tempSpherical).add(targetCenter);
  dirLight.target.position.copy(targetCenter);
  dirLight.target.updateMatrixWorld();
  fillLight.position.copy(dirLight.position).multiplyScalar(-0.55);
  fillLight.position.y = Math.max(1.5, fillLight.position.y + 1.4);
  fillLight.target.position.copy(targetCenter);
  fillLight.target.updateMatrixWorld();

  sunDirectionWorld.copy(dirLight.position).sub(dirLight.target.position).normalize();
  lightDirUniform.value.copy(sunDirectionWorld);
  lightIntensityUniform.value = dirLight.intensity;
  mainCameraPosUniform.value.copy(camera.position);
}

function applyDebugUniforms() {
  debugUniforms.modeUniform.value = DEBUG_MODE_VALUES[debugState.mode] ?? 0;
  debugUniforms.freezeFrameIndexUniform.value = Number.isFinite(debugState.freezeFrameIndex)
    ? Math.round(debugState.freezeFrameIndex)
    : -1;
  debugUniforms.disableFrameBlendUniform.value = debugState.disableFrameBlend ? 1 : 0;
  debugUniforms.flipNormalXUniform.value = debugState.flipNormalX ? 1 : 0;
  debugUniforms.flipNormalYUniform.value = debugState.flipNormalY ? 1 : 0;
  debugUniforms.flipNormalZUniform.value = debugState.flipNormalZ ? 1 : 0;
  debugUniforms.flipFrameDirUniform.value = debugState.flipFrameDir ? 1 : 0;
  debugUniforms.flipLightDirUniform.value = debugState.flipLightDir ? 1 : 0;
  debugUniforms.flipBasisRightUniform.value = debugState.flipBasisRight ? 1 : 0;
  debugUniforms.flipBasisUpUniform.value = debugState.flipBasisUp ? 1 : 0;
  debugUniforms.disableDepthNormalUniform.value = debugState.disableDepthNormal ? 1 : 0;
  debugUniforms.disableAtlasNormalUniform.value = debugState.disableAtlasNormal ? 1 : 0;
}

function computeFrameSelection(): FrameSelection {
  if (!bundleMetadata) {
    return { primaryIndex: 0, secondaryIndex: 0, blend: 0 };
  }

  const impostorPosition = impostorGroup.position.clone();
  const localViewDirection = camera.position.clone().sub(impostorPosition).normalize();
  let selection = findWeightedImpostorFrames(
    localViewDirection,
    bundleMetadata.gridCols,
    bundleMetadata.gridRows
  );

  if (debugState.freezeFrameIndex >= 0) {
    const frozen = THREE.MathUtils.clamp(Math.round(debugState.freezeFrameIndex), 0, Math.max(0, bundleMetadata.frameCount - 1));
    selection = {
      ...selection,
      primaryIndex: frozen,
      secondaryIndex: frozen,
      blend: 0
    };
  } else if (debugState.disableFrameBlend) {
    selection = {
      ...selection,
      secondaryIndex: selection.primaryIndex,
      blend: 0
    };
  }
  return {
    primaryIndex: selection.primaryIndex,
    secondaryIndex: selection.secondaryIndex,
    blend: selection.blend
  };
}

function cloneFrameSelection(selection: FrameSelection | null): FrameSelection | null {
  if (!selection) return null;
  return {
    primaryIndex: selection.primaryIndex,
    secondaryIndex: selection.secondaryIndex,
    blend: selection.blend
  };
}

function computeDebugSnapshot(recordTransition = true): DebugSnapshot {
  const frameSelection = computeFrameSelection();
  const impostorPosition = impostorGroup.position.clone();
  const localViewDirection = camera.position.clone().sub(impostorPosition).normalize();
  let weightedSelection = bundleMetadata
    ? findWeightedImpostorFrames(localViewDirection, bundleMetadata.gridCols, bundleMetadata.gridRows)
    : {
        frameWeights: [{ index: 0, weight: 1 }],
        primaryIndex: 0,
        secondaryIndex: 0,
        blend: 0
      };
  if (bundleMetadata && debugState.freezeFrameIndex >= 0) {
    const frozen = THREE.MathUtils.clamp(Math.round(debugState.freezeFrameIndex), 0, Math.max(0, bundleMetadata.frameCount - 1));
    weightedSelection = {
      ...weightedSelection,
      frameWeights: [{ index: frozen, weight: 1 }],
      primaryIndex: frozen,
      secondaryIndex: frozen,
      blend: 0
    };
  } else if (debugState.disableFrameBlend) {
    weightedSelection = {
      ...weightedSelection,
      frameWeights: [{ index: weightedSelection.primaryIndex, weight: 1 }],
      secondaryIndex: weightedSelection.primaryIndex,
      blend: 0
    };
  }
  const prior = cloneFrameSelection(previousFrameSelection);
  const frameTransitionOccurred = Boolean(
    prior
    && (
      prior.primaryIndex !== frameSelection.primaryIndex
      || prior.secondaryIndex !== frameSelection.secondaryIndex
      || Math.abs(prior.blend - frameSelection.blend) > 1e-5
    )
  );
  const framePairChanged = Boolean(
    prior
    && !(
      (prior.primaryIndex === frameSelection.primaryIndex && prior.secondaryIndex === frameSelection.secondaryIndex)
      || (prior.primaryIndex === frameSelection.secondaryIndex && prior.secondaryIndex === frameSelection.primaryIndex)
    )
  );
  if (recordTransition) {
    previousFrameSelection = cloneFrameSelection(frameSelection);
  }
  return {
    ready: viewerReady,
    debugState: { ...debugState },
    frameSelection,
    framePairChanged,
    previousFrameSelection: prior,
    frameTransitionOccurred,
    frameWeights: weightedSelection.frameWeights.map((entry) => ({
      index: entry.index,
      weight: Number(entry.weight.toFixed(6))
    })),
    sunDirectionWorld: toRoundedTuple(sunDirectionWorld),
    cameraDirectionWorld: toRoundedTuple(cameraDirection),
    cameraPositionWorld: toRoundedTuple(camera.position),
    impostorPositionWorld: toRoundedTuple(impostorPosition),
    atlas: bundleMetadata || {
      frameCount: 0,
      gridCols: 0,
      gridRows: 0,
      atlasWidth: 0,
      atlasHeight: 0,
      normalSpace: 'frame-local',
      depthEncoding: 'orthographic-normalized',
      depthRange: { near: 0, far: 1 }
    },
    toggles: {
      flipNormalX: debugState.flipNormalX,
      flipNormalY: debugState.flipNormalY,
      flipNormalZ: debugState.flipNormalZ,
      flipFrameDir: debugState.flipFrameDir,
      flipLightDir: debugState.flipLightDir,
      flipBasisRight: debugState.flipBasisRight,
      flipBasisUp: debugState.flipBasisUp,
      disableDepthNormal: debugState.disableDepthNormal,
      disableAtlasNormal: debugState.disableAtlasNormal
    }
  };
}

function captureDebugSnapshot(): DebugSnapshot {
  return computeDebugSnapshot(true);
}

function updateOverlay() {
  const snapshot = computeDebugSnapshot(false);
  statePre.textContent = JSON.stringify(snapshot, null, 2);
}

function render() {
  applySunAndCamera();
  applyDebugUniforms();
  updateOverlay();
  renderer.render(scene, camera);
}

function requestRender() {
  render();
}

function normalizeState(partial: Partial<DebugState>): DebugState {
  const next: DebugState = { ...debugState, ...partial };
  const validMode = Object.prototype.hasOwnProperty.call(DEBUG_MODE_VALUES, next.mode) ? next.mode : 'lit';
  const validRepresentation: RepresentationMode[] = ['mesh-only', 'impostor-only', 'side-by-side', 'overlay'];
  next.mode = validMode;
  next.representation = validRepresentation.includes(next.representation) ? next.representation : 'side-by-side';
  next.freezeFrameIndex = Number.isFinite(next.freezeFrameIndex) ? Math.round(next.freezeFrameIndex) : -1;
  next.cameraDistance = THREE.MathUtils.clamp(Number(next.cameraDistance) || defaultState.cameraDistance, 2, 16);
  next.cameraPitch = THREE.MathUtils.clamp(Number(next.cameraPitch) || 0, -80, 80);
  next.cameraYaw = Number(next.cameraYaw) || 0;
  next.sunPitch = THREE.MathUtils.clamp(Number(next.sunPitch) || 0, -80, 80);
  next.sunYaw = Number(next.sunYaw) || 0;
  return next;
}

function resetFrameTracking() {
  previousFrameSelection = null;
}

function getPresetState(presetId: ViewerPresetId): Partial<DebugState> {
  switch (presetId) {
    case 'fixed_sun_orbit_camera':
      return {
        mode: 'lit',
        representation: 'impostor-only',
        freezeFrameIndex: -1,
        disableFrameBlend: false,
        sunYaw: -40,
        sunPitch: 34,
        cameraPitch: 12,
        cameraDistance: 5.8
      };
    case 'fixed_camera_rotate_sun':
      return {
        mode: 'lit',
        representation: 'impostor-only',
        freezeFrameIndex: -1,
        disableFrameBlend: false,
        cameraYaw: 28,
        cameraPitch: 12,
        cameraDistance: 5.8
      };
    case 'frame_frozen_single_frame':
      return {
        mode: 'lit',
        representation: 'impostor-only',
        freezeFrameIndex: 0,
        disableFrameBlend: true,
        sunYaw: -40,
        sunPitch: 34,
        cameraYaw: 28,
        cameraPitch: 12,
        cameraDistance: 5.8
      };
    case 'free_running_frame_selection':
    default:
      return {
        mode: 'lit',
        representation: 'impostor-only',
        freezeFrameIndex: -1,
        disableFrameBlend: false,
        sunYaw: -40,
        sunPitch: 34,
        cameraYaw: 28,
        cameraPitch: 12,
        cameraDistance: 5.8
      };
  }
}

async function applyStateForCapture(partial: Partial<DebugState>) {
  debugState = normalizeState(partial);
  updateRepresentationLayout(modelWidthToHeight);
  requestRender();
  return captureDebugSnapshot();
}

async function runCapturePreset(presetId: ViewerPresetId): Promise<SequenceCapture> {
  resetFrameTracking();
  const state = normalizeState({ ...debugState, ...getPresetState(presetId) });
  const snapshot = await applyStateForCapture(state);
  return {
    name: presetId,
    debugState: { ...state },
    snapshot
  };
}

function summarizeCaptures(sequenceId: ViewerSequenceId, captures: SequenceCapture[]): SequenceSummary {
  let frameTransitionCount = 0;
  let framePairChangeCount = 0;
  let maxBlendDelta = 0;
  const seamTransitionIndices: number[] = [];
  for (let index = 0; index < captures.length; index += 1) {
    const capture = captures[index];
    if (capture.snapshot.frameTransitionOccurred) {
      frameTransitionCount += 1;
      seamTransitionIndices.push(index);
    }
    if (capture.snapshot.framePairChanged) {
      framePairChangeCount += 1;
    }
    if (index > 0) {
      const prevBlend = captures[index - 1]?.snapshot.frameSelection.blend ?? 0;
      const blendDelta = Math.abs(capture.snapshot.frameSelection.blend - prevBlend);
      maxBlendDelta = Math.max(maxBlendDelta, blendDelta);
    }
  }
  return {
    sequenceId,
    captureCount: captures.length,
    frameTransitionCount,
    framePairChangeCount,
    maxBlendDelta: Number(maxBlendDelta.toFixed(6)),
    seamTransitionIndices
  };
}

async function captureStates(sequenceId: ViewerSequenceId, states: Array<{ name: string; state: Partial<DebugState>; note?: string }>) {
  resetFrameTracking();
  const captures: SequenceCapture[] = [];
  for (const entry of states) {
    const normalized = normalizeState({ ...debugState, ...entry.state });
    const snapshot = await applyStateForCapture(normalized);
    captures.push({
      name: entry.name,
      debugState: { ...normalized },
      snapshot,
      note: entry.note
    });
  }
  return {
    sequenceId,
    captures,
    summary: summarizeCaptures(sequenceId, captures)
  } satisfies SequenceManifest;
}

async function captureSequence(sequenceId: ViewerSequenceId): Promise<SequenceManifest> {
  const base = { ...defaultState };
  if (sequenceId === 'frame_stability') {
    const states = [];
    for (let cameraYaw = -20; cameraYaw <= 100; cameraYaw += 4) {
      states.push({
        name: `frame-stability_camYaw_${String(cameraYaw).padStart(3, '0')}`,
        state: {
          ...base,
          representation: 'impostor-only',
          mode: 'lit',
          freezeFrameIndex: -1,
          disableFrameBlend: false,
          sunYaw: -40,
          sunPitch: 34,
          cameraYaw,
          cameraPitch: 12,
          cameraDistance: 5.8
        }
      });
    }
    return captureStates(sequenceId, states);
  }
  if (sequenceId === 'sun_response') {
    const states = [];
    for (const [sunYaw, sunPitch] of [
      [-110, 28],
      [-80, 28],
      [-50, 30],
      [-20, 32],
      [10, 34],
      [40, 34],
      [70, 30]
    ]) {
      states.push({
        name: `sun-response_sunYaw_${String(sunYaw).padStart(4, '0')}_sunPitch_${String(sunPitch).padStart(2, '0')}`,
        state: {
          ...base,
          representation: 'impostor-only',
          mode: 'lit',
          freezeFrameIndex: -1,
          disableFrameBlend: false,
          cameraYaw: 28,
          cameraPitch: 12,
          cameraDistance: 5.8,
          sunYaw,
          sunPitch
        }
      });
    }
    return captureStates(sequenceId, states);
  }
  if (sequenceId === 'seam_normal_atlas_raw' || sequenceId === 'seam_local_normal' || sequenceId === 'seam_view_normal') {
    const mode =
      sequenceId === 'seam_normal_atlas_raw'
        ? 'normal_atlas_raw'
        : sequenceId === 'seam_local_normal'
          ? 'local_normal'
          : 'view_normal';
    const states = [40, 44, 48, 88, 92].map((cameraYaw) => ({
      name: `${sequenceId}_camYaw_${String(cameraYaw).padStart(3, '0')}`,
      state: {
        ...base,
        representation: 'impostor-only',
        mode,
        freezeFrameIndex: -1,
        disableFrameBlend: false,
        cameraYaw,
        cameraPitch: 12,
        cameraDistance: 5.8,
        sunYaw: -40,
        sunPitch: 34
      }
    }));
    return captureStates(sequenceId, states);
  }

  const states = [
    {
      name: 'mesh-match_frontlit_mesh',
      state: { ...base, representation: 'mesh-only', mode: 'lit', cameraYaw: 28, cameraPitch: 12, cameraDistance: 5.8, sunYaw: -40, sunPitch: 34 }
    },
    {
      name: 'mesh-match_frontlit_impostor',
      state: { ...base, representation: 'impostor-only', mode: 'lit', cameraYaw: 28, cameraPitch: 12, cameraDistance: 5.8, sunYaw: -40, sunPitch: 34 }
    },
    {
      name: 'mesh-match_sidelit_mesh',
      state: { ...base, representation: 'mesh-only', mode: 'lit', cameraYaw: 24, cameraPitch: 12, cameraDistance: 5.8, sunYaw: 28, sunPitch: 30 }
    },
    {
      name: 'mesh-match_sidelit_impostor',
      state: { ...base, representation: 'impostor-only', mode: 'lit', cameraYaw: 24, cameraPitch: 12, cameraDistance: 5.8, sunYaw: 28, sunPitch: 30 }
    },
    {
      name: 'mesh-match_backlit_mesh',
      state: { ...base, representation: 'mesh-only', mode: 'lit', cameraYaw: 28, cameraPitch: 12, cameraDistance: 5.8, sunYaw: 145, sunPitch: 28 }
    },
    {
      name: 'mesh-match_backlit_impostor',
      state: { ...base, representation: 'impostor-only', mode: 'lit', cameraYaw: 28, cameraPitch: 12, cameraDistance: 5.8, sunYaw: 145, sunPitch: 28 }
    },
    {
      name: 'mesh-match_seam_mesh',
      state: { ...base, representation: 'mesh-only', mode: 'lit', cameraYaw: 44, cameraPitch: 12, cameraDistance: 5.8, sunYaw: -40, sunPitch: 34 }
    },
    {
      name: 'mesh-match_seam_impostor',
      state: { ...base, representation: 'impostor-only', mode: 'lit', cameraYaw: 44, cameraPitch: 12, cameraDistance: 5.8, sunYaw: -40, sunPitch: 34 }
    }
  ];
  return captureStates(sequenceId, states);
}

async function captureComparisonPair(options: Partial<DebugState> & { preset?: 'frontlit' | 'sidelit' | 'backlit' | 'seam' } = {}): Promise<SequenceManifest> {
  const preset = options.preset || 'frontlit';
  const shared =
    preset === 'sidelit'
      ? { cameraYaw: 24, cameraPitch: 12, cameraDistance: 5.8, sunYaw: 28, sunPitch: 30 }
      : preset === 'backlit'
        ? { cameraYaw: 28, cameraPitch: 12, cameraDistance: 5.8, sunYaw: 145, sunPitch: 28 }
        : preset === 'seam'
          ? { cameraYaw: 44, cameraPitch: 12, cameraDistance: 5.8, sunYaw: -40, sunPitch: 34 }
          : { cameraYaw: 28, cameraPitch: 12, cameraDistance: 5.8, sunYaw: -40, sunPitch: 34 };
  const states = [
    {
      name: `comparison_${preset}_mesh`,
      state: { ...defaultState, ...shared, ...options, representation: 'mesh-only', mode: options.mode || 'lit' }
    },
    {
      name: `comparison_${preset}_impostor`,
      state: { ...defaultState, ...shared, ...options, representation: 'impostor-only', mode: options.mode || 'lit' }
    }
  ];
  return captureStates('mesh_match', states);
}

function resizeRenderer() {
  const width = viewerRoot.clientWidth || window.innerWidth;
  const height = viewerRoot.clientHeight || window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
  requestRender();
}

async function initialize() {
  const bundle = await getTreeAssetBundle();

  bundleMetadata = {
    frameCount: Math.max(1, Number(bundle.impostor.metadata?.frameCount) || bundle.impostor.metadata?.directions?.length || 1),
    gridCols: Math.max(1, Number(bundle.impostor.metadata?.grid?.cols) || 1),
    gridRows: Math.max(1, Number(bundle.impostor.metadata?.grid?.rows) || 1),
    atlasWidth: Math.max(1, Number(bundle.impostor.metadata?.atlasWidth) || 1),
    atlasHeight: Math.max(1, Number(bundle.impostor.metadata?.atlasHeight) || 1),
    normalSpace: bundle.impostor.metadata?.normalSpace || 'frame-local',
    depthEncoding: bundle.impostor.metadata?.depthEncoding || 'orthographic-normalized',
    depthRange: {
      near: Number(bundle.impostor.metadata?.depthRange?.near) || 0,
      far: Number(bundle.impostor.metadata?.depthRange?.far) || 1
    },
    ...(bundle.impostor.metadata as any)
  };
  modelWidthToHeight = Math.max(0.2, bundle.modelMetrics.width / Math.max(bundle.modelMetrics.height, 1e-4));

  for (const part of bundle.meshParts) {
    const mesh = new THREE.Mesh(part.geometry, part.material);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    meshGroup.add(mesh);
  }

  const impostorGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  impostorGeometry.translate(0, 0.5, 0);
  const impostorMaterial = makeTreeOctahedralMaterial(
    bundle.impostor.albedoTexture,
    bundle.impostor.normalTexture,
    bundle.impostor.depthTexture,
    bundle.impostor.metadata,
    {
      lightDirUniform,
      lightColorUniform,
      lightIntensityUniform,
      depthTexture: bundle.impostor.depthTexture
    },
    debugUniforms
  );
  impostorDepthMaterial = makeTreeOctahedralDepthMaterial(
    bundle.impostor.albedoTexture,
    bundle.impostor.depthTexture,
    mainCameraPosUniform,
    lightDirUniform,
    bundle.impostor.metadata,
    { shadowFadeNear: 10_000, shadowFadeFar: 12_000 }
  );
  impostorMesh = new THREE.InstancedMesh(impostorGeometry, impostorMaterial, 1);
  impostorMesh.castShadow = true;
  impostorMesh.receiveShadow = false;
  impostorMesh.customDepthMaterial = impostorDepthMaterial;
  impostorMesh.setColorAt(0, new THREE.Color(0xffffff));
  impostorMesh.instanceColor!.needsUpdate = true;
  impostorGroup.add(impostorMesh);

  updateRepresentationLayout(modelWidthToHeight);
  applySunAndCamera();
  applyDebugUniforms();
  viewerReady = true;
  requestRender();
  resolveReady?.(captureDebugSnapshot());
}

window.addEventListener('resize', resizeRenderer);

window.__TREE_IMPOSTOR_VIEWER__ = {
  waitUntilReady: async () => readyPromise,
  async setDebugState(partial: Partial<DebugState>) {
    return applyStateForCapture(partial);
  },
  getDebugState() {
    return { ...debugState };
  },
  captureDebugSnapshot,
  runCapturePreset,
  captureSequence,
  captureComparisonPair
};

initialize().catch((error) => {
  statePre.textContent = `Viewer failed to initialize:\n${error instanceof Error ? error.stack || error.message : String(error)}`;
  throw error;
});
