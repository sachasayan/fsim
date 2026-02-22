import * as THREE from 'three';

function pickWeatherModeWeighted() {
  const r = Math.random();
  if (r < 0.62) return 0; // clear
  if (r < 0.9) return 1;  // overcast
  return 2;               // storm
}

function getFogForMode(mode) {
  if (mode === 1) return 0.0025;
  if (mode === 2) return 0.006;
  return 0.00015;
}

function pickAtmospherePreset() {
  const presets = [
    {
      clearColor: 0x5a6e8a,
      stormColor: 0x1b2029,
      ambientBase: 0.3,
      directBase: 1.1,
      sunPhiDeg: 80 + Math.random() * 5,
      sunThetaDeg: 130 + Math.random() * 18,
      turbidity: 8.8,
      rayleigh: 2.3,
      mieCoefficient: 0.045,
      mieDirectionalG: 0.42
    },
    {
      clearColor: 0x3a2e3f,
      stormColor: 0x111115,
      ambientBase: 0.25,
      directBase: 1.0,
      sunPhiDeg: 82 + Math.random() * 4,
      sunThetaDeg: 145 + Math.random() * 14,
      turbidity: 10.2,
      rayleigh: 2.6,
      mieCoefficient: 0.05,
      mieDirectionalG: 0.4
    },
    {
      clearColor: 0x6e7890,
      stormColor: 0x1f232d,
      ambientBase: 0.34,
      directBase: 1.2,
      sunPhiDeg: 76 + Math.random() * 5,
      sunThetaDeg: 118 + Math.random() * 20,
      turbidity: 7.7,
      rayleigh: 2.0,
      mieCoefficient: 0.04,
      mieDirectionalG: 0.45
    }
  ];

  return presets[Math.floor(Math.random() * presets.length)];
}

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
    position: new THREE.Vector3(0, AIRCRAFT.gearHeight, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    quaternion: new THREE.Quaternion(),
    angularVelocity: new THREE.Vector3(0, 0, 0),
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
    autopilot: {
      hdg: false,
      targetHdg: 0,
      alt: false,
      targetAlt: 0,
      spd: false,
      targetSpd: 0,
      app: false
    },
    ils: {
      active: false,
      locError: 0,
      gsError: 0,
      distZ: 0
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

  const startupMode = pickWeatherModeWeighted();
  const startupFog = getFogForMode(startupMode);
  const atmosphere = pickAtmospherePreset();

  const WEATHER = {
    mode: startupMode,
    targetFog: startupFog,
    currentFog: startupFog,
    transition: startupMode > 0 ? 1 : 0,
    clearColor: atmosphere.clearColor,
    stormColor: atmosphere.stormColor,
    lightAmbientBase: atmosphere.ambientBase,
    lightDirectBase: atmosphere.directBase,
    sunPhiDeg: atmosphere.sunPhiDeg,
    sunThetaDeg: atmosphere.sunThetaDeg,
    skyTurbidity: atmosphere.turbidity,
    skyRayleigh: atmosphere.rayleigh,
    skyMieCoefficient: atmosphere.mieCoefficient,
    skyMieDirectionalG: atmosphere.mieDirectionalG,
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
    h: false,
    j: false,
    k: false,
    m: false,
    r: false,
    p: false
  };

  const runtime = {
    wasOnGround: true,
    lastTime: performance.now(),
    strobeTimer: 0
  };

  return { AIRCRAFT, PHYSICS, WEATHER, keys, runtime };
}
