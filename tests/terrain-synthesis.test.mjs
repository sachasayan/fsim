import test from 'node:test';
import assert from 'node:assert/strict';

import { Noise } from '../js/modules/noise.js';
import { DEFAULT_WORLD_SIZE } from '../js/modules/world/WorldConfig.js';
import {
    TERRAIN_PREVIEW_OVERLAYS,
    createTerrainSynthesizer,
    normalizeTerrainGeneratorConfig
} from '../js/modules/world/terrain/TerrainSynthesis.js';

const HYDROLOGY_TOPOLOGY_TEST_WORLD_SIZE = 50000;

test('terrain synthesizer is deterministic for a fixed seed', () => {
    Noise.init(12345);
    const synthA = createTerrainSynthesizer({ Noise, worldSize: DEFAULT_WORLD_SIZE, config: { seed: 12345, preset: 'cinematic' } });
    Noise.init(12345);
    const synthB = createTerrainSynthesizer({ Noise, worldSize: DEFAULT_WORLD_SIZE, config: { seed: 12345, preset: 'cinematic' } });

    const samples = [
        [0, 0],
        [3500, -1200],
        [-9000, 14000],
        [18000, -16000]
    ];

    for (const [x, z] of samples) {
        assert.equal(synthA.sampleHeight(x, z), synthB.sampleHeight(x, z));
        assert.deepEqual(synthA.sampleMasks(x, z), synthB.sampleMasks(x, z));
    }
});

test('terrain synthesizer preserves the runway flattening corridor', () => {
    Noise.init(12345);
    const synth = createTerrainSynthesizer({ Noise, worldSize: DEFAULT_WORLD_SIZE, config: { seed: 12345 } });

    assert.equal(synth.sampleHeight(0, 0), 0);
    assert.equal(synth.sampleHeight(100, 1200), 0);

    const blended = synth.sampleHeight(420, 100);
    assert.ok(blended > 0);
    assert.ok(Number.isFinite(synth.sampleHeight(3000, 3000)));
});

test('terrain synthesizer emits v2 hydrology metadata with summary coverage', () => {
    Noise.init(12345);
    const synth = createTerrainSynthesizer({ Noise, worldSize: DEFAULT_WORLD_SIZE, config: { seed: 12345, preset: 'cinematic' } });
    const meta = synth.getMetadata();

    assert.equal(meta.worldSize, DEFAULT_WORLD_SIZE);
    assert.equal(meta.terrainModel.kind, 'offline-synth-v2');
    assert.equal(meta.terrainModel.version, 2);
    assert.ok(meta.hydrology.riverCount > 0, 'expected at least one river candidate');
    assert.ok(Array.isArray(meta.hydrology.rivers));
    assert.ok(Array.isArray(meta.hydrology.lakes));
    assert.ok(meta.hydrology.riverCount <= synth.config.hydrology.riverCount);
    assert.ok(meta.hydrology.summary.cliffCoverage > 0);
    assert.ok(meta.hydrology.summary.gorgeCoverage > 0);
});

test('terrain synthesizer exports cleaned river paths with merge-aware continuity', () => {
    Noise.init(12345);
    const synth = createTerrainSynthesizer({
        Noise,
        worldSize: HYDROLOGY_TOPOLOGY_TEST_WORLD_SIZE,
        config: { seed: 12345, preset: 'cinematic' }
    });
    const { rivers } = synth.getMetadata().hydrology;

    assert.ok(rivers.some(river => river.outlet === 'merge'));
    assert.ok(Math.max(...rivers.map(river => river.points.length)) >= 8);

    for (const river of rivers) {
        assert.equal(river.points.length, river.widths.length);
        for (let index = 1; index < river.points.length; index += 1) {
            assert.notDeepEqual(river.points[index], river.points[index - 1]);
        }
    }
});

test('terrain synthesizer records lake, coast, edge, and merge river outlets deterministically', () => {
    Noise.init(12345);
    const cinematic = createTerrainSynthesizer({
        Noise,
        worldSize: HYDROLOGY_TOPOLOGY_TEST_WORLD_SIZE,
        config: { seed: 12345, preset: 'cinematic' }
    });
    const cinematicOutlets = new Set(cinematic.getMetadata().hydrology.rivers.map(river => river.outlet));
    assert.ok(cinematicOutlets.has('lake'));
    assert.ok(cinematicOutlets.has('merge'));

    Noise.init(12345);
    const coastal = createTerrainSynthesizer({
        Noise,
        worldSize: HYDROLOGY_TOPOLOGY_TEST_WORLD_SIZE,
        config: { seed: 12345, preset: 'coastal' }
    });
    const coastalOutlets = new Set(coastal.getMetadata().hydrology.rivers.map(river => river.outlet));
    assert.ok(coastalOutlets.has('coast'));
    assert.ok(coastalOutlets.has('edge'));
});

test('terrain synthesizer normalizes missing config fields', () => {
    const config = normalizeTerrainGeneratorConfig({ seed: 999, hydrology: { riverCount: 5 } });

    assert.equal(config.version, 2);
    assert.equal(config.seed, 999);
    assert.equal(config.hydrology.riverCount, 5);
    assert.equal(config.preview.overlay, 'height');
    assert.equal(config.landforms.canyonDepth, 0.44);
});

test('terrain synthesizer clamps new config fields', () => {
    const config = normalizeTerrainGeneratorConfig({
        macro: {
            ridgeAmplitude: 20000,
            rangeCount: 999,
            summitSharpness: -2
        },
        landforms: {
            canyonWidth: 99
        },
        hydrology: {
            gorgeStrength: 7,
            cliffThreshold: 0
        }
    });

    assert.equal(config.macro.ridgeAmplitude, 1600);
    assert.equal(config.macro.rangeCount, 10);
    assert.equal(config.macro.summitSharpness, 0);
    assert.equal(config.landforms.canyonWidth, 1);
    assert.equal(config.hydrology.gorgeStrength, 1.2);
    assert.equal(config.hydrology.cliffThreshold, 0.12);
});

test('cinematic preset produces more relief than balanced', () => {
    Noise.init(12345);
    const balanced = createTerrainSynthesizer({ Noise, worldSize: DEFAULT_WORLD_SIZE, config: { seed: 12345, preset: 'balanced' } });
    Noise.init(12345);
    const cinematic = createTerrainSynthesizer({ Noise, worldSize: DEFAULT_WORLD_SIZE, config: { seed: 12345, preset: 'cinematic' } });

    const samplePoints = [
        [-16000, -9000],
        [-8000, 12000],
        [9000, -12000],
        [15000, 7000]
    ];
    const balancedHeights = samplePoints.map(([x, z]) => balanced.sampleHeight(x, z));
    const cinematicHeights = samplePoints.map(([x, z]) => cinematic.sampleHeight(x, z));
    assert.ok(Math.max(...cinematicHeights) > Math.max(...balancedHeights));
});

test('canyon settings deepen terrain more than broad basins at the same point', () => {
    Noise.init(12345);
    const canyon = createTerrainSynthesizer({
        Noise,
        worldSize: DEFAULT_WORLD_SIZE,
        config: {
            preset: 'cinematic',
            landforms: {
                canyonDepth: 1,
                canyonWidth: 0.25,
                basinDepth: 0.1,
                basinBreadth: 0.35
            }
        }
    });
    Noise.init(12345);
    const basin = createTerrainSynthesizer({
        Noise,
        worldSize: DEFAULT_WORLD_SIZE,
        config: {
            preset: 'cinematic',
            landforms: {
                canyonDepth: 0.1,
                canyonWidth: 0.8,
                basinDepth: 1,
                basinBreadth: 1
            }
        }
    });

    const canyonSample = canyon.sampleHeight(9000, -8500);
    const basinSample = basin.sampleHeight(9000, -8500);
    assert.notEqual(canyonSample, basinSample);
});

test('new preview overlays render deterministically and report coverage metrics', () => {
    Noise.init(12345);
    const synth = createTerrainSynthesizer({ Noise, worldSize: DEFAULT_WORLD_SIZE, config: { seed: 12345, preset: 'cinematic' } });

    for (const overlayKind of TERRAIN_PREVIEW_OVERLAYS) {
        const previewA = synth.buildViewportPreview({
            minX: -1000,
            maxX: 1000,
            minZ: -1000,
            maxZ: 1000
        }, {
            overlayKind,
            resolution: 64
        });
        const previewB = synth.buildViewportPreview({
            minX: -1000,
            maxX: 1000,
            minZ: -1000,
            maxZ: 1000
        }, {
            overlayKind,
            resolution: 64
        });

        assert.equal(previewA.width, 64);
        assert.deepEqual(Array.from(previewA.pixels), Array.from(previewB.pixels));
        assert.ok(previewA.metrics.maxRelief >= 0);
        assert.ok(previewA.metrics.cliffCoverage >= 0);
        assert.ok(previewA.metrics.gorgeCoverage >= 0);
    }
});

test('terrain synthesizer returns fallback heights outside the authored world bounds', () => {
    Noise.init(12345);
    const synth = createTerrainSynthesizer({ Noise, worldSize: DEFAULT_WORLD_SIZE, config: { seed: 12345, preset: 'cinematic' } });

    assert.equal(synth.sampleHeight(DEFAULT_WORLD_SIZE * 0.5 + 1, 0), -100);
    assert.equal(synth.sampleHeight(0, -(DEFAULT_WORLD_SIZE * 0.5 + 1)), -100);
});
