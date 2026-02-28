import * as THREE from 'three';
import { LIGHTING_PRESETS, getWeatherModeConfig, pickLightingPresetId, pickStartupWeatherMode } from './lighting.js';

export function createSimulationState({ scene }) {
  const AIRCRAFT = {
    model: 'aircraft1',
    mass: 50000,
    wingArea: 180,
    maxThrust: 800000,
    cdBase: 0.025,
    clSlope: 0.1,
    stallAngle: 35,
    inertia: new THREE.Vector3(100000, 150000, 200000),
    gearHeight: 3.5
  };

  const PHYSICS = {
    gravity: 9.81,
    rho: 1.225,
    dt: 0.016,
    position: new THREE.Vector3(0, AIRCRAFT.gearHeight, 1900),
    velocity: new THREE.Vector3(0, 0, 0),
    quaternion: new THREE.Quaternion(),
    angularVelocity: new THREE.Vector3(0, 0, 0),
    externalForce: new THREE.Vector3(0, 0, 0),
    externalTorque: new THREE.Vector3(0, 0, 0),
    throttle: 0,
    elevator: 0,
    aileron: 0,
    rudder: 0,
    flaps: 0,
    targetFlaps: 0,
    gearDown: true,
    gearTransition: 1.0,
    spoilers: false,
    brakes: false,
    egpwsMode: true,
    ils: {
      active: false,
      locError: 0,
      gsError: 0,
      distZ: 0,
      runwayHeading: 0,
      runwayId: '36'
    },
    airspeed: 0,
    aoa: 0,
    slip: 0,
    gForce: 1.0,
    heightAgl: 0,
    isStalling: false,
    onGround: true,
    crashed: false
  };

  const startupMode = pickStartupWeatherMode();
  const weatherModeCfg = getWeatherModeConfig(startupMode);
  const presetId = pickLightingPresetId();
  const preset = LIGHTING_PRESETS[presetId];

  const WEATHER = {
    mode: startupMode,
    modeName: weatherModeCfg.name,
    targetFog: weatherModeCfg.fog,
    currentFog: weatherModeCfg.fog,
    transition: weatherModeCfg.intensity,
    targetTransition: weatherModeCfg.intensity,
    lightingPresetId: presetId,
    clearColor: preset.clearColor,
    stormColor: preset.stormColor,
    lightAmbientBase: preset.ambientBase,
    lightDirectBase: preset.directBase,
    hemiSkyColor: preset.hemiSkyColor,
    hemiGroundColor: preset.hemiGroundColor,
    dirColor: preset.dirColor,
    sunPhiDeg: preset.sunPhiDeg,
    sunThetaDeg: preset.sunThetaDeg,
    skyTurbidity: preset.skyTurbidity,
    skyRayleigh: preset.skyRayleigh,
    skyMieCoefficient: preset.skyMieCoefficient,
    skyMieDirectionalG: preset.skyMieDirectionalG,
    hazeColor: preset.hazeColor,
    hazeOpacity: preset.hazeOpacity,
    starOpacity: preset.starOpacity,
    exposure: preset.exposure,
    bloomThreshold: preset.bloom.threshold,
    bloomStrength: preset.bloom.strength,
    bloomRadius: preset.bloom.radius,
    cloudColorClear: preset.cloudColorClear,
    cloudColorStorm: preset.cloudColorStorm,
    cloudOpacityBase: preset.cloudOpacityBase,
    cloudOpacityStorm: preset.cloudOpacityStorm,
    cloudEmissiveBase: preset.cloudEmissiveBase,
    cloudEmissiveStorm: preset.cloudEmissiveStorm,
    rainCount: 20000,
    rainMesh: null,
    rainPositions: null,
    rainVelocities: null
  };

  const rainGeo = new THREE.BufferGeometry();
  WEATHER.rainPositions = new Float32Array(WEATHER.rainCount * 3);
  WEATHER.rainVelocities = new Float32Array(WEATHER.rainCount);
  for (let i = 0; i < WEATHER.rainCount; i++) {
    WEATHER.rainPositions[i * 3] = (Math.random() - 0.5) * 800;
    WEATHER.rainPositions[i * 3 + 1] = (Math.random() - 0.5) * 400;
    WEATHER.rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 800;
    WEATHER.rainVelocities[i] = -40 - Math.random() * 20;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(WEATHER.rainPositions, 3));
  const rainMat = new THREE.PointsMaterial({
    color: 0x9999bb,
    size: 1.5,
    transparent: true,
    opacity: 0.5,
    depthWrite: false
  });
  WEATHER.rainMesh = new THREE.Points(rainGeo, rainMat);
  WEATHER.rainMesh.visible = false;
  scene.add(WEATHER.rainMesh);

  const keys = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    a: false,
    z: false,
    q: false,
    e: false,
    m: false,
    r: false
  };

  const runtime = {
    wasOnGround: true,
    lastTime: performance.now(),
    strobeTimer: 0,
    rainPhase: 0,
    physicsAccumulator: 0
  };

  return { AIRCRAFT, PHYSICS, WEATHER, keys, runtime };
}
