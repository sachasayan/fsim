import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import Stats from 'three/addons/libs/stats.module.js';
import { Noise } from './noise.js';
import { createSimulationState } from './state.js';
import { createWorldObjects } from './world/objects.js';
import { calculateAerodynamics } from './physics/updatePhysics.js';
import { createPhysicsAdapter } from './physics/physicsAdapter.js';
import { createCameraController } from './camera/updateCamera.js';
import { createHUD } from './ui/hud.js';
import GUI from 'lil-gui';
import { LIGHTING_PRESETS } from './lighting.js';

// ==========================================
// 2. CORE SETUP & GLOBALS
// ==========================================
const container = document.getElementById('game-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3a2e3f);
scene.fog = new THREE.FogExp2(0x3a2e3f, 0.00015);

const gameHeight = window.innerHeight;
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / gameHeight, 1, 100000);
const renderer = new THREE.WebGLRenderer({ antialias: false, logarithmicDepthBuffer: true });
const BASELINE_PIXEL_RATIO = Math.min(window.devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(BASELINE_PIXEL_RATIO);
renderer.setSize(window.innerWidth, gameHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const stats = new Stats();
document.body.appendChild(stats.dom);

const renderScene = new RenderPass(scene, camera);
const pixelRatio = renderer.getPixelRatio();
const smaaPass = new SMAAPass(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 5.0;
bloomPass.strength = 0.8;
bloomPass.radius = 0.4;

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(smaaPass);
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
const tmpSunDir = new THREE.Vector3();
const tmpShadowSunDir = new THREE.Vector3();
const tmpLightingSunDir = new THREE.Vector3();
let lastTerrainChunkX = Number.POSITIVE_INFINITY;
let lastTerrainChunkZ = Number.POSITIVE_INFINITY;
let lastTerrainUpdateMs = 0;
const TERRAIN_UPDATE_INTERVAL_MS = 120;
let prevAlsTargetIndex = -1;
let prevPapiKey = '';
let prevShadowExtent = -1;
const prevShadowCenter = new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);

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
  updateTerrainAtmosphere,
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

const cloudTuningState = getCloudTuning ? getCloudTuning() : {
  nearFadeStart: 13000,
  nearFadeEnd: 18000,
  minLight: 0.5,
  farFadeStart: 9000,
  farFadeEnd: 14500,
  farOpacityScale: 0.7
};

function applyWind() {
  // Derive wind polar from current XZ components.
  const wx = WEATHER.windX ?? 0;
  const wz = WEATHER.windZ ?? 0;
  const speed = Math.sqrt(wx * wx + wz * wz);
  const dir = (Math.atan2(-wx, -wz) * 180 / Math.PI + 360) % 360;

  // This is a placeholder since we removed the wind GUI, but keeping the logic 
  // structure in case wind is re-added to a different UI.
}

function setPapiColors(lights, whiteCount) {
  for (let i = 0; i < lights.length; i++) {
    lights[i].material = (i >= (4 - whiteCount)) ? PAPI.matWhite : PAPI.matRed;
  }
}

function getHeadingDiff(headingDeg, targetDeg) {
  let d = headingDeg - targetDeg;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return Math.abs(d);
}

window.addEventListener('keydown', (e) => {
  if (Object.prototype.hasOwnProperty.call(keys, e.key.toLowerCase()) || Object.prototype.hasOwnProperty.call(keys, e.key)) {
    const k = Object.prototype.hasOwnProperty.call(keys, e.key) ? e.key : e.key.toLowerCase();
    keys[k] = true;
  }

  if (e.key.toLowerCase() === 'c') cameraController.cycleMode();
  if (e.key.toLowerCase() === 'g') {
    gui.domElement.style.display = gui.domElement.style.display === 'none' ? '' : 'none';
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
    const cabinBed = (0.01 + speedFactor * 0.015) * insideMix;
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
  PHYSICS.position.set(0, AIRCRAFT.gearHeight, 1900);
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
  const newGameHeight = window.innerHeight;
  camera.aspect = window.innerWidth / newGameHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, newGameHeight);
  smaaPass.setSize(window.innerWidth * renderer.getPixelRatio(), newGameHeight * renderer.getPixelRatio());
  composer.setSize(window.innerWidth, newGameHeight); // Update Bloom resolution
});


function animate() {
  requestAnimationFrame(animate);
  stats.update();

  const now = performance.now();
  let dt = (now - runtime.lastTime) / 1000;
  runtime.lastTime = now;

  // Cap dt to avoid simulation explosions on lag spikes
  if (dt > 0.05) dt = 0.05;

  // --- DYNAMIC WEATHER SYSTEM UPDATES ---
  runtime.frameCount++;

  if (runtime.frameCount % 4 === 0) {
    WEATHER.currentFog += (WEATHER.targetFog - WEATHER.currentFog) * dt * 2.0; // Scaled dt to maintain speed
    scene.fog.density = WEATHER.currentFog;

    // Transition visuals based on weather (0 = Twilight, 1 = Stormy Gray)
    WEATHER.transition += (WEATHER.targetTransition - WEATHER.transition) * dt * 2.0;

    // Darken the sky and fog in bad weather
    currentWeatherColor.lerpColors(clearWeatherColor, stormWeatherColor, WEATHER.transition);
    scene.background = currentWeatherColor;
    scene.fog.color = currentWeatherColor;
    if (updateTerrainAtmosphere) updateTerrainAtmosphere(camera, currentWeatherColor);

    // Preserve low-sun readability without flattening mood.
    tmpLightingSunDir.copy(dirLight.position).normalize();
    const sunElev = THREE.MathUtils.clamp((tmpLightingSunDir.y + 0.06) / 0.74, 0, 1);
    const lowSun = 1.0 - sunElev;
    const lowSunWeight = lowSun * (1.0 - WEATHER.transition * 0.45);

    hemiLight.intensity = WEATHER.lightAmbientBase * (1.0 - WEATHER.transition * 0.55) * (1.0 + lowSunWeight * 0.26);
    dirLight.intensity = WEATHER.lightDirectBase * (1.0 - WEATHER.transition * 0.9) * (1.0 + lowSunWeight * 0.1);
    renderer.toneMappingExposure = WEATHER.exposure * (1.0 + lowSunWeight * 0.12);
    bloomPass.threshold = WEATHER.bloomThreshold + lowSunWeight * 0.4;
    bloomPass.strength = WEATHER.bloomStrength * (1.0 - lowSunWeight * 0.2);

    if (cloudMaterial) {
      currentCloudColor.lerpColors(clearCloudColor, stormCloudColor, WEATHER.transition);
      cloudMaterial.color.copy(currentCloudColor);
      cloudMaterial.opacity = WEATHER.cloudOpacityBase + (WEATHER.cloudOpacityStorm - WEATHER.cloudOpacityBase) * WEATHER.transition;
      cloudMaterial.emissiveIntensity = WEATHER.cloudEmissiveBase + (WEATHER.cloudEmissiveStorm - WEATHER.cloudEmissiveBase) * WEATHER.transition;
    }

    if (updateClouds) {
      updateClouds(dt * 4.0, camera, WEATHER, currentCloudColor, tmpSunDir.copy(dirLight.position).normalize());
    }
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
  let targetIdx = -1;
  for (let i = 0; i < alsStrobes.length; i++) {
    if (Math.abs(alsStrobes[i].dist - targetDist) < 40) {
      targetIdx = i;
      break;
    }
  }
  if (targetIdx !== prevAlsTargetIndex) {
    if (prevAlsTargetIndex >= 0 && prevAlsTargetIndex < alsStrobes.length) {
      alsStrobes[prevAlsTargetIndex].mesh.material = strobeMatOff;
    }
    if (targetIdx >= 0 && targetIdx < alsStrobes.length) {
      alsStrobes[targetIdx].mesh.material = strobeMatOn;
    }
    prevAlsTargetIndex = targetIdx;
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
    particleDirty = true;
  }
  // Only upload buffer to GPU when something actually changed.
  if (particleDirty) {
    particleMesh.instanceMatrix.needsUpdate = true;
    if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;
  }

  // --- PAPI LIGHTS UPDATE (RWY 36 / RWY 18) ---
  if (runtime.frameCount % 6 === 0) {
    const allPapiLights = PAPI.lights || [];
    const papi36 = PAPI.lights36 || [];
    const papi18 = PAPI.lights18 || [];

    const dist36 = PHYSICS.position.z - 1000;
    const dist18 = -1000 - PHYSICS.position.z;
    const canUse36 = dist36 > 0 && dist36 < 15000 && getHeadingDiff(headingDeg, 0) <= 90;
    const canUse18 = dist18 > 0 && dist18 < 15000 && getHeadingDiff(headingDeg, 180) <= 90;

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

      // Standard ICAO PAPI: 3° nominal glideslope, ±0.5° bands.
      // >3.5° = all white (too high), <2.0° = all red (too low)
      let whiteCount = 0;
      if (angleDeg > 3.5) whiteCount = 4; // All white — too high
      else if (angleDeg > 3.0) whiteCount = 3; // 3W 1R — slightly high
      else if (angleDeg > 2.5) whiteCount = 2; // 2W 2R — on glidepath
      else if (angleDeg > 2.0) whiteCount = 1; // 1W 3R — slightly low
      // else whiteCount = 0               // All red — too low
      const activeKey = `${activeSet === papi36 ? '36' : '18'}:${whiteCount}`;
      if (activeKey !== prevPapiKey) {
        for (let i = 0; i < allPapiLights.length; i++) allPapiLights[i].material = PAPI.matOff;
        setPapiColors(activeSet, whiteCount);
        prevPapiKey = activeKey;
      }
    } else if (prevPapiKey !== '') {
      for (let i = 0; i < allPapiLights.length; i++) allPapiLights[i].material = PAPI.matOff;
      prevPapiKey = '';
    }
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

      // Cache terrain height — reused in the floor clamp below to avoid a second query.
      const terrainY = getTerrainHeight(PHYSICS.position.x, PHYSICS.position.z, 6);
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
    // During a crash we already called getTerrainHeight above; in normal flight this is the only call.
    const terrainFloorY = (PHYSICS.crashed && PHYSICS.onGround)
      ? PHYSICS.position.y  // Already clamped — floor is wherever we just put it
      : getTerrainHeight(PHYSICS.position.x, PHYSICS.position.z, 6) + AIRCRAFT.gearHeight;
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

  // Keep directional shadow coverage centered around the aircraft to maximize useful texels.
  tmpShadowSunDir.copy(dirLight.position).sub(dirLight.target.position).normalize();
  const shadowCenter = planeGroup.position;
  dirLight.target.position.copy(shadowCenter);
  dirLight.target.updateMatrixWorld();
  dirLight.position.copy(shadowCenter).addScaledVector(tmpShadowSunDir, 2000);
  const shadowExtent = 260 + Math.min(460, PHYSICS.airspeed * 1.35 + Math.max(0, PHYSICS.position.y) * 0.16);
  const shadowMoved =
    Math.abs(shadowCenter.x - prevShadowCenter.x) > 6 ||
    Math.abs(shadowCenter.y - prevShadowCenter.y) > 6 ||
    Math.abs(shadowCenter.z - prevShadowCenter.z) > 6;
  const shadowExtentChanged = Math.abs(shadowExtent - prevShadowExtent) > 3;
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

  const chunkX = Math.floor(PHYSICS.position.x / 4000);
  const chunkZ = Math.floor(PHYSICS.position.z / 4000);
  const terrainDue = (now - lastTerrainUpdateMs) >= TERRAIN_UPDATE_INTERVAL_MS;
  const chunkChanged = chunkX !== lastTerrainChunkX || chunkZ !== lastTerrainChunkZ;
  if (terrainDue || chunkChanged) {
    updateTerrain();
    lastTerrainUpdateMs = now;
    lastTerrainChunkX = chunkX;
    lastTerrainChunkZ = chunkZ;
  }
  cameraController.updateCamera();
  if (runtime.frameCount % 3 === 0) {
    hud.updateHUD();
  }

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
    PHYSICS.position.set(0, AIRCRAFT.gearHeight, 1900);
    PHYSICS.velocity.set(0, 0, 0);
    PHYSICS.angularVelocity.set(0, 0, 0);
    PHYSICS.externalForce.set(0, 0, 0);
    PHYSICS.externalTorque.set(0, 0, 0);
    physicsAdapter.syncFromState();
    animate();
  });
}, 1500);
