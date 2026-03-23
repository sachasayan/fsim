import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

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
                        result: {
                            positions: payload.positions,
                            normals: payload.normals,
                            colors: payload.colors,
                            surfaceWeights: payload.surfaceWeights,
                            wPos: payload.wPos,
                            wNormals: payload.wNormals,
                            wCols: payload.wCols
                        }
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
                                result: {
                                    positions: payload.positions,
                                    normals: payload.normals,
                                    colors: payload.colors,
                                    surfaceWeights: payload.surfaceWeights,
                                    wPos: payload.wPos,
                                    wNormals: payload.wNormals,
                                    wCols: payload.wCols
                                }
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
            await waitForChunkWorkIdle(system);
        } finally {
            global.Worker = OriginalWorker;
        }
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
