import { DEFAULT_WORLD_SIZE } from '../WorldConfig.js';
import { normalizeTerrainGeneratorConfig, createTerrainSynthesizer } from './TerrainSynthesis.js';
import { SEA_LEVEL } from './TerrainPalette.js';

export const TERRAIN_REGION_GRID_SIZE = 64;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function toInteger(value, fallback) {
    if (!Number.isFinite(value)) return fallback;
    return Math.round(value);
}

function makeEmptyMaskSample() {
    return {
        river: 0,
        lake: 0,
        moisture: 0,
        flow: 0,
        erosion: 0,
        gorge: 0,
        floodplain: 0,
        cliff: 0,
        talus: 0,
        alpine: 0,
        wetland: 0,
        terrace: 0
    };
}

export function getTerrainRegionTileSize(worldSize = DEFAULT_WORLD_SIZE) {
    return Math.max(1, worldSize / TERRAIN_REGION_GRID_SIZE);
}

export function normalizeTerrainRegion(rawRegion, worldSize = DEFAULT_WORLD_SIZE) {
    const region = rawRegion || {};
    const maxTileIndex = TERRAIN_REGION_GRID_SIZE - 1;
    const tileX = clamp(toInteger(region.tileX, 0), 0, maxTileIndex);
    const tileZ = clamp(toInteger(region.tileZ, 0), 0, maxTileIndex);
    const tileWidth = clamp(toInteger(region.tileWidth, 1), 1, TERRAIN_REGION_GRID_SIZE - tileX);
    const tileHeight = clamp(toInteger(region.tileHeight, 1), 1, TERRAIN_REGION_GRID_SIZE - tileZ);
    const normalized = {
        tileX,
        tileZ,
        tileWidth,
        tileHeight,
        terrainGenerator: normalizeTerrainGeneratorConfig(region.terrainGenerator)
    };
    if (region.__editorId) {
        normalized.__editorId = region.__editorId;
    }
    const bounds = getTerrainRegionWorldBounds(normalized, worldSize);
    normalized.bounds = bounds;
    normalized.center = [
        Math.round((bounds.minX + bounds.maxX) * 0.5),
        Math.round((bounds.minZ + bounds.maxZ) * 0.5)
    ];
    return normalized;
}

export function normalizeTerrainRegions(regions, worldSize = DEFAULT_WORLD_SIZE) {
    if (!Array.isArray(regions)) return [];
    const normalized = regions.map(region => normalizeTerrainRegion(region, worldSize));
    validateTerrainRegions(normalized);
    return normalized;
}

export function terrainRegionsOverlap(a, b) {
    return !(
        a.tileX + a.tileWidth <= b.tileX
        || b.tileX + b.tileWidth <= a.tileX
        || a.tileZ + a.tileHeight <= b.tileZ
        || b.tileZ + b.tileHeight <= a.tileZ
    );
}

export function findTerrainRegionOverlap(candidate, regions, ignoreRegion = null) {
    for (const region of regions || []) {
        if (!region || region === ignoreRegion) continue;
        if (terrainRegionsOverlap(candidate, region)) return region;
    }
    return null;
}

export function validateTerrainRegions(regions) {
    const normalizedRegions = Array.isArray(regions) ? regions : [];
    for (let index = 0; index < normalizedRegions.length; index += 1) {
        const region = normalizedRegions[index];
        const overlap = findTerrainRegionOverlap(region, normalizedRegions.slice(index + 1));
        if (!overlap) continue;
        throw new Error(
            `Terrain region overlap detected between (${region.tileX},${region.tileZ},${region.tileWidth},${region.tileHeight}) and (${overlap.tileX},${overlap.tileZ},${overlap.tileWidth},${overlap.tileHeight})`
        );
    }
    return normalizedRegions;
}

export function getTerrainRegionWorldBounds(region, worldSize = DEFAULT_WORLD_SIZE) {
    const tileSize = getTerrainRegionTileSize(worldSize);
    const halfWorld = worldSize * 0.5;
    return {
        minX: -halfWorld + region.tileX * tileSize,
        maxX: -halfWorld + (region.tileX + region.tileWidth) * tileSize,
        minZ: -halfWorld + region.tileZ * tileSize,
        maxZ: -halfWorld + (region.tileZ + region.tileHeight) * tileSize
    };
}

export function getTerrainRegionTileWorldBounds(tileX, tileZ, worldSize = DEFAULT_WORLD_SIZE) {
    return getTerrainRegionWorldBounds({
        tileX,
        tileZ,
        tileWidth: 1,
        tileHeight: 1
    }, worldSize);
}

export function worldToTerrainRegionTile(x, z, worldSize = DEFAULT_WORLD_SIZE) {
    const halfWorld = worldSize * 0.5;
    if (x < -halfWorld || x >= halfWorld || z < -halfWorld || z >= halfWorld) {
        return null;
    }
    const tileSize = getTerrainRegionTileSize(worldSize);
    return {
        tileX: clamp(Math.floor((x + halfWorld) / tileSize), 0, TERRAIN_REGION_GRID_SIZE - 1),
        tileZ: clamp(Math.floor((z + halfWorld) / tileSize), 0, TERRAIN_REGION_GRID_SIZE - 1)
    };
}

export function createTerrainRegionFromTiles(startTile, endTile, template = {}, worldSize = DEFAULT_WORLD_SIZE) {
    const tileX = Math.min(startTile.tileX, endTile.tileX);
    const tileZ = Math.min(startTile.tileZ, endTile.tileZ);
    const tileWidth = Math.abs(endTile.tileX - startTile.tileX) + 1;
    const tileHeight = Math.abs(endTile.tileZ - startTile.tileZ) + 1;
    return normalizeTerrainRegion({
        ...template,
        tileX,
        tileZ,
        tileWidth,
        tileHeight
    }, worldSize);
}

export function getTerrainRegionTilesInRect(regionRect) {
    const tiles = [];
    if (!regionRect) return tiles;
    for (let tileZ = regionRect.tileZ; tileZ < regionRect.tileZ + regionRect.tileHeight; tileZ += 1) {
        for (let tileX = regionRect.tileX; tileX < regionRect.tileX + regionRect.tileWidth; tileX += 1) {
            tiles.push({ tileX, tileZ });
        }
    }
    return tiles;
}

export function tileBelongsToTerrainRegion(tile, region) {
    if (!tile || !region) return false;
    return (
        tile.tileX >= region.tileX
        && tile.tileX < region.tileX + region.tileWidth
        && tile.tileZ >= region.tileZ
        && tile.tileZ < region.tileZ + region.tileHeight
    );
}

export function classifyTerrainRegionSelectionTiles(regionRect, regions, ignoreRegion = null) {
    return getTerrainRegionTilesInRect(regionRect).map(tile => {
        const owner = (regions || []).find(region => region !== ignoreRegion && tileBelongsToTerrainRegion(tile, region)) || null;
        return {
            ...tile,
            blocked: owner !== null,
            owner
        };
    });
}

export function getTerrainRegionAtWorldPos(regions, x, z, worldSize = DEFAULT_WORLD_SIZE) {
    const tile = worldToTerrainRegionTile(x, z, worldSize);
    if (!tile) return null;
    for (let index = regions.length - 1; index >= 0; index -= 1) {
        const region = regions[index];
        if (
            tile.tileX >= region.tileX
            && tile.tileX < region.tileX + region.tileWidth
            && tile.tileZ >= region.tileZ
            && tile.tileZ < region.tileZ + region.tileHeight
        ) {
            return region;
        }
    }
    return null;
}

export function createRegionalTerrainSampler({
    Noise,
    worldSize = DEFAULT_WORLD_SIZE,
    regions = []
}) {
    const normalizedRegions = normalizeTerrainRegions(regions, worldSize);
    const synthesizerCache = new Map();

    function getSynthesizer(region) {
        const key = JSON.stringify(region.terrainGenerator);
        if (!synthesizerCache.has(key)) {
            synthesizerCache.set(key, createTerrainSynthesizer({
                Noise,
                worldSize,
                config: region.terrainGenerator
            }));
        }
        return synthesizerCache.get(key);
    }

    function findRegion(x, z) {
        return getTerrainRegionAtWorldPos(normalizedRegions, x, z, worldSize);
    }

    return {
        regions: normalizedRegions,
        sampleHeight(x, z) {
            const region = findRegion(x, z);
            if (!region) return SEA_LEVEL;
            return getSynthesizer(region).sampleHeight(x, z);
        },
        sampleMasks(x, z) {
            const region = findRegion(x, z);
            if (!region) return makeEmptyMaskSample();
            return getSynthesizer(region).sampleMasks?.(x, z) || makeEmptyMaskSample();
        },
        sampleOverlay(x, z, overlayKind) {
            const region = findRegion(x, z);
            if (!region) {
                if (overlayKind === 'height') {
                    return Math.max(0, Math.min(1, (SEA_LEVEL + 160) / 1450));
                }
                return 0;
            }
            const synthesizer = getSynthesizer(region);
            if (typeof synthesizer.sampleOverlay === 'function') {
                return synthesizer.sampleOverlay(x, z, overlayKind);
            }
            return overlayKind === 'height'
                ? Math.max(0, Math.min(1, (synthesizer.sampleHeight(x, z) + 160) / 1450))
                : 0;
        },
        getRegionAtWorldPos(x, z) {
            return findRegion(x, z);
        }
    };
}
