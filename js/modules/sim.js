import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Noise } from './noise.js';
import { createSimulationState } from './state.js';
import { createWorldObjects } from './world/objects.js';
import { calculateAerodynamics } from './physics/updatePhysics.js';
import { createCameraController } from './camera/updateCamera.js';
import { createHUD } from './ui/hud.js';
import { getWeatherModeConfig } from './lighting.js';

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

const cameraController = createCameraController({
  camera,
  planeGroup,
  clouds,
  PHYSICS,
  AIRCRAFT,
  getTerrainHeight
});

const hud = createHUD({ PHYSICS, WEATHER, getTerrainHeight });

window.addEventListener('keydown', (e) => {
  if (Object.prototype.hasOwnProperty.call(keys, e.key.toLowerCase()) || Object.prototype.hasOwnProperty.call(keys, e.key)) {
    const k = Object.prototype.hasOwnProperty.call(keys, e.key) ? e.key : e.key.toLowerCase();
    keys[k] = true;
  }

  if (e.key.toLowerCase() === 'c') cameraController.cycleMode();
  if (e.key.toLowerCase() === 'm') PHYSICS.egpwsMode = !PHYSICS.egpwsMode;

  if (e.key.toLowerCase() === 'r') {
    WEATHER.mode = (WEATHER.mode + 1) % 3;
    const cfg = getWeatherModeConfig(WEATHER.mode);
    WEATHER.modeName = cfg.name;
    WEATHER.targetFog = cfg.fog;
    WEATHER.targetTransition = cfg.intensity;
  }

  if (e.key.toLowerCase() === 'h') {
    PHYSICS.autopilot.hdg = !PHYSICS.autopilot.hdg;
    if (PHYSICS.autopilot.hdg) PHYSICS.autopilot.targetHdg = -new THREE.Euler().setFromQuaternion(PHYSICS.quaternion, 'YXZ').y;
  }
  if (e.key.toLowerCase() === 'j') {
    PHYSICS.autopilot.alt = !PHYSICS.autopilot.alt;
    if (PHYSICS.autopilot.alt) PHYSICS.autopilot.targetAlt = PHYSICS.position.y;
  }
  if (e.key.toLowerCase() === 'k') {
    PHYSICS.autopilot.spd = !PHYSICS.autopilot.spd;
    if (PHYSICS.autopilot.spd) PHYSICS.autopilot.targetSpd = PHYSICS.airspeed;
  }
  if (e.key.toLowerCase() === 'p') {
    if (PHYSICS.ils.active) PHYSICS.autopilot.app = !PHYSICS.autopilot.app;
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
    engineGain: null,
    engineOsc: null,
    jetNoiseFilter: null,
    windGain: null,
    windFilter: null,
    rainGain: null,
    rainFilter: null,
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

        // 2. Wind System (Gentle, ASMR-style breeze)
        const windSrc = this.ctx.createBufferSource();
        windSrc.buffer = noiseBuffer;
        windSrc.loop = true;
        this.windFilter = this.ctx.createBiquadFilter();
        this.windFilter.type = 'lowpass';
        this.windGain = this.ctx.createGain();
        this.windGain.gain.value = 0;
        windSrc.connect(this.windFilter).connect(this.windGain).connect(this.ctx.destination);
        windSrc.start();

        // 3. Jet Engine Roar (Deep, muffled low-frequency rumble)
        const jetNoiseSrc = this.ctx.createBufferSource();
        jetNoiseSrc.buffer = noiseBuffer;
        jetNoiseSrc.loop = true;
        this.jetNoiseFilter = this.ctx.createBiquadFilter();
        this.jetNoiseFilter.type = 'lowpass';
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0;
        jetNoiseSrc.connect(this.jetNoiseFilter).connect(this.engineGain).connect(this.ctx.destination);
        jetNoiseSrc.start();

        // 4. Engine Fan Whine (Smooth sine wave hum instead of harsh sawtooth)
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sine';
        const oscGain = this.ctx.createGain();
        oscGain.gain.value = 0.08; // Very soft blend behind the rumble
        this.engineOsc.connect(oscGain).connect(this.engineGain);
        this.engineOsc.start();

        // 5. Storm Rain System (Soft hiss)
        const rainSrc = this.ctx.createBufferSource();
        rainSrc.buffer = noiseBuffer;
        rainSrc.loop = true;
        this.rainFilter = this.ctx.createBiquadFilter();
        this.rainFilter.type = 'lowpass';
        this.rainGain = this.ctx.createGain();
        this.rainGain.gain.value = 0;
        rainSrc.connect(this.rainFilter).connect(this.rainGain).connect(this.ctx.destination);
        rainSrc.start();
    },

    update: function (throttle, airspeed, spoilers, cameraMode, weatherMode, gForce, angularVelocity) {
        if (!this.initialized || this.ctx.state === 'suspended') return;

        const t = this.ctx.currentTime;
        // Camera dampening (Cockpit is highly insulated, exterior is louder but still smooth)
        const masterVol = cameraMode === 1 ? 0.35 : 0.8;

        // Engine Physics (Ultra-slow, soft transitions for a calmer vibe)
        // INCREASED: Engine base presence and throttle scaling
        this.engineGain.gain.setTargetAtTime((0.15 + throttle * 0.45) * masterVol, t, 1.0);
        this.jetNoiseFilter.frequency.setTargetAtTime(60 + throttle * 150, t, 1.0); // Deep, soothing bass
        this.engineOsc.frequency.setTargetAtTime(80 + throttle * 80, t, 1.0); // Low, stable hum

        // Wind Physics (Dynamic based on G-force and maneuvers)
        const speedFactor = Math.max(0, airspeed / 250);
        const spoilerDrag = (spoilers && airspeed > 30) ? 0.15 : 0;

        // Calculate structural / maneuver stress
        const gStress = Math.abs(gForce - 1.0); // 0 when flying level, >0 when pulling/pushing Gs
        const rotStress = Math.abs(angularVelocity.x) + Math.abs(angularVelocity.y) + Math.abs(angularVelocity.z);
        const maneuverStress = Math.min(1.0, (gStress + rotStress) * 0.8);

        // DECREASED: Base wind volume is now much quieter relative to the engines
        const windVol = (Math.pow(speedFactor, 2) * 0.04 + maneuverStress * 0.25 + spoilerDrag);
        this.windGain.gain.setTargetAtTime(windVol * masterVol, t, 0.5);

        // Filter opens up during maneuvers for a realistic "rushing" sound
        this.windFilter.frequency.setTargetAtTime(100 + speedFactor * 300 + maneuverStress * 800 + (spoilers ? 400 : 0), t, 0.5);

        // Rain Audio Physics (Gentle drizzle)
        const targetRainVol = (weatherMode === 2) ? 0.15 * masterVol : 0;
        this.rainGain.gain.setTargetAtTime(targetRainVol, t, 1.0); // Slow fade in/out
        this.rainFilter.frequency.setTargetAtTime(300 + (airspeed * 1.5), t, 0.5);
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

        osc.connect(gain).connect(this.ctx.destination);
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
    PHYSICS.heading = 0;
    PHYSICS.airspeed = 0;
    PHYSICS.throttle = 0;
    PHYSICS.flaps = 0;
    PHYSICS.targetFlaps = 0;
    PHYSICS.spoilers = false;
    PHYSICS.gearDown = true;
    PHYSICS.gearTransition = 1.0;
    PHYSICS.brakes = false;

    // Disable AP
    PHYSICS.autopilot.alt = false;
    PHYSICS.autopilot.hdg = false;
    PHYSICS.autopilot.spd = false;
    PHYSICS.autopilot.app = false;

    document.getElementById('dashboard').style.opacity = '1.0';
    document.getElementById('crash-screen').style.display = 'none';

    // Clear particles
    for (let i = 0; i < MAX_PARTICLES; i++) particles[i].active = false;

    planeGroup.position.copy(PHYSICS.position);
    planeGroup.quaternion.copy(PHYSICS.quaternion);
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

    // Cap dt to avoid physics explosions on lag spikes
    if (dt > 0.05) dt = 0.05;
    PHYSICS.dt = dt;

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

    // Animate Storm Rain Physics
    if (WEATHER.mode === 2) {
        WEATHER.rainMesh.visible = true;
        const pos = WEATHER.rainMesh.geometry.attributes.position.array;
        const camPos = camera.position;

        for (let i = 0; i < WEATHER.rainCount; i++) {
            // Apply gravity
            pos[i * 3 + 1] += WEATHER.rainVelocities[i] * dt;

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
            let offsetL = new THREE.Vector3(-4.5 + (Math.random() - 0.5) * 2, -3.5, 3 + (Math.random() - 0.5) * 2);
            let offsetR = new THREE.Vector3(4.5 + (Math.random() - 0.5) * 2, -3.5, 3 + (Math.random() - 0.5) * 2);
            let posL = offsetL.applyQuaternion(planeGroup.quaternion).add(planeGroup.position);
            let posR = offsetR.applyQuaternion(planeGroup.quaternion).add(planeGroup.position);

            let pVel = PHYSICS.velocity.clone().multiplyScalar(0.4).add(new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 8, (Math.random() - 0.5) * 8));

            spawnParticle(posL, pVel, 3 + Math.random() * 2, 8, 1.5, 0.7, 0.7, 0.7);
            spawnParticle(posR, pVel, 3 + Math.random() * 2, 8, 1.5, 0.7, 0.7, 0.7);
        }
    }
    runtime.wasOnGround = PHYSICS.onGround;

    // 2. Wingtip Vortices (High G, Spoilers, or heavy Flaps)
    let intensity = (PHYSICS.gForce - 1.2) * 2.0 + (PHYSICS.spoilers ? 0.8 : 0) + (PHYSICS.flaps * 0.5);
    if (!PHYSICS.onGround && intensity > 0.1 && PHYSICS.airspeed > 40) {
        let tipL = new THREE.Vector3(-21, 2, 14).applyQuaternion(planeGroup.quaternion).add(planeGroup.position);
        let tipR = new THREE.Vector3(21, 2, 14).applyQuaternion(planeGroup.quaternion).add(planeGroup.position);
        let pVel = PHYSICS.velocity.clone().multiplyScalar(0.8);

        let iClamp = Math.min(1.0, intensity);
        spawnParticle(tipL, pVel, 1.5, 4, 0.8, iClamp, iClamp, iClamp);
        spawnParticle(tipR, pVel, 1.5, 4, 0.8, iClamp, iClamp, iClamp);
    }

    // 3. High Altitude Engine Contrails
    if (PHYSICS.throttle > 0.2 && PHYSICS.airspeed > 50) {
        let engL = new THREE.Vector3(-7.5, -2.2, 5).applyQuaternion(planeGroup.quaternion).add(planeGroup.position);
        let engR = new THREE.Vector3(7.5, -2.2, 5).applyQuaternion(planeGroup.quaternion).add(planeGroup.position);
        let pVel = PHYSICS.velocity.clone().multiplyScalar(0.7);

        // Fade in at higher altitudes (starts > 1500m, peaks > 4500m)
        let altFactor = Math.max(0, Math.min(1, (PHYSICS.position.y - 1500) / 3000));
        let heatIntensity = altFactor * 0.8 * PHYSICS.throttle;

        if (heatIntensity > 0.05) {
            spawnParticle(engL, pVel, 2.0, 5, 2.5, heatIntensity, heatIntensity, heatIntensity);
            spawnParticle(engR, pVel, 2.0, 5, 2.5, heatIntensity, heatIntensity, heatIntensity);
        }
    }

    // 4. Update & Render Particles
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

    // --- PAPI LIGHTS UPDATE ---
    const distZ = PHYSICS.position.z - 1000;
    // Only activate if approaching from the South (Positive Z) within 15km
    if (distZ > 0 && distZ < 15000) {
        const distX = PHYSICS.position.x - (-63); // Center of PAPI array
        const dist2D = Math.sqrt(distX * distX + distZ * distZ);

        // Calculate viewing angle from the plane down to the PAPI lights
        const angleDeg = Math.atan2(PHYSICS.position.y - 1.5, dist2D) * (180 / Math.PI);

        // Standard PAPI Glidepath: 3.0 degrees
        let wCount = 0;
        if (angleDeg > 3.5) wCount = 4;        // Too High (4 White)
        else if (angleDeg > 3.2) wCount = 3;   // Slightly High (3 White, 1 Red)
        else if (angleDeg > 2.8) wCount = 2;   // On Glidepath (2 White, 2 Red)
        else if (angleDeg > 2.5) wCount = 1;   // Slightly Low (1 White, 3 Red)
        else wCount = 0;                       // Too Low (4 Red)

        // Apply colors (Inner light is index 0, Outer is index 3)
        // Real PAPI: On glidepath = inner 2 red, outer 2 white.
        for (let i = 0; i < 4; i++) {
            PAPI.lights[i].material = (i >= (4 - wCount)) ? PAPI.matWhite : PAPI.matRed;
        }
    } else {
        for (let i = 0; i < 4; i++) PAPI.lights[i].material = PAPI.matOff;
    }

    if (!PHYSICS.crashed) {
        calculateAerodynamics({ THREE, PHYSICS, AIRCRAFT, WEATHER, keys, getTerrainHeight, gearGroup, planeGroup, Noise });
    } else {
        // WRECKAGE PHYSICS: Let gravity pull the wreckage down if destroyed mid-air
        if (!PHYSICS.onGround) {
            PHYSICS.velocity.y -= PHYSICS.gravity * dt;
            PHYSICS.position.add(PHYSICS.velocity.clone().multiplyScalar(dt));

            // Add uncontrolled tumbling spin
            PHYSICS.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(dt, dt * 0.5, dt * 2))).normalize();

            const terrainY = getTerrainHeight(PHYSICS.position.x, PHYSICS.position.z);
            if (PHYSICS.position.y <= terrainY + AIRCRAFT.gearHeight) {
                PHYSICS.position.y = terrainY + AIRCRAFT.gearHeight;
                PHYSICS.onGround = true;
                PHYSICS.velocity.set(0, 0, 0);
            }
            planeGroup.position.copy(PHYSICS.position);
            planeGroup.quaternion.copy(PHYSICS.quaternion);
        }
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
        PHYSICS.angularVelocity
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
        animate();
    });
}, 1500);
