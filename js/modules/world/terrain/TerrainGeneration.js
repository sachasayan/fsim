import * as THREE from 'three';
import { fetchCityIndex, loadCityChunk, getCityAtPoint, CLASS_NAMES } from './CityChunkLoader.js';
import { setupTerrainMaterial } from './TerrainMaterials.js';

export const CHUNK_SIZE = 4000;
export const TREE_DENSITY_MULTIPLIER = 4.0;

// Lazily fetched city index (array of {id, cx, cz, radius})
let _cityIndex = null;
async function getCityIndex() {
    if (!_cityIndex) _cityIndex = await fetchCityIndex();
    return _cityIndex;
}

// Radius inflation so a chunk just outside a city boundary still loads its data
const CITY_CHUNK_MARGIN = CHUNK_SIZE * 0.75;

const maxWorkers = navigator.hardwareConcurrency ? Math.min(navigator.hardwareConcurrency, 4) : 2;
const workers = [];
for (let i = 0; i < maxWorkers; i++) {
    workers.push(new Worker(new URL('./TerrainWorker.js', import.meta.url), { type: 'module' }));
}
let workerIdx = 0;
let jobIdCounter = 0;
const pendingJobs = new Map();

for (const worker of workers) {
    worker.onmessage = (e) => {
        const { jobId, type, result, error } = e.data;
        if (pendingJobs.has(jobId)) {
            const { resolve, reject } = pendingJobs.get(jobId);
            pendingJobs.delete(jobId);
            if (error) reject(new Error(error));
            else resolve(result);
        }
    };
    worker.onerror = (e) => console.error("TerrainWorker Error: ", e);
}

function dispatchWorker(type, payload, transferables = []) {
    return new Promise((resolve, reject) => {
        const jobId = jobIdCounter++;
        const timeout = setTimeout(() => {
            if (pendingJobs.has(jobId)) {
                pendingJobs.delete(jobId);
                reject(new Error(`Worker job ${type} timed out after 60s`));
            }
        }, 60000);

        pendingJobs.set(jobId, {
            resolve: (res) => { clearTimeout(timeout); resolve(res); },
            reject: (err) => { clearTimeout(timeout); reject(err); }
        });

        const worker = workers[workerIdx];
        workerIdx = (workerIdx + 1) % workers.length;
        worker.postMessage({ type, payload, jobId }, transferables);
    });
}

const classConfigs = {
    supertall: {
        style: 'commercial',
        height: [180, 380],
        width: [24, 42],
        depth: [24, 42],
        colors: [0x1b2738, 0x111111, 0x202a36, 0x27364a],
        roof: [0x2d2d2d, 0x353535],
        podium: true,
        spire: true
    },
    highrise: {
        style: 'commercial',
        height: [80, 190],
        width: [18, 30],
        depth: [16, 28],
        colors: [0x34495e, 0x2c3e50, 0x4a6073, 0x3b4a59],
        roof: [0x3d3d3d, 0x4a4a4a],
        podium: true,
        spire: false
    },
    office: {
        style: 'commercial',
        height: [35, 90],
        width: [14, 26],
        depth: [12, 24],
        colors: [0x6e7b85, 0x7a7f89, 0x5e6970, 0x8a8f97],
        roof: [0x555555, 0x636363],
        podium: false,
        spire: false
    },
    apartment: {
        style: 'residential',
        height: [18, 48],
        width: [12, 20],
        depth: [10, 18],
        colors: [0xb6b1a5, 0x9f9a90, 0xc7c2b5, 0xa8a39a],
        roof: [0x6a5e50, 0x736857],
        podium: false,
        spire: false
    },
    townhouse: {
        style: 'residential',
        height: [8, 16],
        width: [7, 12],
        depth: [8, 13],
        colors: [0xe0d7cc, 0xd5cabf, 0xcbc0b3, 0xede4da],
        roof: [0x6a5035, 0x5a4731],
        podium: false,
        spire: false
    },
    industrial: {
        style: 'industrial',
        height: [10, 24],
        width: [18, 34],
        depth: [16, 30],
        colors: [0x8b8d8f, 0x7b7d7f, 0x6d7278, 0x9a9ca0],
        roof: [0x53575e, 0x454a52],
        podium: false,
        spire: false
    }
};

export async function generateChunkBase(cx, cz, lod, ctx) {
    const { LOD_LEVELS, chunkPools, terrainMaterial, terrainFarMaterial, waterMaterial, waterFarMaterial, scene } = ctx;
    const lodCfg = LOD_LEVELS[lod] || LOD_LEVELS[LOD_LEVELS.length - 1];
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
        terrainMesh = new THREE.Mesh(geometry, lod === 0 ? terrainMaterial : terrainFarMaterial);
        terrainMesh.receiveShadow = true;
        chunkGroup.add(terrainMesh);

        const waterGeo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, lodCfg.waterRes, lodCfg.waterRes);
        waterGeo.rotateX(-Math.PI / 2);
        waterGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(waterGeo.attributes.position.count * 3), 3));
        waterMesh = new THREE.Mesh(waterGeo, lod === 0 ? waterMaterial : waterFarMaterial);
        waterMesh.receiveShadow = true;
        chunkGroup.add(waterMesh);
    }

    chunkGroup.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    chunkGroup.userData.lod = lod;
    chunkGroup.userData.chunkKey = `${cx},${cz}`;

    const tGeo = terrainMesh.geometry;
    const wGeo = waterMesh.geometry;

    const tPos = tGeo.attributes.position.array;
    const tCol = tGeo.attributes.color.array;
    const wPos = wGeo.attributes.position.array;
    const wCol = wGeo.attributes.color.array;

    const payload = {
        cx, cz, lodCfg,
        positions: tPos.slice(),
        colors: new Float32Array(tCol.length),
        wPos: wPos.slice(),
        wCols: new Float32Array(wCol.length)
    };

    const transferables = [
        payload.positions.buffer,
        payload.colors.buffer,
        payload.wPos.buffer,
        payload.wCols.buffer
    ];

    const result = await dispatchWorker('chunkBase', payload, transferables);

    // After async return, ensure chunk wasn't repurposed or disposed
    if (chunkGroup.userData.chunkKey !== `${cx},${cz}`) {
        return chunkGroup;
    }

    tGeo.attributes.position.array.set(result.positions);
    tGeo.attributes.position.needsUpdate = true;
    tGeo.attributes.color.array.set(result.colors);
    tGeo.attributes.color.needsUpdate = true;
    tGeo.computeVertexNormals();

    wGeo.attributes.position.array.set(result.wPos);
    wGeo.attributes.position.needsUpdate = true;
    wGeo.attributes.color.array.set(result.wCols);
    wGeo.attributes.color.needsUpdate = true;
    wGeo.computeVertexNormals();

    // Do not add to scene yet, await props generation in terrain.js
    return chunkGroup;
}

// Simple deterministic hash matching what's in utils if needed, or we just trust the arrays matching
function hash2Local(seed, k, p) {
    const n = Math.sin(seed * 127.1 + k * 311.7 + p * 74.7) * 43758.5453123;
    return n - Math.floor(n);
}

/**
 * Determine if a terrain chunk (cx, cz) overlaps any pre-compiled city zone.
 * Returns the matching city entry or null.
 */
export async function getOverlappingCity(cx, cz) {
    const cityIndex = await getCityIndex();
    if (!cityIndex || cityIndex.length === 0) return null;
    // Chunk world-space centre
    const chunkCX = cx * CHUNK_SIZE;
    const chunkCZ = cz * CHUNK_SIZE;
    for (const city of cityIndex) {
        const dx = chunkCX - city.cx, dz = chunkCZ - city.cz;
        const distSq = dx * dx + dz * dz;
        const threshold = city.radius + CITY_CHUNK_MARGIN;
        if (distSq < threshold * threshold) return city;
    }
    return null;
}

/**
 * Spawn city buildings from pre-compiled binary data into the given chunk group.
 * Only installs buildings whose world position falls within this chunk's AABB.
 */
export function spawnCityBuildingsForChunk(chunkGroup, cx, cz, cityData, lod, ctx) {
    const {
        detailedBuildingMats, baseBuildingMat, baseBuildingGeo,
        roofCapGeo, roofCapMat, podiumGeo, podiumMat, spireGeo, spireMat,
        hvacGeo, hvacMat, getPooledInstancedMesh, dummy
    } = ctx;

    const halfChunk = CHUNK_SIZE / 2;
    const minX = cx * CHUNK_SIZE - halfChunk, maxX = cx * CHUNK_SIZE + halfChunk;
    const minZ = cz * CHUNK_SIZE - halfChunk, maxZ = cz * CHUNK_SIZE + halfChunk;

    const key = `${cx},${cz}`;
    const buildingsInChunk = cityData.buildings[key] || [];

    const byClass = { supertall: [], highrise: [], office: [], apartment: [], townhouse: [], industrial: [] };
    for (const b of buildingsInChunk) {
        const className = CLASS_NAMES[b.classId] || 'office';
        byClass[className].push(b);
    }

    const buildingShadowsEnabled = lod === 0;

    for (const [buildingClass, entries] of Object.entries(byClass)) {
        if (entries.length === 0) continue;
        const cfg = classConfigs[buildingClass];
        if (!cfg) continue;
        const buildingMat = lod === 0 ? detailedBuildingMats[cfg.style] : baseBuildingMat;

        const bldgMesh = new THREE.InstancedMesh(baseBuildingGeo, buildingMat, entries.length);
        const roofMesh = new THREE.InstancedMesh(roofCapGeo, roofCapMat, entries.length);
        const podiumMesh = cfg.podium ? new THREE.InstancedMesh(podiumGeo, podiumMat, entries.length) : null;
        const spireMesh = cfg.spire ? new THREE.InstancedMesh(spireGeo, spireMat, entries.length) : null;

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
            const { x, y, z, w, h, d, angle, colorIdx } = bp;
            // Convert from local chunk space (binary stores world coords)
            const lx = x - cx * CHUNK_SIZE;
            const lz = z - cz * CHUNK_SIZE;

            dummy.position.set(lx, y, lz);
            dummy.rotation.set(0, angle, 0);
            dummy.scale.set(w, h, d);
            dummy.updateMatrix();
            bldgMesh.setMatrixAt(j, dummy.matrix);
            baseColor.setHex(cfg.colors[colorIdx % cfg.colors.length]);
            bldgMesh.setColorAt(j, baseColor);

            dummy.position.set(lx, y + h, lz);
            dummy.scale.set(w * 1.04, 1, d * 1.04);
            dummy.updateMatrix();
            roofMesh.setMatrixAt(j, dummy.matrix);
            roofColor.setHex(cfg.roof[colorIdx % cfg.roof.length]);
            roofMesh.setColorAt(j, roofColor);

            if (podiumMesh) {
                const podiumH = Math.max(5, h * 0.08);
                dummy.position.set(lx, y, lz);
                dummy.scale.set(w * 1.2, podiumH, d * 1.2);
                dummy.updateMatrix();
                podiumMesh.setMatrixAt(j, dummy.matrix);
                podiumColor.copy(baseColor).offsetHSL(0, 0, -0.06);
                podiumMesh.setColorAt(j, podiumColor);
            }
            if (spireMesh) {
                const spireH = 18 + (colorIdx / 4) * 32;
                dummy.position.set(lx, y + h, lz);
                dummy.scale.set(1.6, spireH, 1.6);
                dummy.updateMatrix();
                spireMesh.setMatrixAt(j, dummy.matrix);
            }
            if (hvacMesh) {
                const numHvacs = Math.floor(hash2Local(colorIdx, j, 0) * 4);
                for (let k = 0; k < numHvacs; k++) {
                    const hx = lx + (hash2Local(colorIdx, k, 1) - 0.5) * (w * 0.7);
                    const hz = lz + (hash2Local(colorIdx, k, 2) - 0.5) * (d * 0.7);
                    const size = 0.8 + hash2Local(colorIdx, k, 3) * 1.5;
                    const heightHVAC = 1.0 + hash2Local(colorIdx, k, 4) * 1.0;
                    const rot = hash2Local(colorIdx, k, 5) * Math.PI;
                    dummy.position.set(hx, y + h, hz);
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
    const terrainMesh = chunkGroup.children[0];
    if (!terrainMesh || !terrainMesh.geometry || !terrainMesh.geometry.attributes.position) return;
    const positions = terrainMesh.geometry.attributes.position.array;

    const payload = {
        cx, cz, lod, lodCfg,
        positions: positions.slice(),
        cityZones: _cityIndex || []  // embed current index (lightweight)
    };
    const transferables = [payload.positions.buffer];

    // Check city overlap BEFORE dispatching worker (fast async check)
    const overlappingCity = await getOverlappingCity(cx, cz);

    const result = await dispatchWorker('chunkProps', payload, transferables);

    // Ensure chunk wasn't disposed or repurposed while awaiting
    if (chunkGroup.userData.chunkKey !== `${cx},${cz}`) return;

    const { treeMatrices, buildingPositions, boatPositions } = result;

    // --- City chunk injection ---
    if (overlappingCity) {
        const cityData = await loadCityChunk(overlappingCity.id);
        if (cityData && chunkGroup.userData.chunkKey === `${cx},${cz}`) {
            // Suppress noise-based buildings for the city zone — roads/buildings come from binary
            spawnCityBuildingsForChunk(chunkGroup, cx, cz, cityData, lod, ctx);

            // Apply road mask shader to terrain
            if (cityData.roadMaskTexture && !chunkGroup.userData.hasCityMaterial) {
                const cityTerrainMat = lod === 0 ? ctx.terrainMaterial.clone() : ctx.terrainFarMaterial.clone();
                cityData.center = [overlappingCity.cx, overlappingCity.cz];
                cityData.maskRadius = overlappingCity.radius * 1.05;
                setupTerrainMaterial(cityTerrainMat, ctx.terrainDetailUniforms, ctx.atmosphereUniforms, lod !== 0, cityData);
                chunkGroup.children[0].material = cityTerrainMat;
                chunkGroup.userData.hasCityMaterial = true;
            }

            // Render trees from worker
            for (const [treeType, matrices] of Object.entries(treeMatrices)) {
                if (!matrices) continue;
                const count = matrices.length / 16;
                if (count === 0) continue;
                const cfg = treeTypeConfigs[treeType];
                const cardA = new THREE.InstancedMesh(treeBillboardGeo, cfg.mat, count);
                cardA.instanceMatrix.array.set(matrices);
                cardA.instanceMatrix.needsUpdate = true;
                cardA.castShadow = true;
                cardA.receiveShadow = false;
                cardA.customDepthMaterial = cfg.depthMat;
                chunkGroup.add(cardA);
            }

            // Render boats from worker
            if (lodCfg.enableBoats && boatPositions && boatPositions.length > 0) {
                const hullMesh = new THREE.InstancedMesh(hullGeo, hullMat, boatPositions.length);
                const cabinMesh = new THREE.InstancedMesh(cabinGeo, cabinMat, boatPositions.length);
                const mastMesh = new THREE.InstancedMesh(mastGeo, mastMat, boatPositions.length);
                hullMesh.castShadow = true; cabinMesh.castShadow = true; mastMesh.castShadow = true;

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

            return; // Done — city chunk handled
        }
    }

    for (const [treeType, matrices] of Object.entries(treeMatrices)) {
        if (!matrices) continue;
        const count = matrices.length / 16;
        if (count === 0) continue;

        const cfg = treeTypeConfigs[treeType];
        const cardA = new THREE.InstancedMesh(treeBillboardGeo, cfg.mat, count);

        cardA.instanceMatrix.array.set(matrices);
        cardA.instanceMatrix.needsUpdate = true;

        cardA.castShadow = true;
        cardA.receiveShadow = false;
        cardA.customDepthMaterial = cfg.depthMat;

        chunkGroup.add(cardA);
    }

    // Buildings
    for (const [buildingClass, entries] of Object.entries(buildingPositions)) {
        if (entries.length === 0) continue;
        const cfg = classConfigs[buildingClass];
        const buildingMat = lod === 0 ? detailedBuildingMats[cfg.style] : baseBuildingMat;
        const bldgMesh = new THREE.InstancedMesh(baseBuildingGeo, buildingMat, entries.length);
        const roofMesh = new THREE.InstancedMesh(roofCapGeo, roofCapMat, entries.length);
        const podiumMesh = cfg.podium ? new THREE.InstancedMesh(podiumGeo, podiumMat, entries.length) : null;
        const spireMesh = cfg.spire ? new THREE.InstancedMesh(spireGeo, spireMat, entries.length) : null;
        const buildingShadowsEnabled = lod === 0;

        let hvacMesh = null;
        let hvacIdx = 0;
        if (lod === 0) {
            hvacMesh = getPooledInstancedMesh(hvacGeo, hvacMat, entries.length * 3);
            hvacMesh.castShadow = true;
            hvacMesh.receiveShadow = true;
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
        hullMesh.castShadow = true; cabinMesh.castShadow = true; mastMesh.castShadow = true;

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
