import * as THREE from 'three';

import '../../styles/tree-impostor-viewer.css';
import { getTreeAssetBundle } from '../../js/modules/world/terrain/TreeAssetLoader.ts';
import {
  makeTreeOctahedralDepthMaterial,
  makeTreeOctahedralMaterial
} from '../../js/modules/world/terrain/TerrainMaterials.ts';
import {
  encodeOctahedralDirection,
  findWeightedImpostorFrames
} from '../../js/modules/world/terrain/TreeImpostorUtils.ts';

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

type FrameSelection = {
  primaryIndex: number;
  secondaryIndex: number;
  blend: number;
};

type DebugSnapshot = {
  ready: boolean;
  debugState: DebugState;
  primaryIndex: number;
  secondaryIndex: number;
  frameSelection: FrameSelection;
  framePairChanged: boolean;
  previousFrameSelection: FrameSelection | null;
  frameTransitionOccurred: boolean;
  frameWeights: Array<{ index: number; weight: number }>;
  cameraDirectionLocal: [number, number, number];
  sunDirectionWorld: [number, number, number];
  cameraDirectionWorld: [number, number, number];
  cameraPositionWorld: [number, number, number];
  impostorPositionWorld: [number, number, number];
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
    atlasWidth: number;
    atlasHeight: number;
    normalSpace: string;
    depthEncoding: string;
    depthRange: { near: number; far: number };
    captureOrthoScale?: number;
    contentRect?: { x: number; y: number; width: number; height: number };
    visibleWidthRatio?: number;
    visibleHeightRatio?: number;
    padding?: { left: number; right: number; top: number; bottom: number };
    viewBlendMode?: string;
    directions?: Array<[number, number, number]>;
    frameBands?: Array<'horizon' | 'elevated' | 'high-cardinal'>;
    elevatedThreshold?: number;
    highCardinalThreshold?: number;
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
  | 'seam_view_normal'
  | 'selector_cardinals'
  | 'selector_stability'
  | 'selector_seam_probe'
  | 'selector_silhouette_compare';

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
      captureSelectorSnapshot: () => DebugSnapshot;
      runCapturePreset: (presetId: ViewerPresetId) => Promise<SequenceCapture>;
      captureSequence: (sequenceId: ViewerSequenceId) => Promise<SequenceManifest>;
      captureFrameSelectionSweep: (sequenceId: Extract<ViewerSequenceId, 'selector_cardinals' | 'selector_stability' | 'selector_seam_probe' | 'selector_silhouette_compare'>) => Promise<SequenceManifest>;
      captureAtlasSelectionPair: (options?: Partial<DebugState> & {
        preset?: 'front' | 'back' | 'left' | 'right' | 'elevated-front' | 'elevated-side' | 'top-down' | 'seam';
      }) => Promise<SequenceManifest>;
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
  backlight: 12,
  selected_frame_id: 0,
  atlas_tile_preview: 0,
  atlas_tile_pair_preview: 0,
  frame_direction_world: 0,
  camera_direction_local: 0,
  encoded_octahedral_uv: 0,
  frame_grid_overlay: 0
};

const searchParams = new URLSearchParams(window.location.search);
const viewerAssetName = searchParams.get('asset') || 'tree-1';
const viewerModelUrl = searchParams.get('modelUrl')
  || `/world/assets/decimated/scenery/${viewerAssetName}.glb`;
const viewerImpostorBaseUrl = searchParams.get('impostorBaseUrl')
  || `/world/impostors/${viewerAssetName}`;

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
const atlasGridCanvas = document.getElementById('viewer-atlas-grid');
const primaryTileCanvas = document.getElementById('viewer-tile-primary');
const secondaryTileCanvas = document.getElementById('viewer-tile-secondary');
if (
  !(viewerRoot instanceof HTMLDivElement)
  || !(statePre instanceof HTMLPreElement)
  || !(atlasGridCanvas instanceof HTMLCanvasElement)
  || !(primaryTileCanvas instanceof HTMLCanvasElement)
  || !(secondaryTileCanvas instanceof HTMLCanvasElement)
) {
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
let bundleSelectionConfig: {
  directions: THREE.Vector3[];
  frameBands: Array<'horizon' | 'elevated' | 'high-cardinal'>;
  viewBlendMode: string;
  elevatedThreshold: number;
  highCardinalThreshold: number;
} | null = null;
let modelWidthToHeight = 1;
let viewerReady = false;
let resolveReady: ((snapshot: DebugSnapshot) => void) | null = null;
const readyPromise = new Promise<DebugSnapshot>((resolve) => {
  resolveReady = resolve;
});
let previousFrameSelection: FrameSelection | null = null;

let impostorMesh: THREE.InstancedMesh | null = null;
let impostorDepthMaterial: THREE.Material | null = null;
let atlasAlbedoSource: CanvasImageSource | null = null;

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

function toRoundedPair(vector: THREE.Vector2): [number, number] {
  return [
    Number(vector.x.toFixed(6)),
    Number(vector.y.toFixed(6))
  ];
}

function roundDirectionTuple(direction: THREE.Vector3 | [number, number, number] | { x?: number; y?: number; z?: number } | undefined): [number, number, number] {
  const x = direction instanceof THREE.Vector3 ? direction.x : Array.isArray(direction) ? direction[0] || 0 : direction?.x || 0;
  const y = direction instanceof THREE.Vector3 ? direction.y : Array.isArray(direction) ? direction[1] || 0 : direction?.y || 0;
  const z = direction instanceof THREE.Vector3 ? direction.z : Array.isArray(direction) ? direction[2] || 0 : direction?.z || 0;
  return [
    Number(x.toFixed(6)),
    Number(y.toFixed(6)),
    Number(z.toFixed(6))
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

function computeLocalCameraDirection() {
  const impostorPosition = impostorGroup.position.clone();
  return camera.position.clone().sub(impostorPosition).normalize();
}

function computeFrameSelection(): FrameSelection {
  if (!bundleMetadata || !bundleSelectionConfig) {
    return { primaryIndex: 0, secondaryIndex: 0, blend: 0 };
  }

  const localViewDirection = computeLocalCameraDirection();
  let selection = findWeightedImpostorFrames(localViewDirection, bundleSelectionConfig);

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
  const localViewDirection = computeLocalCameraDirection();
  let weightedSelection = bundleSelectionConfig
    ? findWeightedImpostorFrames(localViewDirection, bundleSelectionConfig)
    : {
        frameWeights: [{ index: 0, weight: 1 }],
        primaryIndex: 0,
        secondaryIndex: 0,
        blend: 0,
        encodedUv: new THREE.Vector2(0.5, 0.5)
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
  const selectedFrameDirections = weightedSelection.frameWeights.map((entry) => {
    const direction = bundleMetadata?.directions?.[entry.index] || [0, 1, 0];
    return {
      index: entry.index,
      weight: Number(entry.weight.toFixed(6)),
      direction
    };
  });
  return {
    ready: viewerReady,
    debugState: { ...debugState },
    primaryIndex: frameSelection.primaryIndex,
    secondaryIndex: frameSelection.secondaryIndex,
    frameSelection,
    framePairChanged,
    previousFrameSelection: prior,
    frameTransitionOccurred,
    frameWeights: weightedSelection.frameWeights.map((entry) => ({
      index: entry.index,
      weight: Number(entry.weight.toFixed(6))
    })),
    cameraDirectionLocal: toRoundedTuple(localViewDirection),
    sunDirectionWorld: toRoundedTuple(sunDirectionWorld),
    cameraDirectionWorld: toRoundedTuple(cameraDirection),
    cameraPositionWorld: toRoundedTuple(camera.position),
    impostorPositionWorld: toRoundedTuple(impostorPosition),
    encodedOctUv: toRoundedPair(weightedSelection.encodedUv || encodeOctahedralDirection(localViewDirection)),
    selectedFrameDirections,
    atlas: bundleMetadata || {
      frameCount: 0,
      gridCols: 0,
      gridRows: 0,
      atlasWidth: 0,
      atlasHeight: 0,
      normalSpace: 'frame-local',
      depthEncoding: 'orthographic-normalized',
      depthRange: { near: 0, far: 1 },
      captureOrthoScale: 1,
      contentRect: { x: 0, y: 0, width: 1, height: 1 },
      visibleWidthRatio: 1,
      visibleHeightRatio: 1,
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
      directions: [],
      frameBands: [],
      elevatedThreshold: 0.52,
      highCardinalThreshold: 0.82,
      viewBlendMode: 'direction-weighted'
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

function captureSelectorSnapshot(): DebugSnapshot {
  return computeDebugSnapshot(false);
}

function drawTilePreview(
  canvas: HTMLCanvasElement,
  frameIndex: number,
  weight: number,
  direction: [number, number, number] | undefined,
  label: string
) {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#0b1016';
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (!atlasAlbedoSource || !bundleMetadata || frameIndex < 0) {
    context.fillStyle = '#c5d2df';
    context.font = '12px monospace';
    context.fillText(`${label}: n/a`, 10, 18);
    return;
  }

  const frameSize = Math.max(1, Math.floor(bundleMetadata.atlasWidth / Math.max(1, bundleMetadata.gridCols)));
  const col = frameIndex % bundleMetadata.gridCols;
  const row = Math.floor(frameIndex / bundleMetadata.gridCols);
  const sourceX = col * frameSize;
  const sourceY = row * frameSize;
  const inset = 8;
  const labelHeight = 34;
  context.drawImage(
    atlasAlbedoSource,
    sourceX,
    sourceY,
    frameSize,
    frameSize,
    inset,
    inset + labelHeight,
    canvas.width - inset * 2,
    canvas.height - inset * 2 - labelHeight
  );
  context.strokeStyle = label === 'A' ? '#ff8e72' : '#7dd4ff';
  context.lineWidth = 3;
  context.strokeRect(inset + 0.5, inset + labelHeight + 0.5, canvas.width - inset * 2 - 1, canvas.height - inset * 2 - labelHeight - 1);
  context.fillStyle = 'rgba(9, 15, 22, 0.82)';
  context.fillRect(0, 0, canvas.width, labelHeight);
  context.fillStyle = '#eef5fb';
  context.font = 'bold 13px monospace';
  context.fillText(`${label}: frame ${frameIndex}`, 10, 14);
  context.font = '11px monospace';
  context.fillText(`w=${weight.toFixed(3)}`, 10, 28);
  if (direction) {
    context.fillText(
      `dir=(${direction[0].toFixed(2)}, ${direction[1].toFixed(2)}, ${direction[2].toFixed(2)})`,
      62,
      28
    );
  }
}

function drawAtlasGrid(snapshot: DebugSnapshot) {
  const context = atlasGridCanvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, atlasGridCanvas.width, atlasGridCanvas.height);
  context.fillStyle = '#0b1016';
  context.fillRect(0, 0, atlasGridCanvas.width, atlasGridCanvas.height);
  if (!atlasAlbedoSource || !bundleMetadata) return;

  context.drawImage(atlasAlbedoSource, 0, 0, atlasGridCanvas.width, atlasGridCanvas.height);
  const tileWidth = atlasGridCanvas.width / Math.max(1, bundleMetadata.gridCols);
  const tileHeight = atlasGridCanvas.height / Math.max(1, bundleMetadata.gridRows);
  const contentRect = snapshot.atlas.contentRect || { x: 0, y: 0, width: 1, height: 1 };

  context.strokeStyle = 'rgba(210, 226, 242, 0.22)';
  context.lineWidth = 1;
  for (let col = 0; col <= bundleMetadata.gridCols; col += 1) {
    const x = col * tileWidth;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, atlasGridCanvas.height);
    context.stroke();
  }
  for (let row = 0; row <= bundleMetadata.gridRows; row += 1) {
    const y = row * tileHeight;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(atlasGridCanvas.width, y);
    context.stroke();
  }

  for (let index = 0; index < snapshot.atlas.frameCount; index += 1) {
    const x = (index % bundleMetadata.gridCols) * tileWidth;
    const y = Math.floor(index / bundleMetadata.gridCols) * tileHeight;
    context.fillStyle = 'rgba(6, 10, 15, 0.66)';
    context.fillRect(x + 4, y + 4, 22, 14);
    context.fillStyle = '#f0f6fb';
    context.font = '10px monospace';
    context.fillText(String(index), x + 8, y + 14);
  }

  const highlightFrame = (frameIndex: number, strokeStyle: string, lineWidth: number) => {
    if (frameIndex < 0) return;
    const x = (frameIndex % bundleMetadata.gridCols) * tileWidth;
    const y = Math.floor(frameIndex / bundleMetadata.gridCols) * tileHeight;
    context.strokeStyle = strokeStyle;
    context.lineWidth = lineWidth;
    context.strokeRect(x + 2, y + 2, tileWidth - 4, tileHeight - 4);
  };
  highlightFrame(snapshot.primaryIndex, '#ff8e72', 4);
  highlightFrame(snapshot.secondaryIndex, '#7dd4ff', 3);

  context.strokeStyle = 'rgba(122, 240, 168, 0.95)';
  context.lineWidth = 1.5;
  for (let index = 0; index < snapshot.atlas.frameCount; index += 1) {
    const tileX = (index % bundleMetadata.gridCols) * tileWidth;
    const tileY = Math.floor(index / bundleMetadata.gridCols) * tileHeight;
    context.strokeRect(
      tileX + (contentRect.x * tileWidth),
      tileY + ((1 - (contentRect.y + contentRect.height)) * tileHeight),
      contentRect.width * tileWidth,
      contentRect.height * tileHeight
    );
  }

  const markerX = snapshot.encodedOctUv[0] * atlasGridCanvas.width;
  const markerY = snapshot.encodedOctUv[1] * atlasGridCanvas.height;
  context.fillStyle = '#f6f265';
  context.beginPath();
  context.arc(markerX, markerY, 6, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#10161d';
  context.lineWidth = 2;
  context.stroke();
}

function drawSelectorPanels(snapshot: DebugSnapshot) {
  drawAtlasGrid(snapshot);
  const primaryDirection = snapshot.selectedFrameDirections.find((entry) => entry.index === snapshot.primaryIndex)?.direction;
  const primaryWeight = snapshot.selectedFrameDirections.find((entry) => entry.index === snapshot.primaryIndex)?.weight ?? 1;
  const secondaryDirection = snapshot.selectedFrameDirections.find((entry) => entry.index === snapshot.secondaryIndex)?.direction;
  const secondaryWeight = snapshot.selectedFrameDirections.find((entry) => entry.index === snapshot.secondaryIndex)?.weight ?? 0;
  drawTilePreview(primaryTileCanvas, snapshot.primaryIndex, primaryWeight, primaryDirection, 'A');
  drawTilePreview(secondaryTileCanvas, snapshot.secondaryIndex, secondaryWeight, secondaryDirection, 'B');
}

function updateOverlay() {
  const snapshot = computeDebugSnapshot(false);
  drawSelectorPanels(snapshot);
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
  if (sequenceId === 'selector_cardinals') {
    const states = [
      ['selector-cardinals_front', 0, 12],
      ['selector-cardinals_back', 180, 12],
      ['selector-cardinals_left', -90, 12],
      ['selector-cardinals_right', 90, 12],
      ['selector-cardinals_elevated-front', 0, 30],
      ['selector-cardinals_elevated-side', 90, 30],
      ['selector-cardinals_top-down', 0, 78]
    ].map(([name, cameraYaw, cameraPitch]) => ({
      name: String(name),
      state: {
        ...base,
        representation: 'impostor-only',
        mode: 'atlas_tile_pair_preview' as DebugMode,
        freezeFrameIndex: -1,
        disableFrameBlend: false,
        cameraYaw: Number(cameraYaw),
        cameraPitch: Number(cameraPitch),
        cameraDistance: 5.8,
        sunYaw: -40,
        sunPitch: 34
      }
    }));
    return captureStates(sequenceId, states);
  }
  if (sequenceId === 'selector_stability') {
    const states = [];
    for (let cameraYaw = 60; cameraYaw <= 120; cameraYaw += 4) {
      states.push({
        name: `selector-stability_camYaw_${String(cameraYaw).padStart(3, '0')}`,
        state: {
          ...base,
          representation: 'impostor-only',
          mode: 'atlas_tile_pair_preview',
          freezeFrameIndex: -1,
          disableFrameBlend: false,
          cameraYaw,
          cameraPitch: 12,
          cameraDistance: 5.8,
          sunYaw: -40,
          sunPitch: 34
        }
      });
    }
    return captureStates(sequenceId, states);
  }
  if (sequenceId === 'selector_seam_probe') {
    const seamStates = [
      ['selector-seam-probe_y040_p12', 40, 12],
      ['selector-seam-probe_y044_p12', 44, 12],
      ['selector-seam-probe_y048_p12', 48, 12],
      ['selector-seam-probe_y040_p28', 40, 28],
      ['selector-seam-probe_y044_p28', 44, 28],
      ['selector-seam-probe_y048_p28', 48, 28],
      ['selector-seam-probe_y088_p12', 88, 12],
      ['selector-seam-probe_y092_p12', 92, 12],
      ['selector-seam-probe_y088_p28', 88, 28],
      ['selector-seam-probe_y092_p28', 92, 28]
    ].map(([name, cameraYaw, cameraPitch]) => ({
      name: String(name),
      state: {
        ...base,
        representation: 'impostor-only',
        mode: 'frame_grid_overlay' as DebugMode,
        freezeFrameIndex: -1,
        disableFrameBlend: false,
        cameraYaw: Number(cameraYaw),
        cameraPitch: Number(cameraPitch),
        cameraDistance: 5.8,
        sunYaw: -40,
        sunPitch: 34
      }
    }));
    return captureStates(sequenceId, seamStates);
  }
  if (sequenceId === 'selector_silhouette_compare') {
    const states = [
      {
        name: 'selector-silhouette_right_mesh',
        state: { ...base, representation: 'mesh-only', mode: 'lit', cameraYaw: 90, cameraPitch: 12, cameraDistance: 5.8, sunYaw: -40, sunPitch: 34 }
      },
      {
        name: 'selector-silhouette_right_impostor',
        state: { ...base, representation: 'impostor-only', mode: 'lit', cameraYaw: 90, cameraPitch: 12, cameraDistance: 5.8, sunYaw: -40, sunPitch: 34 }
      },
      {
        name: 'selector-silhouette_sidefront_mesh',
        state: { ...base, representation: 'mesh-only', mode: 'lit', cameraYaw: 44, cameraPitch: 12, cameraDistance: 5.8, sunYaw: -40, sunPitch: 34 }
      },
      {
        name: 'selector-silhouette_sidefront_impostor',
        state: { ...base, representation: 'impostor-only', mode: 'lit', cameraYaw: 44, cameraPitch: 12, cameraDistance: 5.8, sunYaw: -40, sunPitch: 34 }
      },
      {
        name: 'selector-silhouette_elevated-sidefront_mesh',
        state: { ...base, representation: 'mesh-only', mode: 'lit', cameraYaw: 44, cameraPitch: 28, cameraDistance: 5.8, sunYaw: -40, sunPitch: 34 }
      },
      {
        name: 'selector-silhouette_elevated-sidefront_impostor',
        state: { ...base, representation: 'impostor-only', mode: 'lit', cameraYaw: 44, cameraPitch: 28, cameraDistance: 5.8, sunYaw: -40, sunPitch: 34 }
      }
    ];
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

async function captureFrameSelectionSweep(sequenceId: Extract<ViewerSequenceId, 'selector_cardinals' | 'selector_stability' | 'selector_seam_probe' | 'selector_silhouette_compare'>) {
  return captureSequence(sequenceId);
}

async function captureAtlasSelectionPair(
  options: Partial<DebugState> & {
    preset?: 'front' | 'back' | 'left' | 'right' | 'elevated-front' | 'elevated-side' | 'top-down' | 'seam';
  } = {}
): Promise<SequenceManifest> {
  const preset = options.preset || 'right';
  const { preset: _ignoredPreset, ...restOptions } = options;
  const shared =
    preset === 'back'
      ? { cameraYaw: 180, cameraPitch: 12, cameraDistance: 5.8 }
      : preset === 'left'
        ? { cameraYaw: -90, cameraPitch: 12, cameraDistance: 5.8 }
        : preset === 'right'
          ? { cameraYaw: 90, cameraPitch: 12, cameraDistance: 5.8 }
          : preset === 'elevated-front'
            ? { cameraYaw: 0, cameraPitch: 30, cameraDistance: 5.8 }
            : preset === 'elevated-side'
              ? { cameraYaw: 90, cameraPitch: 30, cameraDistance: 5.8 }
              : preset === 'top-down'
                ? { cameraYaw: 0, cameraPitch: 78, cameraDistance: 5.8 }
                : preset === 'seam'
                  ? { cameraYaw: 44, cameraPitch: 12, cameraDistance: 5.8 }
                  : { cameraYaw: 0, cameraPitch: 12, cameraDistance: 5.8 };
  return captureComparisonPair({
    ...shared,
    ...restOptions,
    mode: restOptions.mode || 'atlas_tile_pair_preview'
  });
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
  document.title = `FSIM | ${viewerAssetName} Impostor Viewer`;
  const bundle = await getTreeAssetBundle({
    modelUrl: viewerModelUrl,
    impostorBaseUrl: viewerImpostorBaseUrl
  });
  const metadataDirections = (bundle.impostor.metadata?.directions || []).map((direction: any) => roundDirectionTuple(direction));
  const selectionDirections = (bundle.impostor.metadata?.directions || []).map((direction: any) => (
    direction instanceof THREE.Vector3
      ? direction.clone()
      : Array.isArray(direction)
        ? new THREE.Vector3(direction[0] || 0, direction[1] || 0, direction[2] || 0)
        : new THREE.Vector3(direction?.x || 0, direction?.y || 0, direction?.z || 0)
  ));
  const normalizedFrameBands = Array.isArray(bundle.impostor.metadata?.frameBands)
    ? bundle.impostor.metadata.frameBands.map((band: any) => (
      band === 'elevated' || band === 'high-cardinal' ? band : 'horizon'
    ))
    : [];
  const contentRect = bundle.impostor.metadata?.contentRect
    ? {
      x: Number(bundle.impostor.metadata.contentRect.x) || 0,
      y: Number(bundle.impostor.metadata.contentRect.y) || 0,
      width: Number(bundle.impostor.metadata.contentRect.width) || 1,
      height: Number(bundle.impostor.metadata.contentRect.height) || 1
    }
    : { x: 0, y: 0, width: 1, height: 1 };

  bundleMetadata = {
    ...(bundle.impostor.metadata as any),
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
    captureOrthoScale: Number(bundle.impostor.metadata?.captureOrthoScale) || 1,
    contentRect,
    visibleWidthRatio: contentRect.width,
    visibleHeightRatio: contentRect.height,
    padding: {
      left: contentRect.x,
      right: Math.max(0, 1 - (contentRect.x + contentRect.width)),
      top: Math.max(0, 1 - (contentRect.y + contentRect.height)),
      bottom: contentRect.y
    },
    frameBands: normalizedFrameBands,
    elevatedThreshold: Number.isFinite(bundle.impostor.metadata?.elevatedThreshold)
      ? Number(bundle.impostor.metadata?.elevatedThreshold)
      : 0.52,
    highCardinalThreshold: Number.isFinite(bundle.impostor.metadata?.highCardinalThreshold)
      ? Number(bundle.impostor.metadata?.highCardinalThreshold)
      : 0.82,
    viewBlendMode: bundle.impostor.metadata?.viewBlendMode || 'grid-bilinear',
    directions: metadataDirections
  };
  bundleSelectionConfig = {
    directions: selectionDirections,
    frameBands: normalizedFrameBands,
    viewBlendMode: bundle.impostor.metadata?.viewBlendMode || 'grid-bilinear',
    elevatedThreshold: Number.isFinite(bundle.impostor.metadata?.elevatedThreshold)
      ? Number(bundle.impostor.metadata?.elevatedThreshold)
      : 0.52,
    highCardinalThreshold: Number.isFinite(bundle.impostor.metadata?.highCardinalThreshold)
      ? Number(bundle.impostor.metadata?.highCardinalThreshold)
      : 0.82
  };
  modelWidthToHeight = Math.max(0.2, bundle.modelMetrics.width / Math.max(bundle.modelMetrics.height, 1e-4));
  atlasAlbedoSource = bundle.impostor.albedoTexture.image || bundle.impostor.albedoTexture.source?.data || null;

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
  captureSelectorSnapshot,
  runCapturePreset,
  captureSequence,
  captureFrameSelectionSweep,
  captureAtlasSelectionPair,
  captureComparisonPair
};

initialize().catch((error) => {
  statePre.textContent = `Viewer failed to initialize:\n${error instanceof Error ? error.stack || error.message : String(error)}`;
  throw error;
});
