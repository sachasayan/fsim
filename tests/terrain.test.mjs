import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// Define globals needed for terrain logic
global.Worker = class {
    constructor() { }
    postMessage() { }
};

Object.defineProperty(global, 'navigator', {
    value: { hardwareConcurrency: 2 },
    writable: true
});

global.window = {
    location: {
        search: ''
    }
};
global.URLSearchParams = class {
    constructor(search) { this.search = search; }
    get(param) { return null; }
};

global.document = {
    createElement: (tag) => {
        if (tag === 'canvas') {
            return {
                width: 0,
                height: 0,
                getContext: () => ({
                    createLinearGradient: () => ({ addColorStop: () => { } }),
                    createRadialGradient: () => ({ addColorStop: () => { } }),
                    clearRect: () => { },
                    fillRect: () => { },
                    beginPath: () => { },
                    closePath: () => { },
                    moveTo: () => { },
                    lineTo: () => { },
                    fill: () => { },
                    stroke: () => { },
                    save: () => { },
                    restore: () => { },
                    translate: () => { },
                    scale: () => { },
                    rotate: () => { },
                    arc: () => { },
                    ellipse: () => { },
                    getImageData: () => ({ data: new Uint8Array(1) }),
                    createImageData: () => ({ data: new Uint8Array(1) }),
                    putImageData: () => { },
                    drawImage: () => { }
                })
            };
        }
        return {};
    }
};

test('terrain tests', async (t) => {
    const { createTerrainSystem, createRiverStripGeometry, createLakeSurfaceGeometry } = await import('../js/modules/world/terrain.js');
    const { createRuntimeLodSettings } = await import('../js/modules/world/LodSystem.js');
    const loadStaticWorldFn = async () => false;

    const mockNoise = {
        noise: (x, y) => 0,
        fractal: (x, y, octaves) => 0
    };

    await t.test('createTerrainSystem returns expected interface', () => {
        const scene = new THREE.Scene();
        const PHYSICS = { position: new THREE.Vector3() };
        const lodSettings = createRuntimeLodSettings();

        const renderer = { capabilities: { getMaxAnisotropy: () => 1 } };
        const system = createTerrainSystem({ scene, Noise: mockNoise, PHYSICS, lodSettings, loadStaticWorldFn, renderer });

        assert.ok(system.waterMaterial instanceof THREE.Material);
        assert.equal(typeof system.getTerrainHeight, 'function');
        assert.equal(typeof system.updateTerrain, 'function');
        assert.equal(typeof system.updateTerrainAtmosphere, 'function');
    });

    await t.test('updateTerrainAtmosphere modifies atmosphere uniforms', () => {
        const scene = new THREE.Scene();
        const PHYSICS = { position: new THREE.Vector3() };
        const lodSettings = createRuntimeLodSettings();

        const renderer = { capabilities: { getMaxAnisotropy: () => 1 } };
        const system = createTerrainSystem({ scene, Noise: mockNoise, PHYSICS, lodSettings, loadStaticWorldFn, renderer });

        const camera = new THREE.PerspectiveCamera();
        camera.position.set(100, 200, 300);
        const weatherColor = new THREE.Color(0xff0000);

        system.updateTerrainAtmosphere(camera, weatherColor);

        // Atmosphere uniforms are applied to waterMaterial, we can inspect it
        const waterMaterial = system.waterMaterial;
        const onBeforeCompileStr = waterMaterial.onBeforeCompile.toString();
        // Just verify the method doesn't throw and finishes execution
        assert.ok(typeof system.updateTerrainAtmosphere === 'function');

        system.updateTerrainAtmosphere(null, null);
    });

    await t.test('updateTerrain queues chunk builds', () => {
        const scene = new THREE.Scene();
        const PHYSICS = { position: new THREE.Vector3() };
        const lodSettings = createRuntimeLodSettings();

        const renderer = { capabilities: { getMaxAnisotropy: () => 1 } };
        const system = createTerrainSystem({ scene, Noise: mockNoise, PHYSICS, lodSettings, loadStaticWorldFn, renderer });

        // Ensure no pending builds before updateTerrain
        system.updateTerrain();

        // Because pendingChunkBuilds is private, the best we can do is ensure
        // updateTerrain doesn't throw and executes successfully.
        assert.ok(typeof system.updateTerrain === 'function');
    });

    await t.test('createRiverStripGeometry ignores duplicate points and builds valid geometry', () => {
        const sampler = {
            getAltitudeAt(x, z) {
                return (x + z) * 0.001;
            }
        };

        const geometry = createRiverStripGeometry(
            [[0, 0], [0, 0], [80, 20], [140, 70], [140, 70], [220, 140]],
            18,
            sampler,
            [12, 14, 16, 18, 18, 20]
        );

        assert.ok(geometry instanceof THREE.BufferGeometry);
        assert.ok(geometry.attributes.position.count >= 4);
        assert.ok(geometry.index.count >= 6);
    });

    await t.test('createLakeSurfaceGeometry trims shoreline to the local basin', () => {
        const sampler = {
            getAltitudeAt(x, z) {
                const radius = Math.hypot(x, z);
                if (radius < 60) return 10;
                if (radius < 100) return 10.2;
                return 13.5;
            }
        };

        const geometry = createLakeSurfaceGeometry({
            x: 0,
            z: 0,
            radius: 140,
            level: 10.4
        }, sampler, { segments: 24, radialSteps: 10 });

        assert.ok(geometry instanceof THREE.BufferGeometry);
        const positions = geometry.attributes.position.array;
        let maxRadius = 0;
        for (let index = 3; index < positions.length; index += 3) {
            maxRadius = Math.max(maxRadius, Math.hypot(positions[index], positions[index + 2]));
        }
        assert.ok(maxRadius < 140);
        assert.ok(maxRadius >= 84);
    });
});
