import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export function createHangarSystem({ scene, getTerrainHeight }) {
    const hangarGroup = new THREE.Group();

    const metalMat = new THREE.MeshStandardMaterial({ color: 0x95a5a6, roughness: 0.4, metalness: 0.8 });
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x7f8c8d, roughness: 0.9, metalness: 0.1 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.7, metalness: 0.2 });

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
        hangarGroup.add(hGroup);
        return hGroup;
    }

    // Line hangars up with the tower in a row along the runway
    const towerX = -190;
    const towerZ = -300;

    // Place hangars in a row starting further north of the taxiway connection (-400)
    createHangar(towerX, towerZ - 180, Math.PI / 2);
    createHangar(towerX, towerZ - 260, Math.PI / 2);
    createHangar(towerX, towerZ - 340, Math.PI / 2);

    scene.add(hangarGroup);

    function updateLOD(cameraPos, dist) {
        if (dist > 30000) {
            hangarGroup.visible = false;
        } else {
            hangarGroup.visible = true;
            // Far away, we could disable shadows if needed
            const castShadows = dist < 10000;
            hangarGroup.traverse((obj) => {
                if (obj.isMesh) obj.castShadow = castShadows;
            });
        }
    }

    return { hangarGroup, updateLOD, position: new THREE.Vector3(towerX - 80, 0, towerZ) };
}
