import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import GUI from 'lil-gui';
import { Noise } from './noise.js';
import { createSimulationState } from './state.js';
import { createWorldObjects } from './world/objects.js';
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

// Initialize audio nodes early (will be suspended until gesture)
ProceduralAudio.init();

// Handle browser audio suspension policy
const resumeAudio = () => {
  ProceduralAudio.resume();
  window.removeEventListener('mousedown', resumeAudio);
  window.removeEventListener('keydown', resumeAudio);
  window.removeEventListener('touchstart', resumeAudio);
};
window.addEventListener('mousedown', resumeAudio);
window.addEventListener('keydown', resumeAudio);
window.addEventListener('touchstart', resumeAudio);

// ==========================================
// 1. CORE SETUP & GLOBALS
// ==========================================
const container = document.getElementById('game-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3a2e3f);
scene.fog = new THREE.FogExp2(0x3a2e3f, 0.00015);
const urlParamsForInit = new URLSearchParams(window.location.search);
const runtimeConfig = window.__FSIM_RUNTIME__ || {};
const shouldShowDebugUi = runtimeConfig.showDebugUi === true || urlParamsForInit.get('debug') === '1';
const debugView = {
  slewMode: false,
  slewSpeed: 250
};
const lodSettings = createRuntimeLodSettings({ urlSearch: window.location.search });

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
  profilingReadyAtMs: null
};
const perfCollector = createPerformanceCollector({
  renderer,
  getAdaptiveQualitySnapshot,
  getRenderPassTimings,
  getProfilingSnapshot: () => {
    const now = performance.now();
    return {
      bootstrapComplete: window.fsimWorld?.bootstrapComplete ?? false,
      loaderHidden: window.fsimWorld?.loaderHidden ?? false,
      worldReady: window.fsimWorld?.worldReady ?? false,
      profilingReady: profilingState.profilingReady,
      profilingReadinessReason: profilingState.profilingReadinessReason,
      lastProgramsChangeMsAgo: now - profilingState.lastProgramsChangeAtMs,
      lastTexturesChangeMsAgo: now - profilingState.lastTexturesChangeAtMs,
      lastGeometriesChangeMsAgo: now - profilingState.lastGeometriesChangeAtMs,
      quietWindowMs: profilingState.quietWindowMs,
      profilingReadyAtMs: profilingState.profilingReadyAtMs,
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
  getTerrainSelectionDiagnostics,
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
  invalidateWorldLod,
  updateWorldLOD
} = createWorldObjects({ scene, renderer, Noise, PHYSICS, AIRCRAFT, WEATHER, lodSettings });

function refreshLodState() {
  normalizeLodSettings(worldLodSettings);
  updateTerrain();
  invalidateWorldLod();
  updateWorldLOD(camera.position, { force: true });
  debugGui?.controllersRecursive?.().forEach((controller) => controller.updateDisplay());
}

if (debugGui) {
  const lodFolder = debugGui.addFolder('LOD');
  const worldFolder = lodFolder.addFolder('World');
  worldFolder.add(worldLodSettings.world, 'updateIntervalMs', 16, 1000, 1).name('Update Interval');
  worldFolder.add(worldLodSettings.world, 'cameraMoveThreshold', 0, 100, 1).name('Move Threshold');

  const airportFolder = lodFolder.addFolder('Airport');
  airportFolder.add(worldLodSettings.airport.thresholds, 'mid', 1000, 50000, 100).name('Mid Distance').onFinishChange(refreshLodState);
  airportFolder.add(worldLodSettings.airport.thresholds, 'low', 1000, 80000, 100).name('Low Distance').onFinishChange(refreshLodState);
  airportFolder.add(worldLodSettings.airport.thresholds, 'cull', 1000, 120000, 100).name('Cull Distance').onFinishChange(refreshLodState);
  airportFolder.add(worldLodSettings.airport, 'distanceHysteresis', 0, 5000, 50).name('Hysteresis').onFinishChange(refreshLodState);
  airportFolder.add(worldLodSettings.airport, 'shadowHighDetailDistance', 1000, 30000, 100).name('Shadow Distance').onFinishChange(refreshLodState);

  const terrainFolder = lodFolder.addFolder('Terrain');
  terrainFolder.add(worldLodSettings.terrain, 'renderDistance', 0, 16, 1).name('Render Distance').onFinishChange(refreshLodState);
  terrainFolder.add(worldLodSettings.terrain.ringThresholds, '0', 0, 8, 1).name('LOD0 Ring').onFinishChange(refreshLodState);
  terrainFolder.add(worldLodSettings.terrain.ringThresholds, '1', 1, 12, 1).name('LOD1 Ring').onFinishChange(refreshLodState);
  terrainFolder.add(worldLodSettings.terrain.ringThresholds, '2', 2, 16, 1).name('LOD2 Ring').onFinishChange(refreshLodState);
  terrainFolder.add(worldLodSettings.terrain, 'ringHysteresis', 0, 4, 1).name('Ring Hysteresis').onFinishChange(refreshLodState);

  if (terrainDebugSettings && typeof applyTerrainDebugSettings === 'function') {
    const nativeFolder = lodFolder.addFolder('Native Terrain');
    nativeFolder.add(terrainDebugSettings, 'selectionInterestRadius', 2000, 60000, 250)
      .name('Visible Radius')
      .onFinishChange(() => applyTerrainDebugSettings({ refreshSelection: true }));
    nativeFolder.add(terrainDebugSettings, 'selectionBlockingRadius', 250, 12000, 50)
      .name('Priority Radius')
      .onFinishChange(() => applyTerrainDebugSettings({ refreshSelection: true }));
    nativeFolder.add(terrainDebugSettings, 'selectionMinCellSize', 64, 4000, 32)
      .name('Min Cell Size')
      .onFinishChange(() => applyTerrainDebugSettings({ rebuildSurfaces: true, refreshSelection: true }));
    nativeFolder.add(terrainDebugSettings, 'selectionSplitDistanceFactor', 0.1, 2.0, 0.05)
      .name('Distance Bias')
      .onFinishChange(() => applyTerrainDebugSettings({ refreshSelection: true }));
    nativeFolder.add(terrainDebugSettings, 'selectionMaxDepth', 1, 10, 1)
      .name('Max Depth')
      .onFinishChange(() => applyTerrainDebugSettings({ rebuildSurfaces: true, refreshSelection: true }));

    const bootstrapFolder = nativeFolder.addFolder('Bootstrap');
    bootstrapFolder.add(terrainDebugSettings, 'bootstrapInterestRadius', 500, 12000, 50)
      .name('Visible Radius')
      .onFinishChange(() => applyTerrainDebugSettings({ refreshSelection: true }));
    bootstrapFolder.add(terrainDebugSettings, 'bootstrapBlockingRadius', 250, 8000, 50)
      .name('Priority Radius')
      .onFinishChange(() => applyTerrainDebugSettings({ refreshSelection: true }));
    bootstrapFolder.add(terrainDebugSettings, 'bootstrapMaxSelectedLeaves', 1, 256, 1)
      .name('Max Leaves')
      .onFinishChange(() => applyTerrainDebugSettings({ refreshSelection: true }));
    bootstrapFolder.add(terrainDebugSettings, 'bootstrapMaxBlockingLeaves', 1, 128, 1)
      .name('Max Blocking Leaves')
      .onFinishChange(() => applyTerrainDebugSettings({ refreshSelection: true }));

    const densityFolder = nativeFolder.addFolder('Surface Density');
    densityFolder.add(terrainDebugSettings, 'resolution32MaxNodeSize', 64, 8000, 32)
      .name('32x Max Size')
      .onFinishChange(() => applyTerrainDebugSettings({ rebuildSurfaces: true, refreshSelection: true }));
    densityFolder.add(terrainDebugSettings, 'resolution16MaxNodeSize', 64, 12000, 32)
      .name('16x Max Size')
      .onFinishChange(() => applyTerrainDebugSettings({ rebuildSurfaces: true, refreshSelection: true }));
    densityFolder.add(terrainDebugSettings, 'resolution8MaxNodeSize', 64, 20000, 32)
      .name('8x Max Size')
      .onFinishChange(() => applyTerrainDebugSettings({ rebuildSurfaces: true, refreshSelection: true }));
    densityFolder.add(terrainDebugSettings, 'resolution4MaxNodeSize', 64, 30000, 32)
      .name('4x Max Size')
      .onFinishChange(() => applyTerrainDebugSettings({ rebuildSurfaces: true, refreshSelection: true }));
    nativeFolder.add(terrainDebugSettings, 'showTerrainWireframe')
      .name('Wireframe')
      .onChange(() => applyTerrainDebugSettings({ rebuildSurfaces: false, refreshSelection: false }));
    const objectsFolder = nativeFolder.addFolder('Objects');
    objectsFolder.add(terrainDebugSettings, 'showTrees')
      .name('Trees')
      .onChange(() => applyTerrainDebugSettings({ rebuildProps: true, refreshSelection: false }));
    objectsFolder.add(terrainDebugSettings, 'showBuildings')
      .name('Buildings')
      .onChange(() => applyTerrainDebugSettings({ rebuildProps: true, refreshSelection: false }));
  }
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

const hud = createHUD({ PHYSICS, WEATHER, getTerrainHeight });
setTokenCollectionHandler(({ count, worldPosition, collectedAtMs }) => {
  ProceduralAudio.coinPickup();
  hud.showTokenPickup({ count, worldPosition, collectedAtMs });
});
const shouldLogShaderValidation = urlParamsForInit.get('validateShaders') === '1';

window.fsimWorld = {
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
  terrainDebugSettings,
  applyTerrainDebugSettings,
  terrainSelection: getTerrainSelectionDiagnostics?.() || null,
  shaderValidation: getShaderValidationReport(),
  shaderValidationSummary: getShaderValidationSummary()
};
window.fsimPerf = perfCollector;

// Initialize LiveReload functionality
initLiveReload(window.fsimWorld);

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

const prevPhysicsPos = new THREE.Vector3();
const prevPhysicsQuat = new THREE.Quaternion();

const prevShadowCenter = new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
let prevShadowExtent = -1;
let lastTerrainChunkX = Number.POSITIVE_INFINITY;
let lastTerrainChunkZ = Number.POSITIVE_INFINITY;
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
  PHYSICS,
  spawnParticle,
  getBreakupPieceSpecs,
  onResetRequested: () => {
    window.resetFlight();
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
window.triggerCrash = function (reason) {
  if (PHYSICS.crashState !== 'active') return;
  crashSystem.beginCrash({
    reason,
    baseVelocity: tmpImpactVel.copy(PHYSICS.velocity),
    baseAngularVelocity: tmpImpactAngVel.copy(PHYSICS.angularVelocity)
  });
};

window.resetFlight = function () {
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

window.addEventListener('resize', handleResize);

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

  window.fsimWorld.worldReady = worldReady;

  let reason = 'stable';
  if (!window.fsimWorld.bootstrapComplete) {
    reason = 'bootstrap_incomplete';
  } else if (!window.fsimWorld.loaderHidden) {
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

  profilingState.profilingReadinessReason = reason;
  profilingState.profilingReady = reason === 'stable';
  if (profilingState.profilingReady) {
    profilingState.profilingReadyAtMs ??= now;
  } else {
    profilingState.profilingReadyAtMs = null;
  }

  window.fsimWorld.profilingReady = profilingState.profilingReady;
  window.fsimWorld.profilingReadinessReason = reason;
  window.fsimWorld.terrainSelection = getTerrainSelectionDiagnostics?.() || null;
}

function animate() {
  requestAnimationFrame(animate);
  stats.update();

  const now = performance.now();
  let dt = Math.min((now - runtime.lastTime) / 1000, 0.05);
  runtime.lastTime = now;

  runtime.frameCount++;
  perfCollector.beginFrame({ now, dt });
  let phaseStart = performance.now();
  updateAdaptiveQuality(dt);
  perfCollector.recordPhase('adaptive_quality', performance.now() - phaseStart);

  // 1. Update visuals (weather, lighting, clouds)
  phaseStart = performance.now();
  weatherManager.update(dt, runtime.frameCount, camera);
  perfCollector.recordPhase('weather', performance.now() - phaseStart);

  // 2. Water Animation
  phaseStart = performance.now();
  if (waterMaterial.userData.timeUniform) {
    waterMaterial.userData.timeUniform.value += dt;
  }
  perfCollector.recordPhase('water_animation', performance.now() - phaseStart);


  // 3. Aircraft Control Surfaces
  phaseStart = performance.now();
  updateControlSurfaces(PHYSICS, dt);
  perfCollector.recordPhase('control_surfaces', performance.now() - phaseStart);

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
  perfCollector.recordPhase('lights', performance.now() - phaseStart);

  // 5. Airport Systems (ALS)
  phaseStart = performance.now();
  airportSystems.updateALS(now);
  updateWorldObjects(now);
  perfCollector.recordPhase('world_objects', performance.now() - phaseStart);

  // 5b. Aircraft LOD
  phaseStart = performance.now();
  updateAircraftLOD(camera);
  perfCollector.recordPhase('aircraft_lod', performance.now() - phaseStart);

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
  perfCollector.recordPhase('audio', performance.now() - phaseStart);

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
    if (camera.quaternion) pDummy.quaternion.copy(camera.quaternion);
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
  perfCollector.recordPhase('particles', performance.now() - phaseStart);

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
        THREE, PHYSICS, AIRCRAFT, WEATHER, keys,
        getTerrainHeight, gearGroup, planeGroup, Noise
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
  perfCollector.recordPhase('physics', performance.now() - phaseStart);

  const alpha = runtime.physicsAccumulator / PHYSICS_STEP;
  phaseStart = performance.now();
  if (debugView.slewMode) {
    planeGroup.position.copy(PHYSICS.position);
    planeGroup.quaternion.copy(PHYSICS.quaternion);
  } else {
    planeGroup.position.lerpVectors(prevPhysicsPos, PHYSICS.position, alpha);
    planeGroup.quaternion.slerpQuaternions(prevPhysicsQuat, PHYSICS.quaternion, alpha);
  }
  perfCollector.recordPhase('aircraft_pose', performance.now() - phaseStart);

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
    dirLight.target.position.copy(shadowCenter);
    dirLight.target.updateMatrixWorld();
    dirLight.position.copy(shadowCenter).addScaledVector(tmpShadowSunDir, 2000);

    const shadowExtent = 260 + Math.min(460, PHYSICS.airspeed * 1.35 + Math.max(0, PHYSICS.position.y) * 0.16);
    const shadowMoved = Math.abs(shadowCenter.x - prevShadowCenter.x) > 20 || Math.abs(shadowCenter.y - prevShadowCenter.y) > 20 || Math.abs(shadowCenter.z - prevShadowCenter.z) > 20;
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
      prevShadowCenter.copy(shadowCenter);
      prevShadowExtent = shadowExtent;
    }
  }
  perfCollector.recordPhase('shadow_setup', performance.now() - phaseStart);

  // Terrain and World LOD update
  phaseStart = performance.now();
  const chunkX = Math.floor(PHYSICS.position.x / 4000);
  const chunkZ = Math.floor(PHYSICS.position.z / 4000);
  const terrainDue = (now - lastTerrainUpdateMs) >= worldLodSettings.world.updateIntervalMs;
  const chunkChanged = chunkX !== lastTerrainChunkX || chunkZ !== lastTerrainChunkZ;
  const terrainNeedsWork = !isReady();
  const terrainHasPendingWork = hasPendingTerrainWork?.() === true;
  const shouldUpdateTerrain = chunkChanged || ((terrainNeedsWork || terrainHasPendingWork) && terrainDue);
  let terrainUpdated = false;
  let worldLodUpdated = false;
  if (shouldUpdateTerrain) {
    updateTerrain();
    lastTerrainUpdateMs = now;
    lastTerrainChunkX = chunkX;
    lastTerrainChunkZ = chunkZ;
    terrainUpdated = true;
  }
  if (terrainDue || chunkChanged) {
    updateWorldLOD(camera.position);
    worldLodUpdated = true;
  }
  perfCollector.recordPhase('terrain_lod', performance.now() - phaseStart);

  phaseStart = performance.now();
  cameraController.updateCamera(dt);
  perfCollector.recordPhase('camera', performance.now() - phaseStart);

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
  perfCollector.recordPhase('tokens_hud', performance.now() - phaseStart);

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
const loaderTipsInterval = startLoaderTips('loader-subtext', 150);
let loaderHidden = false;

function hideLoader() {
  if (loaderHidden) return;
  loaderHidden = true;
  window.fsimWorld.loaderHidden = true;
  const loader = document.getElementById('loader');
  if (!loader) return;
  debugLog('Hiding loader...');
  loader.style.opacity = '0';
  setTimeout(() => {
    loader.style.display = 'none';
    if (loaderTipsInterval) clearInterval(loaderTipsInterval);
    debugLog('Loader removed.');
  }, 1000);
}

function waitForStartupReady({ warmupPromise, maxWaitMs = 12000 }) {
  return Promise.resolve(warmupPromise).then(() => new Promise((resolve) => {
    const startTime = performance.now();
    function tick() {
      const terrainReady = isReady();
      const timedOut = (performance.now() - startTime) >= maxWaitMs;
      if (terrainReady || timedOut) {
        if (timedOut && !terrainReady) {
          debugLog('[startup] Terrain preload timed out; presenting coarse terrain and refining asynchronously.');
        }
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
  const urlParams = new URLSearchParams(window.location.search);
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

  const warmupPromise = warmupShaders(camera).then((report) => {
    window.fsimWorld.shaderValidation = report;
    window.fsimWorld.shaderValidationSummary = report.summary;
    if (shouldLogShaderValidation) {
      console.info('[shader-validation]', report.summary);
    }
    return report;
  });
  waitForStartupReady({ warmupPromise }).then(() => {
    completeBootstrap();
    window.fsimWorld.bootstrapComplete = true;
    updateTerrain();
    hideLoader();
  });
}, 1500);
