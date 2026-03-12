import { COLORS } from '../../modules/editor/constants.js';
import { districtContainsPoint, getDistanceToSegment, roadContainsPoint, terrainEditContainsPoint } from '../../modules/editor/geometry.js';
import { isRoad, isDistrict, isCity, isTerrainEdit } from '../../modules/editor/objectTypes.js';
import { getEntityById, getGroupEntityIds } from '../core/document.js';

function isGroupVisible(state, groupId) {
    return state.layers.groupVisibility[groupId] !== false;
}

function isObjectVisible(state, entityId, groupId) {
    return isGroupVisible(state, groupId) && state.layers.itemVisibility[entityId] !== false;
}

function isScreenPointVisible({ width, height }, point, pad = 24) {
    return point.x >= -pad && point.x <= width + pad && point.y >= -pad && point.y <= height + pad;
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

export function renderEditorScene(ctx, canvas, tileManager, state) {
    const { document, viewport, selection, tools } = state;
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
    tileManager.draw(ctx, camera.x, camera.z, zoom, width, height);

    drawGrid(ctx, canvas, camera);
    drawRunway(ctx, worldToScreen, zoom);
    drawDistricts(ctx, state, document, worldToScreen, viewportRect, { minX, maxX, minZ, maxZ });
    drawRoads(ctx, state, document, worldToScreen, viewportRect, { minX, maxX, minZ, maxZ });
    drawCities(ctx, state, document, worldToScreen, viewportRect, { minX, maxX, minZ, maxZ });
    drawTerrain(ctx, state, document, worldToScreen, viewportRect, { minX, maxX, minZ, maxZ });
    drawVantagePoints(ctx, state, document, worldToScreen, viewportRect, { minX, maxX, minZ, maxZ });
    drawOverlays(ctx, state, worldToScreen, selection, tools);
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
}

function drawRunway(ctx, worldToScreen, zoom) {
    const pos = worldToScreen(0, 0);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.fillStyle = COLORS.runway;
    ctx.fillRect(-(100 * zoom) / 2, -(4000 * zoom) / 2, 100 * zoom, 4000 * zoom);
    ctx.restore();
}

function drawDistricts(ctx, state, document, worldToScreen, viewportRect, worldBounds) {
    if (!isGroupVisible(state, 'districts')) return;
    for (const entityId of getGroupEntityIds(document, 'districts')) {
        if (!isObjectVisible(state, entityId, 'districts')) continue;
        const district = getEntityById(document, entityId);
        const isSelected = state.selection.selectedId === entityId;
        const isHovered = state.selection.hoverId === entityId && !isSelected;
        if (!district) continue;
        if (district.center[0] < worldBounds.minX - 1000 || district.center[0] > worldBounds.maxX + 1000 || district.center[1] < worldBounds.minZ - 1000 || district.center[1] > worldBounds.maxZ + 1000) continue;
        const fillStyle = isSelected ? COLORS.districtSelected : isHovered ? 'rgba(255,255,140,0.35)' : COLORS.district;
        if (district.points?.length) {
            ctx.beginPath();
            const start = worldToScreen(district.points[0][0], district.points[0][1]);
            ctx.moveTo(start.x, start.y);
            for (let index = 1; index < district.points.length; index++) {
                const point = worldToScreen(district.points[index][0], district.points[index][1]);
                ctx.lineTo(point.x, point.y);
            }
            ctx.closePath();
            ctx.fillStyle = fillStyle;
            ctx.fill();
            ctx.strokeStyle = isSelected ? '#fff' : 'rgba(255,255,255,0.45)';
            ctx.lineWidth = isSelected ? 2.2 : 1;
            ctx.stroke();
            drawVertexHandles(ctx, state, entityId, district.points, worldToScreen, viewportRect, COLORS.accent);
        }
    }
}

function drawRoads(ctx, state, document, worldToScreen, viewportRect, worldBounds) {
    if (!isGroupVisible(state, 'roads')) return;
    for (const entityId of getGroupEntityIds(document, 'roads')) {
        if (!isObjectVisible(state, entityId, 'roads')) continue;
        const road = getEntityById(document, entityId);
        if (!road?.points?.length) continue;
        if (road.center[0] < worldBounds.minX - 1500 || road.center[0] > worldBounds.maxX + 1500 || road.center[1] < worldBounds.minZ - 1500 || road.center[1] > worldBounds.maxZ + 1500) continue;
        const isSelected = state.selection.selectedId === entityId;
        const isHovered = state.selection.hoverId === entityId && !isSelected;
        const halo = road.surface === 'asphalt' ? 'rgba(255, 159, 67, 0.18)' : road.surface === 'gravel' ? 'rgba(214,190,150,0.18)' : 'rgba(164,120,82,0.18)';
        const stroke = isSelected ? COLORS.roadSelected : isHovered ? '#ffe9c7' : road.surface === 'asphalt' ? COLORS.road : road.surface === 'gravel' ? '#d6be96' : '#a47852';
        const roadWidthPx = Math.max(3, road.width * state.viewport.zoom);
        const haloWidthPx = Math.max(roadWidthPx + 2, (road.width + road.feather * 2) * state.viewport.zoom);

        ctx.beginPath();
        road.points.forEach(([x, z], index) => {
            const point = worldToScreen(x, z);
            if (index === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
        });
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = haloWidthPx;
        ctx.strokeStyle = halo;
        ctx.stroke();

        ctx.beginPath();
        road.points.forEach(([x, z], index) => {
            const point = worldToScreen(x, z);
            if (index === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
        });
        ctx.lineWidth = isSelected ? roadWidthPx + 2 : roadWidthPx;
        ctx.strokeStyle = stroke;
        ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';

        drawVertexHandles(ctx, state, entityId, road.points, worldToScreen, viewportRect, stroke);
    }
}

function drawCities(ctx, state, document, worldToScreen, viewportRect, worldBounds) {
    if (!isGroupVisible(state, 'cities')) return;
    for (const entityId of getGroupEntityIds(document, 'cities')) {
        if (!isObjectVisible(state, entityId, 'cities')) continue;
        const city = getEntityById(document, entityId);
        if (!city) continue;
        if (city.center[0] < worldBounds.minX - 1200 || city.center[0] > worldBounds.maxX + 1200 || city.center[1] < worldBounds.minZ - 1200 || city.center[1] > worldBounds.maxZ + 1200) continue;
        const pos = worldToScreen(city.center[0], city.center[1]);
        if (!isScreenPointVisible(viewportRect, pos, 40)) continue;
        const isSelected = state.selection.selectedId === entityId;
        const isHovered = state.selection.hoverId === entityId && !isSelected;
        const markerSize = isSelected ? 10 : isHovered ? 8 : 6;
        ctx.strokeStyle = isSelected ? COLORS.citySelected : isHovered ? '#c9f2ff' : COLORS.city;
        ctx.lineWidth = isSelected ? 2.4 : 2;
        ctx.beginPath();
        ctx.moveTo(pos.x - markerSize, pos.y);
        ctx.lineTo(pos.x + markerSize, pos.y);
        ctx.moveTo(pos.x, pos.y - markerSize);
        ctx.lineTo(pos.x, pos.y + markerSize);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, isSelected ? 4 : 3, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? COLORS.citySelected : isHovered ? '#c9f2ff' : COLORS.city;
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '12px Outfit';
        ctx.textAlign = 'center';
        ctx.fillText(city.id, pos.x, pos.y - 18);
    }
}

function drawTerrain(ctx, state, document, worldToScreen, viewportRect, worldBounds) {
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
        const isHovered = state.selection.hoverId === entityId && !isSelected;
        const fillStyle = edit.kind === 'lower' ? 'rgba(255,89,94,0.12)' : edit.kind === 'flatten' ? 'rgba(255,173,51,0.12)' : 'rgba(56,189,248,0.12)';
        const strokeStyle = isSelected ? '#fff' : isHovered ? '#cff5ff' : edit.kind === 'lower' ? '#ff595e' : edit.kind === 'flatten' ? '#ffad33' : '#38bdf8';
        if (Array.isArray(edit.points) && edit.points.length > 1) {
            ctx.beginPath();
            edit.points.forEach(([x, z], index) => {
                const point = worldToScreen(x, z);
                if (index === 0) ctx.moveTo(point.x, point.y);
                else ctx.lineTo(point.x, point.y);
            });
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = edit.radius * state.viewport.zoom * 2;
            ctx.strokeStyle = fillStyle;
            ctx.stroke();

            ctx.beginPath();
            edit.points.forEach(([x, z], index) => {
                const point = worldToScreen(x, z);
                if (index === 0) ctx.moveTo(point.x, point.y);
                else ctx.lineTo(point.x, point.y);
            });
            ctx.lineWidth = isSelected ? 3 : Math.max(2, Math.min(6, edit.radius * state.viewport.zoom * 0.18));
            ctx.strokeStyle = strokeStyle;
            ctx.stroke();
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

function drawVantagePoints(ctx, state, document, worldToScreen, viewportRect, worldBounds) {
    if (!isGroupVisible(state, 'vantage')) return;
    for (const entityId of getGroupEntityIds(document, 'vantage')) {
        if (!isObjectVisible(state, entityId, 'vantage')) continue;
        const vp = getEntityById(document, entityId);
        if (!vp) continue;
        if (vp.x < worldBounds.minX - 1200 || vp.x > worldBounds.maxX + 1200 || vp.z < worldBounds.minZ - 1200 || vp.z > worldBounds.maxZ + 1200) continue;
        const point = worldToScreen(vp.x, vp.z);
        if (!isScreenPointVisible(viewportRect, point, 40)) continue;
        const isSelected = state.selection.selectedId === entityId;
        const isHovered = state.selection.hoverId === entityId && !isSelected;
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

function drawOverlays(ctx, state, worldToScreen) {
    if (state.viewport.hoverWorldPos && state.tools.currentTool.startsWith('terrain-')) {
        const point = worldToScreen(state.viewport.hoverWorldPos.x, state.viewport.hoverWorldPos.z);
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

export function findObjectsAtWorldPos(state, worldPos) {
    const found = [];
    const document = state.document;
    const checkOrder = [
        ['vantage', entity => Math.hypot(worldPos.x - entity.x, worldPos.z - entity.z) < 500],
        ['terrain', entity => terrainEditContainsPoint(entity, worldPos.x, worldPos.z)],
        ['cities', entity => Math.hypot(worldPos.x - entity.center[0], worldPos.z - entity.center[1]) < 250 / state.viewport.zoom],
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
            if (entity && predicate(entity)) found.push(entityId);
        }
    }
    return found;
}
