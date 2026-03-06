import * as THREE from 'three';
import { createWaterNormalMap, createTreeBillboardTexture, createPackedTerrainDetailTexture } from './terrain/TerrainTextures.js';
import {
  applyDistanceAtmosphereToMaterial,
  applyWaterDualScrollToMaterial,
  makeTreeBillboardMaterial,
  makeTreeDepthMaterial,
  createDetailedBuildingMat,
  setupTerrainMaterial,
  setupBuildingPopIn
} from './terrain/TerrainMaterials.js';

const tempMainCameraPosUniform = { value: new THREE.Vector3() };
import {
  getTerrainHeight,
  getLodForRingDistance
} from './terrain/TerrainUtils.js';
import {
  fetchCityIndex,
  clearCityCache
} from './terrain/CityChunkLoader.js';
import {
  generateChunkBase as genBase,
  generateChunkProps as genProps,
  getOverlappingCity,
  spawnCityBuildingsForChunk,
  CHUNK_SIZE
} from './terrain/TerrainGeneration.js';

export function createTerrainSystem({ scene, Noise, PHYSICS }) {
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

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('fog') === '0') {
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

  applyDistanceAtmosphereToMaterial(waterMaterial, 'water', atmosphereUniforms, 0.74, 0.08);
  applyWaterDualScrollToMaterial(waterMaterial, waterTimeUniform);
  applyDistanceAtmosphereToMaterial(waterFarMaterial, 'water-far', atmosphereUniforms, 0.74, 0.08);

  const LOD_LEVELS = [
    { terrainRes: 224, waterRes: 72, propDensity: 1.0, enableBuildings: true, enableTrees: true, enableBoats: true },
    { terrainRes: 32, waterRes: 16, propDensity: 0.7, enableBuildings: true, enableTrees: true, enableBoats: false },
    { terrainRes: 12, waterRes: 4, propDensity: 0.2, enableBuildings: true, enableTrees: true, enableBoats: false },
    { terrainRes: 2, waterRes: 2, propDensity: 0.0, enableBuildings: false, enableTrees: false, enableBoats: false }
  ];

  const terrainChunks = new Map();
  const pendingChunkBuilds = [];
  const pendingChunkKeys = new Set();
  let pendingQueueDirty = false;
  const pendingPropBuilds = [];
  const pendingPropKeys = new Set();
  let pendingPropQueueDirty = false;
  const chunkPools = [[], [], [], []];
  const instancedMeshPools = new Map();

  const terrainDetailTex = createPackedTerrainDetailTexture();
  const terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02, flatShading: false });
  const terrainFarMaterial = terrainMaterial.clone();
  terrainFarMaterial.roughness = 1.0;
  terrainFarMaterial.metalness = 0.0;

  const terrainDetailUniforms = {
    uTerrainDetailTex: { value: terrainDetailTex },
    uTerrainDetailScale: { value: 0.16 },
    uTerrainDetailStrength: { value: 1.1 },
    uTerrainSlopeStart: { value: 0.26 },
    uTerrainSlopeEnd: { value: 0.62 },
    uTerrainRockHeightStart: { value: 220.0 },
    uTerrainRockHeightEnd: { value: 560.0 },
    uTerrainAtmosStrength: { value: 0.25 },
    uTerrainFoliageNearStart: { value: 120.0 },
    uTerrainFoliageNearEnd: { value: 1200.0 },
    uTerrainFoliageStrength: { value: 0.38 }
  };

  setupTerrainMaterial(terrainMaterial, terrainDetailUniforms, atmosphereUniforms, waterTimeUniform, false);
  setupTerrainMaterial(terrainFarMaterial, terrainDetailUniforms, atmosphereUniforms, waterTimeUniform, true);

  const treeBillboardGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
  treeBillboardGeo.translate(0, 0.5, 0);
  const treeTextures = {
    conifer: createTreeBillboardTexture('conifer'),
    broadleaf: createTreeBillboardTexture('broadleaf'),
    poplar: createTreeBillboardTexture('poplar'),
    dry: createTreeBillboardTexture('dry')
  };
  const treeBillboardMats = {
    conifer: makeTreeBillboardMaterial(treeTextures.conifer, 0x9eb38a),
    broadleaf: makeTreeBillboardMaterial(treeTextures.broadleaf, 0xa3b88e),
    poplar: makeTreeBillboardMaterial(treeTextures.poplar, 0xafc093),
    dry: makeTreeBillboardMaterial(treeTextures.dry, 0xc6b696)
  };
  const treeDepthMats = {
    conifer: makeTreeDepthMaterial(treeTextures.conifer, tempMainCameraPosUniform),
    broadleaf: makeTreeDepthMaterial(treeTextures.broadleaf, tempMainCameraPosUniform),
    poplar: makeTreeDepthMaterial(treeTextures.poplar, tempMainCameraPosUniform),
    dry: makeTreeDepthMaterial(treeTextures.dry, tempMainCameraPosUniform)
  };
  const treeTypeConfigs = {
    conifer: { mat: treeBillboardMats.conifer, depthMat: treeDepthMats.conifer, hRange: [14, 24], wScale: 0.45 },
    broadleaf: { mat: treeBillboardMats.broadleaf, depthMat: treeDepthMats.broadleaf, hRange: [11, 19], wScale: 0.6 },
    poplar: { mat: treeBillboardMats.poplar, depthMat: treeDepthMats.poplar, hRange: [13, 23], wScale: 0.42 },
    dry: { mat: treeBillboardMats.dry, depthMat: treeDepthMats.dry, hRange: [8, 15], wScale: 0.52 }
  };

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

  // Apply distance-based pop-in to all plain building materials
  [baseBuildingMat, roofCapMat, podiumMat, spireMat, hvacMat].forEach(mat => setupBuildingPopIn(mat, tempMainCameraPosUniform));


  const dummy = new THREE.Object3D();

  function getPooledInstancedMesh(geometry, material, count) {
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
    const isColorable = (geometry === baseBuildingGeo || geometry === roofCapGeo || geometry === podiumGeo || geometry === spireGeo);
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
    const lod = chunkGroup.userData.lod;
    if (lod !== undefined && chunkPools[lod]) {
      while (chunkGroup.children.length > 2) {
        const child = chunkGroup.children.pop();
        if (child.isInstancedMesh) {
          if (child.instanceMatrix) child.instanceMatrix.needsUpdate = false;
          if (child.instanceColor) child.instanceColor.needsUpdate = false;
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
      LOD_LEVELS, Noise, treeBillboardGeo, treeTypeConfigs, detailedBuildingMats, baseBuildingMat, baseBuildingGeo,
      roofCapGeo, roofCapMat, podiumGeo, podiumMat, spireGeo, spireMat, hvacGeo, hvacMat, getPooledInstancedMesh,
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

    const urlParams = new URLSearchParams(window.location.search);
    const isFastLoad = urlParams.get('fastload') === '1';
    const urlRenderDist = urlParams.get('renderDist');
    const parsedRenderDist = urlRenderDist ? parseInt(urlRenderDist, 10) : null;
    const renderDistance = parsedRenderDist !== null ? parsedRenderDist : (isFastLoad ? 4 : 8);

    const activeChunks = new Map();

    for (let dx = -renderDistance; dx <= renderDistance; dx++) {
      for (let dz = -renderDistance; dz <= renderDistance; dz++) {
        const cx = px + dx; const cz = pz + dz; const key = `${cx}, ${cz}`;
        const ringDistance = Math.max(Math.abs(dx), Math.abs(dz));
        const currentLod = terrainChunks.has(key) ? terrainChunks.get(key).lod : null;
        const lod = getLodForRingDistance(ringDistance, currentLod);
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
    // isFastLoad already parsed above
    const buildBudget = (pendingChunkBuilds.length > 160 ? 4 : pendingChunkBuilds.length > 80 ? 3 : 2) * (isFastLoad ? 40 : 1);
    const propBuildBudget = (pendingPropBuilds.length > 160 ? 2 : 1) * (isFastLoad ? 80 : 1);
    processChunkBuildQueue(buildBudget);
    processPropBuildQueue(propBuildBudget);

    if (pendingChunkKeys.size > 0 || pendingPropKeys.size > 0) {
      console.log(`[terrain] Pending chunks: ${pendingChunkKeys.size}, Pending props: ${pendingPropKeys.size}`);
    } else if (terrainChunks.size > 0) {
      const ready = isReady();
      if (ready && !lastReady) {
        console.log('[terrain] All chunks and props fully loaded.');
      }
      lastReady = ready;
    }
  }

  function updateTerrainAtmosphere(camera, weatherColor = null) {
    if (camera) {
      atmosphereCameraPos.copy(camera.position);
      tempMainCameraPosUniform.value.copy(camera.position);
    }
    if (weatherColor) atmosphereColor.copy(weatherColor);
    else {
      tmpColorA.setRGB(0.62, 0.66, 0.72); tmpColorB.setRGB(0.78, 0.81, 0.86);
      atmosphereColor.copy(tmpColorA.lerp(tmpColorB, 0.4));
    }
    if (new URLSearchParams(window.location.search).get('fog') === '0') {
      atmosphereUniforms.uAtmosNear.value = 1e6;
      atmosphereUniforms.uAtmosFar.value = 1e7;
    } else {
      atmosphereUniforms.uAtmosNear.value = 15000.0;
      atmosphereUniforms.uAtmosFar.value = 90000.0;
    }
  }

  const getTerrainHeightWithNoise = (x, z, octaves = 6) => getTerrainHeight(x, z, Noise, octaves);

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
      console.log(`[isReady] size=${terrainChunks.size} blocking=[${blocking.slice(0, 5)}]`);
    }
    window._isReadyLogCounter = (window._isReadyLogCounter || 0) + 1;

    return blocking.length === 0;
  };

  async function reloadCity(cityId = null) {
    console.log(`[terrain] Hot-swapping city: ${cityId || 'all'}`);
    clearCityCache(cityId);

    const cityIndex = await fetchCityIndex();
    const cityToReload = cityId ? cityIndex.find(c => c.id === cityId) : null;

    const ctx = {
      LOD_LEVELS, Noise, treeBillboardGeo, treeTypeConfigs, detailedBuildingMats, baseBuildingMat, baseBuildingGeo,
      roofCapGeo, roofCapMat, podiumGeo, podiumMat, spireGeo, spireMat, hvacGeo, hvacMat, getPooledInstancedMesh,
      hullGeo, hullMat, cabinGeo, cabinMat, mastGeo, mastMat, dummy, atmosphereUniforms,
      terrainMaterial, terrainFarMaterial, terrainDetailUniforms, timeUniform: waterTimeUniform
    };

    for (const [key, state] of terrainChunks.entries()) {
      if (!state.group) continue;
      const [cx, cz] = key.split(',').map(Number);

      const overlapping = await getOverlappingCity(cx, cz);
      if (overlapping && (!cityId || overlapping.id === cityId)) {
        // Clear building/road meshes (keep terrain/water at index 0,1)
        while (state.group.children.length > 2) {
          const child = state.group.children.pop();
          if (child.isInstancedMesh) {
            // In a real production app we'd pool these, but for hot-reload simplicity 
            // we just let them be GC'd or handled by disposeChunkGroup if we were disposing the whole thing.
            // Actually, terrain.js uses a pool. Let's just remove them.
          }
        }
        state.hasCityMaterial = false;

        // Re-fetch data and re-spawn
        const cityData = await (cityId ? overlapping.id === cityId ? overlapping.id : null : overlapping.id); // reload logic
        // Just call genProps again or a subset?
        // Let's call spawnCityBuildingsForChunk directly as it's cleaner for hot-swap
        const loadedData = await (cityId || overlapping.id ? (overlapping.id ? import('./terrain/CityChunkLoader.js').then(m => m.loadCityChunk(overlapping.id)) : null) : null);

        if (loadedData) {
          spawnCityBuildingsForChunk(state.group, cx, cz, loadedData, state.lod, ctx);

          // Refresh road mask if needed
          if (loadedData.roadMaskTexture) {
            const cityTerrainMat = state.lod === 0 ? terrainMaterial.clone() : terrainFarMaterial.clone();
            loadedData.center = [overlapping.cx, overlapping.cz];
            loadedData.maskRadius = overlapping.radius * 1.05;
            setupTerrainMaterial(cityTerrainMat, terrainDetailUniforms, atmosphereUniforms, waterTimeUniform, state.lod !== 0, loadedData);
            state.group.children[0].material = cityTerrainMat;
            state.hasCityMaterial = true;
          }
        }
      }
    }
  }

  return { waterMaterial, getTerrainHeight: getTerrainHeightWithNoise, updateTerrain, updateTerrainAtmosphere, isReady, reloadCity };
}
