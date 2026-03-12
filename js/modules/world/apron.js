import * as THREE from 'three';
import { AIRPORT_CONFIG } from './config.js';
import { getAirportThresholds, resolveDistanceLod } from './LodSystem.js';

export function createApron({ scene, renderer, getTerrainHeight, lodSettings }) {
    const apronX = AIRPORT_CONFIG.APRON.x;
    const apronZ = AIRPORT_CONFIG.APRON.z;
    const width = AIRPORT_CONFIG.APRON.width;
    const depth = AIRPORT_CONFIG.APRON.depth;

    // Procedural texture similar to runway
    function createApronMesh() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Asphalt/Concrete base
        ctx.fillStyle = '#3c4149';
        ctx.fillRect(0, 0, 512, 512);

        // Noise
        for (let i = 0; i < 8000; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#4a515a' : '#2e343c';
            ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
        }

        // Cracks and expansion joints (grid-like for concrete feel)
        ctx.strokeStyle = 'rgba(20, 22, 25, 0.4)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 512; i += 64) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, 512);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(512, i);
            ctx.stroke();
        }

        const tex = new THREE.CanvasTexture(canvas);
        const anisotropy = renderer.capabilities.getMaxAnisotropy();
        tex.anisotropy = anisotropy;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(4, 5); // Tile the texture
        tex.colorSpace = THREE.SRGBColorSpace;

        const apronGeo = new THREE.PlaneGeometry(width, depth);
        const apronMat = new THREE.MeshStandardMaterial({
            map: tex,
            roughness: 0.88,
            metalness: 0.0,
            envMapIntensity: 0.3
        });

        const mesh = new THREE.Mesh(apronGeo, apronMat);
        mesh.rotation.x = -Math.PI / 2;

        // Slightly above terrain to avoid z-fighting
        const ty = getTerrainHeight(apronX, apronZ);
        mesh.position.set(apronX, ty + 0.15, apronZ);
        mesh.receiveShadow = true;

        scene.add(mesh);
        return mesh;
    }

    const apronMesh = createApronMesh();
    let currentLOD = -1;

    function updateLOD(cameraPos, dist) {
        const [, lowThreshold] = getAirportThresholds(lodSettings);
        currentLOD = resolveDistanceLod(dist, currentLOD, [lowThreshold], lodSettings.airport.distanceHysteresis);
        if (currentLOD === 1) {
            apronMesh.visible = false;
        } else {
            apronMesh.visible = true;
        }
    }

    return { apronMesh, updateLOD, position: new THREE.Vector3(apronX, 0, apronZ) };
}
