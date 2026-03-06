import * as THREE from 'three';
import { CLASS_NAMES } from './CityChunkLoader.js';
import { hash2Local } from './TerrainUtils.js';

export const classConfigs = {
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

/**
 * Spawn city buildings from pre-compiled binary data into the given chunk group.
 * Only installs buildings whose world position falls within this chunk's AABB.
 */
export function spawnCityBuildingsForChunk(chunkGroup, cx, cz, cityData, lod, ctx, CHUNK_SIZE) {
    const {
        detailedBuildingMats, baseBuildingMat, baseBuildingGeo,
        roofCapGeo, roofCapMat, podiumGeo, podiumMat, spireGeo, spireMat,
        hvacGeo, hvacMat, getPooledInstancedMesh, dummy
    } = ctx;

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
