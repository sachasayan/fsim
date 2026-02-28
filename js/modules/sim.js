import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Noise } from './noise.js';
import { createSimulationState } from './state.js';
import { createWorldObjects } from './world/objects.js';
import { calculateAerodynamics } from './physics/updatePhysics.js';
import { createPhysicsAdapter } from './physics/physicsAdapter.js';
import { createCameraController } from './camera/updateCamera.js';
import { createHUD } from './ui/hud.js';
import GUI from 'lil-gui';
import { LIGHTING_PRESETS, getWeatherModeConfig } from './lighting.js';

// ==========================================
// 2. CORE SETUP & GLOBALS
// ==========================================
const container = document.getElementById('game-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3a2e3f);
scene.fog = new THREE.FogExp2(0x3a2e3f, 0.00015);

const gameHeight = window.innerHeight * 0.75;
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / gameHeight, 1, 100000);
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setSize(window.innerWidth, gameHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
container.appendChild(renderer.domElement);

const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, gameHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 5.0;
bloomPass.strength = 0.8;
bloomPass.radius = 0.4;

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

const { AIRCRAFT, PHYSICS, WEATHER, keys, runtime } = createSimulationState({ scene });
const physicsAdapter = createPhysicsAdapter({ PHYSICS, AIRCRAFT });
physicsAdapter.init();
scene.background = new THREE.Color(WEATHER.clearColor);
scene.fog = new THREE.FogExp2(WEATHER.clearColor, WEATHER.currentFog);
const clearWeatherColor = new THREE.Color(WEATHER.clearColor);
const stormWeatherColor = new THREE.Color(WEATHER.stormColor);
const currentWeatherColor = new THREE.Color();
const clearCloudColor = new THREE.Color(WEATHER.cloudColorClear);
const stormCloudColor = new THREE.Color(WEATHER.cloudColorStorm);
const currentCloudColor = new THREE.Color(clearCloudColor);
renderer.toneMappingExposure = WEATHER.exposure;
bloomPass.threshold = WEATHER.bloomThreshold;
bloomPass.strength = WEATHER.bloomStrength;
bloomPass.radius = WEATHER.bloomRadius;
const PHYSICS_STEP = 1 / 75;
const MAX_PHYSICS_STEPS_PER_FRAME = 4;
const tmpHdgEuler = new THREE.Euler();
const tmpCrashStep = new THREE.Vector3();
const tmpCrashSpinEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const tmpCrashSpinQuat = new THREE.Quaternion();

// ==========================================
// 4. WORLD OBJECTS
// ==========================================
const {
  hemiLight,
  dirLight,
  waterMaterial,
  PAPI,
  alsStrobes,
  strobeMatOn,
  strobeMatOff,
  getTerrainHeight,
  updateTerrain,
  clouds,
  cloudMaterial,
  updateClouds,
  getCloudTuning,
  setCloudTuning,
  applyEnvironmentFromWeather,
  MAX_PARTICLES,
  particleMesh,
  particles,
  spawnParticle,
  pDummy,
  pColor,
  planeGroup,
  engineFans,
  engineExhausts,
  movableSurfaces,
  gearGroup,
  strobes,
  beacons
} = createWorldObjects({ scene, renderer, Noise, PHYSICS, AIRCRAFT, WEATHER });

const tmpTouchOffsetL = new THREE.Vector3();
const tmpTouchOffsetR = new THREE.Vector3();
const tmpTouchPosL = new THREE.Vector3();
const tmpTouchPosR = new THREE.Vector3();
const tmpTouchVel = new THREE.Vector3();
const tmpTipVel = new THREE.Vector3();

const cameraController = createCameraController({
  camera,
  planeGroup,
  clouds,
  PHYSICS,
  AIRCRAFT,
  getTerrainHeight
});

const hud = createHUD({ PHYSICS, WEATHER, getTerrainHeight });

function colorNumberToHex(value) {
  return `#${(value >>> 0).toString(16).padStart(6, '0')}`;
}

function colorHexToNumber(value) {
  return Number.parseInt(value.replace('#', ''), 16);
}

function syncDerivedWeatherCache() {
  clearWeatherColor.setHex(WEATHER.clearColor);
  stormWeatherColor.setHex(WEATHER.stormColor);
  clearCloudColor.setHex(WEATHER.cloudColorClear);
  stormCloudColor.setHex(WEATHER.cloudColorStorm);
  renderer.toneMappingExposure = WEATHER.exposure;
  bloomPass.threshold = WEATHER.bloomThreshold;
  bloomPass.strength = WEATHER.bloomStrength;
  bloomPass.radius = WEATHER.bloomRadius;
}

function applyLightingPresetToWeather(presetId) {
  const preset = LIGHTING_PRESETS[presetId];
  if (!preset) return;

  WEATHER.lightingPresetId = presetId;
  WEATHER.clearColor = preset.clearColor;
  WEATHER.stormColor = preset.stormColor;
  WEATHER.lightAmbientBase = preset.ambientBase;
  WEATHER.lightDirectBase = preset.directBase;
  WEATHER.hemiSkyColor = preset.hemiSkyColor;
  WEATHER.hemiGroundColor = preset.hemiGroundColor;
  WEATHER.dirColor = preset.dirColor;
  WEATHER.sunPhiDeg = preset.sunPhiDeg;
  WEATHER.sunThetaDeg = preset.sunThetaDeg;
  WEATHER.skyTurbidity = preset.skyTurbidity;
  WEATHER.skyRayleigh = preset.skyRayleigh;
  WEATHER.skyMieCoefficient = preset.skyMieCoefficient;
  WEATHER.skyMieDirectionalG = preset.skyMieDirectionalG;
  WEATHER.hazeColor = preset.hazeColor;
  WEATHER.hazeOpacity = preset.hazeOpacity;
  WEATHER.starOpacity = preset.starOpacity;
  WEATHER.exposure = preset.exposure;
  WEATHER.bloomThreshold = preset.bloom.threshold;
  WEATHER.bloomStrength = preset.bloom.strength;
  WEATHER.bloomRadius = preset.bloom.radius;
  WEATHER.cloudColorClear = preset.cloudColorClear;
  WEATHER.cloudColorStorm = preset.cloudColorStorm;
  WEATHER.cloudOpacityBase = preset.cloudOpacityBase;
  WEATHER.cloudOpacityStorm = preset.cloudOpacityStorm;
  WEATHER.cloudEmissiveBase = preset.cloudEmissiveBase;
  WEATHER.cloudEmissiveStorm = preset.cloudEmissiveStorm;
  syncDerivedWeatherCache();
  if (applyEnvironmentFromWeather) {
    applyEnvironmentFromWeather(WEATHER, { refreshEnvironmentMap: true });
  }
}

const weatherModeLabels = {
  clear: 0,
  overcast: 1,
  storm: 2
};
const weatherModeNames = ['clear', 'overcast', 'storm'];
const cloudTuningState = getCloudTuning ? getCloudTuning() : {
  nearFadeStart: 13000,
  nearFadeEnd: 18000,
  minLight: 0.5,
  farFadeStart: 9000,
  farFadeEnd: 14500,
  farOpacityScale: 0.7
};

const envGuiState = {
  presetId: WEATHER.lightingPresetId,
  weatherMode: weatherModeNames[WEATHER.mode] ?? 'clear',
  clearColor: colorNumberToHex(WEATHER.clearColor),
  stormColor: colorNumberToHex(WEATHER.stormColor),
  hemiSkyColor: colorNumberToHex(WEATHER.hemiSkyColor),
  hemiGroundColor: colorNumberToHex(WEATHER.hemiGroundColor),
  dirColor: colorNumberToHex(WEATHER.dirColor),
  hazeColor: colorNumberToHex(WEATHER.hazeColor),
  sunPhiDeg: WEATHER.sunPhiDeg,
  sunThetaDeg: WEATHER.sunThetaDeg,
  skyTurbidity: WEATHER.skyTurbidity,
  skyRayleigh: WEATHER.skyRayleigh,
  skyMieCoefficient: WEATHER.skyMieCoefficient,
  skyMieDirectionalG: WEATHER.skyMieDirectionalG,
  lightAmbientBase: WEATHER.lightAmbientBase,
  lightDirectBase: WEATHER.lightDirectBase,
  hazeOpacity: WEATHER.hazeOpacity,
  starOpacity: WEATHER.starOpacity,
  exposure: WEATHER.exposure,
  bloomThreshold: WEATHER.bloomThreshold,
  bloomStrength: WEATHER.bloomStrength,
  bloomRadius: WEATHER.bloomRadius,
  cloudColorClear: colorNumberToHex(WEATHER.cloudColorClear),
  cloudColorStorm: colorNumberToHex(WEATHER.cloudColorStorm),
  cloudOpacityBase: WEATHER.cloudOpacityBase,
  cloudOpacityStorm: WEATHER.cloudOpacityStorm,
  cloudEmissiveBase: WEATHER.cloudEmissiveBase,
  cloudEmissiveStorm: WEATHER.cloudEmissiveStorm,
  nearFadeStart: cloudTuningState.nearFadeStart,
  nearFadeEnd: cloudTuningState.nearFadeEnd,
  minLight: cloudTuningState.minLight,
  farFadeStart: cloudTuningState.farFadeStart,
  farFadeEnd: cloudTuningState.farFadeEnd,
  farOpacityScale: cloudTuningState.farOpacityScale,
  resetToPreset: () => {
    applyLightingPresetToWeather(envGuiState.presetId);
    if (setCloudTuning) setCloudTuning({ nearFadeStart: 13000, nearFadeEnd: 18000, minLight: 0.5, farFadeStart: 9000, farFadeEnd: 14500, farOpacityScale: 0.7 });
    syncGuiStateFromWeather();
    updateGuiDisplays();
  },
  copyPresetJson: async () => {
    const payload = {
      clearColor: WEATHER.clearColor,
      stormColor: WEATHER.stormColor,
      hemiSkyColor: WEATHER.hemiSkyColor,
      hemiGroundColor: WEATHER.hemiGroundColor,
      dirColor: WEATHER.dirColor,
      ambientBase: WEATHER.lightAmbientBase,
      directBase: WEATHER.lightDirectBase,
      sunPhiDeg: WEATHER.sunPhiDeg,
      sunThetaDeg: WEATHER.sunThetaDeg,
      skyTurbidity: WEATHER.skyTurbidity,
      skyRayleigh: WEATHER.skyRayleigh,
      skyMieCoefficient: WEATHER.skyMieCoefficient,
      skyMieDirectionalG: WEATHER.skyMieDirectionalG,
      exposure: WEATHER.exposure,
      bloom: {
        threshold: WEATHER.bloomThreshold,
        strength: WEATHER.bloomStrength,
        radius: WEATHER.bloomRadius
      },
      hazeColor: WEATHER.hazeColor,
      hazeOpacity: WEATHER.hazeOpacity,
      starOpacity: WEATHER.starOpacity,
      cloudColorClear: WEATHER.cloudColorClear,
      cloudColorStorm: WEATHER.cloudColorStorm,
      cloudOpacityBase: WEATHER.cloudOpacityBase,
      cloudOpacityStorm: WEATHER.cloudOpacityStorm,
      cloudEmissiveBase: WEATHER.cloudEmissiveBase,
      cloudEmissiveStorm: WEATHER.cloudEmissiveStorm,
      cloudTuning: getCloudTuning ? getCloudTuning() : null
    };
    const json = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      console.log('Copied active environment preset JSON to clipboard');
    } catch (err) {
      console.log(json);
    }
  }
};

function syncGuiStateFromWeather() {
  envGuiState.presetId = WEATHER.lightingPresetId;
  envGuiState.weatherMode = weatherModeNames[WEATHER.mode] ?? 'clear';
  envGuiState.clearColor = colorNumberToHex(WEATHER.clearColor);
  envGuiState.stormColor = colorNumberToHex(WEATHER.stormColor);
  envGuiState.hemiSkyColor = colorNumberToHex(WEATHER.hemiSkyColor);
  envGuiState.hemiGroundColor = colorNumberToHex(WEATHER.hemiGroundColor);
  envGuiState.dirColor = colorNumberToHex(WEATHER.dirColor);
  envGuiState.hazeColor = colorNumberToHex(WEATHER.hazeColor);
  envGuiState.sunPhiDeg = WEATHER.sunPhiDeg;
  envGuiState.sunThetaDeg = WEATHER.sunThetaDeg;
  envGuiState.skyTurbidity = WEATHER.skyTurbidity;
  envGuiState.skyRayleigh = WEATHER.skyRayleigh;
  envGuiState.skyMieCoefficient = WEATHER.skyMieCoefficient;
  envGuiState.skyMieDirectionalG = WEATHER.skyMieDirectionalG;
  envGuiState.lightAmbientBase = WEATHER.lightAmbientBase;
  envGuiState.lightDirectBase = WEATHER.lightDirectBase;
  envGuiState.hazeOpacity = WEATHER.hazeOpacity;
  envGuiState.starOpacity = WEATHER.starOpacity;
  envGuiState.exposure = WEATHER.exposure;
  envGuiState.bloomThreshold = WEATHER.bloomThreshold;
  envGuiState.bloomStrength = WEATHER.bloomStrength;
  envGuiState.bloomRadius = WEATHER.bloomRadius;
  envGuiState.cloudColorClear = colorNumberToHex(WEATHER.cloudColorClear);
  envGuiState.cloudColorStorm = colorNumberToHex(WEATHER.cloudColorStorm);
  envGuiState.cloudOpacityBase = WEATHER.cloudOpacityBase;
  envGuiState.cloudOpacityStorm = WEATHER.cloudOpacityStorm;
  envGuiState.cloudEmissiveBase = WEATHER.cloudEmissiveBase;
  envGuiState.cloudEmissiveStorm = WEATHER.cloudEmissiveStorm;
  if (getCloudTuning) {
    const t = getCloudTuning();
    envGuiState.nearFadeStart = t.nearFadeStart;
    envGuiState.nearFadeEnd = t.nearFadeEnd;
    envGuiState.minLight = t.minLight;
    envGuiState.farFadeStart = t.farFadeStart;
    envGuiState.farFadeEnd = t.farFadeEnd;
    envGuiState.farOpacityScale = t.farOpacityScale;
  }
}

function applyGuiStateToWorld(refreshEnvironmentMap = false) {
  WEATHER.clearColor = colorHexToNumber(envGuiState.clearColor);
  WEATHER.stormColor = colorHexToNumber(envGuiState.stormColor);
  WEATHER.hemiSkyColor = colorHexToNumber(envGuiState.hemiSkyColor);
  WEATHER.hemiGroundColor = colorHexToNumber(envGuiState.hemiGroundColor);
  WEATHER.dirColor = colorHexToNumber(envGuiState.dirColor);
  WEATHER.hazeColor = colorHexToNumber(envGuiState.hazeColor);
  WEATHER.sunPhiDeg = envGuiState.sunPhiDeg;
  WEATHER.sunThetaDeg = envGuiState.sunThetaDeg;
  WEATHER.skyTurbidity = envGuiState.skyTurbidity;
  WEATHER.skyRayleigh = envGuiState.skyRayleigh;
  WEATHER.skyMieCoefficient = envGuiState.skyMieCoefficient;
  WEATHER.skyMieDirectionalG = envGuiState.skyMieDirectionalG;
  WEATHER.lightAmbientBase = envGuiState.lightAmbientBase;
  WEATHER.lightDirectBase = envGuiState.lightDirectBase;
  WEATHER.hazeOpacity = envGuiState.hazeOpacity;
  WEATHER.starOpacity = envGuiState.starOpacity;
  WEATHER.exposure = envGuiState.exposure;
  WEATHER.bloomThreshold = envGuiState.bloomThreshold;
  WEATHER.bloomStrength = envGuiState.bloomStrength;
  WEATHER.bloomRadius = envGuiState.bloomRadius;
  WEATHER.cloudColorClear = colorHexToNumber(envGuiState.cloudColorClear);
  WEATHER.cloudColorStorm = colorHexToNumber(envGuiState.cloudColorStorm);
  WEATHER.cloudOpacityBase = envGuiState.cloudOpacityBase;
  WEATHER.cloudOpacityStorm = envGuiState.cloudOpacityStorm;
  WEATHER.cloudEmissiveBase = envGuiState.cloudEmissiveBase;
  WEATHER.cloudEmissiveStorm = envGuiState.cloudEmissiveStorm;

  if (setCloudTuning) {
    setCloudTuning({
      nearFadeStart: envGuiState.nearFadeStart,
      nearFadeEnd: envGuiState.nearFadeEnd,
      minLight: envGuiState.minLight,
      farFadeStart: envGuiState.farFadeStart,
      farFadeEnd: envGuiState.farFadeEnd,
      farOpacityScale: envGuiState.farOpacityScale
    });
  }
  syncDerivedWeatherCache();
  if (applyEnvironmentFromWeather) {
    applyEnvironmentFromWeather(WEATHER, { refreshEnvironmentMap });
  }
}

const gui = new GUI({ title: 'Daytime + Clouds', width: 330 });
gui.close();
const guiControllers = [];
function bind(controller, refreshEnvironmentMap = false) {
  guiControllers.push(controller);
  controller.onChange(() => applyGuiStateToWorld(false));
  if (refreshEnvironmentMap) {
    controller.onFinishChange(() => applyGuiStateToWorld(true));
  }
  return controller;
}
function updateGuiDisplays() {
  for (const c of guiControllers) c.updateDisplay();
}

guiControllers.push(gui.add(envGuiState, 'presetId', Object.keys(LIGHTING_PRESETS)).name('Preset').onChange((id) => {
  applyLightingPresetToWeather(id);
  syncGuiStateFromWeather();
  updateGuiDisplays();
}));
guiControllers.push(gui.add(envGuiState, 'weatherMode', Object.keys(weatherModeLabels)).name('Weather Mode').onChange((modeName) => {
  const nextMode = weatherModeLabels[modeName];
  WEATHER.mode = nextMode;
  const cfg = getWeatherModeConfig(nextMode);
  WEATHER.modeName = cfg.name;
  WEATHER.targetFog = cfg.fog;
  WEATHER.targetTransition = cfg.intensity;
}));

const dayFolder = gui.addFolder('Daytime');
bind(dayFolder.add(envGuiState, 'sunPhiDeg', 0, 95, 0.1).name('Sun Phi'), true);
bind(dayFolder.add(envGuiState, 'sunThetaDeg', 0, 360, 0.1).name('Sun Theta'), true);
bind(dayFolder.add(envGuiState, 'skyTurbidity', 1, 20, 0.01).name('Sky Turbidity'), true);
bind(dayFolder.add(envGuiState, 'skyRayleigh', 0, 6, 0.01).name('Sky Rayleigh'), true);
bind(dayFolder.add(envGuiState, 'skyMieCoefficient', 0, 0.12, 0.0005).name('Sky Mie Coef'), true);
bind(dayFolder.add(envGuiState, 'skyMieDirectionalG', 0, 0.99, 0.001).name('Sky Mie G'), true);
bind(dayFolder.add(envGuiState, 'hazeOpacity', 0, 0.4, 0.001).name('Haze Opacity'));
bind(dayFolder.add(envGuiState, 'starOpacity', 0, 0.7, 0.001).name('Star Opacity'));

const lightFolder = gui.addFolder('Lighting');
bind(lightFolder.add(envGuiState, 'lightAmbientBase', 0.05, 1.2, 0.005).name('Ambient Base'));
bind(lightFolder.add(envGuiState, 'lightDirectBase', 0.05, 2.2, 0.005).name('Direct Base'));
bind(lightFolder.add(envGuiState, 'exposure', 0.3, 1.6, 0.005).name('Exposure'));
bind(lightFolder.add(envGuiState, 'bloomThreshold', 0.5, 8.0, 0.01).name('Bloom Threshold'));
bind(lightFolder.add(envGuiState, 'bloomStrength', 0.0, 1.8, 0.01).name('Bloom Strength'));
bind(lightFolder.add(envGuiState, 'bloomRadius', 0.0, 1.0, 0.01).name('Bloom Radius'));

const colorFolder = gui.addFolder('Colors');
bind(colorFolder.addColor(envGuiState, 'clearColor').name('Sky Clear'));
bind(colorFolder.addColor(envGuiState, 'stormColor').name('Sky Storm'));
bind(colorFolder.addColor(envGuiState, 'hemiSkyColor').name('Hemi Sky'));
bind(colorFolder.addColor(envGuiState, 'hemiGroundColor').name('Hemi Ground'));
bind(colorFolder.addColor(envGuiState, 'dirColor').name('Sun Light'));
bind(colorFolder.addColor(envGuiState, 'hazeColor').name('Haze'));

const cloudFolder = gui.addFolder('Clouds');
bind(cloudFolder.addColor(envGuiState, 'cloudColorClear').name('Cloud Clear'));
bind(cloudFolder.addColor(envGuiState, 'cloudColorStorm').name('Cloud Storm'));
bind(cloudFolder.add(envGuiState, 'cloudOpacityBase', 0.05, 0.95, 0.001).name('Cloud Opacity Clear'));
bind(cloudFolder.add(envGuiState, 'cloudOpacityStorm', 0.05, 0.99, 0.001).name('Cloud Opacity Storm'));
bind(cloudFolder.add(envGuiState, 'cloudEmissiveBase', 0.0, 0.4, 0.001).name('Cloud Emissive Clear'));
bind(cloudFolder.add(envGuiState, 'cloudEmissiveStorm', 0.0, 0.4, 0.001).name('Cloud Emissive Storm'));
bind(cloudFolder.add(envGuiState, 'nearFadeStart', 2000, 30000, 10).name('Near Fade Start'));
bind(cloudFolder.add(envGuiState, 'nearFadeEnd', 3000, 40000, 10).name('Near Fade End'));
bind(cloudFolder.add(envGuiState, 'minLight', 0.0, 1.0, 0.001).name('Near Min Light'));
bind(cloudFolder.add(envGuiState, 'farFadeStart', 1000, 30000, 10).name('Far Fade Start'));
bind(cloudFolder.add(envGuiState, 'farFadeEnd', 2000, 40000, 10).name('Far Fade End'));
bind(cloudFolder.add(envGuiState, 'farOpacityScale', 0.0, 1.5, 0.001).name('Far Opacity Scale'));

guiControllers.push(gui.add(envGuiState, 'resetToPreset').name('Reset to Preset'));
guiControllers.push(gui.add(envGuiState, 'copyPresetJson').name('Copy JSON'));

syncGuiStateFromWeather();
updateGuiDisplays();

window.addEventListener('keydown', (e) => {
  if (Object.prototype.hasOwnProperty.call(keys, e.key.toLowerCase()) || Object.prototype.hasOwnProperty.call(keys, e.key)) {
    const k = Object.prototype.hasOwnProperty.call(keys, e.key) ? e.key : e.key.toLowerCase();
    keys[k] = true;
  }

  if (e.key.toLowerCase() === 'c') cameraController.cycleMode();
  if (e.key.toLowerCase() === 'm') PHYSICS.egpwsMode = !PHYSICS.egpwsMode;
  if (e.key.toLowerCase() === 'g') {
    gui.domElement.style.display = gui.domElement.style.display === 'none' ? '' : 'none';
  }

  if (e.key.toLowerCase() === 'r') {
    WEATHER.mode = (WEATHER.mode + 1) % 3;
    const cfg = getWeatherModeConfig(WEATHER.mode);
    WEATHER.modeName = cfg.name;
    WEATHER.targetFog = cfg.fog;
    WEATHER.targetTransition = cfg.intensity;
    syncGuiStateFromWeather();
    updateGuiDisplays();
  }
});

window.addEventListener('keyup', (e) => {
  const k = Object.prototype.hasOwnProperty.call(keys, e.key) ? e.key : e.key.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(keys, k)) keys[k] = false;
  if (e.key.toLowerCase() === 'b') PHYSICS.brakes = false;
});
// ==========================================

// --- PROCEDURAL WEB AUDIO ENGINE (ZEN / RELAXING MODE) ---
const ProceduralAudio = {
    ctx: null,
    masterGain: null,
    perspectiveFilter: null,
    limiter: null,
    engineBus: null,
    windBus: null,
    weatherBus: null,
    fxBus: null,
    reverb: null,
    reverbSendEngine: null,
    reverbSendWind: null,
    reverbSendWeather: null,
    reverbReturn: null,
    engineRumbleGain: null,
    engineTurbineGain: null,
    engineRumbleFilter: null,
    engineTurbineFilter: null,
    windBodyGain: null,
    windRushGain: null,
    windBodyFilter: null,
    windRushFilter: null,
    rainFilter: null,
    rainGain: null,
    cabinAirGain: null,
    cabinAirFilter: null,
    initialized: false,

    init: function () {
        if (this.initialized) return;
        this.initialized = true;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();

        // 1. Create a shared White Noise Buffer
        const bufferSize = this.ctx.sampleRate * 2;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

        // Master chain: perspective EQ -> soft limiter -> destination
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.68;
        this.perspectiveFilter = this.ctx.createBiquadFilter();
        this.perspectiveFilter.type = 'lowpass';
        this.perspectiveFilter.frequency.value = 7000;
        this.limiter = this.ctx.createDynamicsCompressor();
        this.limiter.threshold.value = -12;
        this.limiter.knee.value = 14;
        this.limiter.ratio.value = 6;
        this.limiter.attack.value = 0.004;
        this.limiter.release.value = 0.2;
        this.masterGain.connect(this.perspectiveFilter).connect(this.limiter).connect(this.ctx.destination);

        // Buses
        this.engineBus = this.ctx.createGain();
        this.windBus = this.ctx.createGain();
        this.weatherBus = this.ctx.createGain();
        this.fxBus = this.ctx.createGain();
        this.engineBus.connect(this.masterGain);
        this.windBus.connect(this.masterGain);
        this.weatherBus.connect(this.masterGain);
        this.fxBus.connect(this.masterGain);

        // Light reverb for ambient glue
        const ir = this.ctx.createBuffer(2, Math.floor(this.ctx.sampleRate * 1.2), this.ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const data = ir.getChannelData(ch);
            for (let i = 0; i < data.length; i++) {
                const d = i / data.length;
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - d, 2.4);
            }
        }
        this.reverb = this.ctx.createConvolver();
        this.reverb.buffer = ir;
        this.reverbReturn = this.ctx.createGain();
        this.reverbReturn.gain.value = 0.1;
        this.reverb.connect(this.reverbReturn).connect(this.masterGain);

        this.reverbSendEngine = this.ctx.createGain();
        this.reverbSendWind = this.ctx.createGain();
        this.reverbSendWeather = this.ctx.createGain();
        this.reverbSendEngine.gain.value = 0.05;
        this.reverbSendWind.gain.value = 0.14;
        this.reverbSendWeather.gain.value = 0.2;
        this.reverbSendEngine.connect(this.reverb);
        this.reverbSendWind.connect(this.reverb);
        this.reverbSendWeather.connect(this.reverb);

        // Engine layers: rumble + turbine (no tonal whine layer)
        const engNoiseRumble = this.ctx.createBufferSource();
        engNoiseRumble.buffer = noiseBuffer;
        engNoiseRumble.loop = true;
        this.engineRumbleFilter = this.ctx.createBiquadFilter();
        this.engineRumbleFilter.type = 'lowpass';
        this.engineRumbleGain = this.ctx.createGain();
        this.engineRumbleGain.gain.value = 0;
        engNoiseRumble.connect(this.engineRumbleFilter).connect(this.engineRumbleGain);
        this.engineRumbleGain.connect(this.engineBus);
        this.engineRumbleGain.connect(this.reverbSendEngine);
        engNoiseRumble.start();

        const engNoiseTurbine = this.ctx.createBufferSource();
        engNoiseTurbine.buffer = noiseBuffer;
        engNoiseTurbine.loop = true;
        this.engineTurbineFilter = this.ctx.createBiquadFilter();
        this.engineTurbineFilter.type = 'bandpass';
        this.engineTurbineGain = this.ctx.createGain();
        this.engineTurbineGain.gain.value = 0;
        engNoiseTurbine.connect(this.engineTurbineFilter).connect(this.engineTurbineGain);
        this.engineTurbineGain.connect(this.engineBus);
        this.engineTurbineGain.connect(this.reverbSendEngine);
        engNoiseTurbine.start();

        // Wind layers: body + rush
        const windNoiseBody = this.ctx.createBufferSource();
        windNoiseBody.buffer = noiseBuffer;
        windNoiseBody.loop = true;
        this.windBodyFilter = this.ctx.createBiquadFilter();
        this.windBodyFilter.type = 'lowpass';
        this.windBodyGain = this.ctx.createGain();
        this.windBodyGain.gain.value = 0;
        windNoiseBody.connect(this.windBodyFilter).connect(this.windBodyGain);
        this.windBodyGain.connect(this.windBus);
        this.windBodyGain.connect(this.reverbSendWind);
        windNoiseBody.start();

        const windNoiseRush = this.ctx.createBufferSource();
        windNoiseRush.buffer = noiseBuffer;
        windNoiseRush.loop = true;
        this.windRushFilter = this.ctx.createBiquadFilter();
        this.windRushFilter.type = 'bandpass';
        this.windRushGain = this.ctx.createGain();
        this.windRushGain.gain.value = 0;
        windNoiseRush.connect(this.windRushFilter).connect(this.windRushGain);
        this.windRushGain.connect(this.windBus);
        this.windRushGain.connect(this.reverbSendWind);
        windNoiseRush.start();

        // Weather + cabin bed
        const rainSrc = this.ctx.createBufferSource();
        rainSrc.buffer = noiseBuffer;
        rainSrc.loop = true;
        this.rainFilter = this.ctx.createBiquadFilter();
        this.rainFilter.type = 'lowpass';
        this.rainGain = this.ctx.createGain();
        this.rainGain.gain.value = 0;
        rainSrc.connect(this.rainFilter).connect(this.rainGain);
        this.rainGain.connect(this.weatherBus);
        this.rainGain.connect(this.reverbSendWeather);
        rainSrc.start();

        const cabinAirSrc = this.ctx.createBufferSource();
        cabinAirSrc.buffer = noiseBuffer;
        cabinAirSrc.loop = true;
        this.cabinAirFilter = this.ctx.createBiquadFilter();
        this.cabinAirFilter.type = 'bandpass';
        this.cabinAirGain = this.ctx.createGain();
        this.cabinAirGain.gain.value = 0;
        cabinAirSrc.connect(this.cabinAirFilter).connect(this.cabinAirGain).connect(this.weatherBus);
        cabinAirSrc.start();
    },

    update: function (throttle, airspeed, spoilers, cameraMode, weatherMode, gForce, angularVelocity, aoa, slip) {
        if (!this.initialized || this.ctx.state === 'suspended') return;

        const t = this.ctx.currentTime;
        const inside = cameraMode === 1;
        const outsideMix = inside ? 0.0 : 1.0;
        const insideMix = inside ? 1.0 : 0.0;
        const speedFactor = Math.max(0, Math.min(1.4, airspeed / 250));
        const spoilerDrag = (spoilers && airspeed > 30) ? 0.16 : 0.0;
        const gStress = Math.abs(gForce - 1.0);
        const rotStress = Math.abs(angularVelocity.x) + Math.abs(angularVelocity.y) + Math.abs(angularVelocity.z);
        const maneuverStress = Math.min(1.0, (gStress + rotStress) * 0.7);
        const aoaStress = Math.min(1.0, Math.abs(aoa || 0) / (22 * Math.PI / 180));
        const slipStress = Math.min(1.0, Math.abs(slip || 0) / (16 * Math.PI / 180));

        // Perspective and master smoothness
        this.masterGain.gain.setTargetAtTime(inside ? 0.58 : 0.8, t, 1.5);
        this.perspectiveFilter.frequency.setTargetAtTime(inside ? (1300 + speedFactor * 1200) : 11200, t, 1.0);
        this.reverbReturn.gain.setTargetAtTime(inside ? 0.07 : 0.12, t, 1.2);

        // Engine (cinematic, soft, and less droning)
        const spool = Math.min(1.0, throttle * 0.85 + speedFactor * 0.2);
        const engineDrift = Math.sin(t * 0.23) * 0.06 + Math.sin(t * 0.11 + 1.7) * 0.04;
        this.engineRumbleGain.gain.setTargetAtTime((0.06 + spool * 0.2 + engineDrift * 0.03) * (inside ? 0.62 : 1.0), t, 1.1);
        this.engineRumbleFilter.frequency.setTargetAtTime(85 + spool * 140 + engineDrift * 18, t, 1.2);

        this.engineTurbineGain.gain.setTargetAtTime((0.012 + spool * 0.075) * (inside ? 0.45 : 0.88), t, 1.1);
        this.engineTurbineFilter.frequency.setTargetAtTime(260 + spool * 620 + speedFactor * 200 + engineDrift * 35, t, 1.0);

        // Airframe/wind
        const windBody = (Math.pow(speedFactor, 2) * 0.048 + maneuverStress * 0.05 + spoilerDrag * 0.8);
        const windRush = (Math.pow(speedFactor, 2.1) * 0.018 + aoaStress * 0.035 + slipStress * 0.04 + spoilerDrag * 0.5);
        this.windBodyGain.gain.setTargetAtTime(windBody * (inside ? 0.42 : 0.92), t, 0.85);
        this.windRushGain.gain.setTargetAtTime(windRush * (inside ? 0.28 : 0.85), t, 0.7);
        this.windBodyFilter.frequency.setTargetAtTime(150 + speedFactor * 620 + maneuverStress * 240, t, 0.75);
        this.windRushFilter.frequency.setTargetAtTime(620 + speedFactor * 1500 + slipStress * 420, t, 0.6);

        // Rain and cabin ambience
        const rainTarget = weatherMode === 2 ? (0.03 + speedFactor * 0.06) : 0;
        this.rainGain.gain.setTargetAtTime(rainTarget * (inside ? 0.78 : 1.0), t, 1.35);
        this.rainFilter.frequency.setTargetAtTime(820 + speedFactor * 1600, t, 0.8);

        const cabinBed = (0.01 + speedFactor * 0.015 + (weatherMode === 2 ? 0.006 : 0)) * insideMix;
        this.cabinAirGain.gain.setTargetAtTime(cabinBed + (outsideMix * 0.0025), t, 1.4);
        this.cabinAirFilter.frequency.setTargetAtTime(220 + speedFactor * 330, t, 1.2);
    },

    touchdown: function () {
        if (!this.initialized || this.ctx.state === 'suspended') return;
        const t = this.ctx.currentTime;

        // Gentle, low-pitched suspension thud instead of tire screech
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';

        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.4);

        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);

        osc.connect(gain).connect(this.fxBus || this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.4);
    }
};


// --- CRASH LOGIC & RESET ---
window.triggerCrash = function (reason) {
    if (PHYSICS.crashed) return;
    PHYSICS.crashed = true;

    // Sever engine and control inputs
    PHYSICS.throttle = 0;
    PHYSICS.velocity.multiplyScalar(0.2); // Violent deceleration

    document.getElementById('dashboard').style.opacity = '0.3';
    document.getElementById('crash-screen').style.display = 'flex';
    document.getElementById('crash-reason').innerText = "CAUSE: " + reason;

    // Spawn massive fireball and smoke plume
    for (let i = 0; i < 300; i++) {
        let pVel = PHYSICS.velocity.clone().multiplyScalar(0.3).add(new THREE.Vector3((Math.random() - 0.5) * 80, Math.random() * 100, (Math.random() - 0.5) * 80));
        let size = 20 + Math.random() * 40;
        let life = 3 + Math.random() * 6;

        if (Math.random() > 0.4) {
            spawnParticle(planeGroup.position, pVel, size, 25, life, 1.0, 0.2 + Math.random() * 0.3, 0.0); // Fire
        } else {
            spawnParticle(planeGroup.position, pVel.multiplyScalar(0.5), size, 40, life * 1.5, 0.05, 0.05, 0.05); // Thick Smoke
        }
    }
};

window.resetFlight = function () {
    PHYSICS.crashed = false;
    PHYSICS.position.set(0, AIRCRAFT.gearHeight, -1000);
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

    document.getElementById('dashboard').style.opacity = '1.0';
    document.getElementById('crash-screen').style.display = 'none';

    // Clear particles
    for (let i = 0; i < MAX_PARTICLES; i++) particles[i].active = false;

    planeGroup.position.copy(PHYSICS.position);
    planeGroup.quaternion.copy(PHYSICS.quaternion);
    physicsAdapter.syncFromState();
};


// ==========================================
// 9. MAIN LOOP
// ==========================================
window.addEventListener('resize', () => {
    const newGameHeight = window.innerHeight * 0.75;
    camera.aspect = window.innerWidth / newGameHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, newGameHeight);
    composer.setSize(window.innerWidth, newGameHeight); // Update Bloom resolution
});


function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    let dt = (now - runtime.lastTime) / 1000;
    runtime.lastTime = now;

    // Cap dt to avoid simulation explosions on lag spikes
    if (dt > 0.05) dt = 0.05;

    // --- DYNAMIC WEATHER SYSTEM UPDATES ---
    WEATHER.currentFog += (WEATHER.targetFog - WEATHER.currentFog) * dt * 0.5;
    scene.fog.density = WEATHER.currentFog;

    // Transition visuals based on weather (0 = Twilight, 1 = Stormy Gray)
    WEATHER.transition += (WEATHER.targetTransition - WEATHER.transition) * dt * 0.5;

    // Darken the sky and fog in bad weather
    currentWeatherColor.lerpColors(clearWeatherColor, stormWeatherColor, WEATHER.transition);
    scene.background = currentWeatherColor;
    scene.fog.color = currentWeatherColor;

    // Dim the lighting to match the overcast skies
    hemiLight.intensity = WEATHER.lightAmbientBase * (1.0 - WEATHER.transition * 0.55);
    dirLight.intensity = WEATHER.lightDirectBase * (1.0 - WEATHER.transition * 0.9);

    if (cloudMaterial) {
        currentCloudColor.lerpColors(clearCloudColor, stormCloudColor, WEATHER.transition);
        cloudMaterial.color.copy(currentCloudColor);
        cloudMaterial.opacity = WEATHER.cloudOpacityBase + (WEATHER.cloudOpacityStorm - WEATHER.cloudOpacityBase) * WEATHER.transition;
        cloudMaterial.emissiveIntensity = WEATHER.cloudEmissiveBase + (WEATHER.cloudEmissiveStorm - WEATHER.cloudEmissiveBase) * WEATHER.transition;
    }

    if (updateClouds) {
        updateClouds(dt, camera, WEATHER, currentCloudColor);
    }

    // Animate Storm Rain Physics
    if (WEATHER.mode === 2) {
        WEATHER.rainMesh.visible = true;
        const pos = WEATHER.rainMesh.geometry.attributes.position.array;
        const camPos = camera.position;
        runtime.rainPhase = (runtime.rainPhase + 1) & 1;
        const rainStepDt = dt * 2.0;

        for (let i = runtime.rainPhase; i < WEATHER.rainCount; i += 2) {
            // Apply gravity
            pos[i * 3 + 1] += WEATHER.rainVelocities[i] * rainStepDt;

            // Keep the rain anchored to the camera's moving frame of reference
            let dx = pos[i * 3] - camPos.x;
            let dy = pos[i * 3 + 1] - camPos.y;
            let dz = pos[i * 3 + 2] - camPos.z;

            if (dx > 400) pos[i * 3] -= 800; else if (dx < -400) pos[i * 3] += 800;
            if (dy > 200) pos[i * 3 + 1] -= 400; else if (dy < -200) pos[i * 3 + 1] += 400;
            if (dz > 400) pos[i * 3 + 2] -= 800; else if (dz < -400) pos[i * 3 + 2] += 800;
        }
        WEATHER.rainMesh.geometry.attributes.position.needsUpdate = true;
    } else {
        WEATHER.rainMesh.visible = false;
    }

    // Animate Water Normal Map (Rolling Waves)
    if (waterMaterial.normalMap) {
        waterMaterial.normalMap.offset.x -= dt * 0.01;
        waterMaterial.normalMap.offset.y += dt * 0.02;
    }

    // Animate Engine Fans & Exhaust based on throttle
    const fanSpeed = 0.1 + (PHYSICS.throttle * 0.8);
    engineFans.forEach(f => f.rotation.z -= fanSpeed);

    // Engine exhaust glow intentionally disabled for a non-emissive nacelle look.

    // Animate Control Surfaces
    movableSurfaces.flaps.forEach(f => f.rotation.x = PHYSICS.flaps * 0.6);
    movableSurfaces.aileronsL.forEach(a => a.rotation.x = -PHYSICS.aileron * 0.5);
    movableSurfaces.aileronsR.forEach(a => a.rotation.x = PHYSICS.aileron * 0.5);
    movableSurfaces.elevators.forEach(e => e.rotation.x = -PHYSICS.elevator * 0.5);
    movableSurfaces.rudder.forEach(r => r.rotation.y = -PHYSICS.rudder * 0.5);

    // Smoothly animate spoilers deploying
    const targetSpoilerRot = PHYSICS.spoilers ? -0.8 : 0;
    movableSurfaces.spoilers.forEach(s => s.rotation.x += (targetSpoilerRot - s.rotation.x) * 10 * dt);

    // Strobe light logic (double flash every 1.5 seconds)
    runtime.strobeTimer += dt;
    let strobeCycle = runtime.strobeTimer % 1.5;
    let isFlashing = (strobeCycle < 0.05) || (strobeCycle > 0.15 && strobeCycle < 0.2);
    strobes.forEach(s => {
        s.intensity = isFlashing ? 10 : 0;
        if (s.children[0]) s.children[0].visible = isFlashing; // Hide/show physical bulb
    });

    // Beacon light logic (single pulse every 1 second)
    let beaconCycle = runtime.strobeTimer % 1.0;
    let beaconFlash = beaconCycle < 0.1;
    beacons.forEach(b => {
        b.intensity = beaconFlash ? 5 : 0;
        if (b.children[0]) b.children[0].visible = beaconFlash; // Hide/show physical bulb
    });

    // --- ALS RABBIT ANIMATION (Approach Lighting System) ---
    let rabbitCycle = (now / 500) % 1.0; // Loops every 0.5s
    let targetDist = 900 - (rabbitCycle * 600); // Sequence runs from 900m down to 300m

    for (let i = 0; i < alsStrobes.length; i++) {
        if (Math.abs(alsStrobes[i].dist - targetDist) < 40) {
            alsStrobes[i].mesh.material = strobeMatOn;
        } else {
            alsStrobes[i].mesh.material = strobeMatOff;
        }
    }

    // --- AERODYNAMIC PARTICLE SYSTEM ---
    // 1. Touchdown Smoke
    if (!runtime.wasOnGround && PHYSICS.onGround && PHYSICS.airspeed > 30) {

        // Trigger Touchdown Audio Chirp
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

    // 2. Update & Render Particles (touchdown/crash smoke only)
    for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = particles[i];
        if (!p.active) continue;

        p.life -= dt;
        if (p.life <= 0) {
            p.active = false;
            pDummy.scale.set(0, 0, 0);
            pDummy.updateMatrix();
            particleMesh.setMatrixAt(i, pDummy.matrix);
            continue;
        }

        p.pos.addScaledVector(p.vel, dt);
        p.size += p.growth * dt;

        pDummy.position.copy(p.pos);
        // In case updateCamera hasn't run yet, ensure camera quaternion is valid
        if (camera && camera.quaternion) {
            pDummy.quaternion.copy(camera.quaternion);
        }
        pDummy.scale.set(p.size, p.size, p.size);
        pDummy.updateMatrix();
        particleMesh.setMatrixAt(i, pDummy.matrix);

        let progress = p.life / p.maxLife;
        let fade = progress * progress;
        pColor.setRGB(p.r * fade, p.g * fade, p.b * fade);
        particleMesh.setColorAt(i, pColor);
    }
    particleMesh.instanceMatrix.needsUpdate = true;
    if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;

    // --- PAPI LIGHTS UPDATE (RWY 36 / RWY 18) ---
    const allPapiLights = PAPI.lights || [];
    const papi36 = PAPI.lights36 || [];
    const papi18 = PAPI.lights18 || [];
    for (let i = 0; i < allPapiLights.length; i++) allPapiLights[i].material = PAPI.matOff;

    function setPapiColors(lights, whiteCount) {
        for (let i = 0; i < lights.length; i++) {
            lights[i].material = (i >= (4 - whiteCount)) ? PAPI.matWhite : PAPI.matRed;
        }
    }

    let headingDeg = (-tmpHdgEuler.setFromQuaternion(PHYSICS.quaternion, 'YXZ').y) * (180 / Math.PI);
    if (headingDeg < 0) headingDeg += 360;
    const headingDiff = (targetDeg) => {
        let d = headingDeg - targetDeg;
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        return Math.abs(d);
    };

    const dist36 = PHYSICS.position.z - 1000;
    const dist18 = -1000 - PHYSICS.position.z;
    const canUse36 = dist36 > 0 && dist36 < 15000 && headingDiff(0) <= 90;
    const canUse18 = dist18 > 0 && dist18 < 15000 && headingDiff(180) <= 90;

    let activeSet = null;
    let activeDist = 0;
    let papiCenterX = 0;
    if (canUse36 && (!canUse18 || dist36 <= dist18)) {
        activeSet = papi36;
        activeDist = dist36;
        papiCenterX = -63;
    } else if (canUse18) {
        activeSet = papi18;
        activeDist = dist18;
        papiCenterX = 63;
    }

    if (activeSet && activeSet.length === 4) {
        const distX = PHYSICS.position.x - papiCenterX;
        const dist2D = Math.sqrt(distX * distX + activeDist * activeDist);
        const angleDeg = Math.atan2(PHYSICS.position.y - 1.5, dist2D) * (180 / Math.PI);

        let whiteCount = 0;
        if (angleDeg > 3.5) whiteCount = 4;
        else if (angleDeg > 3.2) whiteCount = 3;
        else if (angleDeg > 2.8) whiteCount = 2;
        else if (angleDeg > 2.5) whiteCount = 1;
        setPapiColors(activeSet, whiteCount);
    }

    runtime.physicsAccumulator = Math.min(runtime.physicsAccumulator + dt, PHYSICS_STEP * MAX_PHYSICS_STEPS_PER_FRAME);
    let physicsSteps = 0;
    while (runtime.physicsAccumulator >= PHYSICS_STEP && physicsSteps < MAX_PHYSICS_STEPS_PER_FRAME) {
        PHYSICS.dt = PHYSICS_STEP;
        if (!PHYSICS.crashed) {
            calculateAerodynamics({
                THREE,
                PHYSICS,
                AIRCRAFT,
                WEATHER,
                keys,
                getTerrainHeight,
                gearGroup,
                planeGroup,
                Noise
            });
        } else if (!PHYSICS.onGround) {
            // WRECKAGE PHYSICS: Let gravity pull the wreckage down if destroyed mid-air
            PHYSICS.velocity.y -= PHYSICS.gravity * PHYSICS_STEP;
            PHYSICS.position.add(tmpCrashStep.copy(PHYSICS.velocity).multiplyScalar(PHYSICS_STEP));

            // Add uncontrolled tumbling spin
            PHYSICS.quaternion.multiply(
                tmpCrashSpinQuat.setFromEuler(
                    tmpCrashSpinEuler.set(PHYSICS_STEP, PHYSICS_STEP * 0.5, PHYSICS_STEP * 2)
                )
            ).normalize();

            const terrainY = getTerrainHeight(PHYSICS.position.x, PHYSICS.position.z);
            if (PHYSICS.position.y <= terrainY + AIRCRAFT.gearHeight) {
                PHYSICS.position.y = terrainY + AIRCRAFT.gearHeight;
                PHYSICS.onGround = true;
                PHYSICS.velocity.set(0, 0, 0);
            }
            planeGroup.position.copy(PHYSICS.position);
            planeGroup.quaternion.copy(PHYSICS.quaternion);
        }
        if (PHYSICS.crashed) {
            PHYSICS.externalForce.set(0, 0, 0);
            PHYSICS.externalTorque.set(0, 0, 0);
        }
        runtime.physicsAccumulator -= PHYSICS_STEP;
        physicsSteps++;

        physicsAdapter.step(PHYSICS_STEP);
        const terrainFloorY = getTerrainHeight(PHYSICS.position.x, PHYSICS.position.z) + AIRCRAFT.gearHeight;
        if (PHYSICS.position.y < terrainFloorY) {
            PHYSICS.position.y = terrainFloorY;
            if (PHYSICS.velocity.y < 0) PHYSICS.velocity.y = 0;
            physicsAdapter.syncFromState();
        }
        const agl = PHYSICS.position.y - terrainFloorY;
        const stickyGround = PHYSICS.onGround && agl < 0.45 && PHYSICS.velocity.y <= 1.2;
        PHYSICS.onGround = agl < 0.25 || stickyGround;
        planeGroup.position.copy(PHYSICS.position);
        planeGroup.quaternion.copy(PHYSICS.quaternion);
    }

    updateTerrain();
    cameraController.updateCamera();
    hud.updateHUD();

    // Update Procedural Audio Synthesis (Relaxing Zen Mode)
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

    composer.render(); // Replaced renderer.render with the Post-Processing Composer
}

// Initialization complete
setTimeout(() => {
    document.querySelector('.spinner').style.display = 'none';
    document.getElementById('loader-text').innerText = 'READY FOR TAKEOFF';
    document.getElementById('loader-subtext').innerText = 'Ensure speakers/headphones are active.';

    const startBtn = document.getElementById('start-btn');
    startBtn.style.display = 'block';

    startBtn.addEventListener('click', () => {
        // Initialize Audio Context on user gesture
        ProceduralAudio.init();
        if (ProceduralAudio.ctx && ProceduralAudio.ctx.state === 'suspended') {
            ProceduralAudio.ctx.resume();
        }

        document.getElementById('loader').style.opacity = '0';
        setTimeout(() => document.getElementById('loader').style.display = 'none', 1000);

        // Position at runway start
        PHYSICS.position.set(0, AIRCRAFT.gearHeight, -1000);
        PHYSICS.velocity.set(0, 0, 0);
        PHYSICS.angularVelocity.set(0, 0, 0);
        PHYSICS.externalForce.set(0, 0, 0);
        PHYSICS.externalTorque.set(0, 0, 0);
        physicsAdapter.syncFromState();
        animate();
    });
}, 1500);
