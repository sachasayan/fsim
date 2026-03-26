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
    assert.equal(waterHeight, SEA_LEVEL);
});
