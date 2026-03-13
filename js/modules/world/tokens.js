import * as THREE from 'three';
import { getAirportThresholds, resolveDistanceLod } from './LodSystem.js';

const TOKEN_COUNT = 72;
const TOKEN_VISIBLE_DISTANCE = 12000;
const TOKEN_PICKUP_RADIUS = 55;
const TOKEN_BASE_HEIGHT = 38;
const TOKEN_HEIGHT_VARIATION = 42;
const TOKEN_BOB_AMPLITUDE = 8;
const TOKEN_EFFECT_POOL_SIZE = 16;
const TOKEN_EFFECT_DURATION = 0.38;
const TOKEN_EFFECT_HIDE_SCALE = new THREE.Vector3(0.0001, 0.0001, 0.0001);

function fract(value) {
  return value - Math.floor(value);
}

function seededValue(seed) {
  return fract(Math.sin(seed * 12.9898) * 43758.5453123);
}

function computeSlopeScore(getTerrainHeight, x, z) {
  const sampleStep = 40;
  const center = getTerrainHeight(x, z);
  const dx = Math.abs(getTerrainHeight(x + sampleStep, z) - center);
  const dz = Math.abs(getTerrainHeight(x, z + sampleStep) - center);
  return Math.max(dx, dz);
}

function buildTokenEntries(getTerrainHeight) {
  const entries = [];
  let seed = 1;
  let candidateIndex = 0;

  while (entries.length < TOKEN_COUNT && candidateIndex < 600) {
    const lane = candidateIndex % 6;
    const laneOffset = (lane - 2.5) * 650;
    const distance = 1600 + Math.floor(candidateIndex / 6) * 620 + seededValue(seed + 7) * 240;
    const sideSign = candidateIndex % 2 === 0 ? 1 : -1;
    const x = laneOffset + sideSign * (260 + seededValue(seed + 13) * 220);
    const z = sideSign * distance;

    seed += 1;
    candidateIndex += 1;

    if (Math.abs(x) < 260 && Math.abs(z) < 2600) {
      continue;
    }

    const slopeScore = computeSlopeScore(getTerrainHeight, x, z);
    if (slopeScore > 24) {
      continue;
    }

    const terrainY = getTerrainHeight(x, z);
    const hoverHeight = TOKEN_BASE_HEIGHT + seededValue(seed + 29) * TOKEN_HEIGHT_VARIATION;
    const scale = 10 + seededValue(seed + 31) * 6;
    const spinSpeed = 1.7 + seededValue(seed + 37) * 1.1;
    const bobSpeed = 1.1 + seededValue(seed + 41) * 0.8;
    const phase = seededValue(seed + 43) * Math.PI * 2;
    const wobbleAmount = 0.1 + seededValue(seed + 47) * 0.14;
    const pulseOffset = seededValue(seed + 53) * Math.PI * 2;

    entries.push({
      x,
      z,
      terrainY,
      hoverHeight,
      scale,
      spinSpeed,
      bobSpeed,
      phase,
      wobbleAmount,
      pulseOffset,
      active: true
    });
  }

  return entries;
}

function buildTokenGeometry() {
  const geometry = new THREE.CylinderGeometry(0.92, 0.92, 0.26, 24, 1, false);
  geometry.rotateZ(Math.PI * 0.5);
  return geometry;
}

function createEffectPool(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const ringGeometry = new THREE.TorusGeometry(1.6, 0.16, 12, 32);
  const starGeometry = new THREE.OctahedronGeometry(0.65, 0);
  const flashGeometry = new THREE.PlaneGeometry(2.8, 2.8);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xffe8a3,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const starMaterial = new THREE.MeshBasicMaterial({
    color: 0xffbf47,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const flashMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const effects = [];
  for (let index = 0; index < TOKEN_EFFECT_POOL_SIZE; index += 1) {
    const root = new THREE.Group();
    root.visible = false;

    const ring = new THREE.Mesh(ringGeometry, ringMaterial.clone());
    ring.rotation.x = Math.PI * 0.5;
    root.add(ring);

    const flash = new THREE.Mesh(flashGeometry, flashMaterial.clone());
    flash.rotation.y = Math.PI * 0.25;
    root.add(flash);

    const starA = new THREE.Mesh(starGeometry, starMaterial.clone());
    const starB = new THREE.Mesh(starGeometry, starMaterial.clone());
    starA.position.y = 0.35;
    starB.position.y = 1.35;
    starB.scale.setScalar(0.72);
    root.add(starA);
    root.add(starB);

    group.add(root);
    effects.push({
      root,
      ring,
      flash,
      starA,
      starB,
      origin: new THREE.Vector3(),
      active: false,
      startTime: 0,
      duration: TOKEN_EFFECT_DURATION
    });
  }

  return effects;
}

export function createTokenSystem({ scene, getTerrainHeight, spawnParticle, lodSettings }) {
  const tokenGeometry = buildTokenGeometry();
  const tokenMaterial = new THREE.MeshStandardMaterial({
    color: 0xffda63,
    emissive: 0xffa200,
    emissiveIntensity: 1.0,
    roughness: 0.22,
    metalness: 0.74
  });
  const tokenMesh = new THREE.InstancedMesh(tokenGeometry, tokenMaterial, TOKEN_COUNT);
  tokenMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tokenMesh.castShadow = true;
  tokenMesh.receiveShadow = true;
  tokenMesh.frustumCulled = false;
  scene.add(tokenMesh);

  const hiddenMatrix = new THREE.Matrix4().makeScale(
    TOKEN_EFFECT_HIDE_SCALE.x,
    TOKEN_EFFECT_HIDE_SCALE.y,
    TOKEN_EFFECT_HIDE_SCALE.z
  );
  const dummy = new THREE.Object3D();
  const entries = buildTokenEntries(getTerrainHeight);
  const effectPool = createEffectPool(scene);
  let effectPoolIndex = 0;
  let collectedCount = 0;
  let collectionHandler = null;
  let currentLOD = -1;
  let tokensVisibleAtCurrentLod = true;
  const tokenSystemPosition = new THREE.Vector3();

  if (entries.length > 0) {
    for (const entry of entries) {
      tokenSystemPosition.x += entry.x;
      tokenSystemPosition.z += entry.z;
    }
    tokenSystemPosition.multiplyScalar(1 / entries.length);
  }

  for (let index = 0; index < TOKEN_COUNT; index += 1) {
    tokenMesh.setMatrixAt(index, hiddenMatrix);
  }

  function updateLOD(cameraPos, dist) {
    const [lod0Threshold] = getAirportThresholds(lodSettings);
    const newLOD = resolveDistanceLod(
      dist,
      currentLOD,
      [lod0Threshold],
      lodSettings?.airport?.distanceHysteresis
    );

    if (newLOD === currentLOD) {
      return;
    }

    currentLOD = newLOD;
    tokensVisibleAtCurrentLod = currentLOD === 0;
    tokenMesh.visible = tokensVisibleAtCurrentLod;
  }

  function emitCollectionParticles(worldPosition) {
    if (typeof spawnParticle !== 'function') {
      return;
    }

    for (let index = 0; index < 18; index += 1) {
      const burstAngle = (index / 18) * Math.PI * 2;
      const outward = 10 + Math.random() * 16;
      const lift = 12 + Math.random() * 16;
      const velocity = new THREE.Vector3(
        Math.cos(burstAngle) * outward,
        lift,
        Math.sin(burstAngle) * outward
      );
      spawnParticle(
        worldPosition,
        velocity,
        1.5 + Math.random() * 1.6,
        7 + Math.random() * 8,
        0.2 + Math.random() * 0.16,
        1.0,
        0.88 + Math.random() * 0.12,
        0.35 + Math.random() * 0.14
      );
    }

    for (let index = 0; index < 8; index += 1) {
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        18 + Math.random() * 18,
        (Math.random() - 0.5) * 8
      );
      spawnParticle(
        worldPosition,
        velocity,
        2.1 + Math.random() * 1.2,
        10 + Math.random() * 8,
        0.28 + Math.random() * 0.18,
        1.0,
        0.96,
        0.72
      );
    }
  }

  function startCollectionEffect(worldPosition, timeSeconds) {
    const effect = effectPool[effectPoolIndex];
    effectPoolIndex = (effectPoolIndex + 1) % effectPool.length;
    effect.active = true;
    effect.startTime = timeSeconds;
    effect.duration = TOKEN_EFFECT_DURATION;
    effect.root.visible = true;
    effect.root.position.copy(worldPosition);
    effect.origin.copy(worldPosition);
    effect.root.scale.setScalar(1);
    effect.root.rotation.set(0, 0, 0);
    effect.ring.material.opacity = 0.95;
    effect.flash.material.opacity = 0.7;
    effect.starA.material.opacity = 0.95;
    effect.starB.material.opacity = 0.75;
  }

  function emitCollectionEffect(worldPosition, timeSeconds) {
    emitCollectionParticles(worldPosition);
    startCollectionEffect(worldPosition, timeSeconds);
  }

  function updateCollectionEffects(timeSeconds, cameraQuaternion) {
    for (const effect of effectPool) {
      if (!effect.active) {
        continue;
      }

      const progress = Math.min(1, (timeSeconds - effect.startTime) / effect.duration);
      const fade = 1 - progress;
      const eased = 1 - Math.pow(1 - progress, 3);

      effect.root.position.copy(effect.origin);
      effect.root.position.y += eased * 5.2;
      effect.ring.scale.setScalar(1 + eased * 3.6);
      effect.ring.material.opacity = fade * 0.9;

      effect.flash.quaternion.copy(cameraQuaternion);
      effect.flash.scale.setScalar(1.2 + eased * 2.4);
      effect.flash.material.opacity = Math.max(0, (1 - progress * 1.5) * 0.75);

      effect.starA.position.y = 0.3 + eased * 3.4;
      effect.starB.position.y = 1.1 + eased * 4.8;
      effect.starA.rotation.x += 0.22;
      effect.starA.rotation.y += 0.28;
      effect.starB.rotation.x -= 0.18;
      effect.starB.rotation.z += 0.24;
      effect.starA.scale.setScalar(1 + eased * 0.8);
      effect.starB.scale.setScalar(0.72 + eased * 0.6);
      effect.starA.material.opacity = fade;
      effect.starB.material.opacity = fade * 0.82;

      if (progress >= 1) {
        effect.active = false;
        effect.root.visible = false;
      }
    }
  }

  function updateTokenSystem({ timeMs = 0, aircraftPosition, cameraPosition, cameraQuaternion }) {
    const timeSeconds = timeMs * 0.001;
    const visibleDistanceSq = TOKEN_VISIBLE_DISTANCE * TOKEN_VISIBLE_DISTANCE;
    const pickupRadiusSq = TOKEN_PICKUP_RADIUS * TOKEN_PICKUP_RADIUS;

    tokenMaterial.emissiveIntensity = 1.05 + Math.sin(timeSeconds * 4.5) * 0.12;

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const bobOffset = Math.sin(timeSeconds * entry.bobSpeed + entry.phase) * TOKEN_BOB_AMPLITUDE;
      const worldY = entry.terrainY + entry.hoverHeight + bobOffset;

      if (entry.active && aircraftPosition) {
        const dx = aircraftPosition.x - entry.x;
        const dy = aircraftPosition.y - worldY;
        const dz = aircraftPosition.z - entry.z;
        if ((dx * dx) + (dy * dy) + (dz * dz) <= pickupRadiusSq) {
          entry.active = false;
          collectedCount += 1;
          const worldPosition = new THREE.Vector3(entry.x, worldY, entry.z);
          emitCollectionEffect(worldPosition, timeSeconds);
          collectionHandler?.({
            count: collectedCount,
            worldPosition,
            collectedAtMs: timeMs
          });
        }
      }

      const camDx = (cameraPosition?.x ?? 0) - entry.x;
      const camDy = (cameraPosition?.y ?? 0) - worldY;
      const camDz = (cameraPosition?.z ?? 0) - entry.z;
      const isVisible = tokensVisibleAtCurrentLod
        && entry.active
        && ((camDx * camDx) + (camDy * camDy) + (camDz * camDz) <= visibleDistanceSq);

      if (!isVisible) {
        tokenMesh.setMatrixAt(index, hiddenMatrix);
        continue;
      }

      const wobble = Math.sin(timeSeconds * (entry.bobSpeed * 1.7) + entry.phase) * entry.wobbleAmount;
      const pulse = 1 + Math.sin(timeSeconds * 5.4 + entry.pulseOffset) * 0.06;
      dummy.position.set(entry.x, worldY, entry.z);
      dummy.rotation.set(wobble, timeSeconds * entry.spinSpeed + entry.phase, wobble * 0.55);
      dummy.scale.set(entry.scale * pulse, entry.scale * pulse * 1.06, entry.scale * pulse);
      dummy.updateMatrix();
      tokenMesh.setMatrixAt(index, dummy.matrix);
    }

    tokenMesh.instanceMatrix.needsUpdate = true;
    if (cameraQuaternion) {
      updateCollectionEffects(timeSeconds, cameraQuaternion);
    }
  }

  function resetTokens() {
    collectedCount = 0;
    for (const entry of entries) {
      entry.active = true;
    }
    for (const effect of effectPool) {
      effect.active = false;
      effect.root.visible = false;
    }
  }

  function setCollectionHandler(handler) {
    collectionHandler = typeof handler === 'function' ? handler : null;
  }

  function getCollectedTokenCount() {
    return collectedCount;
  }

  return {
    position: tokenSystemPosition,
    tokenMesh,
    updateLOD,
    updateTokenSystem,
    resetTokens,
    setTokenCollectionHandler: setCollectionHandler,
    getCollectedTokenCount
  };
}
