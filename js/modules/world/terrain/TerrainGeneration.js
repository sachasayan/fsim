import * as THREE from 'three';
import { fetchDistrictIndex, loadDistrictChunk } from './CityChunkLoader.js';
import { QuadtreeMapSampler, hash2Local } from './TerrainUtils.js';
import { normalizeMapData } from '../MapDataUtils.js';
import { spawnCityBuildingsForChunk, classConfigs } from './BuildingSpawner.js';
import { initWorkerManager } from './TerrainWorkerManager.js';
import { debugLog } from '../../core/logging.js';

export const CHUNK_SIZE = 4000;
export const TREE_DENSITY_MULTIPLIER = 8.0;

// Lazily fetched district index (array of {id, cx, cz, radius})
let _districtIndex = null;
let _staticWorldBuffer = null;
let _workerManager = null;

export function clearStaticWorldCache() {
    _staticWorldBuffer = null;
    _districtIndex = null;
}

async function getDistrictIndex() {
    if (!_districtIndex) _districtIndex = await fetchDistrictIndex();
    return _districtIndex;
}

export async function loadStaticWorld() {
    try {
        const resp = await fetch('/world/world.bin');
        if (!resp.ok) return false;
        _staticWorldBuffer = await resp.arrayBuffer();
        const buffer = _staticWorldBuffer;

        const sampler = new QuadtreeMapSampler(buffer);
        const meta = sampler.getMetadata();

        if (meta) {
            normalizeMapData(meta);
            Object.assign(window.fsimWorld || (window.fsimWorld = {}), meta);
            debugLog("🌐 Initialized world from baked metadata");
        } else {
            const jsonResp = await fetch('/tools/map.json');
            const mapData = await jsonResp.json();
            normalizeMapData(mapData);
            Object.assign(window.fsimWorld || (window.fsimWorld = {}), mapData);
            debugLog("⚠️ Baked metadata missing, fallbacked to map.json");
        }

        // Initialize worker manager if not already
        if (!_workerManager) {
            _workerManager = initWorkerManager(_staticWorldBuffer);
        } else {
            // Broadcast buffer to workers
            _workerManager.workers.forEach(w => {
                w.postMessage({ type: 'initStaticMap', payload: buffer });
            });
        }
        return true;
    } catch (e) {
        console.error("Failed to load static world:", e);
        return false;
    }
}

// Radius inflation so a chunk just outside a district boundary still loads its data
const DISTRICT_CHUNK_MARGIN = CHUNK_SIZE * 0.75;

function dispatchWorker(type, payload, transferables = []) {
    if (!_workerManager) {
        _workerManager = initWorkerManager(_staticWorldBuffer);
    }
    return _workerManager.dispatchWorker(type, payload, transferables);
}

export async function generateChunkBase(cx, cz, lod, ctx) {
    const { LOD_LEVELS, chunkPools, terrainMaterial, terrainFarMaterial, waterMaterial, waterFarMaterial } = ctx;
    const lodCfg = LOD_LEVELS[lod] || LOD_LEVELS[LOD_LEVELS.length - 1];
    const receiveTerrainShadows = lod <= 1;
    const receiveWaterShadows = lod === 0;
    let chunkGroup;
    let terrainMesh, waterMesh;

    if (chunkPools[lod] && chunkPools[lod].length > 0) {
        chunkGroup = chunkPools[lod].pop();
        terrainMesh = chunkGroup.children[0];
        waterMesh = chunkGroup.children[1];
    } else {
        chunkGroup = new THREE.Group();
        const geometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, lodCfg.terrainRes, lodCfg.terrainRes);
        geometry.rotateX(-Math.PI / 2);
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 3), 3));
        geometry.setAttribute('surfaceWeights', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 4), 4));
        geometry.setAttribute('surfaceOverrides', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 4), 4));
        terrainMesh = new THREE.Mesh(geometry, lod === 0 ? terrainMaterial : terrainFarMaterial);
        terrainMesh.receiveShadow = receiveTerrainShadows;
        chunkGroup.add(terrainMesh);

        const waterGeo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, lodCfg.waterRes, lodCfg.waterRes);
        waterGeo.rotateX(-Math.PI / 2);
        waterGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(waterGeo.attributes.position.count * 3), 3));
        waterMesh = new THREE.Mesh(waterGeo, lod === 0 ? waterMaterial : waterFarMaterial);
        waterMesh.receiveShadow = receiveWaterShadows;
        chunkGroup.add(waterMesh);
    }

    terrainMesh.receiveShadow = receiveTerrainShadows;
    waterMesh.receiveShadow = receiveWaterShadows;

    chunkGroup.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    chunkGroup.userData.lod = lod;
    chunkGroup.userData.chunkKey = `${cx},${cz}`;

    const tGeo = terrainMesh.geometry;
    const wGeo = waterMesh.geometry;

    const payload = {
        cx, cz, lodCfg,
        positions: tGeo.attributes.position.array.slice(),
        colors: new Float32Array(tGeo.attributes.color.array.length),
        surfaceWeights: new Float32Array(tGeo.attributes.surfaceWeights.array.length),
        surfaceOverrides: new Float32Array(tGeo.attributes.surfaceOverrides.array.length),
        wPos: wGeo.attributes.position.array.slice(),
        wCols: new Float32Array(wGeo.attributes.color.array.length)
    };

    const transferables = [
        payload.positions.buffer,
        payload.colors.buffer,
        payload.surfaceWeights.buffer,
        payload.surfaceOverrides.buffer,
        payload.wPos.buffer,
        payload.wCols.buffer
    ];

    const result = await dispatchWorker('chunkBase', payload, transferables);

    if (chunkGroup.userData.chunkKey !== `${cx},${cz}`) {
        return chunkGroup;
    }

    tGeo.attributes.position.array.set(result.positions);
    tGeo.attributes.position.needsUpdate = true;
    tGeo.attributes.color.array.set(result.colors);
    tGeo.attributes.color.needsUpdate = true;
    tGeo.attributes.surfaceWeights.array.set(result.surfaceWeights);
    tGeo.attributes.surfaceWeights.needsUpdate = true;
    tGeo.attributes.surfaceOverrides.array.set(result.surfaceOverrides);
    tGeo.attributes.surfaceOverrides.needsUpdate = true;
    tGeo.computeVertexNormals();

    wGeo.attributes.position.array.set(result.wPos);
    wGeo.attributes.position.needsUpdate = true;
    wGeo.attributes.color.array.set(result.wCols);
    wGeo.attributes.color.needsUpdate = true;
    wGeo.computeVertexNormals();

    return chunkGroup;
}

/**
 * Determine which authored districts overlap a terrain chunk (cx, cz).
 * Returns an array of matching district entries.
 */
export async function getOverlappingDistricts(cx, cz) {
    const districtIndex = await getDistrictIndex();
    if (!districtIndex || districtIndex.length === 0) return [];
    const chunkCX = cx * CHUNK_SIZE;
    const chunkCZ = cz * CHUNK_SIZE;
    const overlapping = [];
    for (const district of districtIndex) {
        const dx = chunkCX - district.cx;
        const dz = chunkCZ - district.cz;
        const distSq = dx * dx + dz * dz;
        const threshold = district.radius + DISTRICT_CHUNK_MARGIN;
        if (distSq < threshold * threshold) overlapping.push(district);
    }
    return overlapping;
}

export async function generateChunkProps(chunkGroup, cx, cz, lod, ctx) {
    const {
        LOD_LEVELS, treeBillboardGeo, treeTypeConfigs,
        detailedBuildingMats, baseBuildingMat, baseBuildingGeo,
        roofCapGeo, roofCapMat, podiumGeo, podiumMat, spireGeo, spireMat,
        hvacGeo, hvacMat, getPooledInstancedMesh,
        hullGeo, hullMat, cabinGeo, cabinMat, mastGeo, mastMat,
        dummy
    } = ctx;

    const lodCfg = LOD_LEVELS[lod] || LOD_LEVELS[LOD_LEVELS.length - 1];
    const treeShadowsEnabled = lod === 0;
    const boatShadowsEnabled = lod === 0;
    const terrainMesh = chunkGroup.children[0];
    if (!terrainMesh || !terrainMesh.geometry || !terrainMesh.geometry.attributes.position) return;
    const positions = terrainMesh.geometry.attributes.position.array;

    const districtIndex = await getDistrictIndex();
    const payload = {
        cx, cz, lod, lodCfg,
        positions: positions.slice(),
        cityZones: districtIndex || []
    };
    const transferables = [payload.positions.buffer];

    const overlappingDistricts = await getOverlappingDistricts(cx, cz);
    const result = await dispatchWorker('chunkProps', payload, transferables);

    if (chunkGroup.userData.chunkKey !== `${cx},${cz}`) return;

    const { treeMatrices, buildingPositions, boatPositions } = result;

    if (overlappingDistricts.length > 0) {
        const loadedDistricts = await Promise.all(overlappingDistricts.map(district => loadDistrictChunk(district.id)));
        if (chunkGroup.userData.chunkKey === `${cx},${cz}`) {
            loadedDistricts.forEach(districtData => {
                if (!districtData) return;
                spawnCityBuildingsForChunk(chunkGroup, cx, cz, districtData, lod, ctx, CHUNK_SIZE);
            });

            // Render trees
            for (const [treeType, matrices] of Object.entries(treeMatrices)) {
                if (!matrices) continue;
                const count = matrices.length / 16;
                if (count === 0) continue;
                const cfg = treeTypeConfigs[treeType];
                const cardA = new THREE.InstancedMesh(treeBillboardGeo, cfg.mat, count);
                cardA.instanceMatrix.array.set(matrices);
                cardA.instanceMatrix.needsUpdate = true;
                cardA.castShadow = treeShadowsEnabled;
                cardA.receiveShadow = false;
                cardA.customDepthMaterial = cfg.depthMat;
                chunkGroup.add(cardA);
            }

            // Boats
            if (lodCfg.enableBoats && boatPositions && boatPositions.length > 0) {
                const hullMesh = new THREE.InstancedMesh(hullGeo, hullMat, boatPositions.length);
                const cabinMesh = new THREE.InstancedMesh(cabinGeo, cabinMat, boatPositions.length);
                const mastMesh = new THREE.InstancedMesh(mastGeo, mastMat, boatPositions.length);
                hullMesh.castShadow = boatShadowsEnabled; cabinMesh.castShadow = boatShadowsEnabled; mastMesh.castShadow = boatShadowsEnabled;
                for (let j = 0; j < boatPositions.length; j++) {
                    let bp = boatPositions[j];
                    dummy.position.set(bp.x, -10.2, bp.z);
                    dummy.rotation.set(0, bp.rot, 0);
                    dummy.scale.set(1, 1, 1);
                    dummy.updateMatrix();
                    hullMesh.setMatrixAt(j, dummy.matrix);
                    cabinMesh.setMatrixAt(j, dummy.matrix);
                    mastMesh.setMatrixAt(j, dummy.matrix);
                }
                chunkGroup.add(hullMesh, cabinMesh, mastMesh);
            }
            return;
        }
    }

    // Default trees
    for (const [treeType, matrices] of Object.entries(treeMatrices)) {
        if (!matrices) continue;
        const count = matrices.length / 16;
        if (count === 0) continue;
        const cfg = treeTypeConfigs[treeType];
        const cardA = new THREE.InstancedMesh(treeBillboardGeo, cfg.mat, count);
        cardA.instanceMatrix.array.set(matrices);
        cardA.instanceMatrix.needsUpdate = true;
        cardA.castShadow = treeShadowsEnabled;
        cardA.receiveShadow = false;
        cardA.customDepthMaterial = cfg.depthMat;
        chunkGroup.add(cardA);
    }

    // Default buildings
    for (const [buildingClass, entries] of Object.entries(buildingPositions)) {
        if (entries.length === 0) continue;
        const cfg = classConfigs[buildingClass];
        const buildingMat = lod === 0 ? detailedBuildingMats[cfg.style] : baseBuildingMat;
        const bldgMesh = new THREE.InstancedMesh(baseBuildingGeo, buildingMat, entries.length);
        const roofMesh = new THREE.InstancedMesh(roofCapGeo, roofCapMat, entries.length);
        const podiumMesh = cfg.podium ? new THREE.InstancedMesh(podiumGeo, podiumMat, entries.length) : null;
        const spireMesh = cfg.spire ? new THREE.InstancedMesh(spireGeo, spireMat, entries.length) : null;
        const buildingShadowsEnabled = lod === 0;

        let hvacMesh = null, hvacIdx = 0;
        if (lod === 0) {
            hvacMesh = getPooledInstancedMesh(hvacGeo, hvacMat, entries.length * 3);
            hvacMesh.castShadow = true; hvacMesh.receiveShadow = true;
        }

        bldgMesh.castShadow = buildingShadowsEnabled; bldgMesh.receiveShadow = buildingShadowsEnabled;
        roofMesh.castShadow = buildingShadowsEnabled; roofMesh.receiveShadow = buildingShadowsEnabled;
        if (podiumMesh) { podiumMesh.castShadow = buildingShadowsEnabled; podiumMesh.receiveShadow = buildingShadowsEnabled; }
        if (spireMesh) { spireMesh.castShadow = buildingShadowsEnabled; spireMesh.receiveShadow = buildingShadowsEnabled; }

        const baseColor = new THREE.Color();
        const roofColor = new THREE.Color();
        const podiumColor = new THREE.Color();
        for (let j = 0; j < entries.length; j++) {
            const bp = entries[j];
            const h = cfg.height[0] + bp.seed * (cfg.height[1] - cfg.height[0]);
            const w = cfg.width[0] + bp.seed2 * (cfg.width[1] - cfg.width[0]);
            const d = cfg.depth[0] + bp.seed3 * (cfg.depth[1] - cfg.depth[0]);

            dummy.position.set(bp.x, bp.y, bp.z);
            dummy.rotation.set(0, bp.angle, 0);
            dummy.scale.set(w, h, d);
            dummy.updateMatrix();
            bldgMesh.setMatrixAt(j, dummy.matrix);
            baseColor.setHex(cfg.colors[Math.floor(bp.seed * cfg.colors.length) % cfg.colors.length]);
            bldgMesh.setColorAt(j, baseColor);

            dummy.position.set(bp.x, bp.y + h, bp.z);
            dummy.scale.set(w * 1.04, 1, d * 1.04);
            dummy.updateMatrix();
            roofMesh.setMatrixAt(j, dummy.matrix);
            roofColor.setHex(cfg.roof[Math.floor(bp.seed2 * cfg.roof.length) % cfg.roof.length]);
            roofMesh.setColorAt(j, roofColor);

            if (podiumMesh) {
                const podiumH = Math.max(5, h * 0.08);
                dummy.position.set(bp.x, bp.y, bp.z);
                dummy.scale.set(w * 1.2, podiumH, d * 1.2);
                dummy.updateMatrix();
                podiumMesh.setMatrixAt(j, dummy.matrix);
                podiumColor.copy(baseColor).offsetHSL(0, 0, -0.06);
                podiumMesh.setColorAt(j, podiumColor);
            }
            if (spireMesh) {
                const spireH = 18 + bp.seed2 * 32;
                dummy.position.set(bp.x, bp.y + h, bp.z);
                dummy.scale.set(1.6, spireH, 1.6);
                dummy.updateMatrix();
                spireMesh.setMatrixAt(j, dummy.matrix);
            }
            if (hvacMesh) {
                const numHvacs = Math.floor(bp.seed3 * 4);
                for (let k = 0; k < numHvacs; k++) {
                    const hx = bp.x + (hash2Local(bp.seed, k, 1) - 0.5) * (w * 0.7);
                    const hz = bp.z + (hash2Local(bp.seed, k, 2) - 0.5) * (d * 0.7);
                    const size = 0.8 + hash2Local(bp.seed, k, 3) * 1.5;
                    const heightHVAC = 1.0 + hash2Local(bp.seed, k, 4) * 1.0;
                    const rot = hash2Local(bp.seed, k, 5) * Math.PI;
                    dummy.position.set(hx, bp.y + h, hz);
                    dummy.scale.set(size, heightHVAC, size);
                    dummy.rotation.set(0, rot, 0);
                    dummy.updateMatrix();
                    hvacMesh.setMatrixAt(hvacIdx++, dummy.matrix);
                }
            }
        }
        bldgMesh.instanceColor.needsUpdate = true;
        roofMesh.instanceColor.needsUpdate = true;
        chunkGroup.add(bldgMesh, roofMesh);
        if (podiumMesh) { podiumMesh.instanceColor.needsUpdate = true; chunkGroup.add(podiumMesh); }
        if (spireMesh) chunkGroup.add(spireMesh);
        if (hvacMesh && hvacIdx > 0) { hvacMesh.count = hvacIdx; chunkGroup.add(hvacMesh); }
    }

    if (lodCfg.enableBoats && boatPositions.length > 0) {
        const hullMesh = new THREE.InstancedMesh(hullGeo, hullMat, boatPositions.length);
        const cabinMesh = new THREE.InstancedMesh(cabinGeo, cabinMat, boatPositions.length);
        const mastMesh = new THREE.InstancedMesh(mastGeo, mastMat, boatPositions.length);
        hullMesh.castShadow = boatShadowsEnabled; cabinMesh.castShadow = boatShadowsEnabled; mastMesh.castShadow = boatShadowsEnabled;
        for (let j = 0; j < boatPositions.length; j++) {
            let bp = boatPositions[j];
            dummy.position.set(bp.x, -10.2, bp.z);
            dummy.rotation.set(0, bp.rot, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            hullMesh.setMatrixAt(j, dummy.matrix);
            cabinMesh.setMatrixAt(j, dummy.matrix);
            mastMesh.setMatrixAt(j, dummy.matrix);
        }
        chunkGroup.add(hullMesh, cabinMesh, mastMesh);
    }
}
