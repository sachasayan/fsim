import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { AIRPORT_CONFIG } from './config.js';

export function createHangarSystem({ scene, getTerrainHeight }) {
    const hangarGroup = new THREE.Group();

    const metalMat = new THREE.MeshStandardMaterial({ color: 0x95a5a6, roughness: 0.4, metalness: 0.8 });
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x7f8c8d, roughness: 0.9, metalness: 0.1 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.7, metalness: 0.2 });

    const proxyGroup = new THREE.Group();
    const highDetailGroup = new THREE.Group();
    hangarGroup.add(proxyGroup, highDetailGroup);

    const proxyGeos = [];

    function createHangar(x, z, angle) {
        const hGroup = new THREE.Group();
        const ty = getTerrainHeight(x, z);

        const width = 45;
        const height = 18;
        const depth = 35;

        // Main body (arch-like or slanted roof)
        // We'll use a box for the base and a cylinder half for the roof
        const bodyGeo = new THREE.BoxGeometry(width, height * 0.6, depth);
        bodyGeo.translate(0, height * 0.3, 0);

        const roofGeo = new THREE.CylinderGeometry(width / 2, width / 2, depth, 12, 1, false, 0, Math.PI);
        roofGeo.rotateZ(Math.PI / 2);
        roofGeo.rotateY(Math.PI / 2);
        roofGeo.translate(0, height * 0.6, 0);

        const mergedMetalGeo = BufferGeometryUtils.mergeGeometries([bodyGeo, roofGeo]);
        const bodyMesh = new THREE.Mesh(mergedMetalGeo, metalMat);
        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true;
        hGroup.add(bodyMesh);

        // Door (on one of the wide sides)
        const doorGeo = new THREE.PlaneGeometry(width * 0.8, height * 0.75);
        doorGeo.translate(0, height * 0.375, depth / 2 + 0.1);
        const doorMesh = new THREE.Mesh(doorGeo, doorMat);
        hGroup.add(doorMesh);

        hGroup.position.set(x, ty, z);
        hGroup.rotation.y = angle;
        highDetailGroup.add(hGroup);

        // Build proxy geometry data
        const pGeo = new THREE.BoxGeometry(width, height, depth);
        pGeo.translate(x, ty + height / 2, z);
        // Minimal rotation for proxy (could be improved if hangars weren't all 90deg)
        // Since they are all PI/2, we can just swap width/depth if needed, 
        // but for now a block is fine.
        proxyGeos.push(pGeo);

        return hGroup;
    }

    // Use centralized hangar placement from config
    AIRPORT_CONFIG.HANGARS.forEach(h => {
        createHangar(h.x, h.z, h.angle);
    });

    const mergedProxyGeo = BufferGeometryUtils.mergeGeometries(proxyGeos);
    const proxyMesh = new THREE.Mesh(mergedProxyGeo, concreteMat);
    proxyGroup.add(proxyMesh);
    proxyGroup.visible = false;

    scene.add(hangarGroup);

    let currentLOD = -1;

    function updateLOD(cameraPos, dist) {
        let newLOD = 0;
        if (dist > AIRPORT_CONFIG.LOD.CULL) newLOD = 2; // Cull
        else if (dist > AIRPORT_CONFIG.LOD.LOW) newLOD = 1; // Proxy
        else newLOD = 0; // High detail

        if (newLOD === currentLOD) return;
        currentLOD = newLOD;

        if (newLOD === 2) {
            hangarGroup.visible = false;
            return;
        }

        hangarGroup.visible = true;

        if (newLOD === 1) {
            highDetailGroup.visible = false;
            proxyGroup.visible = true;
        } else {
            proxyGroup.visible = false;
            highDetailGroup.visible = true;

            // Optional: Toggle shadows based on distance within high detail range
            const castShadows = dist < 10000;
            highDetailGroup.traverse((obj) => {
                if (obj.isMesh) obj.castShadow = castShadows;
            });
        }
    }

    return { hangarGroup, updateLOD, position: new THREE.Vector3(towerX - 80, 0, towerZ) };
}
