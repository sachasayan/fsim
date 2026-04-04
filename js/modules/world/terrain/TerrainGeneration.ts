// @ts-check

import * as THREE from 'three';
import { fetchDistrictIndex, loadDistrictChunk } from './CityChunkLoader.js';
import { QuadtreeMapSampler, hash2Local, setStaticSampler } from './TerrainUtils.js';
import { normalizeMapData } from '../MapDataUtils.js';
import { spawnCityBuildingsForChunk, spawnDistrictPropsForChunk, classConfigs } from './BuildingSpawner.js';
import { initWorkerManager } from './TerrainWorkerManager.js';
import { debugLog } from '../../core/logging.js';
import type { EditorDistrict } from '../../../editor/core/types';

export const CHUNK_SIZE = 4000;
export const TREE_DENSITY_MULTIPLIER = 8.0;

/**
 * @typedef {{
 *   id: string,
 *   cx: number,
 *   cz: number,
 *   radius: number
 * }} DistrictIndexEntry
 */

/**
 * @typedef {{
 *   count: number,
 *   workerMs: number | null,
 *   applyMs: number | null,
 *   avgWorkerMs: number,
 *   avgApplyMs: number,
 *   maxWorkerMs: number,
 *   maxApplyMs: number
 * }} GenerationPerfBucket
 */

/**
 * @typedef {{
 *   chunkBase: GenerationPerfBucket,
 *   chunkProps: GenerationPerfBucket,
 *   leafSurface: GenerationPerfBucket
 * }} GenerationPerfState
 */

type TerrainGenerationLodConfig = {
    terrainRes: number;
    waterRes: number;
    enableBoats?: boolean;
    enableTrees?: boolean;
    enableTreeContactShadows?: boolean;
    treeRenderMode?: string;
};

type TerrainGenerationDebugSettings = {
    showObjects?: boolean;
    showTrees?: boolean;
    showBuildings?: boolean;
};

type PooledInstancedMeshFactory = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    count: number,
    options?: { colorable?: boolean }
) => THREE.InstancedMesh;

type TreeGroundMaterialSet = {
    near: THREE.Material;
    mid: THREE.Material;
};

type TreeTypeConfig = {
    canopyMat: THREE.Material;
    baseTint: THREE.Color;
    depthMat: THREE.Material | null;
};

type TerrainTreeResources = {
    treeBillboardGeo: THREE.BufferGeometry;
    treeGroundGeo: THREE.BufferGeometry;
    treeTrunkGeo: THREE.BufferGeometry;
    treeTrunkMat: THREE.Material;
    treeGroundMats: TreeGroundMaterialSet;
    treeTypeConfigs: Record<string, TreeTypeConfig>;
    terrainDebugSettings?: TerrainGenerationDebugSettings;
    getPooledInstancedMesh?: PooledInstancedMeshFactory;
};

/**
 * @typedef {{
 *   LOD_LEVELS: TerrainGenerationLodConfig[],
 *   chunkPools: THREE.Group[][],
 *   terrainMaterial: THREE.Material,
 *   terrainFarMaterial: THREE.Material,
 *   waterMaterial: THREE.Material,
 *   waterFarMaterial: THREE.Material,
 *   includeWaterMesh?: boolean
 * }} TerrainChunkBaseContext
 */

type RuntimeWindow = Window & typeof globalThis & {
    fsimWorld?: Record<string, unknown>;
};

type BoatPlacement = { x: number; z: number; rot: number };
type BuildingPlacement = {
    x: number;
    y: number;
    z: number;
    angle: number;
    seed: number;
    seed2: number;
    seed3: number;
};
type ChunkPropsResult = {
    treeInstances: Record<string, Float32Array>;
    buildingPositions: Record<string, BuildingPlacement[]>;
    boatPositions: BoatPlacement[];
};
type DistrictIndexZone = {
    id: string;
    cx: number;
    cz: number;
    radius: number;
    districts?: EditorDistrict[];
};

// Lazily fetched district index (array of {id, cx, cz, radius})
let _districtIndex = null;
let _staticWorldBuffer = null;
let _workerManager = null;
/** @type {GenerationPerfState} */
const _generationPerf = {
    chunkBase: {
        count: 0,
        workerMs: null,
        applyMs: null,
        avgWorkerMs: 0,
        avgApplyMs: 0,
        maxWorkerMs: 0,
        maxApplyMs: 0
    },
    chunkProps: {
        count: 0,
        workerMs: null,
        applyMs: null,
        avgWorkerMs: 0,
        avgApplyMs: 0,
        maxWorkerMs: 0,
        maxApplyMs: 0
    },
    leafSurface: {
        count: 0,
        workerMs: null,
        applyMs: null,
        avgWorkerMs: 0,
        avgApplyMs: 0,
        maxWorkerMs: 0,
        maxApplyMs: 0
    }
};
const _chunkPropSampleTemplateCache = new Map();

/**
 * @param {number | null | undefined} value
 */
function roundPerf(value) {
    return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
}

/**
 * @param {'chunkBase' | 'chunkProps' | 'leafSurface'} kind
 * @param {{ workerMs?: number | null, applyMs?: number | null }} [sample]
 */
function recordGenerationPerf(kind, { workerMs = null, applyMs = null } = {}) {
    const bucket = _generationPerf[kind];
    if (!bucket) return;

    bucket.count += 1;
    if (Number.isFinite(workerMs)) {
        bucket.workerMs = workerMs;
        bucket.avgWorkerMs = ((bucket.avgWorkerMs * (bucket.count - 1)) + workerMs) / bucket.count;
        bucket.maxWorkerMs = Math.max(bucket.maxWorkerMs, workerMs);
    }
    if (Number.isFinite(applyMs)) {
        bucket.applyMs = applyMs;
        bucket.avgApplyMs = ((bucket.avgApplyMs * (bucket.count - 1)) + applyMs) / bucket.count;
        bucket.maxApplyMs = Math.max(bucket.maxApplyMs, applyMs);
    }
}

export function clearStaticWorldCache() {
    _staticWorldBuffer = null;
    _districtIndex = null;
}

/**
 * @returns {Promise<DistrictIndexEntry[] | null>}
 */
async function getDistrictIndex() {
    if (!_districtIndex) _districtIndex = await fetchDistrictIndex();
    return _districtIndex;
}

export async function loadStaticWorld() {
    try {
        const resp = await fetch(`/world/world.bin?t=${Date.now()}`);
        if (!resp.ok) return false;
        _staticWorldBuffer = await resp.arrayBuffer();
        const buffer = _staticWorldBuffer;

        const sampler = new QuadtreeMapSampler(buffer);
        setStaticSampler(sampler);
        const meta = sampler.getMetadata();

        if (meta) {
            const worldWindow = window as RuntimeWindow;
            normalizeMapData(meta);
            Object.assign(worldWindow.fsimWorld || (worldWindow.fsimWorld = {}), meta);
            window.dispatchEvent?.(new CustomEvent('fsim:world-metadata-updated', { detail: { source: 'world.bin' } }));
            debugLog("🌐 Initialized world from baked metadata");
        } else {
            const jsonResp = await fetch('/tools/map.json');
            const mapData = await jsonResp.json();
            const worldWindow = window as RuntimeWindow;
            normalizeMapData(mapData);
            Object.assign(worldWindow.fsimWorld || (worldWindow.fsimWorld = {}), mapData);
            window.dispatchEvent?.(new CustomEvent('fsim:world-metadata-updated', { detail: { source: 'tools/map.json' } }));
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

/**
 * @param {string} type
 * @param {unknown} payload
 * @param {Transferable[]} [transferables]
 */
export function dispatchTerrainWorker(type, payload, transferables = []) {
    return dispatchWorker(type, payload, transferables);
}

/**
 * @param {'chunkBase' | 'chunkProps' | 'leafSurface'} kind
 * @param {{ workerMs?: number | null, applyMs?: number | null }} [sample]
 */
export function recordTerrainGenerationPerf(kind, sample = {}) {
    recordGenerationPerf(kind, sample);
}

export function getTerrainGenerationDiagnostics() {
    return {
        worker: _workerManager?.getDiagnostics?.() || {
            activeWorkerCount: 0,
            inFlightJobs: 0,
            inFlightByType: {},
            jobs: {}
        },
        generation: Object.fromEntries(Object.entries(_generationPerf).map(([key, value]) => [key, {
            count: value.count,
            workerMs: roundPerf(value.workerMs),
            applyMs: roundPerf(value.applyMs),
            avgWorkerMs: roundPerf(value.avgWorkerMs),
            avgApplyMs: roundPerf(value.avgApplyMs),
            maxWorkerMs: roundPerf(value.maxWorkerMs),
            maxApplyMs: roundPerf(value.maxApplyMs)
        }]))
    };
}

function createChunkPropSamplePositions(terrainRes) {
    const geometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, terrainRes, terrainRes);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position.array.slice();
    geometry.dispose();
    return positions;
}

/**
 * @param {{ terrainRes?: number } | null | undefined} lodCfg
 */
function getChunkPropSamplePositions(lodCfg) {
    const terrainRes = Math.max(1, lodCfg?.terrainRes || 1);
    const cacheKey = `${terrainRes}`;
    let cached = _chunkPropSampleTemplateCache.get(cacheKey);
    if (!cached) {
        cached = createChunkPropSamplePositions(terrainRes);
        _chunkPropSampleTemplateCache.set(cacheKey, cached);
    }
    return cached.slice();
}

function getChunkBaseSurfaceMeshes(chunkGroup) {
    return {
        terrainMesh: chunkGroup?.userData?.chunkBaseTerrainMesh || null,
        waterMesh: chunkGroup?.userData?.chunkBaseWaterMesh || null
    };
}

function setChunkBaseSurfaceMeshes(chunkGroup, terrainMesh, waterMesh) {
    if (!chunkGroup) return;
    chunkGroup.userData.chunkBaseTerrainMesh = terrainMesh || null;
    chunkGroup.userData.chunkBaseWaterMesh = waterMesh || null;
}

function insertChunkBaseSurfaceMesh(chunkGroup, mesh, index) {
    chunkGroup.add(mesh);
    const currentIndex = chunkGroup.children.indexOf(mesh);
    if (currentIndex >= 0 && currentIndex !== index) {
        chunkGroup.children.splice(currentIndex, 1);
        chunkGroup.children.splice(index, 0, mesh);
    }
}

/**
 * @param {number} cx
 * @param {number} cz
 * @param {number} lod
 * @param {TerrainChunkBaseContext} ctx
 * @param {THREE.Group | null} [existingGroup]
 */
export async function generateChunkBase(cx, cz, lod, ctx, existingGroup = null) {
    const {
        LOD_LEVELS,
        chunkPools,
        terrainMaterial,
        terrainFarMaterial,
        waterMaterial,
        waterFarMaterial,
        includeWaterMesh = true
    } = ctx;
    const lodCfg = LOD_LEVELS[lod] || LOD_LEVELS[LOD_LEVELS.length - 1];
    let chunkGroup = existingGroup;
    let { terrainMesh, waterMesh } = getChunkBaseSurfaceMeshes(chunkGroup);

    if (!chunkGroup) {
        if (chunkPools[lod] && chunkPools[lod].length > 0) {
            chunkGroup = chunkPools[lod].pop();
            ({ terrainMesh, waterMesh } = getChunkBaseSurfaceMeshes(chunkGroup));
        } else {
            chunkGroup = new THREE.Group();
        }
    }

    if (!terrainMesh) {
        const geometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, lodCfg.terrainRes, lodCfg.terrainRes);
        geometry.rotateX(-Math.PI / 2);
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 3), 3));
        geometry.setAttribute('surfaceWeights', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 4), 4));
        terrainMesh = new THREE.Mesh(geometry, lod === 0 ? terrainMaterial : terrainFarMaterial);
        terrainMesh.castShadow = false;
        terrainMesh.receiveShadow = false;
        insertChunkBaseSurfaceMesh(chunkGroup, terrainMesh, 0);
    }

    if (!includeWaterMesh && waterMesh) {
        chunkGroup.remove(waterMesh);
        waterMesh.geometry?.dispose?.();
        waterMesh = null;
    }

    if (includeWaterMesh && !waterMesh) {
        const waterGeo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, lodCfg.waterRes, lodCfg.waterRes);
        waterGeo.rotateX(-Math.PI / 2);
        waterGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(waterGeo.attributes.position.count * 3), 3));
        waterMesh = new THREE.Mesh(waterGeo, lod === 0 ? waterMaterial : waterFarMaterial);
        waterMesh.receiveShadow = false;
        insertChunkBaseSurfaceMesh(chunkGroup, waterMesh, 1);
    }
    setChunkBaseSurfaceMeshes(chunkGroup, terrainMesh, waterMesh);

    terrainMesh.castShadow = false;
    terrainMesh.receiveShadow = false;
    if (waterMesh) waterMesh.receiveShadow = false;

    chunkGroup.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    chunkGroup.userData.lod = lod;
    chunkGroup.userData.chunkKey = `${cx},${cz}`;

    const tGeo = terrainMesh.geometry;
    const wGeo = waterMesh?.geometry || null;

    const workerStartMs = performance.now();
    const result = await dispatchWorker('chunkBase', { cx, cz, lod, lodCfg });
    const workerMs = performance.now() - workerStartMs;

    if (chunkGroup.userData.chunkKey !== `${cx},${cz}`) {
        recordGenerationPerf('chunkBase', { workerMs });
        return chunkGroup;
    }

    const applyStartMs = performance.now();
    tGeo.attributes.position.array.set(result.positions);
    tGeo.attributes.position.needsUpdate = true;
    tGeo.attributes.normal.array.set(result.normals);
    tGeo.attributes.normal.needsUpdate = true;
    tGeo.attributes.color.array.set(result.colors);
    tGeo.attributes.color.needsUpdate = true;
    tGeo.attributes.surfaceWeights.array.set(result.surfaceWeights);
    tGeo.attributes.surfaceWeights.needsUpdate = true;

    if (wGeo) {
        wGeo.attributes.position.array.set(result.wPos);
        wGeo.attributes.position.needsUpdate = true;
        wGeo.attributes.normal.array.set(result.wNormals);
        wGeo.attributes.normal.needsUpdate = true;
        wGeo.attributes.color.array.set(result.wCols);
        wGeo.attributes.color.needsUpdate = true;
    }

    recordGenerationPerf('chunkBase', {
        workerMs,
        applyMs: performance.now() - applyStartMs
    });

    return chunkGroup;
}

/**
 * Determine which authored districts overlap a terrain chunk (cx, cz).
 * Returns an array of matching district entries.
 */
/**
 * @param {number} cx
 * @param {number} cz
 * @returns {Promise<DistrictIndexEntry[]>}
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

/**
 * @param {THREE.InstancedMesh} mesh
 * @param {number[]} instances
 * @param {THREE.Color} baseTint
 */
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

export function buildTreeMeshesForLod(
    treeInstances: Record<string, Float32Array>,
    lodCfg: TerrainGenerationLodConfig,
    resources: TerrainTreeResources
) {
    const {
        treeBillboardGeo,
        treeGroundGeo,
        treeTrunkGeo,
        treeTrunkMat,
        treeTypeConfigs,
        getPooledInstancedMesh // Add this
    } = resources;
    const dummy = new THREE.Object3D();
    const meshes = [];
    const objectsEnabled = resources.terrainDebugSettings?.showObjects !== false;
    const treesEnabled = objectsEnabled && resources.terrainDebugSettings?.showTrees !== false;
    const renderMode = treesEnabled
        ? (lodCfg?.treeRenderMode || (lodCfg?.enableTrees ? 'billboard' : 'disabled'))
        : 'disabled';
    if (renderMode === 'disabled') return meshes;

    for (const [treeType, instances] of Object.entries(treeInstances || {})) {
        if (!instances || instances.length === 0) continue;
        const count = instances.length / 8;
        const cfg = treeTypeConfigs[treeType];
        if (!cfg || count === 0) continue;

        if (renderMode === 'hybrid' || renderMode === 'crossed') {
            const trunkMesh = getPooledInstancedMesh
                ? getPooledInstancedMesh(treeTrunkGeo, treeTrunkMat, count)
                : new THREE.InstancedMesh(treeTrunkGeo, treeTrunkMat, count);
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
                const mesh = getPooledInstancedMesh
                    ? getPooledInstancedMesh(treeBillboardGeo, cfg.canopyMat, count, { colorable: true })
                    : new THREE.InstancedMesh(treeBillboardGeo, cfg.canopyMat, count);
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
            const trunkHintMesh = getPooledInstancedMesh
                ? getPooledInstancedMesh(treeTrunkGeo, treeTrunkMat, count)
                : new THREE.InstancedMesh(treeTrunkGeo, treeTrunkMat, count);
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
            
            const mesh = getPooledInstancedMesh
                ? getPooledInstancedMesh(treeBillboardGeo, cfg.canopyMat, count, { colorable: true })
                : new THREE.InstancedMesh(treeBillboardGeo, cfg.canopyMat, count);
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
            const groundMesh = getPooledInstancedMesh
                ? getPooledInstancedMesh(treeGroundGeo, groundMat, count)
                : new THREE.InstancedMesh(treeGroundGeo, groundMat, count);
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
    const objectsEnabled = ctx.terrainDebugSettings?.showObjects !== false;
    const treesEnabled = objectsEnabled && ctx.terrainDebugSettings?.showTrees !== false;
    const buildingsEnabled = objectsEnabled && ctx.terrainDebugSettings?.showBuildings !== false;

    if (!objectsEnabled) {
        return;
    }

    const lodCfg = LOD_LEVELS[lod] || LOD_LEVELS[LOD_LEVELS.length - 1];
    const boatShadowsEnabled = lod === 0;
    const terrainMesh = chunkGroup.userData?.chunkBaseTerrainMesh || chunkGroup.children[0];
    const positions = terrainMesh?.geometry?.attributes?.position?.array
        ? terrainMesh.geometry.attributes.position.array
        : getChunkPropSamplePositions(lodCfg);

    const districtIndex = await getDistrictIndex();
    const payload = {
        cx, cz, lod, lodCfg,
        positions: positions.slice(),
        cityZones: (districtIndex || []) as DistrictIndexZone[]
    };
    const transferables = [payload.positions.buffer];

    const overlappingDistricts = await getOverlappingDistricts(cx, cz);
    const workerStartMs = performance.now();
    const result = await dispatchWorker('chunkProps', payload, transferables) as ChunkPropsResult;
    const workerMs = performance.now() - workerStartMs;

    if (chunkGroup.userData.chunkKey !== `${cx},${cz}`) {
        recordGenerationPerf('chunkProps', { workerMs });
        return;
    }

    const { treeInstances, buildingPositions, boatPositions } = result;
    const applyStartMs = performance.now();

    if (overlappingDistricts.length > 0) {
        const loadedDistricts = await Promise.all(overlappingDistricts.map(district => loadDistrictChunk(district.id)));
        if (chunkGroup.userData.chunkKey === `${cx},${cz}`) {
            if (buildingsEnabled) {
                loadedDistricts.forEach(districtData => {
                    if (!districtData) return;
                    spawnCityBuildingsForChunk(chunkGroup, cx, cz, districtData, lod, ctx, CHUNK_SIZE);
                    spawnDistrictPropsForChunk(chunkGroup, cx, cz, districtData, lod, ctx, CHUNK_SIZE);
                });
            }

            if (treesEnabled) {
                buildTreeMeshesForLod(treeInstances, lodCfg, { 
                    treeBillboardGeo, treeGroundGeo, treeTrunkGeo, treeTrunkMat, treeGroundMats, treeTypeConfigs, 
                    terrainDebugSettings: ctx.terrainDebugSettings, 
                    getPooledInstancedMesh // Pass this through
                })
                    .forEach((mesh) => chunkGroup.add(mesh));
            }

            // Boats
            if (lodCfg.enableBoats && boatPositions && boatPositions.length > 0) {
                const hullMesh = getPooledInstancedMesh(hullGeo, hullMat, boatPositions.length);
                const cabinMesh = getPooledInstancedMesh(cabinGeo, cabinMat, boatPositions.length);
                const mastMesh = getPooledInstancedMesh(mastGeo, mastMat, boatPositions.length);
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
                hullMesh.instanceMatrix.needsUpdate = true;
                cabinMesh.instanceMatrix.needsUpdate = true;
                mastMesh.instanceMatrix.needsUpdate = true;
                chunkGroup.add(hullMesh, cabinMesh, mastMesh);
            }
            recordGenerationPerf('chunkProps', {
                workerMs,
                applyMs: performance.now() - applyStartMs
            });
            return;
        }
    }

    if (treesEnabled) {
        buildTreeMeshesForLod(treeInstances, lodCfg, { 
            treeBillboardGeo, treeGroundGeo, treeTrunkGeo, treeTrunkMat, treeGroundMats, treeTypeConfigs, 
            terrainDebugSettings: ctx.terrainDebugSettings,
            getPooledInstancedMesh // Pass this through
        })
            .forEach((mesh) => chunkGroup.add(mesh));
    }

    // Default buildings
    if (!buildingsEnabled) {
        return;
    }
    for (const [buildingClass, entries] of Object.entries(buildingPositions)) {
        if (entries.length === 0) continue;
        const cfg = classConfigs[buildingClass];
        const buildingMat = lod === 0 ? detailedBuildingMats[cfg.style] : baseBuildingMat;
        const bldgMesh = getPooledInstancedMesh(baseBuildingGeo, buildingMat, entries.length, { colorable: true });
        const roofMesh = getPooledInstancedMesh(roofCapGeo, roofCapMat, entries.length, { colorable: true });
        const podiumMesh = cfg.podium ? getPooledInstancedMesh(podiumGeo, podiumMat, entries.length, { colorable: true }) : null;
        const spireMesh = cfg.spire ? getPooledInstancedMesh(spireGeo, spireMat, entries.length, { colorable: true }) : null;
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
    recordGenerationPerf('chunkProps', {
        workerMs,
        applyMs: performance.now() - applyStartMs
    });
}
        bldgMesh.instanceMatrix.needsUpdate = true;
        roofMesh.instanceMatrix.needsUpdate = true;
        if (podiumMesh) podiumMesh.instanceMatrix.needsUpdate = true;
        if (spireMesh) spireMesh.instanceMatrix.needsUpdate = true;
        if (hvacMesh) hvacMesh.instanceMatrix.needsUpdate = hvacIdx > 0;
        bldgMesh.instanceColor.needsUpdate = true;
        roofMesh.instanceColor.needsUpdate = true;
        chunkGroup.add(bldgMesh, roofMesh);
        if (podiumMesh) { podiumMesh.instanceColor.needsUpdate = true; chunkGroup.add(podiumMesh); }
        if (spireMesh) chunkGroup.add(spireMesh);
        if (hvacMesh && hvacIdx > 0) { hvacMesh.count = hvacIdx; chunkGroup.add(hvacMesh); }
    }

    if (lodCfg.enableBoats && boatPositions.length > 0) {
        const hullMesh = getPooledInstancedMesh(hullGeo, hullMat, boatPositions.length);
        const cabinMesh = getPooledInstancedMesh(cabinGeo, cabinMat, boatPositions.length);
        const mastMesh = getPooledInstancedMesh(mastGeo, mastMat, boatPositions.length);
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
        hullMesh.instanceMatrix.needsUpdate = true;
        cabinMesh.instanceMatrix.needsUpdate = true;
        mastMesh.instanceMatrix.needsUpdate = true;
        chunkGroup.add(hullMesh, cabinMesh, mastMesh);
    }
}
