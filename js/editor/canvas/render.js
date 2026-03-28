import { COLORS, isTerrainBrushTool } from '../../modules/editor/constants.js';
import { districtContainsPoint, getDistanceToSegment, roadContainsPoint, terrainEditContainsPoint, terrainRegionContainsPoint } from '../../modules/editor/geometry.js';
import { isAirport, isAuthoredObject, isRoad, isDistrict, isTerrainEdit, isTerrainRegion } from '../../modules/editor/objectTypes.js';
import { getAuthoredObjectAsset } from '../../modules/world/AuthoredObjectCatalog.js';
import { AIRPORT_CONFIG } from '../../modules/world/config.js';
import { airportContainsWorldPoint, transformAirportPoint } from '../../modules/world/AirportLayout.js';
import { DEFAULT_WORLD_SIZE } from '../../modules/world/WorldConfig.js';
import { getEntityById, getGroupEntityIds } from '../core/document.js';
import { TERRAIN_REGION_GRID_SIZE, getTerrainRegionTileSize, getTerrainRegionTileWorldBounds } from '../../modules/world/terrain/TerrainRegions.js';

function isGroupVisible(state, groupId) {
    return state.layers.groupVisibility[groupId] !== false;
}

function isObjectVisible(state, entityId, groupId) {
    return isGroupVisible(state, groupId) && state.layers.itemVisibility[entityId] !== false;
}

function isScreenPointVisible({ width, height }, point, pad = 24) {
    return point.x >= -pad && point.x <= width + pad && point.y >= -pad && point.y <= height + pad;
}

function getTerrainRegionTileScreenSize(zoom) {
    return getTerrainRegionTileSize(DEFAULT_WORLD_SIZE) * zoom;
}

function buildPolylinePath(points, worldToScreen) {
    if (!Array.isArray(points) || points.length === 0) return null;
    const path = new Path2D();
    const start = worldToScreen(points[0][0], points[0][1]);
    path.moveTo(start.x, start.y);
    for (let index = 1; index < points.length; index += 1) {
        const point = worldToScreen(points[index][0], points[index][1]);
        path.lineTo(point.x, point.y);
    }
    return path;
}

function getInteractionState(state, interactionState = {}) {
    return {
        hoverId: interactionState.hoverId ?? state.selection.hoverId ?? null,
        hoverWorldPos: interactionState.hoverWorldPos ?? state.viewport.hoverWorldPos ?? null,
        terrainRegionHover: interactionState.terrainRegionHover ?? state.ui?.terrainRegionHover ?? null,
        terrainRegionSelection: interactionState.terrainRegionSelection ?? state.ui?.terrainRegionSelection ?? null
    };
}

export function createCoordinateHelpers(canvas, camera) {
    return {
        worldToScreen(wx, wz) {
            return {
                x: canvas.width / 2 + (wx - camera.x) * camera.zoom,
                y: canvas.height / 2 + (wz - camera.z) * camera.zoom
            };
        },
        screenToWorld(sx, sy) {
            return {
                x: camera.x + (sx - canvas.width / 2) / camera.zoom,
                z: camera.z + (sy - canvas.height / 2) / camera.zoom
            };
        }
    };
}

export function renderEditorScene(ctx, canvas, tileManager, state, interactionState = null) {
    const { document, viewport, selection, tools } = state;
    const interactions = getInteractionState(state, interactionState);
    const camera = viewport;
    const helpers = createCoordinateHelpers(canvas, camera);
    const { worldToScreen } = helpers;
    const width = canvas.width;
    const height = canvas.height;
    const zoom = camera.zoom;
    const minX = camera.x - width / 2 / zoom;
    const maxX = camera.x + width / 2 / zoom;
    const minZ = camera.z - height / 2 / zoom;
    const maxZ = camera.z + height / 2 / zoom;
    const viewportRect = { width, height };

    ctx.clearRect(0, 0, width, height);
    drawTerrainLabPreview(ctx, state, viewportRect);
    tileManager.draw(ctx, camera.x, camera.z, zoom, width, height);

    drawGrid(ctx, canvas, camera);
    drawWorldBounds(ctx, state, worldToScreen);
    drawRunway(ctx, worldToScreen, zoom);
    drawDistricts(ctx, state, interactions, document, worldToScreen, viewportRect, { minX, maxX, minZ, maxZ });
    drawRoads(ctx, state, interactions, document, worldToScreen, viewportRect, { minX, maxX, minZ, maxZ });
    drawTerrainRegions(ctx, state, interactions, document, worldToScreen, viewportRect, { minX, maxX, minZ, maxZ });
    drawAirports(ctx, state, interactions, document, worldToScreen, viewportRect, { minX, maxX, minZ, maxZ });
    drawAuthoredObjects(ctx, state, interactions, document, worldToScreen, viewportRect, { minX, maxX, minZ, maxZ });
    drawTerrain(ctx, state, interactions, document, worldToScreen, viewportRect, { minX, maxX, minZ, maxZ });
    drawVantagePoints(ctx, state, interactions, document, worldToScreen, viewportRect, { minX, maxX, minZ, maxZ });
    drawOverlays(ctx, state, interactions, worldToScreen, selection, tools);
}

function drawWorldBounds(ctx, state, worldToScreen) {
    const halfWorldSize = DEFAULT_WORLD_SIZE * 0.5;
    const min = worldToScreen(-halfWorldSize, -halfWorldSize);
    const max = worldToScreen(halfWorldSize, halfWorldSize);
    const width = max.x - min.x;
    const height = max.y - min.y;
    ctx.save();
    ctx.strokeStyle = 'rgba(110, 231, 255, 0.28)';
    ctx.lineWidth = 1.25;
    ctx.setLineDash([10, 8]);
    ctx.strokeRect(min.x, min.y, width, height);
    ctx.setLineDash([]);
    ctx.restore();
}

function drawTerrainLabPreview(ctx, state, viewportRect) {
    const preview = state.ui?.terrainLab?.previewSnapshot;
    if (!preview?.pixels || !preview?.bounds) return;

    if (!preview.__canvas && typeof document !== 'undefined') {
        const offscreen = document.createElement('canvas');
        offscreen.width = preview.width;
        offscreen.height = preview.height;
        const offscreenCtx = offscreen.getContext('2d');
        const imageData = offscreenCtx.createImageData(preview.width, preview.height);
        imageData.data.set(preview.pixels);
        offscreenCtx.putImageData(imageData, 0, 0);
        preview.__canvas = offscreen;
    }

    if (!preview.__canvas) return;

    const screenMinX = viewportRect.width / 2 + (preview.bounds.minX - state.viewport.x) * state.viewport.zoom;
    const screenMaxX = viewportRect.width / 2 + (preview.bounds.maxX - state.viewport.x) * state.viewport.zoom;
    const screenMinY = viewportRect.height / 2 + (preview.bounds.minZ - state.viewport.z) * state.viewport.zoom;
    const screenMaxY = viewportRect.height / 2 + (preview.bounds.maxZ - state.viewport.z) * state.viewport.zoom;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(preview.__canvas, screenMinX, screenMinY, screenMaxX - screenMinX, screenMaxY - screenMinY);
    ctx.restore();
}

function drawGrid(ctx, canvas, camera) {
    const width = canvas.width;
    const height = canvas.height;
    const zoom = camera.zoom;
    const minX = camera.x - width / 2 / zoom;
    const maxX = camera.x + width / 2 / zoom;
    const minZ = camera.z - height / 2 / zoom;
    const maxZ = camera.z + height / 2 / zoom;

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = Math.floor(minX / 1000) * 1000; gx <= maxX; gx += 1000) {
        const sx = width / 2 + (gx - camera.x) * zoom;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, height);
    }
    for (let gz = Math.floor(minZ / 1000) * 1000; gz <= maxZ; gz += 1000) {
        const sy = height / 2 + (gz - camera.z) * zoom;
        ctx.moveTo(0, sy);
        ctx.lineTo(width, sy);
    }
    ctx.stroke();

    const tileSize = getTerrainRegionTileSize(DEFAULT_WORLD_SIZE);
    const tileScreenSize = getTerrainRegionTileScreenSize(camera.zoom);
    if (tileScreenSize < 6) return;
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.10)';
    ctx.beginPath();
    for (let gx = 0; gx <= TERRAIN_REGION_GRID_SIZE; gx += 1) {
        const worldX = -DEFAULT_WORLD_SIZE * 0.5 + gx * tileSize;
        const sx = width / 2 + (worldX - camera.x) * zoom;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, height);
    }
    for (let gz = 0; gz <= TERRAIN_REGION_GRID_SIZE; gz += 1) {
        const worldZ = -DEFAULT_WORLD_SIZE * 0.5 + gz * tileSize;
        const sy = height / 2 + (worldZ - camera.z) * zoom;
        ctx.moveTo(0, sy);
        ctx.lineTo(width, sy);
    }
    ctx.stroke();
}

function drawTerrainRegionTile(ctx, worldToScreen, tileX, tileZ, fillStyle, strokeStyle, lineWidth = 1.2) {
    const bounds = getTerrainRegionTileWorldBounds(tileX, tileZ, DEFAULT_WORLD_SIZE);
    const topLeft = worldToScreen(bounds.minX, bounds.minZ);
    const bottomRight = worldToScreen(bounds.maxX, bounds.maxZ);
    const width = bottomRight.x - topLeft.x;
    const height = bottomRight.y - topLeft.y;
    if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fillRect(topLeft.x, topLeft.y, width, height);
    }
    if (strokeStyle) {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;
        ctx.strokeRect(topLeft.x, topLeft.y, width, height);
    }
}

function drawRunway(ctx, worldToScreen, zoom) {
    const pos = worldToScreen(0, 0);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.fillStyle = COLORS.runway;
    ctx.fillRect(-(100 * zoom) / 2, -(4000 * zoom) / 2, 100 * zoom, 4000 * zoom);
    ctx.restore();
}

function drawDistricts(ctx, state, interactions, document, worldToScreen, viewportRect, worldBounds) {
    if (!isGroupVisible(state, 'districts')) return;
    for (const entityId of getGroupEntityIds(document, 'districts')) {
        if (!isObjectVisible(state, entityId, 'districts')) continue;
        const district = getEntityById(document, entityId);
        const isSelected = state.selection.selectedId === entityId;
        const isHovered = interactions.hoverId === entityId && !isSelected;
        if (!district) continue;
        if (district.center[0] < worldBounds.minX - 1000 || district.center[0] > worldBounds.maxX + 1000 || district.center[1] < worldBounds.minZ - 1000 || district.center[1] > worldBounds.maxZ + 1000) continue;
        const fillStyle = isSelected ? COLORS.districtSelected : isHovered ? 'rgba(255,255,140,0.35)' : COLORS.district;
        if (district.points?.length) {
            const path = buildPolylinePath(district.points, worldToScreen);
            path.closePath();
            ctx.fillStyle = fillStyle;
            ctx.fill(path);
            ctx.strokeStyle = isSelected ? '#fff' : 'rgba(255,255,255,0.45)';
            ctx.lineWidth = isSelected ? 2.2 : 1;
            ctx.stroke(path);
            drawVertexHandles(ctx, state, entityId, district.points, worldToScreen, viewportRect, COLORS.accent);
        }
    }
}

function drawRoads(ctx, state, interactions, document, worldToScreen, viewportRect, worldBounds) {
    if (!isGroupVisible(state, 'roads')) return;
    for (const entityId of getGroupEntityIds(document, 'roads')) {
        if (!isObjectVisible(state, entityId, 'roads')) continue;
        const road = getEntityById(document, entityId);
        if (!road?.points?.length) continue;
        if (road.center[0] < worldBounds.minX - 1500 || road.center[0] > worldBounds.maxX + 1500 || road.center[1] < worldBounds.minZ - 1500 || road.center[1] > worldBounds.maxZ + 1500) continue;
        const isSelected = state.selection.selectedId === entityId;
        const isHovered = interactions.hoverId === entityId && !isSelected;
        const halo = road.surface === 'asphalt' ? 'rgba(255, 159, 67, 0.18)' : road.surface === 'gravel' ? 'rgba(214,190,150,0.18)' : 'rgba(164,120,82,0.18)';
        const stroke = isSelected ? COLORS.roadSelected : isHovered ? '#ffe9c7' : road.surface === 'asphalt' ? COLORS.road : road.surface === 'gravel' ? '#d6be96' : '#a47852';
        const roadWidthPx = Math.max(3, road.width * state.viewport.zoom);
        const haloWidthPx = Math.max(roadWidthPx + 2, (road.width + road.feather * 2) * state.viewport.zoom);

        const path = buildPolylinePath(road.points, worldToScreen);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = haloWidthPx;
        ctx.strokeStyle = halo;
        ctx.stroke(path);
        ctx.lineWidth = isSelected ? roadWidthPx + 2 : roadWidthPx;
        ctx.strokeStyle = stroke;
        ctx.stroke(path);
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';

        drawVertexHandles(ctx, state, entityId, road.points, worldToScreen, viewportRect, stroke);
    }
}

function drawTerrainRegions(ctx, state, interactions, document, worldToScreen, viewportRect, worldBounds) {
    if (!isGroupVisible(state, 'terrainRegions')) return;
    const tileScreenSize = getTerrainRegionTileScreenSize(state.viewport.zoom);
    const showPerTileFill = tileScreenSize >= 16;
    for (const entityId of getGroupEntityIds(document, 'terrainRegions')) {
        if (!isObjectVisible(state, entityId, 'terrainRegions')) continue;
        const region = getEntityById(document, entityId);
        const bounds = region?.bounds;
        if (!bounds) continue;
        if (bounds.maxX < worldBounds.minX || bounds.minX > worldBounds.maxX || bounds.maxZ < worldBounds.minZ || bounds.minZ > worldBounds.maxZ) continue;
        const topLeft = worldToScreen(bounds.minX, bounds.minZ);
        const bottomRight = worldToScreen(bounds.maxX, bounds.maxZ);
        if (!isScreenPointVisible(viewportRect, topLeft, 48) && !isScreenPointVisible(viewportRect, bottomRight, 48)) continue;
        const isSelected = state.selection.selectedId === entityId;
        const isHovered = interactions.hoverId === entityId && !isSelected;
        if (showPerTileFill && (isSelected || isHovered)) {
            for (let tileZ = region.tileZ; tileZ < region.tileZ + region.tileHeight; tileZ += 1) {
                for (let tileX = region.tileX; tileX < region.tileX + region.tileWidth; tileX += 1) {
                    drawTerrainRegionTile(
                        ctx,
                        worldToScreen,
                        tileX,
                        tileZ,
                        isSelected ? 'rgba(74, 222, 128, 0.12)' : isHovered ? 'rgba(74, 222, 128, 0.10)' : 'rgba(34, 197, 94, 0.08)',
                        'rgba(74, 222, 128, 0.18)',
                        0.8
                    );
                }
            }
        }
        ctx.save();
        ctx.fillStyle = isSelected ? COLORS.terrainRegionSelected : isHovered ? 'rgba(74, 222, 128, 0.30)' : COLORS.terrainRegion;
        ctx.strokeStyle = isSelected ? '#bbf7d0' : isHovered ? '#dcfce7' : '#4ade80';
        ctx.lineWidth = isSelected ? 2.4 : 1.3;
        ctx.setLineDash([10, 6]);
        ctx.fillRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
        ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
        ctx.restore();
    }
}

function drawTerrain(ctx, state, interactions, document, worldToScreen, viewportRect, worldBounds) {
    if (!isGroupVisible(state, 'terrain')) return;
    for (const entityId of getGroupEntityIds(document, 'terrain')) {
        if (!isObjectVisible(state, entityId, 'terrain')) continue;
        const edit = getEntityById(document, entityId);
        if (!edit) continue;
        const bounds = edit.bounds || {
            minX: edit.x - edit.radius,
            maxX: edit.x + edit.radius,
            minZ: edit.z - edit.radius,
            maxZ: edit.z + edit.radius
        };
        if (bounds.maxX < worldBounds.minX || bounds.minX > worldBounds.maxX || bounds.maxZ < worldBounds.minZ || bounds.minZ > worldBounds.maxZ) continue;
        const isSelected = state.selection.selectedId === entityId;
        const isHovered = interactions.hoverId === entityId && !isSelected;
        const fillStyle = edit.kind === 'lower' ? 'rgba(255,89,94,0.12)' : edit.kind === 'flatten' ? 'rgba(255,173,51,0.12)' : 'rgba(56,189,248,0.12)';
        const strokeStyle = isSelected ? '#fff' : isHovered ? '#cff5ff' : edit.kind === 'lower' ? '#ff595e' : edit.kind === 'flatten' ? '#ffad33' : '#38bdf8';
        if (Array.isArray(edit.points) && edit.points.length > 1) {
            const path = buildPolylinePath(edit.points, worldToScreen);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = edit.radius * state.viewport.zoom * 2;
            ctx.strokeStyle = fillStyle;
            ctx.stroke(path);
            ctx.lineWidth = isSelected ? 3 : Math.max(2, Math.min(6, edit.radius * state.viewport.zoom * 0.18));
            ctx.strokeStyle = strokeStyle;
            ctx.stroke(path);
            ctx.lineCap = 'butt';
            ctx.lineJoin = 'miter';
            drawVertexHandles(ctx, state, entityId, edit.points, worldToScreen, viewportRect, strokeStyle);
        } else {
            const point = worldToScreen(edit.x, edit.z);
            ctx.beginPath();
            ctx.arc(point.x, point.y, edit.radius * state.viewport.zoom, 0, Math.PI * 2);
            ctx.fillStyle = fillStyle;
            ctx.fill();
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = isSelected ? 2.2 : 1;
            ctx.stroke();
        }
    }
}

function drawAirports(ctx, state, interactions, document, worldToScreen, viewportRect, worldBounds) {
    if (!isGroupVisible(state, 'airports')) return;
    for (const entityId of getGroupEntityIds(document, 'airports')) {
        if (!isObjectVisible(state, entityId, 'airports')) continue;
        const airport = getEntityById(document, entityId);
        if (!isAirport(airport)) continue;
        const bounds = airport.bounds || {
            minX: airport.x - 2500,
            maxX: airport.x + 2500,
            minZ: airport.z - 2500,
            maxZ: airport.z + 2500
        };
        if (bounds.maxX < worldBounds.minX || bounds.minX > worldBounds.maxX || bounds.maxZ < worldBounds.minZ || bounds.minZ > worldBounds.maxZ) continue;
        const point = worldToScreen(airport.x, airport.z);
        if (!isScreenPointVisible(viewportRect, point, 48)) continue;
        const isSelected = state.selection.selectedId === entityId;
        const isHovered = interactions.hoverId === entityId && !isSelected;
        const runwayStart = transformAirportPoint(airport, 0, -AIRPORT_CONFIG.RUNWAY.length * 0.5);
        const runwayEnd = transformAirportPoint(airport, 0, AIRPORT_CONFIG.RUNWAY.length * 0.5);
        const runwayA = worldToScreen(runwayStart.x, runwayStart.z);
        const runwayB = worldToScreen(runwayEnd.x, runwayEnd.z);
        const apronCorners = [
            transformAirportPoint(airport, AIRPORT_CONFIG.APRON.x - AIRPORT_CONFIG.APRON.width * 0.5, AIRPORT_CONFIG.APRON.z - AIRPORT_CONFIG.APRON.depth * 0.5),
            transformAirportPoint(airport, AIRPORT_CONFIG.APRON.x + AIRPORT_CONFIG.APRON.width * 0.5, AIRPORT_CONFIG.APRON.z - AIRPORT_CONFIG.APRON.depth * 0.5),
            transformAirportPoint(airport, AIRPORT_CONFIG.APRON.x + AIRPORT_CONFIG.APRON.width * 0.5, AIRPORT_CONFIG.APRON.z + AIRPORT_CONFIG.APRON.depth * 0.5),
            transformAirportPoint(airport, AIRPORT_CONFIG.APRON.x - AIRPORT_CONFIG.APRON.width * 0.5, AIRPORT_CONFIG.APRON.z + AIRPORT_CONFIG.APRON.depth * 0.5)
        ];

        ctx.save();
        ctx.strokeStyle = isSelected ? '#fff1f8' : isHovered ? '#ffd7ea' : '#f472b6';
        ctx.fillStyle = isSelected ? COLORS.airportSelected : isHovered ? 'rgba(244, 114, 182, 0.32)' : COLORS.airport;
        ctx.lineWidth = isSelected ? 2.4 : 1.5;
        ctx.beginPath();
        ctx.moveTo(runwayA.x, runwayA.y);
        ctx.lineTo(runwayB.x, runwayB.y);
        ctx.stroke();

        const apronPath = new Path2D();
        const apronStart = worldToScreen(apronCorners[0].x, apronCorners[0].z);
        apronPath.moveTo(apronStart.x, apronStart.y);
        for (let index = 1; index < apronCorners.length; index += 1) {
            const corner = worldToScreen(apronCorners[index].x, apronCorners[index].z);
            apronPath.lineTo(corner.x, corner.y);
        }
        apronPath.closePath();
        ctx.fill(apronPath);
        ctx.stroke(apronPath);

        ctx.beginPath();
        ctx.arc(point.x, point.y, isSelected ? 8 : 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function drawAuthoredObjects(ctx, state, interactions, document, worldToScreen, viewportRect, worldBounds) {
    if (!isGroupVisible(state, 'objects')) return;
    for (const entityId of getGroupEntityIds(document, 'objects')) {
        if (!isObjectVisible(state, entityId, 'objects')) continue;
        const authoredObject = getEntityById(document, entityId);
        if (!isAuthoredObject(authoredObject)) continue;
        if (authoredObject.x < worldBounds.minX - 1600 || authoredObject.x > worldBounds.maxX + 1600 || authoredObject.z < worldBounds.minZ - 1600 || authoredObject.z > worldBounds.maxZ + 1600) continue;
        const point = worldToScreen(authoredObject.x, authoredObject.z);
        if (!isScreenPointVisible(viewportRect, point, 40)) continue;
        const asset = getAuthoredObjectAsset(authoredObject.assetId);
        const isSelected = state.selection.selectedId === entityId;
        const isHovered = interactions.hoverId === entityId && !isSelected;
        const radius = isSelected ? 10 : 8;
        const fillStyle = isSelected ? COLORS.objectSelected : isHovered ? '#d5fbff' : asset?.color || COLORS.object;

        ctx.save();
        ctx.translate(point.x, point.y);
        ctx.rotate((authoredObject.yaw || 0) * Math.PI / 180);
        ctx.fillStyle = fillStyle;
        ctx.strokeStyle = '#04131a';
        ctx.lineWidth = isSelected ? 2.2 : 1.4;
        ctx.beginPath();
        ctx.moveTo(0, -radius - 4);
        ctx.lineTo(radius, 0);
        ctx.lineTo(0, radius + 4);
        ctx.lineTo(-radius, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}

function drawVantagePoints(ctx, state, interactions, document, worldToScreen, viewportRect, worldBounds) {
    if (!isGroupVisible(state, 'vantage')) return;
    for (const entityId of getGroupEntityIds(document, 'vantage')) {
        if (!isObjectVisible(state, entityId, 'vantage')) continue;
        const vp = getEntityById(document, entityId);
        if (!vp) continue;
        if (vp.x < worldBounds.minX - 1200 || vp.x > worldBounds.maxX + 1200 || vp.z < worldBounds.minZ - 1200 || vp.z > worldBounds.maxZ + 1200) continue;
        const point = worldToScreen(vp.x, vp.z);
        if (!isScreenPointVisible(viewportRect, point, 40)) continue;
        const isSelected = state.selection.selectedId === entityId;
        const isHovered = interactions.hoverId === entityId && !isSelected;
        ctx.beginPath();
        ctx.arc(point.x, point.y, isSelected ? 9 : 8, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? COLORS.vantageSelected : isHovered ? '#d4ffc0' : COLORS.vantage;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.stroke();
    }
}

function drawVertexHandles(ctx, state, entityId, points, worldToScreen, viewportRect, color) {
    if (state.selection.selectedId !== entityId || state.tools.currentTool !== 'edit-poly') return;
    for (let index = 0; index < points.length; index++) {
        const point = worldToScreen(points[index][0], points[index][1]);
        if (!isScreenPointVisible(viewportRect, point, 12)) continue;
        const active = state.selection.activeVertex?.entityId === entityId && state.selection.activeVertex?.index === index;
        ctx.fillStyle = active ? '#fff' : color;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#08111f';
        ctx.lineWidth = 1.4;
        ctx.stroke();
    }
}

function drawOverlays(ctx, state, interactions, worldToScreen) {
    const tileScreenSize = getTerrainRegionTileScreenSize(state.viewport.zoom);
    if (state.tools.currentTool === 'terrain-region' && interactions.terrainRegionHover) {
        drawTerrainRegionTile(
            ctx,
            worldToScreen,
            interactions.terrainRegionHover.tileX,
            interactions.terrainRegionHover.tileZ,
            interactions.terrainRegionHover.ownerId ? 'rgba(248, 113, 113, 0.16)' : 'rgba(74, 222, 128, 0.12)',
            interactions.terrainRegionHover.ownerId ? '#f87171' : '#86efac',
            tileScreenSize >= 12 ? 1.6 : 2
        );
    }

    const regionSelection = interactions.terrainRegionSelection;
    if (regionSelection?.bounds && Array.isArray(regionSelection.tiles)) {
        ctx.save();
        for (const tile of regionSelection.tiles) {
            drawTerrainRegionTile(
                ctx,
                worldToScreen,
                tile.tileX,
                tile.tileZ,
                tile.blocked ? 'rgba(248, 113, 113, 0.22)' : 'rgba(74, 222, 128, 0.18)',
                tileScreenSize >= 12 ? (tile.blocked ? 'rgba(248, 113, 113, 0.9)' : 'rgba(134, 239, 172, 0.9)') : null,
                tileScreenSize >= 12 ? 1.2 : 0
            );
        }
        const topLeft = worldToScreen(regionSelection.bounds.minX, regionSelection.bounds.minZ);
        const bottomRight = worldToScreen(regionSelection.bounds.maxX, regionSelection.bounds.maxZ);
        ctx.strokeStyle = regionSelection.valid === false ? '#f87171' : '#4ade80';
        ctx.lineWidth = tileScreenSize >= 12 ? 2 : 2.4;
        ctx.setLineDash([10, 6]);
        ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
        ctx.restore();
    }

    if (interactions.hoverWorldPos && isTerrainBrushTool(state.tools.currentTool)) {
        const point = worldToScreen(interactions.hoverWorldPos.x, interactions.hoverWorldPos.z);
        const previewColor = state.tools.currentTool === 'terrain-lower'
            ? 'rgba(255, 89, 94, 0.85)'
            : state.tools.currentTool === 'terrain-flatten'
                ? 'rgba(255, 173, 51, 0.85)'
                : 'rgba(56, 189, 248, 0.85)';
        ctx.beginPath();
        ctx.arc(point.x, point.y, state.tools.terrainBrush.radius * state.viewport.zoom, 0, Math.PI * 2);
        ctx.fillStyle = previewColor.replace('0.85', '0.14');
        ctx.fill();
        ctx.strokeStyle = previewColor;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

function isObjectLocked(state, entityId, groupId) {
    return state.layers.groupLocked[groupId] === true || state.layers.itemLocked[entityId] === true;
}

function getCachedPointBounds(entity, points, pad = 0) {
    if (entity.__editorHitBounds && entity.__editorHitBoundsPad === pad) {
        return entity.__editorHitBounds;
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of points || []) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
    }
    const bounds = {
        minX: minX - pad,
        maxX: maxX + pad,
        minZ: minZ - pad,
        maxZ: maxZ + pad
    };
    entity.__editorHitBounds = bounds;
    entity.__editorHitBoundsPad = pad;
    return bounds;
}

function mayContainWorldPos(groupId, entity, worldPos, zoom) {
    if (groupId === 'vantage') {
        return Math.abs(worldPos.x - entity.x) <= 500 && Math.abs(worldPos.z - entity.z) <= 500;
    }
    if (groupId === 'terrainRegions') {
        const bounds = entity?.bounds;
        return bounds
            ? worldPos.x >= bounds.minX && worldPos.x <= bounds.maxX && worldPos.z >= bounds.minZ && worldPos.z <= bounds.maxZ
            : true;
    }
    if (groupId === 'airports') {
        const bounds = entity?.bounds;
        return bounds
            ? worldPos.x >= bounds.minX && worldPos.x <= bounds.maxX && worldPos.z >= bounds.minZ && worldPos.z <= bounds.maxZ
            : true;
    }
    if (groupId === 'objects') {
        return Math.abs(worldPos.x - entity.x) <= 500 && Math.abs(worldPos.z - entity.z) <= 500;
    }
    if (groupId === 'terrain') {
        const bounds = entity?.bounds;
        if (bounds) {
            return worldPos.x >= bounds.minX && worldPos.x <= bounds.maxX && worldPos.z >= bounds.minZ && worldPos.z <= bounds.maxZ;
        }
        const radius = entity?.radius || 0;
        return Math.abs(worldPos.x - entity.x) <= radius && Math.abs(worldPos.z - entity.z) <= radius;
    }
    if (groupId === 'roads') {
        const bounds = Array.isArray(entity?.points) && entity.points.length > 0
            ? getCachedPointBounds(entity, entity.points, (entity?.width || 0) * 0.5 + (entity?.feather || 0) + 6 / zoom)
            : null;
        return bounds
            ? worldPos.x >= bounds.minX && worldPos.x <= bounds.maxX && worldPos.z >= bounds.minZ && worldPos.z <= bounds.maxZ
            : true;
    }
    if (groupId === 'districts') {
        const bounds = Array.isArray(entity?.points) && entity.points.length > 0
            ? getCachedPointBounds(entity, entity.points)
            : null;
        return bounds
            ? worldPos.x >= bounds.minX && worldPos.x <= bounds.maxX && worldPos.z >= bounds.minZ && worldPos.z <= bounds.maxZ
            : true;
    }
    return true;
}

export function findObjectsAtWorldPos(state, worldPos) {
    const found = [];
    const document = state.document;
    const checkOrder = [
        ['airports', entity => airportContainsWorldPoint(entity, worldPos.x, worldPos.z, Math.max(120, 24 / state.viewport.zoom))],
        ['objects', entity => Math.hypot(worldPos.x - entity.x, worldPos.z - entity.z) < Math.max(220, 14 / state.viewport.zoom)],
        ['vantage', entity => Math.hypot(worldPos.x - entity.x, worldPos.z - entity.z) < 500],
        ['terrainRegions', entity => terrainRegionContainsPoint(entity, worldPos.x, worldPos.z)],
        ['terrain', entity => terrainEditContainsPoint(entity, worldPos.x, worldPos.z)],
        ['roads', entity => roadContainsPoint(entity, worldPos.x, worldPos.z, 6 / state.viewport.zoom)],
        ['districts', entity => districtContainsPoint(entity, worldPos.x, worldPos.z)]
    ];

    for (const [groupId, predicate] of checkOrder) {
        if (!isGroupVisible(state, groupId)) continue;
        const ids = getGroupEntityIds(document, groupId);
        for (let index = ids.length - 1; index >= 0; index--) {
            const entityId = ids[index];
            if (!isObjectVisible(state, entityId, groupId)) continue;
            if (isObjectLocked(state, entityId, groupId)) continue;
            const entity = getEntityById(document, entityId);
            if (!entity || !mayContainWorldPos(groupId, entity, worldPos, state.viewport.zoom)) continue;
            if (entity && predicate(entity)) found.push(entityId);
        }
    }
    return found;
}
