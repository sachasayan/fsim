// @ts-check

import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import GUI from 'lil-gui';
import { Noise } from './noise.js';
import { createSimulationState } from './state.js';
import { createWorldObjects } from './world/objects';
import { mergeShadowCoverage } from './world/authoredObjects.js';
import { createRuntimeLodSettings, normalizeLodSettings } from './world/LodSystem.js';
import { calculateAerodynamics } from './physics/updatePhysics.js';
import { createPhysicsAdapter } from './physics/physicsAdapter.js';
import { createCameraController } from './camera/updateCamera.js';
import { createHUD } from './ui/hud.js';

// New extracted modules
import { createRendererManager } from './core/RendererManager.js';
import { createPerformanceCollector } from './core/PerformanceCollector.js';
import { createWeatherManager } from './core/WeatherManager.js';
import { createInputHandler } from './core/InputHandler.js';
import { createAirportSystems } from './sim/AirportSystems.js';
import { ProceduralAudio } from './audio/AudioSystem.js';
import { initLiveReload } from './core/LiveReload.js';
import { startLoaderTips } from './ui/LoaderTips.js';
import { debugLog } from './core/logging.js';
import { createCrashSystem, evaluateCrashImpact } from './crash/CrashSystem.js';

type FsimRuntimeWindow = Window & typeof globalThis & {
  __FSIM_RUNTIME__?: { showDebugUi?: boolean };
  fsimWorld: Record<string, any>;
  fsimPerf?: Record<string, unknown>;
  triggerCrash?: (reason?: string) => void;
  resetFlight?: () => void;
};

type LoaderElements = {
  phaseText: HTMLElement | null;
  phaseDetailText: HTMLElement | null;
  terrainBank: HTMLElement | null;
  terrainSwitches: HTMLElement[];
  terrainCount: HTMLElement | null;
  terrainText: HTMLElement | null;
  assetsBank: HTMLElement | null;
  assetsSwitches: HTMLElement[];
  assetsCount: HTMLElement | null;
  assetsText: HTMLElement | null;
};

type TerrainSelectionDiagnostics = {
  blockingLeafCount?: number;
  pendingBlockingLeafCount?: number;
  timings?: {
    selectionBuildMs?: number;
    queueSchedulingMs?: number;
    queuePruneMs?: number;
    leafBuildMs?: number;
    leafBuildDispatchMs?: number;
    leafBuildApplyMs?: number;
    chunkBuildQueueMs?: number;
    propBuildQueueMs?: number;
  };
};

type WarmupProgress = {
  ratio?: number;
  stage?: 'building' | 'compiling' | 'complete' | 'skipped';
  completed?: number;
  total?: number;
};

const runtimeWindow = window as FsimRuntimeWindow;
runtimeWindow.fsimWorld ??= {};

// Initialize audio nodes early (will be suspended until gesture)
ProceduralAudio.init();

// Handle browser audio suspension policy
const resumeAudio = () => {
  ProceduralAudio.resume();
  runtimeWindow.removeEventListener('mousedown', resumeAudio);
  runtimeWindow.removeEventListener('keydown', resumeAudio);
  runtimeWindow.removeEventListener('touchstart', resumeAudio);
};
runtimeWindow.addEventListener('mousedown', resumeAudio);
runtimeWindow.addEventListener('keydown', resumeAudio);
runtimeWindow.addEventListener('touchstart', resumeAudio);

// ==========================================
// 1. CORE SETUP & GLOBALS
// ==========================================
const container = document.getElementById('game-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3a2e3f);
scene.fog = new THREE.FogExp2(0x3a2e3f, 0.00015);
const urlParamsForInit = new URLSearchParams(runtimeWindow.location.search);
const runtimeConfig = runtimeWindow.__FSIM_RUNTIME__ || {};
const shouldShowDebugUi = runtimeConfig.showDebugUi === true || urlParamsForInit.get('debug') === '1';
const debugView = {
  slewMode: false,
  slewSpeed: 1000,
  showShadowCameraHelper: false
};
const lodSettings = createRuntimeLodSettings({ urlSearch: runtimeWindow.location.search });

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 100000);

const {
  renderer,
  composer,
  smaaPass,
  bloomPass,
  renderFrame,
  getRenderPassTimings,
  shadowsEnabled,
  logarithmicDepthBufferEnabled,
  updateAdaptiveQuality,
  getAdaptiveQualitySnapshot,
  handleResize
} = createRendererManager({ container, scene, camera });
const PROFILING_READY_QUIET_WINDOW_MS = 3000;
const startupTimeline = {
  simInitAtMs: performance.now(),
  animationStartedAtMs: null,
  shaderWarmupStartedAtMs: null,
  shaderWarmupCompletedAtMs: null,
  startupReadyAtMs: null,
  bootstrapCompletedAtMs: null,
  loaderHiddenAtMs: null
};
const profilingState = {
  profilingReady: false,
  profilingReadinessReason: 'bootstrap_incomplete',
  quietWindowMs: PROFILING_READY_QUIET_WINDOW_MS,
  lastProgramsChangeAtMs: performance.now(),
  lastTexturesChangeAtMs: performance.now(),
  lastGeometriesChangeAtMs: performance.now(),
  lastObservedPrograms: 0,
  lastObservedTextures: 0,
  lastObservedGeometries: 0,
  profilingReadyAtMs: null,
  firstStableAtMs: null,
  lastReasonChangedAtMs: performance.now(),
  timeBlockedByProgramsMs: 0,
  timeBlockedByTexturesMs: 0,
  timeBlockedByGeometriesMs: 0
};
const perfCollector = createPerformanceCollector({
  renderer,
  getAdaptiveQualitySnapshot,
  getRenderPassTimings,
  getProfilingSnapshot: () => {
    const now = performance.now();
    return {
      bootstrapComplete: runtimeWindow.fsimWorld?.bootstrapComplete ?? false,
      loaderHidden: runtimeWindow.fsimWorld?.loaderHidden ?? false,
      worldReady: runtimeWindow.fsimWorld?.worldReady ?? false,
      profilingReady: profilingState.profilingReady,
      profilingReadinessReason: profilingState.profilingReadinessReason,
      lastProgramsChangeMsAgo: now - profilingState.lastProgramsChangeAtMs,
      lastTexturesChangeMsAgo: now - profilingState.lastTexturesChangeAtMs,
      lastGeometriesChangeMsAgo: now - profilingState.lastGeometriesChangeAtMs,
      quietWindowMs: profilingState.quietWindowMs,
      profilingReadyAtMs: profilingState.profilingReadyAtMs,
      firstStableAtMs: profilingState.firstStableAtMs,
      timeBlockedByProgramsMs: profilingState.timeBlockedByProgramsMs,
      timeBlockedByTexturesMs: profilingState.timeBlockedByTexturesMs,
      timeBlockedByGeometriesMs: profilingState.timeBlockedByGeometriesMs,
      startupTimeline: { ...startupTimeline },
      terrainSelection: getTerrainSelectionDiagnostics?.() || null
    };
  }
});

const stats = new Stats();
if (shouldShowDebugUi) {
  document.body.appendChild(stats.dom);
}
let debugGui = null;
if (shouldShowDebugUi) {
  debugGui = new GUI({ title: 'Debug View' });
  const cameraFolder = debugGui.addFolder('Camera');
  cameraFolder.add(debugView, 'slewMode').name('Slew Mode');
  cameraFolder.add(debugView, 'slewSpeed', 25, 1000, 5).name('Slew Speed');
  cameraFolder.open();
}

const { AIRCRAFT, PHYSICS, WEATHER, keys, runtime } = createSimulationState({ scene });
const physicsAdapter = createPhysicsAdapter({ PHYSICS, AIRCRAFT });
physicsAdapter.init();

// ==========================================
// 2. WORLD OBJECTS
// ==========================================
const {
  hemiLight,
  dirLight,
  waterMaterial,
  alsStrobes,
  strobeColorOn,
  strobeColorOff,
  getTerrainHeight,
  updateTerrain,
  updateTerrainAtmosphere,
  updateSurfaceShadowCoverage,
  getTerrainSelectionDiagnostics,
  getSurfaceShadowDiagnostics,
  consumeLeafBuildApplyTiming,
  flushPendingLeafApplies,
  hasPendingTerrainWork,
  terrainDebugSettings,
  applyTerrainDebugSettings,
  clouds,
  cloudMaterial,
  updateClouds,
  applyEnvironmentFromWeather,
  MAX_PARTICLES,
  particleMesh,
  particles,
  spawnParticle,
  pDummy,
  pColor,
  planeGroup,
  movableSurfaces,
  gearGroup,
  strobes,
  beacons,
  getBreakupPieceSpecs,
  updateAircraftLOD,
  updateControlSurfaces,
  animateWindmills,
  isReady,
  reloadCity,
  warmupShaders,
  validateShaders,
  getShaderValidationReport,
  getShaderValidationSummary,
  getShaderValidationVariants,
  completeBootstrap,
  getCollectedTokenCount,
  lodSettings: worldLodSettings,
  resetTokens,
  setTokenCollectionHandler,
  updateTokenSystem,
  updateWorldObjects,
  refreshTerrainAlignment,
  getNearestShadowContributor,
  invalidateWorldLod,
  updateWorldLOD
} = createWorldObjects({ scene, renderer, Noise, PHYSICS, AIRCRAFT, WEATHER, lodSettings });

const shadowCameraHelper = shadowsEnabled ? new THREE.CameraHelper(dirLight.shadow.camera) : null;
if (shadowCameraHelper) {
  shadowCameraHelper.visible = false;
  scene.add(shadowCameraHelper);
}

function refreshLodState() {
  normalizeLodSettings(worldLodSettings);
  updateTerrain();
  invalidateWorldLod();
  updateWorldLOD(camera.position, { force: true });
  debugGui?.controllersRecursive?.().forEach((controller) => controller.updateDisplay());
}

if (debugGui) {
  if (terrainDebugSettings && typeof applyTerrainDebugSettings === 'function') {
    const systemsFolder = debugGui.addFolder('Systems');
    systemsFolder.add(terrainDebugSettings, 'showTerrain')
      .name('Terrain')
      .onChange(() => applyTerrainDebugSettings({ rebuildSurfaces: false, refreshSelection: false }));
    systemsFolder.add(terrainDebugSettings, 'showWater')
      .name('Water')
      .onChange(() => applyTerrainDebugSettings({ rebuildSurfaces: false, refreshSelection: false }));
    systemsFolder.add(terrainDebugSettings, 'showObjects')
      .name('Objects')
      .onChange(() => applyTerrainDebugSettings({ rebuildProps: true, refreshSelection: false }));
    systemsFolder.add(terrainDebugSettings, 'showTrees')
      .name('Trees')
      .onChange(() => applyTerrainDebugSettings({ rebuildProps: true, refreshSelection: false }));
    systemsFolder.add(terrainDebugSettings, 'showBuildings')
      .name('Buildings')
      .onChange(() => applyTerrainDebugSettings({ rebuildProps: true, refreshSelection: false }));
    systemsFolder.add(terrainDebugSettings, 'enableChunkGeneration')
      .name('Chunk Generation')
      .onChange(() => applyTerrainDebugSettings({ refreshSelection: true }));
    systemsFolder.add(terrainDebugSettings, 'enableLeafGeneration')
      .name('Leaf Generation')
      .onChange(() => applyTerrainDebugSettings({ refreshSelection: true }));
  }

  const shadowsFolder = debugGui.addFolder('Shadows');
  shadowsFolder.add(debugView, 'showShadowCameraHelper')
    .name('Shadow Frustum')
    .onChange((visible) => {
      if (!shadowCameraHelper) return;
      shadowCameraHelper.visible = visible === true;
      if (shadowCameraHelper.visible) shadowCameraHelper.update();
    });
}

// ==========================================
// 3. MANAGERS
// ==========================================
const weatherManager = createWeatherManager({
  scene,
  renderer,
  bloomPass,
  WEATHER,
  hemiLight,
  dirLight,
  cloudMaterial,
  updateClouds,
  updateTerrainAtmosphere,
  applyEnvironmentFromWeather,
  initialPreset: urlParamsForInit.get('lighting') || undefined
});

const airportSystems = createAirportSystems({
  alsStrobes,
  strobeColorOn,
  strobeColorOff
});

const cameraController = createCameraController({
  camera,
  planeGroup,
  clouds,
  PHYSICS,
  AIRCRAFT,
  getTerrainHeight
});

const inputHandler = createInputHandler({ keys, PHYSICS, cameraController });
inputHandler.init();

const hud = createHUD({ PHYSICS: /** @type {any} */ (PHYSICS), WEATHER, getTerrainHeight });
setTokenCollectionHandler(({ count, worldPosition, collectedAtMs }) => {
  ProceduralAudio.coinPickup();
  hud.showTokenPickup({ count, worldPosition, collectedAtMs });
});
const shouldLogShaderValidation = urlParamsForInit.get('validateShaders') === '1';

runtimeWindow.fsimWorld = {
  isReady,
  reloadCity,
  PHYSICS,
  cameraController,
  weatherManager,
  AIRCRAFT,
  WEATHER,
  planeGroup,
  physicsAdapter,
  clouds,
  cloudMaterial,
  updateTerrainAtmosphere,
  updateTerrain, // Export updateTerrain for explicit batcher control
  refreshTerrainAlignment,
  refreshLodState,
  lodSettings: worldLodSettings,
  waterMaterial,
  rendererConfig: {
    shadowsEnabled,
    logarithmicDepthBufferEnabled
  },
  getCollectedTokenCount,
  debugGui,
  debugView,
  validateShaders,
  getShaderValidationReport,
  getShaderValidationSummary,
  getShaderValidationVariants,
  bootstrapComplete: false,
  loaderHidden: false,
  worldReady: false,
  profilingReady: false,
  profilingReadinessReason: profilingState.profilingReadinessReason,
  getTerrainSelectionDiagnostics,
  getSurfaceShadowDiagnostics,
  terrainDebugSettings,
  applyTerrainDebugSettings,
  terrainSelection: getTerrainSelectionDiagnostics?.() || null,
  surfaceShadows: getSurfaceShadowDiagnostics?.() || null,
  loaderProgress: null,
  shaderValidation: getShaderValidationReport(),
  shaderValidationSummary: getShaderValidationSummary(),
  startupTimeline
};
runtimeWindow.fsimPerf = perfCollector;

const loaderElements: LoaderElements = {
  phaseText: document.getElementById('loader-phase'),
  phaseDetailText: document.getElementById('loader-phase-detail'),
  terrainBank: document.getElementById('loader-terrain-bank'),
  terrainSwitches: Array.from(document.querySelectorAll<HTMLElement>('#loader-terrain-bank .loader-switch')),
  terrainCount: document.getElementById('loader-terrain-progress-count'),
  terrainText: document.getElementById('loader-terrain-progress-text'),
  assetsBank: document.getElementById('loader-assets-bank'),
  assetsSwitches: Array.from(document.querySelectorAll<HTMLElement>('#loader-assets-bank .loader-switch')),
  assetsCount: document.getElementById('loader-assets-progress-count'),
  assetsText: document.getElementById('loader-assets-progress-text')
};
const loaderProgressState = {
  terrain: { ratio: 0, text: 'Waiting for terrain selection...' },
  assets: { ratio: 0, text: 'Waiting for shader warmup...' }
};
const loaderRenderState = {
  phaseText: null as string | null,
  phaseDetailText: null as string | null,
  terrainActiveSwitches: -1,
  terrainCountText: null as string | null,
  terrainText: null as string | null,
  assetsActiveSwitches: -1,
  assetsCountText: null as string | null,
  assetsText: null as string | null
};
type LoaderRenderTextKey =
  | 'phaseText'
  | 'phaseDetailText'
  | 'terrainCountText'
  | 'terrainText'
  | 'assetsCountText'
  | 'assetsText';

function setTextIfChanged(
  element: HTMLElement | null,
  nextText: string,
  stateKey: LoaderRenderTextKey
) {
  if (!element || loaderRenderState[stateKey] === nextText) return;
  element.textContent = nextText;
  loaderRenderState[stateKey] = nextText;
}

function setLoaderProgressSection(
  switchElements: HTMLElement[],
  countElement: HTMLElement | null,
  textElement: HTMLElement | null,
  ratio: number,
  text: string,
  countStateKey: 'terrainCountText' | 'assetsCountText',
  textStateKey: 'terrainText' | 'assetsText',
  activeSwitchesStateKey: 'terrainActiveSwitches' | 'assetsActiveSwitches'
) {
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const totalSwitches = switchElements.length;
  if (totalSwitches > 0) {
    const activeSwitches = clampedRatio >= 1
      ? totalSwitches
      : Math.min(totalSwitches, Math.max(clampedRatio > 0 ? 1 : 0, Math.floor(clampedRatio * totalSwitches)));
    if (loaderRenderState[activeSwitchesStateKey] !== activeSwitches) {
      switchElements.forEach((switchElement, index) => {
        switchElement.classList.toggle('is-active', index < activeSwitches);
      });
      loaderRenderState[activeSwitchesStateKey] = activeSwitches;
    }
    setTextIfChanged(
      countElement,
      `${String(activeSwitches).padStart(2, '0')}/${String(totalSwitches).padStart(2, '0')}`,
      countStateKey
    );
  } else {
    setTextIfChanged(countElement, `${Math.round(clampedRatio * 100)}%`, countStateKey);
  }
  setTextIfChanged(textElement, text, textStateKey);
}

function setLoaderPhaseText(phaseText, detailText) {
  if (typeof phaseText === 'string') setTextIfChanged(loaderElements.phaseText, phaseText, 'phaseText');
  if (typeof detailText === 'string') setTextIfChanged(loaderElements.phaseDetailText, detailText, 'phaseDetailText');
}

function updateLoaderProgress() {
  const terrainSelection = (getTerrainSelectionDiagnostics?.() || null) as TerrainSelectionDiagnostics | null;
  const blockingLeafCount = terrainSelection?.blockingLeafCount ?? 0;
  const pendingBlockingLeafCount = terrainSelection?.pendingBlockingLeafCount ?? 0;
  const readyBlockingLeafCount = Math.max(0, blockingLeafCount - pendingBlockingLeafCount);
  const terrainReady = isReady();
  if (blockingLeafCount > 0) {
    loaderProgressState.terrain.ratio = readyBlockingLeafCount / blockingLeafCount;
    loaderProgressState.terrain.text = `${readyBlockingLeafCount}/${blockingLeafCount} leaves ready`;
  } else {
    loaderProgressState.terrain.ratio = terrainReady ? 1 : 0;
    loaderProgressState.terrain.text = terrainReady ? 'Terrain ready' : 'Selecting bootstrap terrain...';
  }

  runtimeWindow.fsimWorld.loaderProgress = {
    terrain: { ...loaderProgressState.terrain },
    assets: { ...loaderProgressState.assets }
  };

  if (loaderHidden) return;

  setLoaderProgressSection(
    loaderElements.terrainSwitches,
    loaderElements.terrainCount,
    loaderElements.terrainText,
    loaderProgressState.terrain.ratio,
    loaderProgressState.terrain.text,
    'terrainCountText',
    'terrainText',
    'terrainActiveSwitches'
  );
  setLoaderProgressSection(
    loaderElements.assetsSwitches,
    loaderElements.assetsCount,
    loaderElements.assetsText,
    loaderProgressState.assets.ratio,
    loaderProgressState.assets.text,
    'assetsCountText',
    'assetsText',
    'assetsActiveSwitches'
  );

  const terrainRatio = loaderProgressState.terrain.ratio;
  const assetsRatio = loaderProgressState.assets.ratio;
  if (terrainReady && assetsRatio >= 1) {
    setLoaderPhaseText('Bootstrap complete. Preparing visual handoff', 'World data and shader warmup are ready');
  } else if (terrainRatio >= 1) {
    setLoaderPhaseText('Terrain envelope locked. Finalizing systems warmup', 'Terrain ready, completing shader and asset preparation');
  } else if (assetsRatio >= 1) {
    setLoaderPhaseText('Systems warm. Finalizing terrain envelope', 'Shader warmup finished, waiting on bootstrap terrain');
  } else if (blockingLeafCount > 0) {
    setLoaderPhaseText('Mapping the immediate flight corridor', `Bootstrap terrain ${readyBlockingLeafCount}/${blockingLeafCount} sectors ready`);
  } else {
    setLoaderPhaseText('Bringing the flight deck online', 'Awaiting terrain selection and shader warmup');
  }
}

// Initialize LiveReload functionality
initLiveReload(/** @type {any} */ (runtimeWindow.fsimWorld));

// Bind visual surfaces back to physics configuration
AIRCRAFT.movableSurfaces = movableSurfaces;

// Temp vectors for efficiency
const tmpHdgEuler = new THREE.Euler();
const tmpCrashStep = new THREE.Vector3();
const tmpCrashSpinEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const tmpCrashSpinQuat = new THREE.Quaternion();
const tmpSunDir = new THREE.Vector3();
const tmpShadowSunDir = new THREE.Vector3();
const tmpTouchOffsetL = new THREE.Vector3();
const tmpTouchOffsetR = new THREE.Vector3();
const tmpTouchPosL = new THREE.Vector3();
const tmpTouchPosR = new THREE.Vector3();
const tmpTouchVel = new THREE.Vector3();
const tmpTipVel = new THREE.Vector3();
const tmpSlewForward = new THREE.Vector3();
const tmpSlewRight = new THREE.Vector3();
const tmpSlewUp = new THREE.Vector3();
const tmpImpactVel = new THREE.Vector3();
const tmpImpactAngVel = new THREE.Vector3();
const tmpFocusPos = new THREE.Vector3();
const tmpShadowFitCenter = new THREE.Vector3();

const prevPhysicsPos = new THREE.Vector3();
const prevPhysicsQuat = new THREE.Quaternion();

const prevShadowCenter = new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
let prevShadowExtent = -1;
let lastTerrainChunkX = Number.POSITIVE_INFINITY;
let lastTerrainChunkZ = Number.POSITIVE_INFINITY;
let lastTerrainUpdatePosX = Number.POSITIVE_INFINITY;
let lastTerrainUpdatePosZ = Number.POSITIVE_INFINITY;
let lastTerrainUpdateMs = 0;
const SHADOW_MAP_NEAR = 2048;
const SHADOW_MAP_FAR = 1024;
let currentShadowMapSize = SHADOW_MAP_NEAR;

const PHYSICS_STEP = 1 / 75;
const MAX_PHYSICS_STEPS_PER_FRAME = 4;
const spawnState = {
  x: 0,
  y: AIRCRAFT.gearHeight,
  z: 1900
};

const crashSystem = createCrashSystem({
  scene,
  physicsAdapter,
  getTerrainHeight,
  planeGroup,
  AIRCRAFT,
  PHYSICS: /** @type {any} */ (PHYSICS),
  spawnParticle,
  getBreakupPieceSpecs: /** @type {any} */ (getBreakupPieceSpecs),
  onResetRequested: () => {
    runtimeWindow.resetFlight?.();
  }
});

function updateSlewMode(dt) {
  const slewStep = debugView.slewSpeed * dt;
  const yawStep = dt * 1.2;

  tmpSlewForward.set(0, 0, -1).applyQuaternion(PHYSICS.quaternion);
  tmpSlewRight.set(1, 0, 0).applyQuaternion(PHYSICS.quaternion);
  tmpSlewUp.set(0, 1, 0);

  if (keys.ArrowUp) PHYSICS.position.addScaledVector(tmpSlewForward, slewStep);
  if (keys.ArrowDown) PHYSICS.position.addScaledVector(tmpSlewForward, -slewStep);
  if (keys.ArrowRight) PHYSICS.position.addScaledVector(tmpSlewRight, slewStep);
  if (keys.ArrowLeft) PHYSICS.position.addScaledVector(tmpSlewRight, -slewStep);
  if (keys.a) PHYSICS.position.addScaledVector(tmpSlewUp, slewStep);
  if (keys.z) PHYSICS.position.addScaledVector(tmpSlewUp, -slewStep);

  if (keys.q || keys.e) {
    tmpCrashSpinQuat.setFromAxisAngle(tmpSlewUp, (keys.q ? yawStep : 0) + (keys.e ? -yawStep : 0));
    PHYSICS.quaternion.premultiply(tmpCrashSpinQuat).normalize();
  }

  PHYSICS.velocity.set(0, 0, 0);
  PHYSICS.angularVelocity.set(0, 0, 0);
  PHYSICS.externalForce.set(0, 0, 0);
  PHYSICS.externalTorque.set(0, 0, 0);
  PHYSICS.airspeed = 0;
  PHYSICS.gForce = 1.0;
  PHYSICS.aoa = 0;
  PHYSICS.slip = 0;
  PHYSICS.onGround = false;

  physicsAdapter.syncFromState();
}

// --- CRASH LOGIC & RESET ---
runtimeWindow.triggerCrash = function (reason) {
  if (PHYSICS.crashState !== 'active') return;
  crashSystem.beginCrash({
    reason,
    baseVelocity: tmpImpactVel.copy(PHYSICS.velocity),
    baseAngularVelocity: tmpImpactAngVel.copy(PHYSICS.angularVelocity)
  });
};

runtimeWindow.resetFlight = function () {
  crashSystem.endCrash();
  PHYSICS.position.set(spawnState.x, spawnState.y, spawnState.z);
  PHYSICS.velocity.set(0, 0, 0);
  PHYSICS.quaternion.identity();
  PHYSICS.angularVelocity.set(0, 0, 0);
  PHYSICS.externalForce.set(0, 0, 0);
  PHYSICS.externalTorque.set(0, 0, 0);
  PHYSICS.heading = 0;
  PHYSICS.airspeed = 0;
  PHYSICS.throttle = 0;
  PHYSICS.flaps = 0;
  PHYSICS.targetFlaps = 0;
  PHYSICS.spoilers = false;
  PHYSICS.gearDown = true;
  PHYSICS.gearTransition = 1.0;
  PHYSICS.brakes = false;
  PHYSICS.onGround = true;
  PHYSICS.impactSpeed = 0;
  PHYSICS.impactVerticalSpeed = 0;
  PHYSICS.impactAngularSpeed = 0;

  for (let i = 0; i < MAX_PARTICLES; i++) particles[i].active = false;
  resetTokens();
  hud.resetTransientHud();

  prevPhysicsPos.copy(PHYSICS.position);
  prevPhysicsQuat.identity();
  planeGroup.position.copy(PHYSICS.position);
  planeGroup.quaternion.copy(PHYSICS.quaternion);
  physicsAdapter.syncFromState();
};

runtimeWindow.addEventListener('resize', handleResize);

function updateProfilingReadiness(now) {
  const info = renderer.info;
  const programCount = Array.isArray(info.programs) ? info.programs.length : 0;
  const textureCount = info.memory.textures;
  const geometryCount = info.memory.geometries;
  const worldReady = isReady();

  if (programCount !== profilingState.lastObservedPrograms) {
    profilingState.lastObservedPrograms = programCount;
    profilingState.lastProgramsChangeAtMs = now;
  }
  if (textureCount !== profilingState.lastObservedTextures) {
    profilingState.lastObservedTextures = textureCount;
    profilingState.lastTexturesChangeAtMs = now;
  }
  if (geometryCount !== profilingState.lastObservedGeometries) {
    profilingState.lastObservedGeometries = geometryCount;
    profilingState.lastGeometriesChangeAtMs = now;
  }

  runtimeWindow.fsimWorld.worldReady = worldReady;

  let reason = 'stable';
  if (!runtimeWindow.fsimWorld.bootstrapComplete) {
    reason = 'bootstrap_incomplete';
  } else if (!runtimeWindow.fsimWorld.loaderHidden) {
    reason = 'loader_visible';
  } else if (!worldReady) {
    reason = 'world_not_ready';
  } else if ((now - profilingState.lastProgramsChangeAtMs) < profilingState.quietWindowMs) {
    reason = 'programs_growing';
  } else if ((now - profilingState.lastTexturesChangeAtMs) < profilingState.quietWindowMs) {
    reason = 'textures_growing';
  } else if ((now - profilingState.lastGeometriesChangeAtMs) < profilingState.quietWindowMs) {
    reason = 'geometries_growing';
  }

  if (reason !== profilingState.profilingReadinessReason) {
    const blockedForMs = Math.max(0, now - profilingState.lastReasonChangedAtMs);
    if (profilingState.profilingReadinessReason === 'programs_growing') {
      profilingState.timeBlockedByProgramsMs += blockedForMs;
    } else if (profilingState.profilingReadinessReason === 'textures_growing') {
      profilingState.timeBlockedByTexturesMs += blockedForMs;
    } else if (profilingState.profilingReadinessReason === 'geometries_growing') {
      profilingState.timeBlockedByGeometriesMs += blockedForMs;
    }
    profilingState.lastReasonChangedAtMs = now;
  }

  profilingState.profilingReadinessReason = reason;
  profilingState.profilingReady = reason === 'stable';
  if (profilingState.profilingReady) {
    profilingState.profilingReadyAtMs ??= now;
    profilingState.firstStableAtMs ??= now;
  } else {
    profilingState.profilingReadyAtMs = null;
  }

  runtimeWindow.fsimWorld.profilingReady = profilingState.profilingReady;
  runtimeWindow.fsimWorld.profilingReadinessReason = reason;
  runtimeWindow.fsimWorld.terrainSelection = getTerrainSelectionDiagnostics?.() || null;
  runtimeWindow.fsimWorld.surfaceShadows = getSurfaceShadowDiagnostics?.() || null;
}

function animate() {
  requestAnimationFrame(animate);
  stats.update();

  startupTimeline.animationStartedAtMs ??= performance.now();

  const now = performance.now();
  let dt = Math.min((now - runtime.lastTime) / 1000, 0.05);
  runtime.lastTime = now;

  runtime.frameCount++;
  perfCollector.beginFrame({ now, dt });
  let phaseStart = now;
  updateAdaptiveQuality(dt);
  phaseStart = performance.now() - phaseStart;
  perfCollector.recordPhase('adaptive_quality', phaseStart);

  // 1. Update visuals (weather, lighting, clouds)
  phaseStart = performance.now();
  weatherManager.update(dt, runtime.frameCount, camera);
  phaseStart = performance.now() - phaseStart;
  perfCollector.recordPhase('weather', phaseStart);

  phaseStart = performance.now();
  animateWindmills?.(now * 0.001);
  phaseStart = performance.now() - phaseStart;
  perfCollector.recordPhase('windmills', phaseStart);

  // 2. Water Animation
  phaseStart = performance.now();
  phaseStart = performance.now() - phaseStart;
  perfCollector.recordPhase('water_animation', phaseStart);


  // 3. Aircraft Control Surfaces
  phaseStart = performance.now();
  updateControlSurfaces(PHYSICS, dt);
  phaseStart = performance.now() - phaseStart;
  perfCollector.recordPhase('control_surfaces', phaseStart);

  // 4. Strobe & Beacon Logic
  phaseStart = performance.now();
  runtime.strobeTimer += dt;
  let strobeCycle = runtime.strobeTimer % 1.5;
  let isFlashing = (strobeCycle < 0.05) || (strobeCycle > 0.15 && strobeCycle < 0.2);
  strobes.forEach(s => {
    s.intensity = isFlashing ? 10 : 0;
    if (s.children[0]) s.children[0].visible = isFlashing;
  });

  let beaconCycle = runtime.strobeTimer % 1.0;
  let beaconFlash = beaconCycle < 0.1;
  beacons.forEach(b => {
    b.intensity = beaconFlash ? 5 : 0;
    if (b.children[0]) b.children[0].visible = beaconFlash;
  });
  phaseStart = performance.now() - phaseStart;
  perfCollector.recordPhase('lights', phaseStart);

  // 5. Airport Systems (ALS)
  phaseStart = performance.now();
  airportSystems.updateALS(now);
  phaseStart = performance.now() - phaseStart;
  perfCollector.recordPhase('airport_als', phaseStart);

  phaseStart = performance.now();
  updateWorldObjects(now);
  phaseStart = performance.now() - phaseStart;
  perfCollector.recordPhase('world_objects', phaseStart);

  // 5b. Aircraft LOD
  phaseStart = performance.now();
  updateAircraftLOD(camera);
  phaseStart = performance.now() - phaseStart;
  perfCollector.recordPhase('aircraft_lod', phaseStart);

  // 6. Audio Update
  phaseStart = performance.now();
  ProceduralAudio.update(
    PHYSICS.throttle,
    PHYSICS.airspeed,
    PHYSICS.spoilers,
    cameraController.getMode(),
    WEATHER.mode,
    PHYSICS.gForce,
    PHYSICS.angularVelocity,
    PHYSICS.aoa,
    PHYSICS.slip
  );
  phaseStart = performance.now() - phaseStart;
  perfCollector.recordPhase('audio', phaseStart);

  // 7. Particle System (Touchdown)
  phaseStart = performance.now();
  if (!runtime.wasOnGround && PHYSICS.onGround && PHYSICS.airspeed > 30) {
    ProceduralAudio.touchdown();
    for (let i = 0; i < 40; i++) {
      tmpTouchOffsetL.set(-4.5 + (Math.random() - 0.5) * 2, -3.5, 3 + (Math.random() - 0.5) * 2);
      tmpTouchOffsetR.set(4.5 + (Math.random() - 0.5) * 2, -3.5, 3 + (Math.random() - 0.5) * 2);
      const posL = tmpTouchPosL.copy(tmpTouchOffsetL).applyQuaternion(planeGroup.quaternion).add(planeGroup.position);
      const posR = tmpTouchPosR.copy(tmpTouchOffsetR).applyQuaternion(planeGroup.quaternion).add(planeGroup.position);
      const pVel = tmpTouchVel.copy(PHYSICS.velocity).multiplyScalar(0.4).add(
        tmpTipVel.set((Math.random() - 0.5) * 8, Math.random() * 8, (Math.random() - 0.5) * 8)
      );
      spawnParticle(posL, pVel, 3 + Math.random() * 2, 8, 1.5, 0.7, 0.7, 0.7);
      spawnParticle(posR, pVel, 3 + Math.random() * 2, 8, 1.5, 0.7, 0.7, 0.7);
    }
  }
  runtime.wasOnGround = PHYSICS.onGround;

  let particleDirty = false;
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = particles[i];
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.active = false;
      pDummy.scale.set(0, 0, 0);
      pDummy.updateMatrix();
      particleMesh.setMatrixAt(i, pDummy.matrix);
      particleDirty = true;
      continue;
    }
    p.pos.addScaledVector(p.vel, dt);
    p.size += p.growth * dt;
    pDummy.position.copy(p.pos);
    pDummy.quaternion.copy(camera.quaternion);
    pDummy.scale.set(p.size, p.size, p.size);
    pDummy.updateMatrix();
    particleMesh.setMatrixAt(i, pDummy.matrix);
    let progress = p.life / p.maxLife;
    let fade = progress * progress;
    pColor.setRGB(p.r * fade, p.g * fade, p.b * fade);
    particleMesh.setColorAt(i, pColor);
    particleDirty = true;
  }
  if (particleDirty) {
    particleMesh.instanceMatrix.needsUpdate = true;
    if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;
  }
  phaseStart = performance.now() - phaseStart;
  perfCollector.recordPhase('particles', phaseStart);

  // 8. Physics Steps
  phaseStart = performance.now();
  runtime.physicsAccumulator = Math.min(runtime.physicsAccumulator + dt, PHYSICS_STEP * MAX_PHYSICS_STEPS_PER_FRAME);
  let physicsSteps = 0;
  if (debugView.slewMode) {
    runtime.physicsAccumulator = 0;
    prevPhysicsPos.copy(PHYSICS.position);
    prevPhysicsQuat.copy(PHYSICS.quaternion);
    updateSlewMode(dt);
  }
  while (!debugView.slewMode && runtime.physicsAccumulator >= PHYSICS_STEP && physicsSteps < MAX_PHYSICS_STEPS_PER_FRAME) {
    prevPhysicsPos.copy(PHYSICS.position);
    prevPhysicsQuat.copy(PHYSICS.quaternion);
    tmpImpactVel.copy(PHYSICS.velocity);
    tmpImpactAngVel.copy(PHYSICS.angularVelocity);
    const wasOnGround = PHYSICS.onGround;

    PHYSICS.dt = PHYSICS_STEP;
    if (PHYSICS.crashState === 'active') {
      calculateAerodynamics({
        THREE, PHYSICS: /** @type {any} */ (PHYSICS), AIRCRAFT: /** @type {any} */ (AIRCRAFT), WEATHER, keys,
        getTerrainHeight
      });
    }

    if (PHYSICS.crashState !== 'active') {
      PHYSICS.externalForce.set(0, 0, 0);
      PHYSICS.externalTorque.set(0, 0, 0);
    }

    physicsAdapter.step(PHYSICS_STEP);

    const terrainFloorY = (PHYSICS.crashState !== 'active' && PHYSICS.onGround)
      ? PHYSICS.position.y
      : getTerrainHeight(PHYSICS.position.x, PHYSICS.position.z) + AIRCRAFT.gearHeight;

    if (PHYSICS.position.y < terrainFloorY) {
      PHYSICS.position.y = terrainFloorY;
      if (PHYSICS.velocity.y < 0) PHYSICS.velocity.y = 0;
      physicsAdapter.syncFromState();
    }

    const agl = PHYSICS.position.y - terrainFloorY;
    const stickyGround = PHYSICS.onGround && agl < 0.45 && PHYSICS.velocity.y <= 1.2;
    if (PHYSICS.crashState === 'active') {
      PHYSICS.onGround = agl < 0.25 || stickyGround;
    }

    if (PHYSICS.crashState === 'active') {
      const impact = evaluateCrashImpact({
        wasOnGround,
        isOnGround: PHYSICS.onGround,
        velocity: tmpImpactVel,
        angularVelocity: tmpImpactAngVel,
        quaternion: PHYSICS.quaternion
      });
      PHYSICS.impactSpeed = impact.impactSpeed;
      PHYSICS.impactVerticalSpeed = impact.impactVerticalSpeed;
      PHYSICS.impactAngularSpeed = impact.impactAngularSpeed;
      if (impact.triggered) {
        crashSystem.beginCrash({
          reason: impact.reason,
          baseVelocity: tmpImpactVel,
          baseAngularVelocity: tmpImpactAngVel
        });
      }
    } else {
      crashSystem.update(PHYSICS_STEP);
    }

    physicsSteps++;
    runtime.physicsAccumulator -= PHYSICS_STEP;
  }
  phaseStart = performance.now() - phaseStart;
  perfCollector.recordPhase('physics', phaseStart);

  const alpha = runtime.physicsAccumulator / PHYSICS_STEP;
  phaseStart = performance.now();
  if (debugView.slewMode) {
    planeGroup.position.copy(PHYSICS.position);
    planeGroup.quaternion.copy(PHYSICS.quaternion);
  } else {
    planeGroup.position.lerpVectors(prevPhysicsPos, PHYSICS.position, alpha);
    planeGroup.quaternion.slerpQuaternions(prevPhysicsQuat, PHYSICS.quaternion, alpha);
  }
  phaseStart = performance.now() - phaseStart;
  perfCollector.recordPhase('aircraft_pose', phaseStart);

  // 9. Post-Physics Sync
  phaseStart = performance.now();
  if (shadowsEnabled) {
    const cameraMode = cameraController.getMode();
    const highShadowQuality = PHYSICS.position.y < 1200 && cameraMode !== 2;
    const targetShadowMapSize = highShadowQuality ? SHADOW_MAP_NEAR : SHADOW_MAP_FAR;
    if (targetShadowMapSize !== currentShadowMapSize) {
      currentShadowMapSize = targetShadowMapSize;
      dirLight.shadow.mapSize.set(currentShadowMapSize, currentShadowMapSize);
      if (dirLight.shadow.map) {
        dirLight.shadow.map.dispose();
        dirLight.shadow.map = null;
      }
    }

    // Shadow centering
    tmpShadowSunDir.copy(dirLight.position).sub(dirLight.target.position).normalize();
    const shadowCenter = crashSystem.getFocusPosition(tmpFocusPos);
    let shadowTarget = shadowCenter;
    let shadowExtent = Math.max(
      16000,
      (260 + Math.min(460, PHYSICS.airspeed * 1.35 + Math.max(0, PHYSICS.position.y) * 0.16)) * 3.0
    );
    const shadowContributor = getNearestShadowContributor?.(shadowCenter, 1800);
    if (shadowContributor) {
      const mergedShadowFit = mergeShadowCoverage(
        shadowCenter,
        shadowExtent,
        shadowContributor.center,
        shadowContributor.radius,
        60,
        tmpShadowFitCenter
      );
      shadowTarget = mergedShadowFit.center;
      shadowExtent = mergedShadowFit.extent;
    }
    dirLight.target.position.copy(shadowTarget);
    dirLight.target.updateMatrixWorld();
    dirLight.position.copy(shadowTarget).addScaledVector(tmpShadowSunDir, 2000);
    updateSurfaceShadowCoverage?.(shadowTarget, shadowExtent);

    const shadowMoved = Math.abs(shadowTarget.x - prevShadowCenter.x) > 20 || Math.abs(shadowTarget.y - prevShadowCenter.y) > 20 || Math.abs(shadowTarget.z - prevShadowCenter.z) > 20;
    const shadowExtentChanged = Math.abs(shadowExtent - prevShadowExtent) > 15;
    if (shadowMoved || shadowExtentChanged) {
      const shadowCam = dirLight.shadow.camera;
      shadowCam.left = -shadowExtent;
      shadowCam.right = shadowExtent;
      shadowCam.top = shadowExtent;
      shadowCam.bottom = -shadowExtent;
      shadowCam.near = 40;
      shadowCam.far = 5200;
      shadowCam.updateProjectionMatrix();
      prevShadowCenter.copy(shadowTarget);
      prevShadowExtent = shadowExtent;
    }
    if (shadowCameraHelper?.visible) {
      shadowCameraHelper.update();
    }
  }
  phaseStart = performance.now() - phaseStart;
  perfCollector.recordPhase('shadow_setup', phaseStart);

  // Terrain and World LOD update
  phaseStart = performance.now();
  const chunkX = Math.floor(PHYSICS.position.x / 4000);
  const chunkZ = Math.floor(PHYSICS.position.z / 4000);
  const terrainDue = (now - lastTerrainUpdateMs) >= worldLodSettings.world.updateIntervalMs;
  const chunkChanged = chunkX !== lastTerrainChunkX || chunkZ !== lastTerrainChunkZ;
  
  const dx = PHYSICS.position.x - lastTerrainUpdatePosX;
  const dz = PHYSICS.position.z - lastTerrainUpdatePosZ;
  const distMovedSq = dx * dx + dz * dz;
  const movedEnough = distMovedSq > 2500; // 50 units

  const terrainNeedsWork = !isReady();
  const terrainHasPendingWork = hasPendingTerrainWork?.() === true;
  flushPendingLeafApplies?.(terrainDue || chunkChanged ? 2 : 1, terrainDue || chunkChanged ? 4 : 2);
  const shouldUpdateTerrain = chunkChanged || (terrainDue && (movedEnough || terrainNeedsWork || terrainHasPendingWork));
  let terrainUpdated = false;
  let worldLodUpdated = false;
  if (shouldUpdateTerrain) {
    const terrainDiagnostics = updateTerrain() as TerrainSelectionDiagnostics | null;
    lastTerrainUpdateMs = now;
    lastTerrainChunkX = chunkX;
    lastTerrainChunkZ = chunkZ;
    lastTerrainUpdatePosX = PHYSICS.position.x;
    lastTerrainUpdatePosZ = PHYSICS.position.z;
    terrainUpdated = true;
    if (terrainDiagnostics?.timings) {
      perfCollector.recordPhase('terrain_selection', terrainDiagnostics.timings.selectionBuildMs ?? 0);
      perfCollector.recordPhase('terrain_queue_schedule', terrainDiagnostics.timings.queueSchedulingMs ?? 0);
      perfCollector.recordPhase('terrain_queue_prune', terrainDiagnostics.timings.queuePruneMs ?? 0);
      perfCollector.recordPhase('terrain_leaf_build', terrainDiagnostics.timings.leafBuildMs ?? 0);
      perfCollector.recordPhase('terrain_leaf_build_dispatch', terrainDiagnostics.timings.leafBuildDispatchMs ?? 0);
      perfCollector.recordPhase('terrain_leaf_apply', terrainDiagnostics.timings.leafBuildApplyMs ?? 0);
      perfCollector.recordPhase('terrain_chunk_queue', terrainDiagnostics.timings.chunkBuildQueueMs ?? 0);
      perfCollector.recordPhase('terrain_prop_queue', terrainDiagnostics.timings.propBuildQueueMs ?? 0);
    }
  }
  const asyncLeafApplyStats = consumeLeafBuildApplyTiming?.() || null;
  if (!shouldUpdateTerrain && asyncLeafApplyStats?.applyMs > 0) {
    perfCollector.recordPhase('terrain_leaf_build', asyncLeafApplyStats.applyMs);
    perfCollector.recordPhase('terrain_leaf_apply', asyncLeafApplyStats.applyMs);
  }
  if (terrainDue || chunkChanged) {
    updateWorldLOD(camera.position);
    worldLodUpdated = true;
  }
  phaseStart = performance.now() - phaseStart;
  perfCollector.recordPhase('terrain_lod', phaseStart);

  phaseStart = performance.now();
  cameraController.updateCamera(dt);
  phaseStart = performance.now() - phaseStart;
  perfCollector.recordPhase('camera', phaseStart);

  phaseStart = performance.now();
  updateTokenSystem({
    timeMs: now,
    aircraftPosition: PHYSICS.position,
    cameraPosition: camera.position,
    cameraQuaternion: camera.quaternion
  });
  let hudUpdated = false;
  if (runtime.frameCount % 3 === 0) {
    hud.updateHUD();
    hudUpdated = true;
  }
  phaseStart = performance.now() - phaseStart;
  perfCollector.recordPhase('tokens_hud', phaseStart);

  // 10. Final Render
  phaseStart = performance.now();
  renderFrame(dt);
  const renderTotalMs = performance.now() - phaseStart;
  const renderPassTimings = getRenderPassTimings();
  perfCollector.recordPhase('render', renderTotalMs);
  perfCollector.recordPhase('render_total', renderTotalMs);
  perfCollector.recordPhase('render_scene', renderPassTimings.renderScene ?? 0);
  perfCollector.recordPhase('render_smaa', renderPassTimings.smaa ?? 0);
  perfCollector.recordPhase('render_bloom', renderPassTimings.bloom ?? 0);
  updateProfilingReadiness(now);
  perfCollector.endFrame({
    now,
    physicsSteps,
    terrainUpdated,
    worldLodUpdated,
    hudUpdated
  });
}

// Initialize Loader Tips
const loaderTipsInterval = startLoaderTips('loader-subtext', 2200);
let loaderHidden = false;

function hideLoader() {
  if (loaderHidden) return;
  loaderHidden = true;
  startupTimeline.loaderHiddenAtMs ??= performance.now();
  runtimeWindow.fsimWorld.loaderHidden = true;
  if (loaderTipsInterval) clearInterval(loaderTipsInterval);
  const loader = document.getElementById('loader');
  if (!loader) return;
  debugLog('Hiding loader...');
  loader.style.opacity = '0';
  setTimeout(() => {
    loader.style.display = 'none';
    debugLog('Loader removed.');
  }, 1000);
}

updateLoaderProgress();

function waitForStartupReady({ warmupPromise }) {
  return Promise.resolve(warmupPromise).then(() => new Promise<void>((resolve) => {
    function tick() {
      const terrainReady = isReady();
      updateLoaderProgress();
      if (terrainReady) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    }
    tick();
  }));
}

// Initialization complete
setTimeout(() => {
  // Final attempt to resume if not already done
  ProceduralAudio.resume();

  debugLog('Finalizing initialization...');
  const urlParams = new URLSearchParams(runtimeWindow.location.search);
  const spawnX = urlParams.has('x') ? parseFloat(urlParams.get('x')) : 0;
  const spawnY = urlParams.has('y') ? parseFloat(urlParams.get('y')) : AIRCRAFT.gearHeight;
  const spawnZ = urlParams.has('z') ? parseFloat(urlParams.get('z')) : 1900;
  spawnState.x = spawnX;
  spawnState.y = spawnY;
  spawnState.z = spawnZ;

  if (urlParams.get('fog') === '0') {
    WEATHER.targetFog = 0;
    WEATHER.currentFog = 0;
    if (scene.fog) scene.fog.density = 0;
  }

  if (urlParams.get('clouds') === '0') {
    clouds.visible = false;
  }

  if (urlParams.get('hideplane') === '1') {
    planeGroup.visible = false;
  }

  debugLog(`Setting initial position: [${spawnX}, ${spawnY}, ${spawnZ}]`);
  PHYSICS.position.set(spawnX, spawnY, spawnZ);
  PHYSICS.velocity.set(0, 0, 0);
  PHYSICS.angularVelocity.set(0, 0, 0);
  PHYSICS.externalForce.set(0, 0, 0);
  PHYSICS.externalTorque.set(0, 0, 0);

  prevPhysicsPos.copy(PHYSICS.position);
  prevPhysicsQuat.copy(PHYSICS.quaternion);

  if (urlParams.has('tilt')) {
    const tiltDeg = parseFloat(urlParams.get('tilt'));
    cameraController.setRotation(0, -tiltDeg * (Math.PI / 180));
  }
  if (urlParams.has('camDist')) {
    cameraController.setDistance(parseFloat(urlParams.get('camDist')));
  }

  physicsAdapter.syncFromState();
  animate();

  startupTimeline.shaderWarmupStartedAtMs ??= performance.now();
  const warmupPromise = warmupShaders(camera, {
    onProgress: (progress: WarmupProgress) => {
      const ratio = Number.isFinite(progress?.ratio) ? progress.ratio : 0;
      let text = 'Preparing asset warmup...';
      if (progress?.stage === 'building') {
        const completed = Number.isFinite(progress?.completed) ? progress.completed : 0;
        const total = Number.isFinite(progress?.total) ? progress.total : 1;
        text = `Preparing shaders ${completed}/${Math.max(1, total - 1)}`;
      } else if (progress?.stage === 'compiling') {
        text = 'Compiling shader pipelines...';
      } else if (progress?.stage === 'complete' || progress?.stage === 'skipped') {
        text = 'Asset warmup ready';
      }
      loaderProgressState.assets.ratio = progress?.stage === 'compiling' ? Math.max(ratio, 0.92) : ratio;
      loaderProgressState.assets.text = text;
      updateLoaderProgress();
    }
  }).then((report) => {
    startupTimeline.shaderWarmupCompletedAtMs ??= performance.now();
    runtimeWindow.fsimWorld.shaderValidation = report;
    runtimeWindow.fsimWorld.shaderValidationSummary = report.summary;
    loaderProgressState.assets.ratio = 1;
    loaderProgressState.assets.text = 'Asset warmup ready';
    updateLoaderProgress();
    if (shouldLogShaderValidation) {
      console.info('[shader-validation]', report.summary);
    }
    return report;
  });
  waitForStartupReady({ warmupPromise }).then(() => {
    startupTimeline.startupReadyAtMs ??= performance.now();
    completeBootstrap();
    startupTimeline.bootstrapCompletedAtMs ??= performance.now();
    runtimeWindow.fsimWorld.bootstrapComplete = true;
    updateTerrain();
    hideLoader();
  });
}, 1500);
