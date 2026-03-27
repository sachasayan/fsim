import test from 'node:test';
import assert from 'node:assert/strict';

import {
    classifyTerrainRegionSelectionTiles,
    createRegionalTerrainSampler,
    createTerrainRegionFromTiles,
    getTerrainRegionTileWorldBounds,
    getTerrainRegionTilesInRect,
    worldToTerrainRegionTile
} from '../js/modules/world/terrain/TerrainRegions.js';
import { createSeededNoise, createTerrainSynthesizer } from '../js/modules/world/terrain/TerrainSynthesis.js';
import { Noise } from '../js/modules/noise.js';
import { SEA_LEVEL } from '../js/modules/world/terrain/TerrainPalette.js';
import { DEFAULT_WORLD_SIZE } from '../js/modules/world/WorldConfig.js';

test('worldToTerrainRegionTile and tile bounds align on the 64x64 grid', () => {
    const tile = worldToTerrainRegionTile(0, 0, DEFAULT_WORLD_SIZE);
    assert.deepEqual(tile, { tileX: 32, tileZ: 32 });

    const bounds = getTerrainRegionTileWorldBounds(tile.tileX, tile.tileZ, DEFAULT_WORLD_SIZE);
    const centerX = (bounds.minX + bounds.maxX) * 0.5;
    const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
    assert.deepEqual(worldToTerrainRegionTile(centerX, centerZ, DEFAULT_WORLD_SIZE), tile);
});

test('getTerrainRegionTilesInRect enumerates all selected cells', () => {
    const region = createTerrainRegionFromTiles({ tileX: 4, tileZ: 5 }, { tileX: 5, tileZ: 7 });
    const tiles = getTerrainRegionTilesInRect(region);

    assert.equal(tiles.length, 6);
    assert.deepEqual(tiles[0], { tileX: 4, tileZ: 5 });
    assert.deepEqual(tiles.at(-1), { tileX: 5, tileZ: 7 });
});

test('classifyTerrainRegionSelectionTiles marks overlapping cells as blocked', () => {
    const selection = createTerrainRegionFromTiles({ tileX: 8, tileZ: 8 }, { tileX: 10, tileZ: 9 });
    const existing = [
        createTerrainRegionFromTiles({ tileX: 9, tileZ: 8 }, { tileX: 9, tileZ: 8 }),
        createTerrainRegionFromTiles({ tileX: 10, tileZ: 9 }, { tileX: 10, tileZ: 9 })
    ];

    const tiles = classifyTerrainRegionSelectionTiles(selection, existing);
    const blockedTiles = tiles.filter(tile => tile.blocked);
    const openTiles = tiles.filter(tile => !tile.blocked);

    assert.deepEqual(blockedTiles.map(tile => [tile.tileX, tile.tileZ]), [[9, 8], [10, 9]]);
    assert.deepEqual(openTiles.map(tile => [tile.tileX, tile.tileZ]), [[8, 8], [10, 8], [8, 9], [9, 9]]);
});

test('regional sampler falls back to ocean when a region is removed', () => {
    const regions = [
        createTerrainRegionFromTiles(
            { tileX: 32, tileZ: 32 },
            { tileX: 32, tileZ: 32 },
            {
                terrainGenerator: {
                    seed: 24680,
                    macro: {
                        baseOffset: 200
                    }
                }
            }
        )
    ];
    const withRegion = createRegionalTerrainSampler({ Noise, worldSize: DEFAULT_WORLD_SIZE, regions });
    const withoutRegion = createRegionalTerrainSampler({ Noise, worldSize: DEFAULT_WORLD_SIZE, regions: [] });

    const landHeight = withRegion.sampleHeight(10, 10);
    const waterHeight = withoutRegion.sampleHeight(10, 10);

    assert.notEqual(landHeight, SEA_LEVEL);
    assert.ok(waterHeight < SEA_LEVEL);
});

test('regional sampler is invariant to world placement for identical region configs', () => {
    const config = {
        seed: 24680,
        preset: 'cinematic'
    };
    const regionA = createTerrainRegionFromTiles(
        { tileX: 8, tileZ: 10 },
        { tileX: 11, tileZ: 14 },
        { terrainGenerator: config }
    );
    const regionB = createTerrainRegionFromTiles(
        { tileX: 44, tileZ: 40 },
        { tileX: 47, tileZ: 44 },
        { terrainGenerator: config }
    );
    const sampler = createRegionalTerrainSampler({
        Noise,
        worldSize: DEFAULT_WORLD_SIZE,
        regions: [regionA, regionB]
    });

    const relativePoints = [
        [0.2, 0.35],
        [0.5, 0.5],
        [0.78, 0.62]
    ];

    for (const [u, v] of relativePoints) {
        const worldA = {
            x: regionA.bounds.minX + (regionA.bounds.maxX - regionA.bounds.minX) * u,
            z: regionA.bounds.minZ + (regionA.bounds.maxZ - regionA.bounds.minZ) * v
        };
        const worldB = {
            x: regionB.bounds.minX + (regionB.bounds.maxX - regionB.bounds.minX) * u,
            z: regionB.bounds.minZ + (regionB.bounds.maxZ - regionB.bounds.minZ) * v
        };
        assert.equal(sampler.sampleHeight(worldA.x, worldA.z), sampler.sampleHeight(worldB.x, worldB.z));
        assert.deepEqual(sampler.sampleMasks(worldA.x, worldA.z), sampler.sampleMasks(worldB.x, worldB.z));
    }
});

test('regional sampler seeds remain isolated between otherwise identical regions', () => {
    const regionA = createTerrainRegionFromTiles(
        { tileX: 20, tileZ: 20 },
        { tileX: 23, tileZ: 23 },
        { terrainGenerator: { seed: 11111, preset: 'cinematic' } }
    );
    const regionB = createTerrainRegionFromTiles(
        { tileX: 20, tileZ: 20 },
        { tileX: 23, tileZ: 23 },
        { terrainGenerator: { seed: 22222, preset: 'cinematic' } }
    );
    const samplerA = createRegionalTerrainSampler({ Noise, worldSize: DEFAULT_WORLD_SIZE, regions: [regionA] });
    const samplerB = createRegionalTerrainSampler({ Noise, worldSize: DEFAULT_WORLD_SIZE, regions: [regionB] });
    const sampleX = regionA.bounds.minX + (regionA.bounds.maxX - regionA.bounds.minX) * 0.6;
    const sampleZ = regionA.bounds.minZ + (regionA.bounds.maxZ - regionA.bounds.minZ) * 0.45;

    assert.notEqual(samplerA.sampleHeight(sampleX, sampleZ), samplerB.sampleHeight(sampleX, sampleZ));
});

test('edge-touching regions remain self-contained islands with oceanized boundaries', () => {
    const region = createTerrainRegionFromTiles(
        { tileX: 0, tileZ: 0 },
        { tileX: 5, tileZ: 4 },
        {
            terrainGenerator: {
                seed: 24680,
                preset: 'cinematic',
                macro: {
                    baseOffset: 180,
                    continentalAmplitude: 260
                }
            }
        }
    );
    const sampler = createRegionalTerrainSampler({ Noise, worldSize: DEFAULT_WORLD_SIZE, regions: [region] });
    const centerX = (region.bounds.minX + region.bounds.maxX) * 0.5;
    const centerZ = (region.bounds.minZ + region.bounds.maxZ) * 0.5;
    const edgeX = region.bounds.minX;
    const edgeZ = region.bounds.minZ + (region.bounds.maxZ - region.bounds.minZ) * 0.5;

    const centerHeight = sampler.sampleHeight(centerX, centerZ);
    const edgeHeight = sampler.sampleHeight(edgeX, edgeZ);
    const outsideHeight = sampler.sampleHeight(region.bounds.minX - 1, edgeZ);

    assert.ok(centerHeight > edgeHeight);
    assert.ok(edgeHeight <= SEA_LEVEL);
    assert.ok(outsideHeight < SEA_LEVEL);
});

test('regional sampler matches preview synthesizer output for the same region config', () => {
    const region = createTerrainRegionFromTiles(
        { tileX: 12, tileZ: 18 },
        { tileX: 16, tileZ: 21 },
        {
            terrainGenerator: {
                seed: 13579,
                preset: 'coastal',
                preview: {
                    overlay: 'gorge',
                    resolution: 64,
                    showContours: false
                }
            }
        }
    );

    const sampler = createRegionalTerrainSampler({
        Noise,
        worldSize: DEFAULT_WORLD_SIZE,
        regions: [region]
    });
    const previewSynth = createTerrainSynthesizer({
        Noise: createSeededNoise(region.terrainGenerator.seed),
        worldSize: DEFAULT_WORLD_SIZE,
        config: region.terrainGenerator,
        authoredBounds: region.bounds,
        applyRunwayFlattening: false
    });

    const relativePoints = [
        [0.22, 0.31],
        [0.5, 0.5],
        [0.77, 0.68]
    ];

    for (const [u, v] of relativePoints) {
        const x = region.bounds.minX + (region.bounds.maxX - region.bounds.minX) * u;
        const z = region.bounds.minZ + (region.bounds.maxZ - region.bounds.minZ) * v;
        assert.equal(sampler.sampleHeight(x, z), previewSynth.sampleHeight(x, z));
        assert.deepEqual(sampler.sampleMasks(x, z), previewSynth.sampleMasks(x, z));
        assert.equal(sampler.sampleOverlay(x, z, 'gorge'), previewSynth.sampleOverlay(x, z, 'gorge'));
    }
});

test('preview snapshots stay finite and bounded for extreme rectangular regions', () => {
    const regions = [
        createTerrainRegionFromTiles(
            { tileX: 2, tileZ: 8 },
            { tileX: 17, tileZ: 9 },
            { terrainGenerator: { seed: 24680, preset: 'coastal' } }
        ),
        createTerrainRegionFromTiles(
            { tileX: 30, tileZ: 6 },
            { tileX: 31, tileZ: 24 },
            { terrainGenerator: { seed: 24680, preset: 'coastal' } }
        )
    ];

    for (const region of regions) {
        const synth = createTerrainSynthesizer({
            Noise: createSeededNoise(region.terrainGenerator.seed),
            worldSize: DEFAULT_WORLD_SIZE,
            config: region.terrainGenerator,
            authoredBounds: region.bounds,
            applyRunwayFlattening: false
        });
        const preview = synth.buildViewportPreview(region.bounds, {
            overlayKind: 'height',
            resolution: 48,
            showContours: false
        });
        const centerX = (region.bounds.minX + region.bounds.maxX) * 0.5;
        const centerZ = (region.bounds.minZ + region.bounds.maxZ) * 0.5;
        const edgeMidX = region.bounds.minX;
        const edgeMidZ = (region.bounds.minZ + region.bounds.maxZ) * 0.5;

        assert.equal(preview.width, 48);
        assert.equal(preview.height, 48);
        assert.ok(Number.isFinite(preview.metrics.minHeight));
        assert.ok(Number.isFinite(preview.metrics.maxHeight));
        assert.ok(Number.isFinite(preview.metrics.maxRelief));
        assert.ok(preview.metrics.maxHeight > preview.metrics.minHeight);
        assert.ok(synth.sampleHeight(centerX, centerZ) > synth.sampleHeight(edgeMidX, edgeMidZ));
        assert.ok(synth.sampleHeight(edgeMidX, edgeMidZ) <= SEA_LEVEL);
        assert.ok(Array.from(preview.pixels).every(Number.isFinite));
    }
});

test('regional sampler exposes regional bake metadata instead of global terrain metadata', () => {
    const regions = [
        createTerrainRegionFromTiles(
            { tileX: 4, tileZ: 4 },
            { tileX: 6, tileZ: 7 },
            { terrainGenerator: { seed: 11111, preset: 'coastal' } }
        ),
        createTerrainRegionFromTiles(
            { tileX: 20, tileZ: 24 },
            { tileX: 22, tileZ: 27 },
            { terrainGenerator: { seed: 22222, preset: 'cinematic' } }
        )
    ];
    const sampler = createRegionalTerrainSampler({
        Noise,
        worldSize: DEFAULT_WORLD_SIZE,
        regions
    });
    const metadata = sampler.getMetadata();

    assert.equal(metadata.terrainModel.kind, 'regional-offline-synth-v2');
    assert.equal(metadata.terrainModel.regionCount, 2);
    assert.equal(metadata.terrainRegionMetadata.length, 2);
    assert.ok(metadata.hydrology.riverCount >= 0);
    assert.ok(metadata.terrainRegionMetadata.every(region => region.terrainModel.kind === 'offline-synth-v2'));
});
