import * as THREE from 'three';
import { createWaterNormalMap, createTreeBillboardTexture, createPackedTerrainDetailTexture } from './terrain/TerrainTextures.js';
import {
  applyDistanceAtmosphereToMaterial,
  makeTreeBillboardMaterial,
  createDetailedBuildingMat,
  setupTerrainMaterial
} from './terrain/TerrainMaterials.js';
import {
  getTerrainHeight,
  getLodForRingDistance
} from './terrain/TerrainUtils.js';
import {
  generateChunkBase as genBase,
  generateChunkProps as genProps,
  CHUNK_SIZE
} from './terrain/TerrainGeneration.js';

export function createTerrainSystem({ scene, Noise, PHYSICS }) {
  const waterMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    roughness: 0.62,
    metalness: 0.05,
    envMapIntensity: 0.22,
    normalMap: createWaterNormalMap(Noise),
    normalScale: new THREE.Vector2(0.36, 0.36)
  });

  const atmosphereCameraPos = new THREE.Vector3();
  const atmosphereColor = new THREE.Color(0x90939f);
  const atmosphereUniforms = {
    uAtmosCameraPos: { value: atmosphereCameraPos },
    uAtmosColor: { value: atmosphereColor },
    uAtmosNear: { value: 9000.0 },
    uAtmosFar: { value: 68000.0 }
  };
  const tmpColorA = new THREE.Color();
  const tmpColorB = new THREE.Color();

  applyDistanceAtmosphereToMaterial(waterMaterial, 'water', atmosphereUniforms, 0.74, 0.08);

  const LOD_LEVELS = [
    { terrainRes: 224, waterRes: 72, propDensity: 1.0, enableBuildings: true, enableTrees: true, enableBoats: true },
    { terrainRes: 64, waterRes: 40, propDensity: 0.48, enableBuildings: true, enableTrees: true, enableBoats: false },
    { terrainRes: 28, waterRes: 20, propDensity: 0.16, enableBuildings: false, enableTrees: true, enableBoats: false },
    { terrainRes: 12, waterRes: 10, propDensity: 0.0, enableBuildings: false, enableTrees: false, enableBoats: false }
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
    uTerrainAtmosStrength: { value: 0.44 },
    uTerrainFoliageNearStart: { value: 120.0 },
    uTerrainFoliageNearEnd: { value: 1200.0 },
    uTerrainFoliageStrength: { value: 0.38 }
  };

  setupTerrainMaterial(terrainMaterial, terrainDetailUniforms, atmosphereUniforms, false);
  setupTerrainMaterial(terrainFarMaterial, terrainDetailUniforms, atmosphereUniforms, true);

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
  const treeTypeConfigs = {
    conifer: { mat: treeBillboardMats.conifer, hRange: [14, 24], wScale: 0.45 },
    broadleaf: { mat: treeBillboardMats.broadleaf, hRange: [11, 19], wScale: 0.6 },
    poplar: { mat: treeBillboardMats.poplar, hRange: [13, 23], wScale: 0.42 },
    dry: { mat: treeBillboardMats.dry, hRange: [8, 15], wScale: 0.52 }
  };

  const hullGeo = new THREE.BoxGeometry(2.5, 1.2, 8); hullGeo.translate(0, 0.6, 0);
  const cabinGeo = new THREE.BoxGeometry(2.0, 1.5, 3); cabinGeo.translate(0, 1.9, -1);
  const mastGeo = new THREE.CylinderGeometry(0.07, 0.08, 1.8, 6); mastGeo.translate(0, 2.8, 0.2);
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.6 });
  const mastMat = new THREE.MeshStandardMaterial({ color: 0xd9d9d9, roughness: 0.4, metalness: 0.6 });

  const baseBuildingGeo = new THREE.BoxGeometry(1, 1, 1); baseBuildingGeo.translate(0, 0.5, 0);
  const detailedBuildingMats = {
    commercial: createDetailedBuildingMat('commercial'),
    residential: createDetailedBuildingMat('residential'),
    industrial: createDetailedBuildingMat('industrial')
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
    return genBase(cx, cz, lod, { LOD_LEVELS, chunkPools, terrainMaterial, terrainFarMaterial, waterMaterial, Noise, scene });
  }

  function generateChunkProps(chunkGroup, cx, cz, lod = 0) {
    genProps(chunkGroup, cx, cz, lod, {
      LOD_LEVELS, Noise, treeBillboardGeo, treeTypeConfigs, detailedBuildingMats, baseBuildingMat, baseBuildingGeo,
      roofCapGeo, roofCapMat, podiumGeo, podiumMat, spireGeo, spireMat, hvacGeo, hvacMat, getPooledInstancedMesh,
      hullGeo, hullMat, cabinGeo, cabinMat, mastGeo, mastMat, dummy
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
        if (!existing.propsBuilt) enqueuePropBuild(job.cx, job.cz, job.lod, job.priority, job.key, existing.group);
        builds++; continue;
      }
      if (existing) { removePendingPropJobs(job.key); disposeChunkGroup(existing.group); terrainChunks.delete(job.key); }
      const group = generateChunkBase(job.cx, job.cz, job.lod);
      terrainChunks.set(job.key, { group, lod: job.lod, propsBuilt: false });
      enqueuePropBuild(job.cx, job.cz, job.lod, job.priority, job.key, group);
      builds++;
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
      if (!state || state.group !== job.groupRef || state.lod !== job.lod || state.propsBuilt) { builds++; continue; }
      generateChunkProps(state.group, job.cx, job.cz, job.lod);
      state.propsBuilt = true; builds++;
    }
  }

  function updateTerrain() {
    const px = Math.floor(PHYSICS.position.x / CHUNK_SIZE);
    const pz = Math.floor(PHYSICS.position.z / CHUNK_SIZE);
    const renderDistance = 8;
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
      if (!activeChunks.has(key)) { removePendingPropJobs(key); disposeChunkGroup(chunkState.group); terrainChunks.delete(key); }
    }
    const buildBudget = pendingChunkBuilds.length > 160 ? 4 : pendingChunkBuilds.length > 80 ? 3 : 2;
    const propBuildBudget = pendingPropBuilds.length > 160 ? 2 : 1;
    processChunkBuildQueue(buildBudget);
    processPropBuildQueue(propBuildBudget);
  }

  function updateTerrainAtmosphere(camera, weatherColor = null) {
    if (camera) atmosphereCameraPos.copy(camera.position);
    if (weatherColor) atmosphereColor.copy(weatherColor);
    else {
      tmpColorA.setRGB(0.62, 0.66, 0.72); tmpColorB.setRGB(0.78, 0.81, 0.86);
      atmosphereColor.copy(tmpColorA.lerp(tmpColorB, 0.4));
    }
    atmosphereUniforms.uAtmosNear.value = 7000.0;
    atmosphereUniforms.uAtmosFar.value = 62000.0;
  }

  const getTerrainHeightWithNoise = (x, z) => getTerrainHeight(x, z, Noise);
  return { waterMaterial, getTerrainHeight: getTerrainHeightWithNoise, updateTerrain, updateTerrainAtmosphere };
}
