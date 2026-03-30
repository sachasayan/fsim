// @ts-check

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

import { AIRPORT_CONFIG } from './config.js';
import { buildAirportDescriptor, listRuntimeAirports, transformAirportPoint } from './AirportLayout.js';
import { getAirportThresholds, resolveDistanceLod } from './LodSystem.js';
import {
    getRunwayLightShaderDescriptor
} from './shaders/RunwayOwnedShaderSource.js';
import { applyOwnedShaderDescriptor } from './shaders/ShaderDescriptor.js';

/**
 * @typedef AirportSystemLodSettings
 * @property {{
 *   distanceHysteresis: number,
 *   thresholds: { mid: number, low: number, cull: number }
 * }} airport
 */

/**
 * @typedef AirportSystemArgs
 * @property {THREE.Scene} scene
 * @property {THREE.WebGLRenderer} renderer
 * @property {(x: number, z: number) => number} getTerrainHeight
 * @property {AirportSystemLodSettings} lodSettings
 */

function getRuntimeWorldData() {
    if (typeof window === 'undefined') return null;
    return (window as AirportRuntimeWindow).fsimWorld || null;
}

function buildRuntimeAirportDescriptors() {
    return listRuntimeAirports(getRuntimeWorldData()).map((airport) => buildAirportDescriptor(airport));
}

/**
 * @param {AirportSystemArgs} args
 */
export function createAirportSystem({ scene, renderer, getTerrainHeight, lodSettings }) {
    const RUNWAY_LIGHT_SIZE_SCALE = 0.5;
    const RUNWAY_LIGHT_GLOW_SCALE = 0.28;
    const RUNWAY_LIGHT_STROBE_SCALE = 0.32;
    const airportRoot = new THREE.Group();
    airportRoot.name = 'Airports';
    scene.add(airportRoot);

    const runwayCanvas = document.createElement('canvas');
    runwayCanvas.width = 1024;
    runwayCanvas.height = 4096;
    const runwayCtx = runwayCanvas.getContext('2d');
    if (!runwayCtx) {
        throw new Error('Failed to create airport runway canvas context');
    }
    runwayCtx.fillStyle = '#30343b';
    runwayCtx.fillRect(0, 0, 1024, 4096);
    for (let i = 0; i < 15000; i += 1) {
        runwayCtx.fillStyle = Math.random() > 0.5 ? '#434a53' : '#2a3038';
        runwayCtx.fillRect(Math.random() * 1024, Math.random() * 4096, 2, 2);
    }
    runwayCtx.fillStyle = '#ffffff';
    for (let y = 0; y < 4096; y += 128) {
        runwayCtx.fillRect(504, y, 16, 64);
    }
    runwayCtx.fillRect(100, 0, 16, 4096);
    runwayCtx.fillRect(908, 0, 16, 4096);
    for (let i = 0; i < 8; i += 1) {
        runwayCtx.fillRect(150 + i * 40, 50, 20, 150);
        runwayCtx.fillRect(570 + i * 40, 50, 20, 150);
        runwayCtx.fillRect(150 + i * 40, 3896, 20, 150);
        runwayCtx.fillRect(570 + i * 40, 3896, 20, 150);
    }
    runwayCtx.fillRect(220, 700, 90, 500);
    runwayCtx.fillRect(715, 700, 90, 500);
    runwayCtx.fillRect(220, 4096 - 1200, 90, 500);
    runwayCtx.fillRect(715, 4096 - 1200, 90, 500);
    runwayCtx.font = 'bold 300px Arial';
    runwayCtx.textAlign = 'center';
    runwayCtx.save();
    runwayCtx.translate(512, 450);
    runwayCtx.rotate(Math.PI);
    runwayCtx.fillText('18', 0, 0);
    runwayCtx.restore();
    runwayCtx.fillText('36', 512, 4096 - 450);

    const runwayTex = new THREE.CanvasTexture(runwayCanvas);
    const anisotropy = renderer.capabilities.getMaxAnisotropy();
    runwayTex.anisotropy = anisotropy;
    runwayTex.wrapS = THREE.ClampToEdgeWrapping;
    runwayTex.wrapT = THREE.RepeatWrapping;
    runwayTex.colorSpace = THREE.SRGBColorSpace;
    const runwayMat = new THREE.MeshStandardMaterial({
        map: runwayTex,
        roughness: 0.92,
        metalness: 0.0,
        envMapIntensity: 0.32
    });

    const apronCanvas = document.createElement('canvas');
    apronCanvas.width = 512;
    apronCanvas.height = 512;
    const apronCtx = apronCanvas.getContext('2d');
    if (!apronCtx) {
        throw new Error('Failed to create airport apron canvas context');
    }
    apronCtx.fillStyle = '#3c4149';
    apronCtx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 8000; i += 1) {
        apronCtx.fillStyle = Math.random() > 0.5 ? '#4a515a' : '#2e343c';
        apronCtx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }
    apronCtx.strokeStyle = 'rgba(20, 22, 25, 0.4)';
    apronCtx.lineWidth = 1;
    for (let i = 0; i <= 512; i += 64) {
        apronCtx.beginPath();
        apronCtx.moveTo(i, 0);
        apronCtx.lineTo(i, 512);
        apronCtx.stroke();
        apronCtx.beginPath();
        apronCtx.moveTo(0, i);
        apronCtx.lineTo(512, i);
        apronCtx.stroke();
    }
    const apronTex = new THREE.CanvasTexture(apronCanvas);
    apronTex.anisotropy = anisotropy;
    apronTex.wrapS = THREE.RepeatWrapping;
    apronTex.wrapT = THREE.RepeatWrapping;
    apronTex.repeat.set(4, 5);
    apronTex.colorSpace = THREE.SRGBColorSpace;
    const apronMat = new THREE.MeshStandardMaterial({
        map: apronTex,
        roughness: 0.88,
        metalness: 0.0,
        envMapIntensity: 0.3
    });

    const metalMat = new THREE.MeshStandardMaterial({ color: 0x95a5a6, roughness: 0.4, metalness: 0.8 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.7, metalness: 0.2 });
    const radarMetalMat = new THREE.MeshStandardMaterial({ color: 0xbdc3c7, roughness: 0.3, metalness: 0.7 });
    const radarDarkMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.6, metalness: 0.4 });

    const strobeColorOn = new THREE.Color(0xffffff);
    const strobeColorOff = new THREE.Color(0x111111);
    const alsStrobes = [];
    let warmupLightMaterial = null;

    function createInstancedLightMaterial(baseEmissive, intensity) {
        const material = new THREE.MeshBasicMaterial({ color: baseEmissive });
        applyOwnedShaderDescriptor(material, getRunwayLightShaderDescriptor({ intensity }));
        return material;
    }

    /**
     * @param {ReturnType<typeof buildAirportDescriptor>} airport
     */
    function createAirportInstance(airport) {
        const root = new THREE.Group();
        root.position.set(airport.x, 0, airport.z);
        root.rotation.y = THREE.MathUtils.degToRad(airport.yaw || 0);
        airportRoot.add(root);

        const runwayGroup = new THREE.Group();
        const NUM_SEGMENTS = 10;
        const segmentLength = AIRPORT_CONFIG.RUNWAY.length / NUM_SEGMENTS;
        for (let index = 0; index < NUM_SEGMENTS; index += 1) {
            const segGeo = new THREE.PlaneGeometry(AIRPORT_CONFIG.RUNWAY.width, segmentLength);
            const uv = segGeo.attributes.uv;
            const vTop = 1 - (index / NUM_SEGMENTS);
            const vBottom = 1 - ((index + 1) / NUM_SEGMENTS);
            for (let uvIndex = 0; uvIndex < uv.count; uvIndex += 1) {
                uv.setY(uvIndex, uv.getY(uvIndex) > 0.5 ? vTop : vBottom);
            }
            const mesh = new THREE.Mesh(segGeo, runwayMat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(0, 0.2, -AIRPORT_CONFIG.RUNWAY.length * 0.5 + segmentLength * 0.5 + index * segmentLength);
            mesh.receiveShadow = true;
            runwayGroup.add(mesh);
        }
        root.add(runwayGroup);

        const lightGroup = new THREE.Group();
        const dummy = new THREE.Object3D();
        const lightGeo = new THREE.SphereGeometry(0.5 * RUNWAY_LIGHT_SIZE_SCALE, 4, 4);
        const lightBaseGeo = new THREE.CylinderGeometry(0.24 * RUNWAY_LIGHT_SIZE_SCALE, 0.24 * RUNWAY_LIGHT_SIZE_SCALE, 0.28 * RUNWAY_LIGHT_SIZE_SCALE, 8);
        const poleGeo = new THREE.CylinderGeometry(0.15, 0.15, 1);
        const centerMat = createInstancedLightMaterial(0xffffff, 30 * RUNWAY_LIGHT_GLOW_SCALE);
        const alsWhiteMat = createInstancedLightMaterial(0xffffee, 50 * RUNWAY_LIGHT_GLOW_SCALE);
        const strobeMat = createInstancedLightMaterial(0xffffff, 180 * RUNWAY_LIGHT_STROBE_SCALE);
        warmupLightMaterial = centerMat;
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x252525, roughness: 0.9 });
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
        const centerCount = Math.floor(AIRPORT_CONFIG.RUNWAY.length / 100) + 1;
        const centerMesh = new THREE.InstancedMesh(lightGeo, centerMat, centerCount);
        const baseMesh = new THREE.InstancedMesh(lightBaseGeo, baseMat, centerCount);
        let centerIdx = 0;
        let baseIdx = 0;
        for (let z = -AIRPORT_CONFIG.RUNWAY.length * 0.5; z <= AIRPORT_CONFIG.RUNWAY.length * 0.5; z += 100) {
            dummy.position.set(0, 0.1 * RUNWAY_LIGHT_SIZE_SCALE, z);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            centerMesh.setMatrixAt(centerIdx, dummy.matrix);
            centerIdx += 1;
            dummy.position.set(0, -0.16 * RUNWAY_LIGHT_SIZE_SCALE, z);
            dummy.updateMatrix();
            baseMesh.setMatrixAt(baseIdx, dummy.matrix);
            baseIdx += 1;
        }
        centerMesh.instanceMatrix.needsUpdate = true;
        baseMesh.instanceMatrix.needsUpdate = true;
        lightGroup.add(centerMesh, baseMesh);

        const alsWhiteMesh = new THREE.InstancedMesh(lightGeo, alsWhiteMat, 400);
        const strobeMesh = new THREE.InstancedMesh(lightGeo, strobeMat, 40);
        const poleMesh = new THREE.InstancedMesh(poleGeo, poleMat, 100);
        let alsWhiteIdx = 0;
        let strobeIdx = 0;
        let poleIdx = 0;
        function buildAls(thresholdZ, direction) {
            for (let dist = 30; dist <= 900; dist += 30) {
                const localZ = thresholdZ + dist * direction;
                const worldPoint = transformAirportPoint(airport, 0, localZ);
                const terrainY = getTerrainHeight(worldPoint.x, worldPoint.z);
                const rowY = terrainY + 1.5;
                if (rowY - terrainY > 0.1) {
                    dummy.position.set(0, terrainY + (rowY - terrainY) * 0.5, localZ);
                    dummy.scale.set(1, rowY - terrainY, 1);
                    dummy.updateMatrix();
                    poleMesh.setMatrixAt(poleIdx, dummy.matrix);
                    poleIdx += 1;
                }
                for (let x = -6; x <= 6; x += 3) {
                    dummy.position.set(x, rowY, localZ);
                    dummy.scale.set(1.5 * RUNWAY_LIGHT_SIZE_SCALE, 1.5 * RUNWAY_LIGHT_SIZE_SCALE, 1.5 * RUNWAY_LIGHT_SIZE_SCALE);
                    dummy.updateMatrix();
                    alsWhiteMesh.setMatrixAt(alsWhiteIdx, dummy.matrix);
                    alsWhiteIdx += 1;
                }
                if (Math.abs(dist - 300) <= 15) {
                    for (let x = -24; x <= 24; x += 3) {
                        if (Math.abs(x) <= 6) continue;
                        dummy.position.set(x, rowY, localZ);
                        dummy.scale.set(1.5 * RUNWAY_LIGHT_SIZE_SCALE, 1.5 * RUNWAY_LIGHT_SIZE_SCALE, 1.5 * RUNWAY_LIGHT_SIZE_SCALE);
                        dummy.updateMatrix();
                        alsWhiteMesh.setMatrixAt(alsWhiteIdx, dummy.matrix);
                        alsWhiteIdx += 1;
                    }
                }
                if (dist > 300) {
                    dummy.position.set(0, rowY + 0.5 * RUNWAY_LIGHT_SIZE_SCALE, localZ);
                    dummy.scale.set(3 * RUNWAY_LIGHT_SIZE_SCALE, 3 * RUNWAY_LIGHT_SIZE_SCALE, 3 * RUNWAY_LIGHT_SIZE_SCALE);
                    dummy.updateMatrix();
                    strobeMesh.setMatrixAt(strobeIdx, dummy.matrix);
                    strobeMesh.setColorAt(strobeIdx, strobeColorOff);
                    alsStrobes.push({ mesh: strobeMesh, index: strobeIdx, dist, dir: direction });
                    strobeIdx += 1;
                }
            }
        }
        buildAls(AIRPORT_CONFIG.RUNWAY.length * 0.5 - 50, 1);
        buildAls(-(AIRPORT_CONFIG.RUNWAY.length * 0.5 - 50), -1);
        alsWhiteMesh.count = alsWhiteIdx;
        strobeMesh.count = strobeIdx;
        poleMesh.count = poleIdx;
        alsWhiteMesh.instanceMatrix.needsUpdate = true;
        strobeMesh.instanceMatrix.needsUpdate = true;
        poleMesh.instanceMatrix.needsUpdate = true;
        if (strobeMesh.instanceColor) strobeMesh.instanceColor.needsUpdate = true;
        lightGroup.add(alsWhiteMesh, strobeMesh, poleMesh);
        root.add(lightGroup);

        const apronMesh = new THREE.Mesh(new THREE.PlaneGeometry(AIRPORT_CONFIG.APRON.width, AIRPORT_CONFIG.APRON.depth), apronMat);
        apronMesh.rotation.x = -Math.PI / 2;
        const apronWorld = transformAirportPoint(airport, AIRPORT_CONFIG.APRON.x, AIRPORT_CONFIG.APRON.z);
        apronMesh.position.set(AIRPORT_CONFIG.APRON.x, getTerrainHeight(apronWorld.x, apronWorld.z) + 0.15, AIRPORT_CONFIG.APRON.z);
        apronMesh.receiveShadow = true;
        root.add(apronMesh);

        const hangarGroup = new THREE.Group();
        const hangarInstances = [];
        for (const hangar of AIRPORT_CONFIG.HANGARS) {
            const group = new THREE.Group();
            const worldPoint = transformAirportPoint(airport, hangar.x, hangar.z);
            const height = getTerrainHeight(worldPoint.x, worldPoint.z);
            const width = 45;
            const hangarHeight = 18;
            const depth = 35;
            const bodyGeo = new THREE.BoxGeometry(width, hangarHeight * 0.6, depth);
            bodyGeo.translate(0, hangarHeight * 0.3, 0);
            const roofGeoHangar = new THREE.CylinderGeometry(width / 2, width / 2, depth, 12, 1, false, 0, Math.PI);
            roofGeoHangar.rotateZ(Math.PI / 2);
            roofGeoHangar.rotateY(Math.PI / 2);
            roofGeoHangar.translate(0, hangarHeight * 0.6, 0);
            const bodyMesh = new THREE.Mesh(BufferGeometryUtils.mergeGeometries([bodyGeo, roofGeoHangar]), metalMat);
            bodyMesh.castShadow = true;
            bodyMesh.receiveShadow = true;
            group.add(bodyMesh);
            const doorGeo = new THREE.PlaneGeometry(width * 0.8, hangarHeight * 0.75);
            doorGeo.translate(0, hangarHeight * 0.375, depth / 2 + 0.1);
            group.add(new THREE.Mesh(doorGeo, doorMat));
            group.position.set(hangar.x, height, hangar.z);
            group.rotation.y = THREE.MathUtils.degToRad(hangar.yawDeg || 0);
            hangarGroup.add(group);
            hangarInstances.push(group);
        }
        root.add(hangarGroup);

        const radarGroup = new THREE.Group();
        const radarWorld = transformAirportPoint(airport, AIRPORT_CONFIG.RADAR.x, AIRPORT_CONFIG.RADAR.z);
        const radarY = getTerrainHeight(radarWorld.x, radarWorld.z);
        const radarTowerGeo = new THREE.CylinderGeometry(1.5, 2.5, 12, 8);
        radarTowerGeo.translate(0, 6, 0);
        const radarTowerMesh = new THREE.Mesh(radarTowerGeo, radarMetalMat);
        radarTowerMesh.castShadow = true;
        radarTowerMesh.receiveShadow = true;
        radarGroup.add(radarTowerMesh);
        const platformGeoRadar = new THREE.CylinderGeometry(3, 3, 1, 12);
        platformGeoRadar.translate(0, 12.5, 0);
        radarGroup.add(new THREE.Mesh(platformGeoRadar, radarDarkMat));
        const dishGroup = new THREE.Group();
        dishGroup.position.y = 13.5;
        const dishGeo = new THREE.SphereGeometry(6, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        dishGeo.scale(1, 0.4, 0.8);
        dishGeo.rotateX(Math.PI / 2);
        const dishMesh = new THREE.Mesh(dishGeo, radarMetalMat);
        dishMesh.castShadow = true;
        dishGroup.add(dishMesh);
        const supportGeo = new THREE.BoxGeometry(1, 4, 1);
        supportGeo.translate(0, -2, 0);
        dishGroup.add(new THREE.Mesh(supportGeo, radarDarkMat));
        radarGroup.add(dishGroup);
        radarGroup.position.set(AIRPORT_CONFIG.RADAR.x, radarY, AIRPORT_CONFIG.RADAR.z);
        root.add(radarGroup);

        return {
            airport,
            root,
            runwayGroup,
            lightGroup,
            apronMesh,
            hangarGroup,
            hangarInstances,
            radarGroup,
            dishGroup,
            currentLod: -1
        };
    }

    const instances = new Map();

    function syncAirports() {
        const nextDescriptors = buildRuntimeAirportDescriptors();
        alsStrobes.length = 0;
        for (const [id, instance] of instances.entries()) {
            airportRoot.remove(instance.root);
        }
        instances.clear();
        for (const descriptor of nextDescriptors) {
            instances.set(descriptor.id, createAirportInstance(descriptor));
        }
    }

    function refreshTerrainAlignment() {
        for (const instance of instances.values()) {
            const airport = instance.airport;
            const apronWorld = transformAirportPoint(airport, AIRPORT_CONFIG.APRON.x, AIRPORT_CONFIG.APRON.z);
            instance.apronMesh.position.y = getTerrainHeight(apronWorld.x, apronWorld.z) + 0.15;
            let hangarIndex = 0;
            for (const child of instance.hangarInstances) {
                const hangar = AIRPORT_CONFIG.HANGARS[hangarIndex];
                const worldPoint = transformAirportPoint(airport, hangar.x, hangar.z);
                child.position.y = getTerrainHeight(worldPoint.x, worldPoint.z);
                hangarIndex += 1;
            }
            const radarWorld = transformAirportPoint(airport, AIRPORT_CONFIG.RADAR.x, AIRPORT_CONFIG.RADAR.z);
            instance.radarGroup.position.y = getTerrainHeight(radarWorld.x, radarWorld.z);
        }
    }

    /**
     * @param {THREE.Vector3} cameraPos
     */
    function updateLOD(cameraPos) {
        const thresholds = getAirportThresholds(lodSettings);
        const [, lowThreshold, cullThreshold] = thresholds;
        for (const instance of instances.values()) {
            const dist = cameraPos.distanceTo(new THREE.Vector3(instance.airport.x, 0, instance.airport.z));
            const newLod = resolveDistanceLod(dist, instance.currentLod, [lowThreshold, cullThreshold], lodSettings.airport.distanceHysteresis);
            instance.currentLod = newLod;
            if (newLod === 2) {
                instance.lightGroup.visible = false;
                instance.root.visible = true;
                instance.hangarGroup.visible = false;
            } else {
                instance.root.visible = true;
                instance.lightGroup.visible = true;
                instance.hangarGroup.visible = true;
            }
        }
    }

    function update(time) {
        for (const instance of instances.values()) {
            instance.dishGroup.rotation.y = time * 0.001 * 2;
        }
    }

    function getShaderValidationVariants() {
        return [
            {
                id: 'runway-surface',
                metadata: { system: 'runway', variant: 'surface' },
                build() {
                    const runwayGeo = new THREE.PlaneGeometry(100, 400);
                    runwayGeo.rotateX(-Math.PI / 2);
                    const runwayMesh = new THREE.Mesh(runwayGeo, runwayMat);
                    runwayMesh.position.set(0, 0.2, 0);
                    runwayMesh.updateMatrixWorld(true);
                    return {
                        objects: [runwayMesh],
                        dispose() {
                            runwayGeo.dispose();
                        }
                    };
                }
            },
            {
                id: 'runway-light',
                metadata: { system: 'runway', variant: 'light' },
                build() {
                    const lightGeo = new THREE.SphereGeometry(1, 4, 4);
                    const warmupDummy = new THREE.Object3D();
                    const lightMesh = new THREE.InstancedMesh(lightGeo, warmupLightMaterial, 1);
                    warmupDummy.position.set(0, 2, 0);
                    warmupDummy.scale.set(1.5, 1.5, 1.5);
                    warmupDummy.updateMatrix();
                    lightMesh.setMatrixAt(0, warmupDummy.matrix);
                    lightMesh.setColorAt(0, new THREE.Color(0xffffff));
                    lightMesh.instanceMatrix.needsUpdate = true;
                    if (lightMesh.instanceColor) lightMesh.instanceColor.needsUpdate = true;
                    lightMesh.updateMatrixWorld(true);
                    return {
                        objects: [lightMesh],
                        dispose() {
                            lightGeo.dispose();
                        }
                    };
                }
            }
        ];
    }

    const handleWorldDataUpdated = () => {
        syncAirports();
        refreshTerrainAlignment();
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('fsim:world-metadata-updated', handleWorldDataUpdated);
    }
    handleWorldDataUpdated();

    return {
        alsStrobes,
        strobeColorOn,
        strobeColorOff,
        update,
        updateLOD,
        refreshTerrainAlignment,
        position: new THREE.Vector3(),
        getShaderValidationVariants
    };
}
type AirportRuntimeWindow = Window & typeof globalThis & {
    fsimWorld?: unknown;
};
