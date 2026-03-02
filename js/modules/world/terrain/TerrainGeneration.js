import * as THREE from 'three';

export const CHUNK_SIZE = 4000;
export const TREE_DENSITY_MULTIPLIER = 4.0;

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
        pendingJobs.set(jobId, { resolve, reject });
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
    const { LOD_LEVELS, chunkPools, terrainMaterial, terrainFarMaterial, waterMaterial, scene } = ctx;
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
        waterMesh = new THREE.Mesh(waterGeo, waterMaterial);
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

    // Check if the chunk group hasn't been disposed before adding
    if (!chunkGroup.parent && chunkGroup.userData.lod === lod) {
        scene.add(chunkGroup);
    }
    return chunkGroup;
}

// Simple deterministic hash matching what's in utils if needed, or we just trust the arrays matching
function hash2Local(seed, k, p) {
    const n = Math.sin(seed * 127.1 + k * 311.7 + p * 74.7) * 43758.5453123;
    return n - Math.floor(n);
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
        positions: positions.slice()
    };
    const transferables = [payload.positions.buffer];

    const result = await dispatchWorker('chunkProps', payload, transferables);

    // Ensure chunk wasn't disposed or repurposed while awaiting
    if (chunkGroup.userData.chunkKey !== `${cx},${cz}` || !chunkGroup.parent) return;

    const { treePositions, buildingPositions, boatPositions } = result;

    for (const [treeType, trees] of Object.entries(treePositions)) {
        if (trees.length === 0) continue;
        const cfg = treeTypeConfigs[treeType];
        const cardA = new THREE.InstancedMesh(treeBillboardGeo, cfg.mat, trees.length);
        const cardB = new THREE.InstancedMesh(treeBillboardGeo, cfg.mat, trees.length);
        cardA.castShadow = false; cardB.castShadow = false;
        cardA.receiveShadow = false; cardB.receiveShadow = false;

        for (let j = 0; j < trees.length; j++) {
            const tp = trees[j];
            const heading = tp.seed * Math.PI * 2;
            const treeHeight = cfg.hRange[0] + tp.seed * (cfg.hRange[1] - cfg.hRange[0]);
            const treeWidth = treeHeight * cfg.wScale * (0.92 + tp.seed2 * 0.3);

            dummy.position.set(tp.x, tp.y, tp.z);
            dummy.rotation.set(tp.lean * 0.5, heading, 0);
            dummy.scale.set(treeWidth, treeHeight, 1);
            dummy.updateMatrix();
            cardA.setMatrixAt(j, dummy.matrix);

            dummy.rotation.set(tp.lean * 0.5, heading + Math.PI * 0.5, 0);
            dummy.updateMatrix();
            cardB.setMatrixAt(j, dummy.matrix);
        }
        chunkGroup.add(cardA, cardB);
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
