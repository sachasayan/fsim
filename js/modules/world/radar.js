import * as THREE from 'three';
import { AIRPORT_CONFIG } from './config.js';
import { getAirportThresholds, resolveDistanceLod } from './LodSystem.js';

export function createRadarSystem({ scene, getTerrainHeight, lodSettings }) {
    const radarGroup = new THREE.Group();
    const radarX = -250;
    const radarZ = -450;
    const ty = getTerrainHeight(radarX, radarZ);

    const metalMat = new THREE.MeshStandardMaterial({ color: 0xbdc3c7, roughness: 0.3, metalness: 0.7 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.6, metalness: 0.4 });

    // Tower
    const towerGeo = new THREE.CylinderGeometry(1.5, 2.5, 12, 8);
    towerGeo.translate(0, 6, 0);
    const towerMesh = new THREE.Mesh(towerGeo, metalMat);
    towerMesh.castShadow = true;
    towerMesh.receiveShadow = true;
    radarGroup.add(towerMesh);

    // Rotating platform
    const platformGeo = new THREE.CylinderGeometry(3, 3, 1, 12);
    platformGeo.translate(0, 12.5, 0);
    const platformMesh = new THREE.Mesh(platformGeo, darkMat);
    radarGroup.add(platformMesh);

    // The Dish
    const dishGroup = new THREE.Group();
    dishGroup.position.y = 13.5;

    // Parabolic dish (half sphere flattened)
    const dishGeo = new THREE.SphereGeometry(6, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    dishGeo.scale(1, 0.4, 0.8);
    dishGeo.rotateX(Math.PI / 2);
    const dishMesh = new THREE.Mesh(dishGeo, metalMat);
    dishMesh.castShadow = true;
    dishGroup.add(dishMesh);

    // Support structure for dish
    const supportGeo = new THREE.BoxGeometry(1, 4, 1);
    supportGeo.translate(0, -2, 0);
    const supportMesh = new THREE.Mesh(supportGeo, darkMat);
    dishGroup.add(supportMesh);

    radarGroup.add(dishGroup);
    radarGroup.position.set(radarX, ty, radarZ);
    scene.add(radarGroup);
    let currentLOD = -1;

    function update(time) {
        // Rotate the dish
        dishGroup.rotation.y = time * 0.001 * 2; // 2 rad/s approx
    }

    function updateLOD(cameraPos, dist) {
        const [, , cullThreshold] = getAirportThresholds(lodSettings);
        currentLOD = resolveDistanceLod(dist, currentLOD, [cullThreshold], lodSettings.airport.distanceHysteresis);
        if (currentLOD === 1) {
            radarGroup.visible = false;
        } else {
            radarGroup.visible = true;
        }
    }

    function refreshTerrainAlignment() {
        radarGroup.position.set(radarX, getTerrainHeight(radarX, radarZ), radarZ);
    }

    return { radarGroup, update, updateLOD, refreshTerrainAlignment, position: new THREE.Vector3(radarX, 0, radarZ) };
}
