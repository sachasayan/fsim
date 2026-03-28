import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { AIRPORT_CONFIG } from './config';
import { getAirportThresholds, resolveDistanceLod } from './LodSystem';

type CreateHangarSystemArgs = {
    scene: THREE.Scene;
    getTerrainHeight: (x: number, z: number) => number;
    lodSettings: {
        airport: {
            distanceHysteresis: number;
            shadowHighDetailDistance: number;
            thresholds: {
                mid: number;
                low: number;
                cull: number;
            };
        };
    };
};

export function createHangarSystem({ scene, getTerrainHeight, lodSettings }: CreateHangarSystemArgs) {
    const towerX = AIRPORT_CONFIG.TOWER.x;
    const towerZ = AIRPORT_CONFIG.TOWER.z;
    const hangarGroup = new THREE.Group();

    const metalMat = new THREE.MeshStandardMaterial({ color: 0x95a5a6, roughness: 0.4, metalness: 0.8 });
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x7f8c8d, roughness: 0.9, metalness: 0.1 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.7, metalness: 0.2 });

    const proxyGroup = new THREE.Group();
    const highDetailGroup = new THREE.Group();
    hangarGroup.add(proxyGroup, highDetailGroup);

    const proxyGeos: THREE.BufferGeometry[] = [];

    function createHangar(x: number, z: number, angle: number) {
        const hGroup = new THREE.Group();
        const ty = getTerrainHeight(x, z);

        const width = 45;
        const height = 18;
        const depth = 35;

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

        const doorGeo = new THREE.PlaneGeometry(width * 0.8, height * 0.75);
        doorGeo.translate(0, height * 0.375, depth / 2 + 0.1);
        const doorMesh = new THREE.Mesh(doorGeo, doorMat);
        hGroup.add(doorMesh);

        hGroup.position.set(x, ty, z);
        hGroup.rotation.y = angle;
        highDetailGroup.add(hGroup);

        const pGeo = new THREE.BoxGeometry(width, height, depth);
        pGeo.translate(x, ty + height / 2, z);
        proxyGeos.push(pGeo);

        return hGroup;
    }

    AIRPORT_CONFIG.HANGARS.forEach((h) => {
        createHangar(h.x, h.z, THREE.MathUtils.degToRad(h.yawDeg));
    });

    const mergedProxyGeo = BufferGeometryUtils.mergeGeometries(proxyGeos);
    const proxyMesh = new THREE.Mesh(mergedProxyGeo, concreteMat);
    proxyGroup.add(proxyMesh);
    proxyGroup.visible = false;

    scene.add(hangarGroup);

    let currentLOD = -1;

    function updateLOD(_cameraPos: THREE.Vector3, dist: number) {
        const [, lowThreshold, cullThreshold] = getAirportThresholds(lodSettings);
        const newLOD = resolveDistanceLod(dist, currentLOD, [lowThreshold, cullThreshold], lodSettings.airport.distanceHysteresis);

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

            const castShadows = dist < lodSettings.airport.shadowHighDetailDistance;
            highDetailGroup.traverse((obj) => {
                if (obj instanceof THREE.Mesh) obj.castShadow = castShadows;
            });
        }
    }

    function refreshTerrainAlignment() {
        let hangarIndex = 0;
        for (const child of highDetailGroup.children) {
            const config = AIRPORT_CONFIG.HANGARS[hangarIndex];
            if (!config) break;
            child.position.set(config.x, getTerrainHeight(config.x, config.z), config.z);
            hangarIndex += 1;
        }

        proxyGeos.length = 0;
        for (const config of AIRPORT_CONFIG.HANGARS) {
            const width = 45;
            const height = 18;
            const depth = 35;
            const ty = getTerrainHeight(config.x, config.z);
            const pGeo = new THREE.BoxGeometry(width, height, depth);
            pGeo.translate(config.x, ty + height / 2, config.z);
            proxyGeos.push(pGeo);
        }
        proxyMesh.geometry.dispose();
        proxyMesh.geometry = BufferGeometryUtils.mergeGeometries(proxyGeos);
    }

    return {
        hangarGroup,
        updateLOD,
        refreshTerrainAlignment,
        position: new THREE.Vector3(towerX - 80, 0, towerZ)
    };
}
