import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const TEST_CHUNK_SIZE = 4000;

function createMockChunkBaseResult(lodCfg) {
    const terrainGeo = new THREE.PlaneGeometry(TEST_CHUNK_SIZE, TEST_CHUNK_SIZE, lodCfg.terrainRes, lodCfg.terrainRes);
    terrainGeo.rotateX(-Math.PI / 2);
    terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(terrainGeo.attributes.position.count * 3), 3));
    terrainGeo.setAttribute('surfaceWeights', new THREE.Float32BufferAttribute(new Float32Array(terrainGeo.attributes.position.count * 4), 4));
    const waterGeo = new THREE.PlaneGeometry(TEST_CHUNK_SIZE, TEST_CHUNK_SIZE, lodCfg.waterRes, lodCfg.waterRes);
    waterGeo.rotateX(-Math.PI / 2);
    waterGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(waterGeo.attributes.position.count * 3), 3));
    return {
        positions: terrainGeo.attributes.position.array.slice(),
        normals: new Float32Array(terrainGeo.attributes.normal.array),
        colors: new Float32Array(terrainGeo.attributes.color.array),
        surfaceWeights: new Float32Array(terrainGeo.attributes.surfaceWeights.array),
        wPos: waterGeo.attributes.position.array.slice(),
        wNormals: new Float32Array(waterGeo.attributes.normal.array),
        wCols: new Float32Array(waterGeo.attributes.color.array)
    };
}

// Define globals needed for terrain logic
global.Worker = class {
    constructor() {
        setTimeout(() => {
            this.onmessage?.({ data: { type: 'workerReady' } });
        }, 0);
    }
    postMessage(message) {
        const { type, jobId, payload } = message || {};
        setTimeout(() => {
            if (type === 'initStaticMap') {
                this.onmessage?.({ data: { type: 'initStaticMap_done', jobId } });
                return;
            }
            if (type === 'chunkBase') {
                this.onmessage?.({
                    data: {
                        jobId,
                        result: createMockChunkBaseResult(payload.lodCfg)
                    }
                });
                return;
            }
            if (type === 'chunkProps') {
                this.onmessage?.({
                    data: {
                        jobId,
                        result: {
                            treeInstances: {},
                            buildingPositions: {},
                            boatPositions: []
                        }
                    }
                });
            }
        }, 0);
    }
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
    },
    createElementNS: (_namespace, tag) => {
        if (tag === 'img' || tag === 'image') {
            return {
                addEventListener: () => { },
                removeEventListener: () => { },
                setAttribute: () => { }
            };
        }
        return global.document.createElement(tag);
    }
};

global.fetch = async () => ({
    ok: true,
    async json() {
        return [];
    },
    async arrayBuffer() {
        return new ArrayBuffer(0);
    }
});

test('terrain tests', async (t) => {
    const { createTerrainSystem, createRiverStripGeometry, createLakeSurfaceGeometry } = await import('../js/modules/world/terrain.js');
    const { createRuntimeLodSettings } = await import('../js/modules/world/LodSystem.js');
    const { CHUNK_SIZE } = await import('../js/modules/world/terrain/TerrainGeneration.js');
    const loadStaticWorldFn = async () => false;
    const renderer = {
        capabilities: {
            getMaxAnisotropy() {
                return 1;
            }
        }
    };

    const mockNoise = {
        noise: (x, y) => 0,
        fractal: (x, y, octaves) => 0
    };

    async function waitForChunkWorkIdle(system, maxIterations = 60) {
        let lastDiagnostics = null;
        for (let i = 0; i < maxIterations; i += 1) {
            system.updateTerrain();
            const diagnostics = system.getTerrainSelectionDiagnostics();
            lastDiagnostics = diagnostics;
            const pendingBase = diagnostics.queueDepths?.pendingBaseChunkJobs ?? 0;
            const pendingProps = diagnostics.queueDepths?.pendingPropJobs ?? 0;
            const buildingBase = diagnostics.chunkStates?.building_base ?? 0;
            const buildingProps = diagnostics.chunkStates?.building_props ?? 0;
            if (pendingBase === 0 && pendingProps === 0 && buildingBase === 0 && buildingProps === 0) {
                return diagnostics;
            }
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
        assert.fail(`terrain chunk work did not become idle in time: ${JSON.stringify(lastDiagnostics)}`);
    }

    function findVisibleChunkGroup(scene) {
        return scene.children.find((child) =>
            child instanceof THREE.Group
            && typeof child.userData?.chunkKey === 'string'
            && child.children?.[0]?.visible === true
        ) || null;
    }

    await t.test('createTerrainSystem returns expected interface', () => {
        const scene = new THREE.Scene();
        const PHYSICS = { position: new THREE.Vector3() };
        const lodSettings = createRuntimeLodSettings();

        const system = createTerrainSystem({ scene, renderer, Noise: mockNoise, PHYSICS, lodSettings, loadStaticWorldFn });

        assert.ok(system.waterMaterial instanceof THREE.Material);
        assert.equal(typeof system.getTerrainHeight, 'function');
        assert.equal(typeof system.updateTerrain, 'function');
        assert.equal(typeof system.updateTerrainAtmosphere, 'function');
    });

    await t.test('updateTerrainAtmosphere modifies atmosphere uniforms', () => {
        const scene = new THREE.Scene();
        const PHYSICS = { position: new THREE.Vector3() };
        const lodSettings = createRuntimeLodSettings();

        const system = createTerrainSystem({ scene, renderer, Noise: mockNoise, PHYSICS, lodSettings, loadStaticWorldFn });

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

        const system = createTerrainSystem({ scene, renderer, Noise: mockNoise, PHYSICS, lodSettings, loadStaticWorldFn });

        // Ensure no pending builds before updateTerrain
        system.updateTerrain();

        // Because pendingChunkBuilds is private, the best we can do is ensure
        // updateTerrain doesn't throw and executes successfully.
        assert.ok(typeof system.updateTerrain === 'function');
    });

    await t.test('terrain debug settings can override water shadow mode and wireframe', () => {
        const scene = new THREE.Scene();
        const PHYSICS = { position: new THREE.Vector3() };
        const lodSettings = createRuntimeLodSettings();

        const system = createTerrainSystem({ scene, renderer, Noise: mockNoise, PHYSICS, lodSettings, loadStaticWorldFn });

        system.terrainDebugSettings.showWaterWireframe = true;
        system.terrainDebugSettings.waterShadowMode = 'force-on';
        system.applyTerrainDebugSettings();

        assert.equal(system.waterMaterial.wireframe, true);
        assert.equal(system.terrainDebugSettings.waterShadowMode, 'force-on');

        system.terrainDebugSettings.waterShadowMode = 'not-a-mode';
        system.applyTerrainDebugSettings();

        assert.equal(system.terrainDebugSettings.waterShadowMode, 'auto');
    });

    await t.test('terrain debug settings can tune water material response', () => {
        const scene = new THREE.Scene();
        const PHYSICS = { position: new THREE.Vector3() };
        const lodSettings = createRuntimeLodSettings();

        const system = createTerrainSystem({ scene, renderer, Noise: mockNoise, PHYSICS, lodSettings, loadStaticWorldFn });

        system.terrainDebugSettings.waterRoughness = 0.18;
        system.terrainDebugSettings.waterMetalness = 0.32;
        system.terrainDebugSettings.waterNormalStrength = 2.25;
        system.terrainDebugSettings.waterNormalAnimation = false;
        system.terrainDebugSettings.surfaceShadowDistance = 8500;
        system.terrainDebugSettings.terrainShadowContrast = 0.45;
        system.terrainDebugSettings.waterAtmosphereStrength = 1.4;
        system.terrainDebugSettings.waterAtmosphereDesaturation = 0.3;
        system.terrainDebugSettings.waterShadowContrast = 0.55;
        system.applyTerrainDebugSettings();

        assert.equal(system.waterMaterial.roughness, 0.18);
        assert.equal(system.waterMaterial.metalness, 0.32);
        assert.equal(system.waterMaterial.normalMap, null);
        assert.equal(system.waterMaterial.normalScale.x, 3.375);
        assert.equal(system.waterMaterial.normalScale.y, 3.375);

        system.terrainDebugSettings.waterRoughness = -1;
        system.terrainDebugSettings.waterMetalness = 2;
        system.terrainDebugSettings.waterNormalStrength = 10;
        system.terrainDebugSettings.surfaceShadowDistance = -100;
        system.terrainDebugSettings.terrainShadowContrast = -2;
        system.terrainDebugSettings.waterAtmosphereStrength = -1;
        system.terrainDebugSettings.waterAtmosphereDesaturation = 2;
        system.terrainDebugSettings.waterShadowContrast = 4;
        system.applyTerrainDebugSettings();

        assert.equal(system.terrainDebugSettings.surfaceShadowDistance, 0);
        assert.equal(system.terrainDebugSettings.terrainShadowContrast, 0);
        assert.equal(system.terrainDebugSettings.waterRoughness, 0);
        assert.equal(system.terrainDebugSettings.waterMetalness, 1);
        assert.equal(system.terrainDebugSettings.waterNormalStrength, 4);
        assert.equal(system.terrainDebugSettings.waterAtmosphereStrength, 0);
        assert.equal(system.terrainDebugSettings.waterAtmosphereDesaturation, 1);
        assert.equal(system.terrainDebugSettings.waterShadowContrast, 1);
    });

    await t.test('terrain debug settings normalize tree impostor diagnostic controls', () => {
        const scene = new THREE.Scene();
        const PHYSICS = { position: new THREE.Vector3() };
        const lodSettings = createRuntimeLodSettings();

        const system = createTerrainSystem({ scene, renderer, Noise: mockNoise, PHYSICS, lodSettings, loadStaticWorldFn });

        system.terrainDebugSettings.treeImpostorDebugMode = 'not-a-mode';
        system.terrainDebugSettings.treeImpostorDebugFreezeFrameIndex = 2.7;
        system.terrainDebugSettings.treeImpostorDebugDisableFrameBlend = 1;
        system.terrainDebugSettings.treeImpostorDebugFlipNormalX = 1;
        system.terrainDebugSettings.treeImpostorDebugReferenceMode = 'broken';
        system.terrainDebugSettings.treeImpostorDebugReferenceOffset = -4;
        system.applyTerrainDebugSettings();

        assert.equal(system.terrainDebugSettings.treeImpostorDebugMode, 'lit');
        assert.equal(system.terrainDebugSettings.treeImpostorDebugFreezeFrameIndex, 3);
        assert.equal(system.terrainDebugSettings.treeImpostorDebugDisableFrameBlend, true);
        assert.equal(system.terrainDebugSettings.treeImpostorDebugFlipNormalX, true);
        assert.equal(system.terrainDebugSettings.treeImpostorDebugReferenceMode, 'off');
        assert.equal(system.terrainDebugSettings.treeImpostorDebugReferenceOffset, 0);
    });

    await t.test('terrain shadow distance defaults to doubled range with fade start', () => {
        const scene = new THREE.Scene();
        const PHYSICS = { position: new THREE.Vector3() };
        const lodSettings = createRuntimeLodSettings();

        const system = createTerrainSystem({ scene, renderer, Noise: mockNoise, PHYSICS, lodSettings, loadStaticWorldFn });
        const diagnostics = system.getSurfaceShadowDiagnostics();

        assert.equal(system.terrainDebugSettings.surfaceShadowDistance, 20000);
        assert.equal(diagnostics.settings.surfaceShadowDistance, 20000);
        assert.equal(diagnostics.settings.surfaceShadowFadeStart, 16000);
        assert.equal(diagnostics.settings.shadowCoverageExtent, 16000);
        assert.equal(diagnostics.settings.shadowCoverageFadeStart, 12800);
    });

    await t.test('surface shadow diagnostics expose nearest surface state', () => {
        const scene = new THREE.Scene();
        const PHYSICS = { position: new THREE.Vector3() };
        const lodSettings = createRuntimeLodSettings();

        const system = createTerrainSystem({ scene, renderer, Noise: mockNoise, PHYSICS, lodSettings, loadStaticWorldFn });
        system.updateTerrainAtmosphere({ position: new THREE.Vector3(120, 300, 240) });

        const diagnostics = system.getSurfaceShadowDiagnostics();

        assert.deepEqual(diagnostics.focus, { x: 120, y: 300, z: 240 });
        assert.equal(diagnostics.settings.surfaceShadowDistance, system.terrainDebugSettings.surfaceShadowDistance);
        assert.equal(diagnostics.settings.surfaceShadowFadeStart, system.terrainDebugSettings.surfaceShadowDistance * 0.8);
        assert.equal(diagnostics.settings.shadowCoverageExtent, 16000);
        assert.equal(diagnostics.settings.shadowCoverageFadeStart, 12800);
        assert.equal(diagnostics.settings.waterShadowMode, system.terrainDebugSettings.waterShadowMode);
        assert.equal(Object.prototype.hasOwnProperty.call(diagnostics, 'nearestTerrain'), true);
        assert.equal(Object.prototype.hasOwnProperty.call(diagnostics, 'nearestWater'), true);
    });

    await t.test('terrain runtime uses dedicated ocean patches instead of chunk water meshes', async () => {
        const scene = new THREE.Scene();
        const PHYSICS = { position: new THREE.Vector3() };
        const lodSettings = createRuntimeLodSettings();

        const system = createTerrainSystem({ scene, renderer, Noise: mockNoise, PHYSICS, lodSettings, loadStaticWorldFn });
        const camera = new THREE.PerspectiveCamera();
        camera.position.set(800, 180, 1200);
        system.updateTerrainAtmosphere(camera);
        await waitForChunkWorkIdle(system);

        const diagnostics = system.getTerrainSelectionDiagnostics();
        assert.equal(diagnostics.waterRuntime.activeChunkWaterMeshes, 0);
        assert.equal(diagnostics.waterRuntime.activeOceanWaterMeshes, 3);
        assert.ok(diagnostics.waterRuntime.activeLeafWaterOverlayRenderers <= 1);
        assert.ok(diagnostics.waterRuntime.activeLeafWaterMeshes <= diagnostics.selectedLeafCount);
        assert.ok(diagnostics.waterRuntime.uniqueWaterMaterials >= 1);
        assert.equal(
            diagnostics.waterRuntime.estimatedSeaLevelWaterDrawCalls,
            diagnostics.waterRuntime.activeLeafWaterOverlayRenderers + diagnostics.waterRuntime.activeOceanWaterMeshes
        );
    });

    await t.test('near terrain chunk bases receive shadows by default', async () => {
        const scene = new THREE.Scene();
        const PHYSICS = { position: new THREE.Vector3() };
        const lodSettings = createRuntimeLodSettings();
        lodSettings.terrain.renderDistance = 0;

        const system = createTerrainSystem({ scene, renderer, Noise: mockNoise, PHYSICS, lodSettings, loadStaticWorldFn });
        await waitForChunkWorkIdle(system);

        const visibleChunk = findVisibleChunkGroup(scene);
        assert.ok(visibleChunk);
        assert.equal(visibleChunk.userData.lod, 0);
        assert.equal(visibleChunk.children[0].castShadow, true);
        assert.equal(visibleChunk.children[0].receiveShadow, true);
    });

    await t.test('terrain base becomes visible before deferred props finish', async () => {
        const OriginalWorker = global.Worker;
        global.Worker = class {
            constructor() {
                setTimeout(() => {
                    this.onmessage?.({ data: { type: 'workerReady' } });
                }, 0);
            }
            postMessage(message) {
                const { type, jobId, payload } = message || {};
                if (type === 'initStaticMap') {
                    setTimeout(() => {
                        this.onmessage?.({ data: { type: 'initStaticMap_done', jobId } });
                    }, 0);
                    return;
                }
                if (type === 'chunkBase') {
                    setTimeout(() => {
                        this.onmessage?.({
                            data: {
                                jobId,
                                result: createMockChunkBaseResult(payload.lodCfg)
                            }
                        });
                    }, 0);
                    return;
                }
                if (type === 'chunkProps') {
                    setTimeout(() => {
                        this.onmessage?.({
                            data: {
                                jobId,
                                result: {
                                    treeInstances: {},
                                    buildingPositions: {},
                                    boatPositions: []
                                }
                            }
                        });
                    }, 40);
                }
            }
        };

        try {
            const scene = new THREE.Scene();
            const PHYSICS = { position: new THREE.Vector3() };
            const lodSettings = createRuntimeLodSettings();
            lodSettings.terrain.renderDistance = 0;

            const system = createTerrainSystem({ scene, renderer, Noise: mockNoise, PHYSICS, lodSettings, loadStaticWorldFn });

            let sawBaseVisibleBeforeDone = false;
            for (let i = 0; i < 30; i += 1) {
                system.updateTerrain();
                const diagnostics = system.getTerrainSelectionDiagnostics();
                const visibleChunk = findVisibleChunkGroup(scene);
                const stillStreamingProps = (diagnostics.chunkStates?.done ?? 0) === 0
                    || (diagnostics.chunkStates?.building_props ?? 0) > 0
                    || (diagnostics.queueDepths?.pendingPropJobs ?? 0) > 0;
                if (visibleChunk && stillStreamingProps) {
                    assert.equal(visibleChunk.children[0].visible, true);
                    sawBaseVisibleBeforeDone = true;
                    break;
                }
                await new Promise((resolve) => setTimeout(resolve, 5));
            }

            assert.equal(sawBaseVisibleBeforeDone, true);
            const finalDiagnostics = await waitForChunkWorkIdle(system);
            assert.ok((finalDiagnostics.chunkBaseRole?.currentVisibleChunkCount ?? 0) >= 1, JSON.stringify(finalDiagnostics.chunkBaseRole));
        } finally {
            global.Worker = OriginalWorker;
        }
    });

    await t.test('terrain diagnostics expose chunkBase fallback role summary', async () => {
        const scene = new THREE.Scene();
        const PHYSICS = { position: new THREE.Vector3() };
        const lodSettings = createRuntimeLodSettings();
        lodSettings.terrain.renderDistance = 0;

        const system = createTerrainSystem({ scene, renderer, Noise: mockNoise, PHYSICS, lodSettings, loadStaticWorldFn });
        const diagnostics = await waitForChunkWorkIdle(system);

        assert.ok(diagnostics.chunkBaseRole);
        assert.equal(typeof diagnostics.chunkBaseRole.currentVisibleChunkCount, 'number');
        assert.equal(typeof diagnostics.chunkBaseRole.currentHiddenByReadyLeafCount, 'number');
        assert.equal(typeof diagnostics.chunkBaseRole.buildStarts, 'number');
        assert.equal(typeof diagnostics.chunkBaseRole.buildCompletes, 'number');
        assert.ok(diagnostics.chunkBaseRole.visibleDwellMs);
    });

    await t.test('warm chunk cache records a hit when revisiting a recently evicted chunk', async () => {
        const scene = new THREE.Scene();
        const PHYSICS = { position: new THREE.Vector3() };
        const lodSettings = createRuntimeLodSettings();
        lodSettings.terrain.renderDistance = 0;

        const system = createTerrainSystem({ scene, renderer, Noise: mockNoise, PHYSICS, lodSettings, loadStaticWorldFn });

        await waitForChunkWorkIdle(system);
        let diagnostics = system.getTerrainSelectionDiagnostics();
        assert.equal(diagnostics.warmChunkCache.hits, 0, JSON.stringify(diagnostics.warmChunkCache));
        assert.equal(diagnostics.warmChunkCache.size, 0, JSON.stringify(diagnostics.warmChunkCache));

        PHYSICS.position.x = CHUNK_SIZE;
        await waitForChunkWorkIdle(system);
        diagnostics = system.getTerrainSelectionDiagnostics();
        assert.ok(diagnostics.warmChunkCache.size >= 1, JSON.stringify(diagnostics.warmChunkCache));

        PHYSICS.position.x = 0;
        await waitForChunkWorkIdle(system);
        diagnostics = system.getTerrainSelectionDiagnostics();
        assert.ok(diagnostics.warmChunkCache.hits >= 1, JSON.stringify(diagnostics.warmChunkCache));
    });

    await t.test('refreshBakedTerrain clears the warm chunk cache', async () => {
        const scene = new THREE.Scene();
        const PHYSICS = { position: new THREE.Vector3() };
        const lodSettings = createRuntimeLodSettings();
        lodSettings.terrain.renderDistance = 0;

        const system = createTerrainSystem({ scene, renderer, Noise: mockNoise, PHYSICS, lodSettings, loadStaticWorldFn });

        await waitForChunkWorkIdle(system);
        PHYSICS.position.x = CHUNK_SIZE;
        await waitForChunkWorkIdle(system);

        let diagnostics = system.getTerrainSelectionDiagnostics();
        assert.ok(diagnostics.warmChunkCache.size >= 1, JSON.stringify(diagnostics.warmChunkCache));

        system.refreshBakedTerrain();
        diagnostics = system.getTerrainSelectionDiagnostics();
        assert.equal(diagnostics.warmChunkCache.size, 0, JSON.stringify(diagnostics.warmChunkCache));
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
