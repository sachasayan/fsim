import * as THREE from 'three';
import { fetchDistrictIndex, loadDistrictChunk } from './CityChunkLoader.js';
import { QuadtreeMapSampler, hash2Local } from './TerrainUtils.js';
import { normalizeMapData } from '../MapDataUtils.js';
import { spawnCityBuildingsForChunk, spawnDistrictPropsForChunk, classConfigs } from './BuildingSpawner.js';
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
        normals: new Float32Array(tGeo.attributes.normal.array.length),
        colors: new Float32Array(tGeo.attributes.color.array.length),
        surfaceWeights: new Float32Array(tGeo.attributes.surfaceWeights.array.length),
        surfaceOverrides: new Float32Array(tGeo.attributes.surfaceOverrides.array.length),
        wPos: wGeo.attributes.position.array.slice(),
        wNormals: new Float32Array(wGeo.attributes.normal.array.length),
        wCols: new Float32Array(wGeo.attributes.color.array.length)
    };

    const transferables = [
        payload.positions.buffer,
        payload.normals.buffer,
        payload.colors.buffer,
        payload.surfaceWeights.buffer,
        payload.surfaceOverrides.buffer,
        payload.wPos.buffer,
        payload.wNormals.buffer,
        payload.wCols.buffer
    ];

    const result = await dispatchWorker('chunkBase', payload, transferables);

    if (chunkGroup.userData.chunkKey !== `${cx},${cz}`) {
        return chunkGroup;
    }

    tGeo.attributes.position.array.set(result.positions);
    tGeo.attributes.position.needsUpdate = true;
    tGeo.attributes.normal.array.set(result.normals);
    tGeo.attributes.normal.needsUpdate = true;
    tGeo.attributes.color.array.set(result.colors);
    tGeo.attributes.color.needsUpdate = true;
    tGeo.attributes.surfaceWeights.array.set(result.surfaceWeights);
    tGeo.attributes.surfaceWeights.needsUpdate = true;
    tGeo.attributes.surfaceOverrides.array.set(result.surfaceOverrides);
    tGeo.attributes.surfaceOverrides.needsUpdate = true;

    wGeo.attributes.position.array.set(result.wPos);
    wGeo.attributes.position.needsUpdate = true;
    wGeo.attributes.normal.array.set(result.wNormals);
    wGeo.attributes.normal.needsUpdate = true;
    wGeo.attributes.color.array.set(result.wCols);
    wGeo.attributes.color.needsUpdate = true;

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

function applyTreeInstanceColors(mesh, instances, baseTint) {
    const count = instances.length / 8;
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
        const seed = instances[i * 8 + 6];
        color.copy(baseTint);
        color.offsetHSL((seed - 0.5) * 0.03, (seed - 0.5) * 0.08, (seed - 0.5) * 0.12);
        const brightness = 0.94 + seed * 0.14;
        color.multiplyScalar(brightness);
        colors[i * 3 + 0] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    mesh.instanceColor.needsUpdate = true;
}

export function buildTreeMeshesForLod(treeInstances, lodCfg, resources) {
    const {
        treeBillboardGeo,
        treeGroundGeo,
        treeTrunkGeo,
        treeTrunkMat,
        treeTypeConfigs
    } = resources;
    const dummy = new THREE.Object3D();
    const meshes = [];
    const renderMode = lodCfg?.treeRenderMode || (lodCfg?.enableTrees ? 'billboard' : 'disabled');
    if (renderMode === 'disabled') return meshes;

    for (const [treeType, instances] of Object.entries(treeInstances || {})) {
        if (!instances || instances.length === 0) continue;
        const count = instances.length / 8;
        const cfg = treeTypeConfigs[treeType];
        if (!cfg || count === 0) continue;

        if (renderMode === 'hybrid' || renderMode === 'crossed') {
            const trunkMesh = new THREE.InstancedMesh(treeTrunkGeo, treeTrunkMat, count);
            for (let i = 0; i < count; i++) {
                const offset = i * 8;
                const canopyWidth = instances[offset + 3];
                const canopyHeight = instances[offset + 4];
                const seed = instances[offset + 6];
                dummy.position.set(instances[offset + 0], instances[offset + 1], instances[offset + 2]);
                dummy.rotation.set(0, instances[offset + 5], 0);
                dummy.scale.set(
                    canopyWidth * (0.11 + seed * 0.04),
                    canopyHeight * (0.3 + seed * 0.08),
                    canopyWidth * (0.11 + seed * 0.04)
                );
                dummy.updateMatrix();
                trunkMesh.setMatrixAt(i, dummy.matrix);
            }
            trunkMesh.instanceMatrix.needsUpdate = true;
            trunkMesh.castShadow = true;
            trunkMesh.receiveShadow = false;
            trunkMesh.userData.treeRenderTier = 'near-trunk';
            meshes.push(trunkMesh);

            const crownLayouts = [
                { dx: 0.0, dz: 0.0, y: 0.38, w: 0.82, h: 0.56, castShadow: true },
                { dx: -0.16, dz: 0.10, y: 0.46, w: 0.66, h: 0.48, castShadow: false },
                { dx: 0.17, dz: -0.08, y: 0.5, w: 0.62, h: 0.46, castShadow: false }
            ];
            crownLayouts.forEach((layout, crownIndex) => {
                const mesh = new THREE.InstancedMesh(treeBillboardGeo, cfg.canopyMat, count);
                for (let i = 0; i < count; i++) {
                    const offset = i * 8;
                    const canopyWidth = instances[offset + 3];
                    const canopyHeight = instances[offset + 4];
                    const yaw = instances[offset + 5];
                    const seed = instances[offset + 6];
                    const crownScaleY = canopyHeight * (layout.h + seed * 0.08);
                    const cosYaw = Math.cos(yaw);
                    const sinYaw = Math.sin(yaw);
                    const localX = layout.dx * canopyWidth * (0.85 + seed * 0.25);
                    const localZ = layout.dz * canopyWidth * (0.85 + seed * 0.25);
                    dummy.position.set(
                        instances[offset + 0] + localX * cosYaw - localZ * sinYaw,
                        instances[offset + 1] + canopyHeight * (layout.y + seed * 0.05) - crownScaleY * 0.48,
                        instances[offset + 2] + localX * sinYaw + localZ * cosYaw
                    );
                    dummy.rotation.set(0, 0, 0);
                    dummy.scale.set(
                        canopyWidth * (layout.w + seed * 0.1),
                        crownScaleY,
                        1
                    );
                    dummy.updateMatrix();
                    mesh.setMatrixAt(i, dummy.matrix);
                }
                mesh.instanceMatrix.needsUpdate = true;
                applyTreeInstanceColors(mesh, instances, cfg.baseTint);
                mesh.castShadow = layout.castShadow;
                mesh.receiveShadow = false;
                mesh.customDepthMaterial = layout.castShadow ? cfg.depthMat : null;
                mesh.userData.treeRenderTier = `near-canopy-${crownIndex}`;
                mesh.userData.treeType = treeType;
                meshes.push(mesh);
            });
        } else if (renderMode === 'billboard') {
            const trunkHintMesh = new THREE.InstancedMesh(treeTrunkGeo, treeTrunkMat, count);
            for (let i = 0; i < count; i++) {
                const offset = i * 8;
                const canopyWidth = instances[offset + 3];
                const canopyHeight = instances[offset + 4];
                const seed = instances[offset + 6];
                dummy.position.set(instances[offset + 0], instances[offset + 1], instances[offset + 2]);
                dummy.rotation.set(0, instances[offset + 5], 0);
                dummy.scale.set(
                    canopyWidth * (0.1 + seed * 0.03),
                    canopyHeight * (0.24 + seed * 0.05),
                    canopyWidth * (0.1 + seed * 0.03)
                );
                dummy.updateMatrix();
                trunkHintMesh.setMatrixAt(i, dummy.matrix);
            }
            trunkHintMesh.instanceMatrix.needsUpdate = true;
            trunkHintMesh.castShadow = false;
            trunkHintMesh.receiveShadow = false;
            trunkHintMesh.userData.treeRenderTier = 'mid-trunk-hint';
            meshes.push(trunkHintMesh);

            const mesh = new THREE.InstancedMesh(treeBillboardGeo, cfg.canopyMat, count);
            const matrices = mesh.instanceMatrix.array;
            for (let i = 0; i < count; i++) {
                const offset = i * 8;
                const m = i * 16;
                const scaleY = instances[offset + 4] * (0.62 + instances[offset + 6] * 0.08);
                matrices[m + 0] = instances[offset + 3] * (0.92 + instances[offset + 6] * 0.08);
                matrices[m + 1] = 0; matrices[m + 2] = 0; matrices[m + 3] = 0;
                matrices[m + 4] = 0; matrices[m + 5] = scaleY; matrices[m + 6] = 0; matrices[m + 7] = 0;
                matrices[m + 8] = 0; matrices[m + 9] = 0; matrices[m + 10] = 1; matrices[m + 11] = 0;
                matrices[m + 12] = instances[offset + 0];
                matrices[m + 13] = instances[offset + 1] + instances[offset + 4] * 0.42 - scaleY * 0.48;
                matrices[m + 14] = instances[offset + 2];
                matrices[m + 15] = 1;
            }
            mesh.instanceMatrix.needsUpdate = true;
            applyTreeInstanceColors(mesh, instances, cfg.baseTint);
            mesh.castShadow = true;
            mesh.receiveShadow = false;
            mesh.customDepthMaterial = cfg.depthMat;
            mesh.userData.treeRenderTier = 'mid-billboard';
            mesh.userData.treeType = treeType;
            meshes.push(mesh);
        }

        if (lodCfg?.enableTreeContactShadows) {
            const isNearHybrid = renderMode === 'hybrid' || renderMode === 'crossed';
            const groundMat = isNearHybrid ? resources.treeGroundMats.near : resources.treeGroundMats.mid;
            const groundMesh = new THREE.InstancedMesh(treeGroundGeo, groundMat, count);
            for (let i = 0; i < count; i++) {
                const offset = i * 8;
                const groundScale = instances[offset + 7];
                const canopyWidth = instances[offset + 3];
                dummy.position.set(instances[offset + 0], instances[offset + 1] + 0.05, instances[offset + 2]);
                dummy.rotation.set(0, instances[offset + 5], 0);
                dummy.scale.set(canopyWidth * 1.35 * groundScale, 1, canopyWidth * 0.98 * groundScale);
                dummy.updateMatrix();
                groundMesh.setMatrixAt(i, dummy.matrix);
            }
            groundMesh.instanceMatrix.needsUpdate = true;
            groundMesh.castShadow = false;
            groundMesh.receiveShadow = false;
            groundMesh.renderOrder = 1;
            groundMesh.userData.treeRenderTier = isNearHybrid ? 'near-contact' : 'mid-contact';
            meshes.push(groundMesh);
        }
    }

    return meshes;
}

export async function generateChunkProps(chunkGroup, cx, cz, lod, ctx) {
    const {
        LOD_LEVELS, treeBillboardGeo, treeGroundGeo, treeTrunkGeo, treeTrunkMat, treeGroundMats, treeTypeConfigs,
        detailedBuildingMats, baseBuildingMat, baseBuildingGeo,
        roofCapGeo, roofCapMat, podiumGeo, podiumMat, spireGeo, spireMat,
        hvacGeo, hvacMat, getPooledInstancedMesh,
        hullGeo, hullMat, cabinGeo, cabinMat, mastGeo, mastMat,
        dummy
    } = ctx;

    const lodCfg = LOD_LEVELS[lod] || LOD_LEVELS[LOD_LEVELS.length - 1];
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

    const { treeInstances, buildingPositions, boatPositions } = result;

    if (overlappingDistricts.length > 0) {
        const loadedDistricts = await Promise.all(overlappingDistricts.map(district => loadDistrictChunk(district.id)));
        if (chunkGroup.userData.chunkKey === `${cx},${cz}`) {
            loadedDistricts.forEach(districtData => {
                if (!districtData) return;
                spawnCityBuildingsForChunk(chunkGroup, cx, cz, districtData, lod, ctx, CHUNK_SIZE);
                spawnDistrictPropsForChunk(chunkGroup, cx, cz, districtData, lod, ctx, CHUNK_SIZE);
            });

            buildTreeMeshesForLod(treeInstances, lodCfg, { treeBillboardGeo, treeGroundGeo, treeTrunkGeo, treeTrunkMat, treeGroundMats, treeTypeConfigs })
                .forEach((mesh) => chunkGroup.add(mesh));

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

    buildTreeMeshesForLod(treeInstances, lodCfg, { treeBillboardGeo, treeGroundGeo, treeTrunkGeo, treeTrunkMat, treeGroundMats, treeTypeConfigs })
        .forEach((mesh) => chunkGroup.add(mesh));

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
