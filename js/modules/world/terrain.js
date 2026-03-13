import * as THREE from 'three';
import { createWaterNormalMap, createTreeBillboardTexture, createTreeContactTexture, createPackedTerrainDetailTexture } from './terrain/TerrainTextures.js';
import {
  makeTreeBillboardMaterial,
  makeTreeDepthMaterial,
  createDetailedBuildingMat,
  setupTerrainMaterial,
  setupWaterMaterial,
  setupBuildingPopIn
} from './terrain/TerrainMaterials.js';
import { RoadMarkingOverlay } from './terrain/RoadMarkingOverlay.js';

const tempMainCameraPosUniform = { value: new THREE.Vector3() };
import {
  getTerrainHeight,
  getLodForRingDistance
} from './terrain/TerrainUtils.js';
import { normalizeLodSettings } from './LodSystem.js';
import {
  fetchDistrictIndex,
  clearDistrictCache
} from './terrain/CityChunkLoader.js';
import {
  generateChunkBase as genBase,
  generateChunkProps as genProps,
  getOverlappingDistricts,
  loadStaticWorld,
  CHUNK_SIZE
} from './terrain/TerrainGeneration.js';
import { animateWindmillProps, spawnCityBuildingsForChunk, spawnDistrictPropsForChunk } from './terrain/BuildingSpawner.js';
import { debugLog } from '../core/logging.js';
import { createRuntimeLodSettings } from './LodSystem.js';

export function createTerrainSystem({
  scene,
  renderer,
  Noise,
  PHYSICS,
  lodSettings = null,
  loadStaticWorldFn = loadStaticWorld
}) {
  const hasWindow = typeof window !== 'undefined';
  const windowRef = hasWindow ? window : null;
  const locationSearch = windowRef?.location?.search || '';
  lodSettings = lodSettings || createRuntimeLodSettings({ urlSearch: locationSearch });

  const waterMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.62,
    metalness: 0.05,
    normalMap: createWaterNormalMap(Noise),
    normalScale: new THREE.Vector2(1.5, 1.5)
  });

  const atmosphereCameraPos = new THREE.Vector3();
  const atmosphereColor = new THREE.Color(0x90939f);
  const atmosphereUniforms = {
    uAtmosCameraPos: { value: atmosphereCameraPos },
    uAtmosColor: { value: atmosphereColor },
    uAtmosNear: { value: 9000.0 },
    uAtmosFar: { value: 68000.0 }
  };

  // Parse URL params once — these never change at runtime
  const urlParams = new URLSearchParams(locationSearch);
  const _fogDisabled = urlParams.get('fog') === '0';
  const _isFastLoad  = urlParams.get('fastload') === '1';
  normalizeLodSettings(lodSettings);

  if (_fogDisabled) {
    atmosphereUniforms.uAtmosNear.value = 1e6;
    atmosphereUniforms.uAtmosFar.value = 1e7;
  }
  const tmpColorA = new THREE.Color();
  const tmpColorB = new THREE.Color();

  const waterFarMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true
  });

  const waterTimeUniform = { value: 0 };
  waterMaterial.userData.timeUniform = waterTimeUniform;

  setupWaterMaterial(waterMaterial, atmosphereUniforms, waterTimeUniform, false);
  setupWaterMaterial(waterFarMaterial, atmosphereUniforms, null, true);

  const LOD_LEVELS = lodSettings.terrain.lodLevels;

  const terrainChunks = new Map();
  const pendingChunkBuilds = [];
  const pendingChunkKeys = new Set();
  let pendingQueueDirty = false;
  const pendingPropBuilds = [];
  const pendingPropKeys = new Set();
  let pendingPropQueueDirty = false;
  const chunkPools = [[], [], [], []];
  const instancedMeshPools = new Map();
  let bootstrapMode = true;
  const terrainDetailTex = createPackedTerrainDetailTexture();
  const roadMarkingOverlay = new RoadMarkingOverlay();
  const terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02, flatShading: false });
  const terrainFarMaterial = terrainMaterial.clone();
  terrainFarMaterial.roughness = 1.0;
  terrainFarMaterial.metalness = 0.0;

  const terrainDetailUniforms = {
    uTerrainDetailTex: { value: terrainDetailTex },
    uRoadMarkingTex: { value: roadMarkingOverlay.texture },
    uRoadMarkingCenter: { value: new THREE.Vector2(0, 0) },
    uRoadMarkingWorldSize: { value: roadMarkingOverlay.worldSize },
    uRoadMarkingOpacity: { value: 1.0 },
    uRoadMarkingFadeStart: { value: 180.0 },
    uRoadMarkingFadeEnd: { value: 460.0 },
    uRoadMarkingBodyStart: { value: 0.2 },
    uRoadMarkingBodyEnd: { value: 0.45 },
    uRoadMarkingCoreStart: { value: 0.55 },
    uRoadMarkingCoreEnd: { value: 0.8 },
    uTerrainDetailScale: { value: 0.16 },
    uTerrainDetailStrength: { value: 1.1 },
    uTerrainSlopeStart: { value: 0.26 },
    uTerrainSlopeEnd: { value: 0.62 },
    uTerrainRockHeightStart: { value: 220.0 },
    uTerrainRockHeightEnd: { value: 560.0 },
    uTerrainAtmosStrength: { value: 0.25 },
    uTerrainFoliageNearStart: { value: 120.0 },
    uTerrainFoliageNearEnd: { value: 1200.0 },
    uTerrainFoliageStrength: { value: 0.38 },
    uTerrainSandColor: { value: new THREE.Color(194 / 255, 178 / 255, 128 / 255) },
    uTerrainGrassColor: { value: new THREE.Color(42 / 255, 75 / 255, 42 / 255) },
    uTerrainRockColor: { value: new THREE.Color(85 / 255, 85 / 255, 85 / 255) },
    uTerrainSnowColor: { value: new THREE.Color(1, 1, 1) },
    uTerrainAsphaltColor: { value: new THREE.Color(0x000000) }
  };

  setupTerrainMaterial(terrainMaterial, terrainDetailUniforms, atmosphereUniforms, waterTimeUniform, false);
  setupTerrainMaterial(terrainFarMaterial, terrainDetailUniforms, atmosphereUniforms, waterTimeUniform, true);

  // Load static world data after uniforms exist so the moving road-marking atlas can populate immediately.
  Promise.resolve(loadStaticWorldFn()).then(success => {
    if (success && windowRef?.fsimWorld) {
      roadMarkingOverlay.update(PHYSICS.position.x, PHYSICS.position.z, windowRef.fsimWorld);
      terrainDetailUniforms.uRoadMarkingCenter.value.set(roadMarkingOverlay.center.x, roadMarkingOverlay.center.z);
    }
  });

  const treeBillboardGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
  treeBillboardGeo.translate(0, 0.5, 0);
  const treeGroundGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
  treeGroundGeo.rotateX(-Math.PI / 2);
  const treeTrunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1, 6);
  treeTrunkGeo.translate(0, 0.5, 0);
  const treeTextures = {
    broadleaf: createTreeBillboardTexture('broadleaf', { crownOnly: true }),
    poplar: createTreeBillboardTexture('poplar', { crownOnly: true }),
    dry: createTreeBillboardTexture('dry', { crownOnly: true })
  };
  const treeContactTexture = createTreeContactTexture();
  const treeCanopyMats = {
    broadleaf: makeTreeBillboardMaterial(treeTextures.broadleaf, 0x9bb784, { cameraFacing: true, lockYAxis: false }),
    poplar: makeTreeBillboardMaterial(treeTextures.poplar, 0xa7be88, { cameraFacing: true, lockYAxis: false }),
    dry: makeTreeBillboardMaterial(treeTextures.dry, 0xb3af7e, { cameraFacing: true, lockYAxis: false })
  };
  const treeDepthMats = {
    broadleaf: makeTreeDepthMaterial(treeTextures.broadleaf, tempMainCameraPosUniform, { cameraFacing: true, lockYAxis: false, shadowFadeNear: 1400, shadowFadeFar: 2100 }),
    poplar: makeTreeDepthMaterial(treeTextures.poplar, tempMainCameraPosUniform, { cameraFacing: true, lockYAxis: false, shadowFadeNear: 1400, shadowFadeFar: 2100 }),
    dry: makeTreeDepthMaterial(treeTextures.dry, tempMainCameraPosUniform, { cameraFacing: true, lockYAxis: false, shadowFadeNear: 1400, shadowFadeFar: 2100 })
  };
  const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4d31, roughness: 0.94, metalness: 0.0 });
  const treeTypeConfigs = {
    broadleaf: { canopyMat: treeCanopyMats.broadleaf, depthMat: treeDepthMats.broadleaf, hRange: [12, 21], wScale: 0.68, baseTint: new THREE.Color(0x9bb784) },
    poplar: { canopyMat: treeCanopyMats.poplar, depthMat: treeDepthMats.poplar, hRange: [13, 24], wScale: 0.4, baseTint: new THREE.Color(0xa7be88) },
    dry: { canopyMat: treeCanopyMats.dry, depthMat: treeDepthMats.dry, hRange: [9, 17], wScale: 0.58, baseTint: new THREE.Color(0xb3af7e) }
  };
  const treeGroundMats = {
    near: new THREE.MeshBasicMaterial({ map: treeContactTexture, color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false }),
    mid: new THREE.MeshBasicMaterial({ map: treeContactTexture, color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false })
  };
  treeGroundMats.near.toneMapped = false;
  treeGroundMats.mid.toneMapped = false;

  const hullGeo = new THREE.BoxGeometry(2.5, 1.2, 8); hullGeo.translate(0, 0.6, 0);
  const cabinGeo = new THREE.BoxGeometry(2.0, 1.5, 3); cabinGeo.translate(0, 1.9, -1);
  const mastGeo = new THREE.CylinderGeometry(0.07, 0.08, 1.8, 6); mastGeo.translate(0, 2.8, 0.2);
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.6 });
  const mastMat = new THREE.MeshStandardMaterial({ color: 0xd9d9d9, roughness: 0.4, metalness: 0.6 });

  const baseBuildingGeo = new THREE.BoxGeometry(1, 1, 1); baseBuildingGeo.translate(0, 0.5, 0);
  const detailedBuildingMats = {
    commercial: createDetailedBuildingMat('commercial', tempMainCameraPosUniform),
    residential: createDetailedBuildingMat('residential', tempMainCameraPosUniform),
    industrial: createDetailedBuildingMat('industrial', tempMainCameraPosUniform)
  };
  const baseBuildingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.3 });
  const roofCapGeo = new THREE.BoxGeometry(1.06, 0.18, 1.06); roofCapGeo.translate(0, 0.09, 0);
  const roofCapMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.1 });
  const podiumGeo = new THREE.BoxGeometry(1.02, 1, 1.02); podiumGeo.translate(0, 0.5, 0);
  const podiumMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0.12 });
  const spireGeo = new THREE.CylinderGeometry(0.06, 0.12, 1, 8); spireGeo.translate(0, 0.5, 0);
  const spireMat = new THREE.MeshStandardMaterial({ color: 0xc7c7c7, roughness: 0.3, metalness: 0.9 });
  const hvacGeo = new THREE.BoxGeometry(1, 1, 1); hvacGeo.translate(0, 0.5, 0);
  const hvacMat = new THREE.MeshStandardMaterial({ color: 0x909090, roughness: 0.7, metalness: 0.4 });
  const windmillTowerGeo = new THREE.CylinderGeometry(0.5, 0.7, 1, 10); windmillTowerGeo.translate(0, 0.5, 0);
  const windmillNacelleGeo = new THREE.BoxGeometry(1, 1, 1); windmillNacelleGeo.translate(0.5, 0, 0);
  const windmillHubGeo = new THREE.SphereGeometry(0.5, 10, 10);
  const windmillBladeGeo = new THREE.BoxGeometry(0.14, 1, 0.06); windmillBladeGeo.translate(0, 0.5, 0);
  const windmillTowerMat = new THREE.MeshStandardMaterial({ color: 0xe7ebef, roughness: 0.82, metalness: 0.08 });
  const windmillNacelleMat = new THREE.MeshStandardMaterial({ color: 0xdfe5ea, roughness: 0.78, metalness: 0.1 });
  const windmillHubMat = new THREE.MeshStandardMaterial({ color: 0xc8d0d7, roughness: 0.68, metalness: 0.14 });
  const windmillBladeMat = new THREE.MeshStandardMaterial({ color: 0xf7f9fb, roughness: 0.7, metalness: 0.04 });

  // Apply distance-based pop-in to all plain building materials
  [baseBuildingMat, roofCapMat, podiumMat, spireMat, hvacMat].forEach(mat => setupBuildingPopIn(mat, tempMainCameraPosUniform));


  const dummy = new THREE.Object3D();

  function getPooledInstancedMesh(geometry, material, count, { colorable = false } = {}) {
    const key = geometry.uuid + '_' + material.uuid;
    let pool = instancedMeshPools.get(key);
    if (!pool) { pool = []; instancedMeshPools.set(key, pool); }
    let bestIdx = -1;
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].instanceMatrix.count >= count) {
        if (bestIdx === -1 || pool[i].instanceMatrix.count < pool[bestIdx].instanceMatrix.count) bestIdx = i;
      }
    }
    if (bestIdx !== -1) {
      const mesh = pool.splice(bestIdx, 1)[0];
      mesh.count = count;
      return mesh;
    }
    const capacity = Math.max(count, 32);
    const isColorable = colorable || geometry === baseBuildingGeo || geometry === roofCapGeo || geometry === podiumGeo || geometry === spireGeo;
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    if (!mesh.instanceColor && isColorable) {
      const colorArray = new Float32Array(capacity * 3);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3);
    }
    mesh.count = count;
    return mesh;
  }

  function disposeChunkGroup(chunkGroup) {
    if (!chunkGroup) return;
    scene.remove(chunkGroup);
    chunkGroup.userData.windmillBladeMeshes = null;
    const lod = chunkGroup.userData.lod;
    if (lod !== undefined && chunkPools[lod]) {
      while (chunkGroup.children.length > 2) {
        const child = chunkGroup.children[chunkGroup.children.length - 1];
        chunkGroup.remove(child);
        if (child.isInstancedMesh) {
          child.count = 0;
          if (child.instanceMatrix) child.instanceMatrix.needsUpdate = false;
          if (child.instanceColor) child.instanceColor.needsUpdate = false;
          if (child.userData?.windmillBladeInstances) child.userData.windmillBladeInstances = null;
          child.userData = {};
          const key = child.geometry.uuid + '_' + child.material.uuid;
          let pool = instancedMeshPools.get(key);
          if (!pool) {
            pool = [];
            instancedMeshPools.set(key, pool);
          }
          pool.push(child);
        }
      }
      chunkPools[lod].push(chunkGroup);
    } else {
      chunkGroup.traverse((child) => { if (child.isMesh || child.isInstancedMesh) child.geometry.dispose(); });
    }
  }

  function generateChunkBase(cx, cz, lod = 0) {
    return genBase(cx, cz, lod, { LOD_LEVELS, chunkPools, terrainMaterial, terrainFarMaterial, waterMaterial, waterFarMaterial, Noise, scene });
  }

  function generateChunkProps(chunkGroup, cx, cz, lod = 0) {
    return genProps(chunkGroup, cx, cz, lod, {
      LOD_LEVELS, Noise, treeBillboardGeo, treeGroundGeo, treeTrunkGeo, treeTrunkMat, treeGroundMats, treeTypeConfigs, detailedBuildingMats, baseBuildingMat, baseBuildingGeo,
      roofCapGeo, roofCapMat, podiumGeo, podiumMat, spireGeo, spireMat, hvacGeo, hvacMat, getPooledInstancedMesh,
      windmillTowerGeo, windmillTowerMat, windmillNacelleGeo, windmillNacelleMat, windmillHubGeo, windmillHubMat, windmillBladeGeo, windmillBladeMat,
      hullGeo, hullMat, cabinGeo, cabinMat, mastGeo, mastMat, dummy, atmosphereUniforms,
      terrainMaterial, terrainFarMaterial, terrainDetailUniforms, timeUniform: waterTimeUniform
    });
  }

  function enqueueChunkBuild(cx, cz, lod, priority) {
    const key = `${cx}, ${cz}`;
    if (pendingChunkKeys.has(key)) return;
    pendingChunkKeys.add(key);
    pendingChunkBuilds.push({ cx, cz, lod, key, priority });
    pendingQueueDirty = true;
  }

  function getTargetLod(ringDistance, currentLod = null) {
    const lod = getLodForRingDistance(ringDistance, currentLod, lodSettings.terrain);
    return bootstrapMode ? (ringDistance === 0 ? lod : 3) : lod;
  }

  function removePendingPropJobs(key) {
    if (!pendingPropKeys.has(key)) return;
    for (let i = pendingPropBuilds.length - 1; i >= 0; i--) {
      if (pendingPropBuilds[i].key === key) pendingPropBuilds.splice(i, 1);
    }
    pendingPropKeys.delete(key);
    pendingPropQueueDirty = true;
  }

  function enqueuePropBuild(cx, cz, lod, priority, key, groupRef) {
    if (pendingPropKeys.has(key)) return;
    pendingPropKeys.add(key);
    pendingPropBuilds.push({ cx, cz, lod, priority, key, groupRef });
    pendingPropQueueDirty = true;
  }

  function processChunkBuildQueue(maxBuildsPerFrame = 2) {
    if (pendingChunkBuilds.length === 0) return;
    if (pendingQueueDirty) { pendingChunkBuilds.sort((a, b) => b.priority - a.priority); pendingQueueDirty = false; }
    let builds = 0;
    while (builds < maxBuildsPerFrame && pendingChunkBuilds.length > 0) {
      const job = pendingChunkBuilds.pop();
      pendingChunkKeys.delete(job.key);
      const existing = terrainChunks.get(job.key);

      if (existing && existing.lod === job.lod) {
        if (!existing.propsBuilt && existing.state !== 'building_props') {
          enqueuePropBuild(job.cx, job.cz, job.lod, job.priority, job.key, existing.group || existing.pendingGroup);
        }
        continue;
      }

      if (existing && existing.state === 'building_base' && existing.lod === job.lod) {
        continue;
      }

      let oldGroup = null;
      if (existing) {
        removePendingPropJobs(job.key);
        oldGroup = existing.group;
        if (existing.pendingGroup) disposeChunkGroup(existing.pendingGroup);
      }

      terrainChunks.set(job.key, { group: oldGroup, pendingGroup: null, lod: job.lod, propsBuilt: false, state: 'building_base' });
      builds++;

      generateChunkBase(job.cx, job.cz, job.lod).then(group => {
        const current = terrainChunks.get(job.key);
        if (current && current.lod === job.lod && current.state === 'building_base') {
          current.pendingGroup = group;
          current.state = 'base_done';
          enqueuePropBuild(job.cx, job.cz, job.lod, job.priority, job.key, group);
        } else {
          disposeChunkGroup(group);
        }
      }).catch(err => {
        console.error(`[terrain] Base build failed for ${job.key}:`, err);
        const current = terrainChunks.get(job.key);
        if (current && current.state === 'building_base') current.state = 'error';
      });
    }
  }

  function processPropBuildQueue(maxBuildsPerFrame = 1) {
    if (pendingPropBuilds.length === 0) return;
    if (pendingPropQueueDirty) { pendingPropBuilds.sort((a, b) => b.priority - a.priority); pendingPropQueueDirty = false; }
    let builds = 0;
    while (builds < maxBuildsPerFrame && pendingPropBuilds.length > 0) {
      const job = pendingPropBuilds.pop();
      pendingPropKeys.delete(job.key);
      const state = terrainChunks.get(job.key);

      const targetGroup = state ? (state.pendingGroup || state.group) : null;
      if (!state || targetGroup !== job.groupRef || state.lod !== job.lod || state.propsBuilt || state.state === 'building_props') {
        continue;
      }

      state.state = 'building_props';
      builds++;

      generateChunkProps(targetGroup, job.cx, job.cz, job.lod).then(() => {
        const current = terrainChunks.get(job.key);
        if (current && (current.pendingGroup === job.groupRef || current.group === job.groupRef) && current.lod === job.lod && current.state === 'building_props') {
          if (current.pendingGroup) {
            if (current.group) disposeChunkGroup(current.group);
            current.group = current.pendingGroup;
            scene.add(current.group);
            current.pendingGroup = null;
          } else if (current.group && !current.group.parent) {
            scene.add(current.group);
          }
          current.propsBuilt = true;
          current.state = 'done';
        }
      }).catch(err => {
        console.error(`[terrain] Prop build failed for ${job.key}:`, err);
        const current = terrainChunks.get(job.key);
        if (current && current.state === 'building_props') {
          if (current.pendingGroup) {
            if (current.group) disposeChunkGroup(current.group);
            current.group = current.pendingGroup;
            scene.add(current.group);
            current.pendingGroup = null;
          }
          current.state = 'done';
        }
      });
    }
  }

  let lastProcessedChunkX = -999999;
  let lastProcessedChunkZ = -999999;
  let lastReady = false;

  function updateTerrain() {
    const px = Math.floor(PHYSICS.position.x / CHUNK_SIZE);
    const pz = Math.floor(PHYSICS.position.z / CHUNK_SIZE);

    lastProcessedChunkX = px;
    lastProcessedChunkZ = pz;

    const renderDistance = bootstrapMode ? 0 : lodSettings.terrain.renderDistance;

    const activeChunks = new Map();

    for (let dx = -renderDistance; dx <= renderDistance; dx++) {
      for (let dz = -renderDistance; dz <= renderDistance; dz++) {
        const cx = px + dx; const cz = pz + dz; const key = `${cx}, ${cz}`;
        const ringDistance = Math.max(Math.abs(dx), Math.abs(dz));
        const currentLod = terrainChunks.has(key) ? terrainChunks.get(key).lod : null;
        const lod = getTargetLod(ringDistance, currentLod);
        activeChunks.set(key, lod);
        if (!terrainChunks.has(key)) enqueueChunkBuild(cx, cz, lod, ringDistance);
        else { const chunkState = terrainChunks.get(key); if (chunkState.lod !== lod) enqueueChunkBuild(cx, cz, lod, ringDistance + 0.25); }
      }
    }

    for (let i = pendingChunkBuilds.length - 1; i >= 0; i--) {
      const job = pendingChunkBuilds[i];
      if (!activeChunks.has(job.key)) { pendingChunkKeys.delete(job.key); pendingChunkBuilds.splice(i, 1); pendingQueueDirty = true; }
    }
    for (let i = pendingPropBuilds.length - 1; i >= 0; i--) {
      const job = pendingPropBuilds[i];
      if (!activeChunks.has(job.key)) { pendingPropKeys.delete(job.key); pendingPropBuilds.splice(i, 1); pendingPropQueueDirty = true; }
    }
    for (const [key, chunkState] of terrainChunks.entries()) {
      if (!activeChunks.has(key)) {
        removePendingPropJobs(key);
        if (chunkState.group) disposeChunkGroup(chunkState.group);
        if (chunkState.pendingGroup) disposeChunkGroup(chunkState.pendingGroup);
        terrainChunks.delete(key);
      }
    }
    const buildBudgetBase = pendingChunkBuilds.length > 160 ? 4 : pendingChunkBuilds.length > 80 ? 3 : 2;
    const propBuildBudgetBase = pendingPropBuilds.length > 160 ? 2 : 1;
    const buildBudget = buildBudgetBase * (_isFastLoad ? 40 : bootstrapMode ? 2 : 1);
    const propBuildBudget = propBuildBudgetBase * (_isFastLoad ? 80 : bootstrapMode ? 2 : 1);
    processChunkBuildQueue(buildBudget);
    processPropBuildQueue(propBuildBudget);

    if (pendingChunkKeys.size > 0 || pendingPropKeys.size > 0) {
      debugLog(`[terrain] Pending chunks: ${pendingChunkKeys.size}, Pending props: ${pendingPropKeys.size}`);
    } else if (terrainChunks.size > 0) {
      const ready = isReady();
      if (ready && !lastReady) {
        debugLog('[terrain] All chunks and props fully loaded.');
      }
      lastReady = ready;
    }
  }

  function updateTerrainAtmosphere(camera, weatherColor = null) {
    terrainDetailUniforms.uTerrainAtmosStrength.value = 0.25;
    if (camera) {
      atmosphereCameraPos.copy(camera.position);
      tempMainCameraPosUniform.value.copy(camera.position);
      if (windowRef?.fsimWorld && roadMarkingOverlay.update(camera.position.x, camera.position.z, windowRef.fsimWorld)) {
        terrainDetailUniforms.uRoadMarkingCenter.value.set(roadMarkingOverlay.center.x, roadMarkingOverlay.center.z);
      }
    }
    const windmillTime = performance.now() * 0.001;
    for (const state of terrainChunks.values()) {
      if (state.group) animateWindmillProps(state.group, windmillTime, dummy);
      if (state.pendingGroup) animateWindmillProps(state.pendingGroup, windmillTime, dummy);
    }
    if (weatherColor) atmosphereColor.copy(weatherColor);
    else {
      tmpColorA.setRGB(0.62, 0.66, 0.72); tmpColorB.setRGB(0.78, 0.81, 0.86);
      atmosphereColor.copy(tmpColorA.lerp(tmpColorB, 0.4));
    }
    if (_fogDisabled) {
      atmosphereUniforms.uAtmosNear.value = 1e6;
      atmosphereUniforms.uAtmosFar.value = 1e7;
    } else {
      atmosphereUniforms.uAtmosNear.value = 15000.0;
      atmosphereUniforms.uAtmosFar.value = 90000.0;
    }
  }

  const getTerrainHeightWithNoise = (x, z, octaves = 6) => getTerrainHeight(x, z, Noise, octaves);

  function createTerrainWarmupGeometry() {
    const terrainGeo = new THREE.PlaneGeometry(256, 256, 1, 1);
    terrainGeo.rotateX(-Math.PI / 2);
    terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(terrainGeo.attributes.position.count * 3).fill(1), 3));
    terrainGeo.setAttribute('surfaceWeights', new THREE.Float32BufferAttribute(new Float32Array([
      0.05, 0.85, 0.10, 0.00,
      0.00, 0.75, 0.25, 0.00,
      0.00, 0.30, 0.70, 0.00,
      0.00, 0.05, 0.15, 0.80
    ]), 4));
    terrainGeo.setAttribute('surfaceOverrides', new THREE.Float32BufferAttribute(new Float32Array(terrainGeo.attributes.position.count * 4), 4));
    return terrainGeo;
  }

  function createWaterWarmupGeometry() {
    const waterGeo = new THREE.PlaneGeometry(256, 256, 1, 1);
    waterGeo.rotateX(-Math.PI / 2);
    waterGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(waterGeo.attributes.position.count * 3).fill(0.7), 3));
    return waterGeo;
  }

  function createTreeWarmupGeometry() {
    const treeGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
    treeGeo.translate(0, 0.5, 0);
    return treeGeo;
  }

  function createBuildingWarmupGeometry() {
    const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
    buildingGeo.translate(0, 0.5, 0);
    return buildingGeo;
  }

  function makeWarmupInstancedMesh(geometry, material, position, tint = null) {
    const warmupDummy = new THREE.Object3D();
    const mesh = new THREE.InstancedMesh(geometry, material, 1);
    warmupDummy.position.copy(position);
    warmupDummy.scale.set(18, 18, 18);
    warmupDummy.rotation.set(0, 0, 0);
    warmupDummy.updateMatrix();
    mesh.setMatrixAt(0, warmupDummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
    if (tint) {
      mesh.setColorAt(0, tint);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    mesh.updateMatrixWorld(true);
    return mesh;
  }

  function getShaderValidationVariants() {
    return [
      {
        id: 'terrain-near-surface',
        metadata: { system: 'terrain', variant: 'terrain-near' },
        build(camera) {
          updateTerrainAtmosphere(camera);
          const terrainGeo = createTerrainWarmupGeometry();
          const mesh = new THREE.Mesh(terrainGeo, terrainMaterial);
          mesh.position.set(-320, 0, 0);
          mesh.updateMatrixWorld(true);
          return {
            objects: [mesh],
            dispose() {
              terrainGeo.dispose();
            }
          };
        }
      },
      {
        id: 'terrain-far-surface',
        metadata: { system: 'terrain', variant: 'terrain-far' },
        build(camera) {
          updateTerrainAtmosphere(camera);
          const terrainGeo = createTerrainWarmupGeometry();
          const mesh = new THREE.Mesh(terrainGeo, terrainFarMaterial);
          mesh.position.set(0, 0, 0);
          mesh.updateMatrixWorld(true);
          return {
            objects: [mesh],
            dispose() {
              terrainGeo.dispose();
            }
          };
        }
      },
      {
        id: 'water-near-surface',
        metadata: { system: 'terrain', variant: 'water-near' },
        build(camera) {
          updateTerrainAtmosphere(camera);
          const waterGeo = createWaterWarmupGeometry();
          const mesh = new THREE.Mesh(waterGeo, waterMaterial);
          mesh.position.set(320, 0, 0);
          mesh.updateMatrixWorld(true);
          return {
            objects: [mesh],
            dispose() {
              waterGeo.dispose();
            }
          };
        }
      },
      {
        id: 'water-far-surface',
        metadata: { system: 'terrain', variant: 'water-far' },
        build(camera) {
          updateTerrainAtmosphere(camera);
          const waterGeo = createWaterWarmupGeometry();
          const mesh = new THREE.Mesh(waterGeo, waterFarMaterial);
          mesh.position.set(640, 0, 0);
          mesh.updateMatrixWorld(true);
          return {
            objects: [mesh],
            dispose() {
              waterGeo.dispose();
            }
          };
        }
      },
      {
        id: 'tree-billboard',
        metadata: { system: 'terrain', variant: 'tree-billboard' },
        build() {
          const treeGeo = createTreeWarmupGeometry();
          const mesh = makeWarmupInstancedMesh(treeGeo, treeCanopyMats.broadleaf, new THREE.Vector3(960, 0, 0));
          return {
            objects: [mesh],
            dispose() {
              treeGeo.dispose();
            }
          };
        }
      },
      {
        id: 'tree-depth',
        metadata: { system: 'terrain', variant: 'tree-depth' },
        build() {
          const treeGeo = createTreeWarmupGeometry();
          const mesh = makeWarmupInstancedMesh(treeGeo, treeDepthMats.broadleaf, new THREE.Vector3(1120, 0, 0));
          return {
            objects: [mesh],
            dispose() {
              treeGeo.dispose();
            }
          };
        }
      },
      {
        id: 'building-commercial',
        metadata: { system: 'terrain', variant: 'building-commercial' },
        build() {
          const buildingGeo = createBuildingWarmupGeometry();
          const mesh = makeWarmupInstancedMesh(buildingGeo, detailedBuildingMats.commercial, new THREE.Vector3(1280, 0, 0));
          return {
            objects: [mesh],
            dispose() {
              buildingGeo.dispose();
            }
          };
        }
      },
      {
        id: 'building-residential',
        metadata: { system: 'terrain', variant: 'building-residential' },
        build() {
          const buildingGeo = createBuildingWarmupGeometry();
          const mesh = makeWarmupInstancedMesh(buildingGeo, detailedBuildingMats.residential, new THREE.Vector3(1440, 0, 0));
          return {
            objects: [mesh],
            dispose() {
              buildingGeo.dispose();
            }
          };
        }
      },
      {
        id: 'building-industrial',
        metadata: { system: 'terrain', variant: 'building-industrial' },
        build() {
          const buildingGeo = createBuildingWarmupGeometry();
          const mesh = makeWarmupInstancedMesh(buildingGeo, detailedBuildingMats.industrial, new THREE.Vector3(1600, 0, 0));
          return {
            objects: [mesh],
            dispose() {
              buildingGeo.dispose();
            }
          };
        }
      },
      {
        id: 'building-pop-in-base',
        metadata: { system: 'terrain', variant: 'building-pop-in-base' },
        build() {
          const buildingGeo = createBuildingWarmupGeometry();
          const mesh = makeWarmupInstancedMesh(buildingGeo, baseBuildingMat, new THREE.Vector3(1760, 0, 0));
          return {
            objects: [mesh],
            dispose() {
              buildingGeo.dispose();
            }
          };
        }
      }
    ];
  }

  function completeBootstrap() {
    if (!bootstrapMode) return;
    bootstrapMode = false;
    debugLog('[terrain] Bootstrap LOD complete; refining outer rings.');
  }

  const isReady = () => {
    if (terrainChunks.size === 0) return false;

    const px = Math.floor(PHYSICS.position.x / CHUNK_SIZE);
    const pz = Math.floor(PHYSICS.position.z / CHUNK_SIZE);
    if (px !== lastProcessedChunkX || pz !== lastProcessedChunkZ) return false;

    // Queues must be empty
    if (pendingChunkKeys.size > 0 || pendingPropKeys.size > 0) return false;

    let blocking = [];
    for (const [key, state] of terrainChunks.entries()) {
      if (state.state !== 'done' || !state.group) {
        blocking.push(`${key}:${state.state}`);
      }
    }

    if (blocking.length > 0 && window._isReadyLogCounter % 120 === 0) {
      debugLog(`[isReady] size=${terrainChunks.size} blocking=[${blocking.slice(0, 5)}]`);
    }
    window._isReadyLogCounter = (window._isReadyLogCounter || 0) + 1;

    return blocking.length === 0;
  };

  async function reloadCity(cityId = null) {
    debugLog(`[terrain] Hot-swapping district data: ${cityId || 'all'}`);
    clearDistrictCache(cityId);

    await fetchDistrictIndex();

    const ctx = {
      LOD_LEVELS, Noise, treeBillboardGeo, treeGroundGeo, treeTrunkGeo, treeTrunkMat, treeGroundMats, treeTypeConfigs, detailedBuildingMats, baseBuildingMat, baseBuildingGeo,
      roofCapGeo, roofCapMat, podiumGeo, podiumMat, spireGeo, spireMat, hvacGeo, hvacMat, getPooledInstancedMesh,
      windmillTowerGeo, windmillTowerMat, windmillNacelleGeo, windmillNacelleMat, windmillHubGeo, windmillHubMat, windmillBladeGeo, windmillBladeMat,
      hullGeo, hullMat, cabinGeo, cabinMat, mastGeo, mastMat, dummy, atmosphereUniforms,
      terrainMaterial, terrainFarMaterial, terrainDetailUniforms, timeUniform: waterTimeUniform
    };

    for (const [key, state] of terrainChunks.entries()) {
      if (!state.group) continue;
      const [cx, cz] = key.split(',').map(Number);

      const overlapping = await getOverlappingDistricts(cx, cz);
      const matching = overlapping.filter(district => !cityId || district.id === cityId);
      if (matching.length > 0) {
        // Clear spawned prop meshes (keep terrain/water at index 0,1)
        state.group.userData.windmillBladeMeshes = null;
        while (state.group.children.length > 2) {
          const child = state.group.children[state.group.children.length - 1];
          state.group.remove(child);
          if (child.isInstancedMesh) {
            // In a real production app we'd pool these, but for hot-reload simplicity 
            // we just let them be GC'd or handled by disposeChunkGroup if we were disposing the whole thing.
            // Actually, terrain.js uses a pool. Let's just remove them.
          }
        }

        const { loadDistrictChunk } = await import('./terrain/CityChunkLoader.js');
        const loadedDistricts = await Promise.all(matching.map(district => loadDistrictChunk(district.id)));
        loadedDistricts.forEach(loadedData => {
          if (!loadedData) return;
          spawnCityBuildingsForChunk(state.group, cx, cz, loadedData, state.lod, ctx, CHUNK_SIZE);
          spawnDistrictPropsForChunk(state.group, cx, cz, loadedData, state.lod, ctx, CHUNK_SIZE);
        });
      }
    }
  }

  return {
    waterMaterial,
    getTerrainHeight: getTerrainHeightWithNoise,
    updateTerrain,
    updateTerrainAtmosphere,
    isReady,
    reloadCity,
    getShaderValidationVariants,
    completeBootstrap
  };
}
