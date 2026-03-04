import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { Noise } from './noise.js';
import { createSimulationState } from './state.js';
import { createWorldObjects } from './world/objects.js';
import { calculateAerodynamics } from './physics/updatePhysics.js';
import { createPhysicsAdapter } from './physics/physicsAdapter.js';
import { createCameraController } from './camera/updateCamera.js';
import { createHUD } from './ui/hud.js';

// New extracted modules
import { createRendererManager } from './core/RendererManager.js';
import { createWeatherManager } from './core/WeatherManager.js';
import { createInputHandler } from './core/InputHandler.js';
import { createAirportSystems } from './sim/AirportSystems.js';
import { ProceduralAudio } from './audio/AudioSystem.js';

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

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 100000);

const {
  renderer,
  composer,
  smaaPass,
  bloomPass,
  handleResize
} = createRendererManager({ container, scene, camera });

const stats = new Stats();
document.body.appendChild(stats.dom);

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
  updateAircraftLOD,
  updateControlSurfaces
} = createWorldObjects({ scene, renderer, Noise, PHYSICS, AIRCRAFT, WEATHER });

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
  applyEnvironmentFromWeather
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

const prevShadowCenter = new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
let prevShadowExtent = -1;
let lastTerrainChunkX = Number.POSITIVE_INFINITY;
let lastTerrainChunkZ = Number.POSITIVE_INFINITY;
let lastTerrainUpdateMs = 0;
const TERRAIN_UPDATE_INTERVAL_MS = 120;

const PHYSICS_STEP = 1 / 75;
const MAX_PHYSICS_STEPS_PER_FRAME = 4;

// --- CRASH LOGIC & RESET ---
window.triggerCrash = function (reason) {
  if (PHYSICS.crashed) return;
  PHYSICS.crashed = true;
  PHYSICS.throttle = 0;
  PHYSICS.velocity.multiplyScalar(0.2);

  document.getElementById('dashboard').style.opacity = '0.3';
  document.getElementById('crash-screen').style.display = 'flex';
  document.getElementById('crash-reason').innerText = "CAUSE: " + reason;

  for (let i = 0; i < 300; i++) {
    let pVel = PHYSICS.velocity.clone().multiplyScalar(0.3).add(new THREE.Vector3((Math.random() - 0.5) * 80, Math.random() * 100, (Math.random() - 0.5) * 80));
    let size = 20 + Math.random() * 40;
    let life = 3 + Math.random() * 6;
    if (Math.random() > 0.4) {
      spawnParticle(planeGroup.position, pVel, size, 25, life, 1.0, 0.2 + Math.random() * 0.3, 0.0);
    } else {
      spawnParticle(planeGroup.position, pVel.multiplyScalar(0.5), size, 40, life * 1.5, 0.05, 0.05, 0.05);
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

  for (let i = 0; i < MAX_PARTICLES; i++) particles[i].active = false;

  planeGroup.position.copy(PHYSICS.position);
  planeGroup.quaternion.copy(PHYSICS.quaternion);
  physicsAdapter.syncFromState();
};

window.addEventListener('resize', handleResize);

function animate() {
  requestAnimationFrame(animate);
  stats.update();

  const now = performance.now();
  let dt = Math.min((now - runtime.lastTime) / 1000, 0.05);
  runtime.lastTime = now;

  runtime.frameCount++;

  // 1. Update visuals (weather, lighting, clouds)
  weatherManager.update(dt, runtime.frameCount, camera);

  // 2. Water Animation
  if (waterMaterial.userData.timeUniform) {
    waterMaterial.userData.timeUniform.value += dt;
  }


  // 3. Aircraft Control Surfaces
  updateControlSurfaces(PHYSICS, dt);

  // 4. Strobe & Beacon Logic
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

  // 5. Airport Systems (ALS)
  airportSystems.updateALS(now);

  // 5b. Aircraft LOD
  updateAircraftLOD(camera);

  // 6. Audio Update
  ProceduralAudio.update(
    PHYSICS.throttle,
    PHYSICS.airspeed,
    PHYSICS.spoilers,
    cameraController.mode,
    WEATHER.mode,
    PHYSICS.gForce,
    PHYSICS.angularVelocity,
    PHYSICS.aoa,
    PHYSICS.slip
  );

  // 7. Particle System (Touchdown)
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

  // 8. Physics Steps
  runtime.physicsAccumulator = Math.min(runtime.physicsAccumulator + dt, PHYSICS_STEP * MAX_PHYSICS_STEPS_PER_FRAME);
  let physicsSteps = 0;
  while (runtime.physicsAccumulator >= PHYSICS_STEP && physicsSteps < MAX_PHYSICS_STEPS_PER_FRAME) {
    PHYSICS.dt = PHYSICS_STEP;
    if (!PHYSICS.crashed) {
      calculateAerodynamics({
        THREE, PHYSICS, AIRCRAFT, WEATHER, keys,
        getTerrainHeight, gearGroup, planeGroup, Noise
      });
    } else if (!PHYSICS.onGround) {
      PHYSICS.velocity.y -= PHYSICS.gravity * PHYSICS_STEP;
      PHYSICS.position.add(tmpTouchVel.copy(PHYSICS.velocity).multiplyScalar(PHYSICS_STEP));
      PHYSICS.quaternion.multiply(
        tmpCrashSpinQuat.setFromEuler(
          tmpCrashSpinEuler.set(Math.random() * 0.1, Math.random() * 0.1, Math.random() * 0.1)
        )
      ).normalize();

      const terrainY = getTerrainHeight(PHYSICS.position.x, PHYSICS.position.z);
      if (PHYSICS.position.y <= terrainY + AIRCRAFT.gearHeight) {
        PHYSICS.position.y = terrainY + AIRCRAFT.gearHeight;
        PHYSICS.onGround = true;
        PHYSICS.velocity.set(0, 0, 0);
      }
    }

    if (PHYSICS.crashed) {
      PHYSICS.externalForce.set(0, 0, 0);
      PHYSICS.externalTorque.set(0, 0, 0);
    }

    physicsAdapter.step(PHYSICS_STEP);

    const terrainFloorY = (PHYSICS.crashed && PHYSICS.onGround)
      ? PHYSICS.position.y
      : getTerrainHeight(PHYSICS.position.x, PHYSICS.position.z) + AIRCRAFT.gearHeight;

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

    physicsSteps++;
    runtime.physicsAccumulator -= PHYSICS_STEP;
  }

  // 9. Post-Physics Sync
  // Shadow centering
  tmpShadowSunDir.copy(dirLight.position).sub(dirLight.target.position).normalize();
  const shadowCenter = planeGroup.position;
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

  // Terrain update
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

  // 10. Final Render
  composer.render();
}

// Initialization complete
setTimeout(() => {
  // Final attempt to resume if not already done
  ProceduralAudio.resume();

  const loader = document.getElementById('loader');
  if (loader) {
    loader.style.opacity = '0';
    setTimeout(() => loader.style.display = 'none', 1000);
  }

  PHYSICS.position.set(0, AIRCRAFT.gearHeight, 1900);
  PHYSICS.velocity.set(0, 0, 0);
  PHYSICS.angularVelocity.set(0, 0, 0);
  PHYSICS.externalForce.set(0, 0, 0);
  PHYSICS.externalTorque.set(0, 0, 0);
  physicsAdapter.syncFromState();
  animate();
}, 1500);
