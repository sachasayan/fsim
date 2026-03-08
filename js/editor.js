import { Noise } from './modules/noise.js';
import { QuadtreeMapSampler, setStaticSampler, getTerrainHeight } from './modules/world/terrain/TerrainUtils.js';
import { MapTileManager } from './modules/ui/MapTileManager.js';
import { applyTerrainEdits } from './modules/world/terrain/TerrainEdits.js';
import { DISTRICT_TYPES, getDistrictType, getDistrictsForCity, normalizeMapData } from './modules/world/MapDataUtils.js';
import { TOOL_SHORTCUTS, CONTROL_GROUPS, CONTROL_GROUP_BY_ID, COLORS } from './modules/editor/constants.js';
import { isCity, isDistrict, isTerrainEdit, getLayerGroupId as getLayerGroupIdForObject, objectLabel } from './modules/editor/objectTypes.js';
import { districtContainsPoint, getVertexHitIndex, getClosestTerrainSegmentIndex, terrainEditContainsPoint } from './modules/editor/geometry.js';
import {
    getTerrainEditBounds as getTerrainEditBoundsExt,
    refreshTerrainEditGeometry as refreshTerrainEditGeometryExt,
    invalidateTerrainEdit as invalidateTerrainEditExt,
    isTerrainStroke as isTerrainStrokeExt,
    moveTerrainStrokePoint as moveTerrainStrokePointExt,
    insertTerrainStrokePoint as insertTerrainStrokePointExt,
    removeTerrainStrokePoint as removeTerrainStrokePointExt,
    createTerrainStroke as createTerrainStrokeExt,
    appendTerrainStrokePoint as appendTerrainStrokePointExt
} from './modules/editor/terrainEdits.js';
import {
    createLayerState,
    createLayerIdentity,
    isGroupVisible as getGroupVisible,
    isGroupLocked as getGroupLocked,
    isObjectVisible as getObjectVisibleForLayer,
    isObjectLocked as getObjectLockedForLayer,
    getLayerGroupsData as buildLayerGroupsData,
    getObjectByLayerKey as resolveObjectByLayerKey
} from './modules/editor/layers.js';

const canvas = document.getElementById('map-canvas');
const ctx = canvas.getContext('2d');
const coordsDiv = document.getElementById('coords');
const canvasContainer = document.getElementById('canvas-container');
const layersGroupsDiv = document.getElementById('layers-groups');

// State
let worldData = null;
let vantageData = null;
let camera = { x: 0, z: 0, zoom: 0.05 }; // pixels per meter
let isPanning = false;
let lastMouse = { x: 0, y: 0 };
let selectedObject = null;
let isDragging = false;
let draggedVertex = null; // { object: d, index: i }
let currentTool = 'select';
let isPaintingTerrain = false;
let terrainBrush = { radius: 300, strength: 40 };
let activeTerrainStroke = null;
let hoverWorldPos = null;
let hoverObject = null;
let activePointerId = null;
let _sidebarLivePending = false;
let _layersRenderPending = false;
let vantageEntries = [];

const layerState = createLayerState();
const { getObjectUid, getLayerKey } = createLayerIdentity(getLayerGroupIdForObject);

let _rafPending = false;

function scheduleRender() {
    if (!_rafPending) {
        _rafPending = true;
        requestAnimationFrame(() => { _rafPending = false; render(); });
    }
}

function scheduleSidebarLiveUpdate() {
    if (_sidebarLivePending) return;
    _sidebarLivePending = true;
    requestAnimationFrame(() => {
        _sidebarLivePending = false;
        updateSidebarLiveFields();
    });
}

function scheduleLayersPanelRender() {
    if (_layersRenderPending) return;
    _layersRenderPending = true;
    requestAnimationFrame(() => {
        _layersRenderPending = false;
        renderLayersPanel();
    });
}

function getLayerGroupId(obj) {
    return getLayerGroupIdForObject(obj);
}

function isGroupVisible(groupId) {
    return getGroupVisible(layerState, groupId);
}

function isGroupLocked(groupId) {
    return getGroupLocked(layerState, groupId);
}

function isObjectVisible(obj) {
    return getObjectVisibleForLayer(layerState, obj, getLayerGroupIdForObject, getLayerKey);
}

function isObjectLocked(obj) {
    return getObjectLockedForLayer(layerState, obj, getLayerGroupIdForObject, getLayerKey);
}

function rebuildVantageEntries() {
    vantageEntries = [];
    if (!vantageData) return;
    const entries = Object.entries(vantageData);
    for (let i = 0; i < entries.length; i++) {
        const [id, vp] = entries[i];
        vantageEntries.push({ id, obj: vp });
    }
}

function setSelection(nextSelection) {
    selectedObject = nextSelection;
    updateSidebar();
    scheduleRender();
}

function clearSelectionIfUnavailable() {
    if (!selectedObject) return;
    if (!isObjectVisible(selectedObject) || isObjectLocked(selectedObject)) {
        selectedObject = null;
    }
}

function formatControlValue(value) {
    if (!Number.isFinite(value)) return '';
    if (Math.abs(value) >= 100 || Number.isInteger(value)) return String(Math.round(value));
    return value.toFixed(2).replace(/\.?0+$/, '');
}

function syncControlGroup(sourceId, rawValue) {
    const group = CONTROL_GROUP_BY_ID.get(sourceId);
    if (!group) return;
    group.ids.forEach(id => {
        const input = document.getElementById(id);
        if (input && input.value !== String(rawValue)) input.value = rawValue;
    });
    if (group.valueId) {
        const pill = document.getElementById(group.valueId);
        if (pill) pill.textContent = formatControlValue(Number(rawValue));
    }
}

function setSyncedControlValue(id, value) {
    const input = document.getElementById(id);
    if (!input) return;
    input.value = value;
    syncControlGroup(id, value);
}

function sampleTerrainHeight(x, z) {
    const baseHeight = getTerrainHeight(x, z, Noise);
    return applyTerrainEdits(baseHeight, x, z, worldData?.terrainEdits || []);
}

const tileManager = new MapTileManager({
    getTerrainHeight: sampleTerrainHeight,
    tileSize: 256,
    useHillshading: true,
    Noise,
    onTileReady: scheduleRender
});

function getTerrainEditBounds(edit) {
    return getTerrainEditBoundsExt(edit);
}

function refreshTerrainEditGeometry(edit) {
    refreshTerrainEditGeometryExt(edit);
}

function invalidateTerrainEdit(edit) {
    invalidateTerrainEditExt(edit, tileManager);
}

function isTerrainStroke(edit) {
    return isTerrainStrokeExt(edit, isTerrainEdit);
}

function moveTerrainStrokePoint(edit, index, worldPos) {
    moveTerrainStrokePointExt(edit, index, worldPos, { isTerrainEdit, tileManager });
}

function insertTerrainStrokePoint(edit, insertIndex, worldPos) {
    return insertTerrainStrokePointExt(edit, insertIndex, worldPos, { isTerrainEdit, tileManager });
}

function removeTerrainStrokePoint(edit, index) {
    return removeTerrainStrokePointExt(edit, index, { isTerrainEdit, tileManager });
}

function createTerrainStroke(worldPos) {
    return createTerrainStrokeExt(worldPos, {
        currentTool,
        terrainBrush,
        sampleTerrainHeight,
        worldData,
        tileManager
    });
}

function appendTerrainStrokePoint(edit, worldPos) {
    return appendTerrainStrokePointExt(edit, worldPos, { tileManager });
}

async function init() {
    resize();
    window.addEventListener('resize', resize);

    // Load world data
    try {
        const [worldResp, vantageResp, worldBinResp] = await Promise.all([
            fetch('/tools/map.json'),
            fetch('/config/vantage_points.json'),
            fetch('/world/world.bin')
        ]);
        worldData = await worldResp.json();
        vantageData = await vantageResp.json();
        normalizeMapData(worldData);
        rebuildVantageEntries();

        if (worldBinResp.ok) {
            const buf = await worldBinResp.arrayBuffer();
            const sampler = new QuadtreeMapSampler(buf);
            setStaticSampler(sampler);
            console.log(`[Editor] Loaded static world.bin (${(buf.byteLength / 1024 / 1024).toFixed(2)} MB)`);
        }
    } catch (e) {
        console.error("Failed to load map data", e);
    }

    render();
    setupInputs();
    setCanvasToolClass();
    renderLayersPanel();
    setupHotReload();
}

function translateDistrict(district, dx, dz) {
    district.center[0] += dx;
    district.center[1] += dz;
    if (district.points?.length) {
        district.points.forEach(point => {
            point[0] += dx;
            point[1] += dz;
        });
    }
}

function translateCity(city, dx, dz) {
    city.center[0] += dx;
    city.center[1] += dz;
    getDistrictsForCity(worldData, city.id).forEach(district => translateDistrict(district, dx, dz));
}

function findCityForDistrictPlacement() {
    if (isCity(selectedObject)) return selectedObject;
    if (isDistrict(selectedObject) && selectedObject.city_id) {
        return worldData?.cities.find(city => city.id === selectedObject.city_id) || null;
    }
    return null;
}

function createPolygonDistrict(center, districtType = 'commercial') {
    const [cx, cz] = center;
    const size = 500;
    return {
        district_type: districtType,
        center: [cx, cz],
        radius: size,
        points: [
            [cx - size, cz - size],
            [cx + size, cz - size],
            [cx + size, cz + size],
            [cx - size, cz + size]
        ]
    };
}

function getLayerGroupsData() {
    return buildLayerGroupsData(worldData, vantageEntries, objectLabel);
}

function setCanvasToolClass() {
    canvasContainer.classList.remove(
        'tool-select',
        'tool-pan',
        'tool-edit-poly',
        'tool-add-city',
        'tool-add-district',
        'tool-terrain-raise',
        'tool-terrain-lower',
        'tool-terrain-flatten',
        'dragging'
    );
    canvasContainer.classList.add(`tool-${currentTool}`);
    if (isPanning) canvasContainer.classList.add('dragging');
}

function updateSidebarLiveFields() {
    if (!selectedObject) return;
    const coordX = document.getElementById('prop-cx');
    const coordZ = document.getElementById('prop-cz');
    const terrainPoints = document.getElementById('prop-terrain-points');
    if (coordX && coordZ) {
        coordX.value = isCity(selectedObject) || isDistrict(selectedObject) ? selectedObject.center[0] : selectedObject.x;
        coordZ.value = isCity(selectedObject) || isDistrict(selectedObject) ? selectedObject.center[1] : selectedObject.z;
    }
    if (terrainPoints && isTerrainEdit(selectedObject)) {
        terrainPoints.value = String(Array.isArray(selectedObject.points) ? selectedObject.points.length : 0);
    }
}

function renderLayersPanel() {
    if (!layersGroupsDiv) return;
    const groups = getLayerGroupsData();
    const html = groups.map(group => {
        const collapsed = layerState.collapsed.get(group.id) === true;
        const visible = isGroupVisible(group.id);
        const locked = isGroupLocked(group.id);
        const body = collapsed ? '' : `
            <div class="layers-items">
                ${group.items.map(item => {
                    const itemKey = getLayerKey(item.obj);
                    const itemVisible = isObjectVisible(item.obj);
                    const itemLocked = isObjectLocked(item.obj);
                    const selected = selectedObject === item.obj;
                    return `
                        <div class="layer-item ${selected ? 'selected' : ''}">
                            <button class="layer-toggle" type="button" data-layer-item-visible="${itemKey}" title="${itemVisible ? 'Hide layer' : 'Show layer'}">${itemVisible ? 'V' : 'H'}</button>
                            <button class="layer-toggle" type="button" data-layer-item-lock="${itemKey}" title="${itemLocked ? 'Unlock layer' : 'Lock layer'}">${itemLocked ? 'L' : 'U'}</button>
                            <button class="layer-item-select" type="button" data-layer-select="${itemKey}"><span class="layer-item-name">${item.label}</span></button>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        return `
            <div class="layers-group">
                <div class="layers-group-header">
                    <button class="layer-toggle chevron" type="button" data-layer-group-toggle="${group.id}" title="Toggle group">${collapsed ? '+' : '-'}</button>
                    <button class="layer-group-name" type="button" data-layer-group-toggle="${group.id}">${group.label}</button>
                    <span class="layer-count">${group.items.length}</span>
                    <span style="display:flex; gap:6px;">
                        <button class="layer-toggle" type="button" data-layer-group-visible="${group.id}" title="${visible ? 'Hide group' : 'Show group'}">${visible ? 'V' : 'H'}</button>
                        <button class="layer-toggle" type="button" data-layer-group-lock="${group.id}" title="${locked ? 'Unlock group' : 'Lock group'}">${locked ? 'L' : 'U'}</button>
                    </span>
                </div>
                ${body}
            </div>
        `;
    }).join('');
    layersGroupsDiv.innerHTML = html;
}

function getObjectByLayerKey(layerKey) {
    return resolveObjectByLayerKey(layerKey, getLayerGroupsData(), getObjectUid);
}

function canInteractWithObject(obj) {
    return !!obj && isObjectVisible(obj) && !isObjectLocked(obj);
}

function setupHotReload() {
    const es = new EventSource('/events');
    es.addEventListener('reload-city', async () => {
        console.log("🔄 World rebuild detected, refreshing terrain...");
        try {
            const [worldResp, mapResp] = await Promise.all([
                fetch('/world/world.bin'),
                fetch('/tools/map.json')
            ]);
            if (worldResp.ok) {
                const buf = await worldResp.arrayBuffer();
                const sampler = new QuadtreeMapSampler(buf);
                setStaticSampler(sampler);
            }
            if (mapResp.ok) {
                worldData = await mapResp.json();
                normalizeMapData(worldData);
            }
            tileManager.clearCache();
            clearSelectionIfUnavailable();
            updateSidebar();
            renderLayersPanel();
            scheduleRender();
            console.log("✨ Terrain refreshed!");
        } catch (e) {
            console.error("Failed to hot-reload world.bin", e);
        }
    });
}

function resize() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    scheduleRender();
}

function worldToScreen(wx, wz) {
    return {
        x: canvas.width / 2 + (wx - camera.x) * camera.zoom,
        y: canvas.height / 2 + (wz - camera.z) * camera.zoom
    };
}

function screenToWorld(sx, sy) {
    return {
        x: camera.x + (sx - canvas.width / 2) / camera.zoom,
        z: camera.z + (sy - canvas.height / 2) / camera.zoom
    };
}


function render() {
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const zoom = camera.zoom;
    const minX = camera.x - halfWidth / zoom;
    const maxX = camera.x + halfWidth / zoom;
    const minZ = camera.z - halfHeight / zoom;
    const maxZ = camera.z + halfHeight / zoom;
    const offscreenPadPx = 24;

    const toScreen = (wx, wz) => ({
        x: halfWidth + (wx - camera.x) * zoom,
        y: halfHeight + (wz - camera.z) * zoom
    });
    const isWorldPointNearViewport = (wx, wz, padMeters = 0) =>
        wx >= minX - padMeters && wx <= maxX + padMeters && wz >= minZ - padMeters && wz <= maxZ + padMeters;
    const isScreenPointVisible = (sx, sy, padPx = offscreenPadPx) =>
        sx >= -padPx && sx <= width + padPx && sy >= -padPx && sy <= height + padPx;

    ctx.clearRect(0, 0, width, height);
    tileManager.draw(ctx, camera.x, camera.z, zoom, width, height);

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const gridSpacing = 1000;
    ctx.beginPath();
    for (let gx = Math.floor(minX / gridSpacing) * gridSpacing; gx <= maxX; gx += gridSpacing) {
        const sx = halfWidth + (gx - camera.x) * zoom;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, height);
    }
    for (let gz = Math.floor(minZ / gridSpacing) * gridSpacing; gz <= maxZ; gz += gridSpacing) {
        const sy = halfHeight + (gz - camera.z) * zoom;
        ctx.moveTo(0, sy);
        ctx.lineTo(width, sy);
    }
    ctx.stroke();

    if (!worldData) return;

    const rwPos = toScreen(0, 0);
    ctx.save();
    ctx.translate(rwPos.x, rwPos.y);
    ctx.fillStyle = COLORS.runway;
    const rwW = 100 * zoom;
    const rwL = 4000 * zoom;
    ctx.fillRect(-rwW / 2, -rwL / 2, rwW, rwL);
    ctx.restore();

    const districts = worldData.districts || [];
    for (let i = 0; i < districts.length; i++) {
        const d = districts[i];
        if (!isObjectVisible(d)) continue;
        if (!isWorldPointNearViewport(d.center[0], d.center[1], (d.radius || 700))) continue;
        const isSelected = selectedObject === d;
        const isHovered = hoverObject === d && !isSelected;
        const fillStyle = isSelected ? COLORS.districtSelected : isHovered ? 'rgba(255, 255, 140, 0.35)' : COLORS.district;
        if (d.points && d.points.length > 0) {
            ctx.beginPath();
            const startPos = toScreen(d.points[0][0], d.points[0][1]);
            ctx.moveTo(startPos.x, startPos.y);
            for (let p = 1; p < d.points.length; p++) {
                const pointPos = toScreen(d.points[p][0], d.points[p][1]);
                ctx.lineTo(pointPos.x, pointPos.y);
            }
            ctx.closePath();
            ctx.fillStyle = fillStyle;
            ctx.fill();
            ctx.strokeStyle = isSelected ? '#fff' : isHovered ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)';
            ctx.lineWidth = isSelected ? 2.2 : 1;
            ctx.stroke();

            if (isSelected && currentTool === 'edit-poly') {
                for (let p = 0; p < d.points.length; p++) {
                    const vp = toScreen(d.points[p][0], d.points[p][1]);
                    if (!isScreenPointVisible(vp.x, vp.y)) continue;
                    ctx.fillStyle = (draggedVertex && draggedVertex.object === d && draggedVertex.index === p) ? '#fff' : COLORS.accent;
                    ctx.beginPath();
                    ctx.arc(vp.x, vp.y, 6, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#021018';
                    ctx.lineWidth = 1.2;
                    ctx.stroke();
                }
            }
        } else {
            const dPos = toScreen(d.center[0], d.center[1]);
            const dRad = d.radius * zoom;
            if (!isScreenPointVisible(dPos.x, dPos.y, dRad + offscreenPadPx)) continue;
            ctx.beginPath();
            ctx.arc(dPos.x, dPos.y, dRad, 0, Math.PI * 2);
            ctx.fillStyle = fillStyle;
            ctx.fill();
            ctx.strokeStyle = isSelected ? '#fff' : 'rgba(255,255,255,0.2)';
            ctx.lineWidth = isSelected ? 1.8 : 1;
            ctx.stroke();
        }
    }

    const cities = worldData.cities || [];
    for (let i = 0; i < cities.length; i++) {
        const city = cities[i];
        if (!isObjectVisible(city)) continue;
        if (!isWorldPointNearViewport(city.center[0], city.center[1], 1200)) continue;
        const pos = toScreen(city.center[0], city.center[1]);
        if (!isScreenPointVisible(pos.x, pos.y, 36)) continue;
        const isSelected = selectedObject === city;
        const isHovered = hoverObject === city && !isSelected;
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

        if (isScreenPointVisible(pos.x, pos.y - 18, 40)) {
            ctx.fillStyle = '#fff';
            ctx.font = '12px Outfit';
            ctx.textAlign = 'center';
            ctx.fillText(city.id, pos.x, pos.y - 18);
        }
    }

    const terrainEdits = worldData.terrainEdits || [];
    for (let i = 0; i < terrainEdits.length; i++) {
        const edit = terrainEdits[i];
        if (!isObjectVisible(edit)) continue;
        const bounds = getTerrainEditBounds(edit);
        if (bounds.maxX < minX || bounds.minX > maxX || bounds.maxZ < minZ || bounds.minZ > maxZ) continue;
        const isSelected = selectedObject === edit;
        const isHovered = hoverObject === edit && !isSelected;
        const fillStyle = edit.kind === 'lower'
            ? 'rgba(255, 89, 94, 0.12)'
            : edit.kind === 'flatten'
                ? 'rgba(255, 173, 51, 0.12)'
                : 'rgba(56, 189, 248, 0.12)';
        const baseStroke = edit.kind === 'lower' ? '#ff595e' : edit.kind === 'flatten' ? '#ffad33' : '#38bdf8';
        const strokeStyle = isSelected ? '#fff' : isHovered ? '#cff5ff' : baseStroke;
        const points = Array.isArray(edit.points) ? edit.points : null;

        if (points?.length > 1) {
            ctx.beginPath();
            for (let p = 0; p < points.length; p++) {
                const pos = toScreen(points[p][0], points[p][1]);
                if (p === 0) ctx.moveTo(pos.x, pos.y);
                else ctx.lineTo(pos.x, pos.y);
            }
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = edit.radius * zoom * 2;
            ctx.strokeStyle = fillStyle;
            ctx.stroke();

            ctx.beginPath();
            for (let p = 0; p < points.length; p++) {
                const pos = toScreen(points[p][0], points[p][1]);
                if (p === 0) ctx.moveTo(pos.x, pos.y);
                else ctx.lineTo(pos.x, pos.y);
            }
            ctx.lineWidth = isSelected ? 3 : Math.max(2, Math.min(6, edit.radius * zoom * 0.18));
            ctx.strokeStyle = strokeStyle;
            ctx.stroke();
            ctx.lineCap = 'butt';
            ctx.lineJoin = 'miter';

            if (isSelected && currentTool === 'edit-poly') {
                for (let p = 0; p < points.length; p++) {
                    const vp = toScreen(points[p][0], points[p][1]);
                    if (!isScreenPointVisible(vp.x, vp.y)) continue;
                    ctx.fillStyle = (draggedVertex && draggedVertex.object === edit && draggedVertex.index === p) ? '#fff' : strokeStyle;
                    ctx.beginPath();
                    ctx.arc(vp.x, vp.y, 6, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#08111f';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }
            }
            continue;
        }

        const [px, pz] = points?.[0] || [edit.x, edit.z];
        const pos = toScreen(px, pz);
        const radius = edit.radius * zoom;
        if (!isScreenPointVisible(pos.x, pos.y, radius + offscreenPadPx)) continue;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = fillStyle;
        ctx.fill();
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = isSelected ? 2.2 : 1;
        ctx.stroke();
    }

    if (hoverWorldPos && currentTool.startsWith('terrain-') && !isPaintingTerrain) {
        const pos = toScreen(hoverWorldPos.x, hoverWorldPos.z);
        const previewColor = currentTool === 'terrain-lower'
            ? 'rgba(255, 89, 94, 0.85)'
            : currentTool === 'terrain-flatten'
                ? 'rgba(255, 173, 51, 0.85)'
                : 'rgba(56, 189, 248, 0.85)';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, terrainBrush.radius * zoom, 0, Math.PI * 2);
        ctx.fillStyle = previewColor.replace('0.85', '0.14');
        ctx.fill();
        ctx.strokeStyle = previewColor;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(pos.x - 8, pos.y);
        ctx.lineTo(pos.x + 8, pos.y);
        ctx.moveTo(pos.x, pos.y - 8);
        ctx.lineTo(pos.x, pos.y + 8);
        ctx.strokeStyle = previewColor;
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    for (let i = 0; i < vantageEntries.length; i++) {
        const { id, obj: vp } = vantageEntries[i];
        if (!isObjectVisible(vp)) continue;
        if (!isWorldPointNearViewport(vp.x, vp.z, 1500)) continue;
        const pos = toScreen(vp.x, vp.z);
        if (!isScreenPointVisible(pos.x, pos.y, 40)) continue;
        const isSelected = selectedObject === vp;
        const isHovered = hoverObject === vp && !isSelected;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, isSelected ? 9 : 8, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? COLORS.vantageSelected : isHovered ? '#d4ffc0' : COLORS.vantage;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = '10px Outfit';
        ctx.textAlign = 'center';
        ctx.fillText(id, pos.x, pos.y + 20);
    }
}

function getCanvasPointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        inside: event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
    };
}

function findObjectAtWorldPos(worldPos, { allowLocked = false } = {}) {
    if (!worldData) return null;

    const districts = worldData.districts || [];
    for (let i = districts.length - 1; i >= 0; i--) {
        const district = districts[i];
        if (!isObjectVisible(district)) continue;
        if (!allowLocked && isObjectLocked(district)) continue;
        if (districtContainsPoint(district, worldPos.x, worldPos.z)) return district;
    }

    const cities = worldData.cities || [];
    for (let i = cities.length - 1; i >= 0; i--) {
        const city = cities[i];
        if (!isObjectVisible(city)) continue;
        if (!allowLocked && isObjectLocked(city)) continue;
        const dist = Math.hypot(worldPos.x - city.center[0], worldPos.z - city.center[1]);
        if (dist < 250 / camera.zoom) return city;
    }

    const terrainEdits = worldData.terrainEdits || [];
    for (let i = terrainEdits.length - 1; i >= 0; i--) {
        const edit = terrainEdits[i];
        if (!isObjectVisible(edit)) continue;
        if (!allowLocked && isObjectLocked(edit)) continue;
        if (terrainEditContainsPoint(edit, worldPos.x, worldPos.z)) return edit;
    }

    for (let i = vantageEntries.length - 1; i >= 0; i--) {
        const vp = vantageEntries[i].obj;
        if (!isObjectVisible(vp)) continue;
        if (!allowLocked && isObjectLocked(vp)) continue;
        const dist = Math.hypot(worldPos.x - vp.x, worldPos.z - vp.z);
        if (dist < 500) return vp;
    }

    return null;
}


function setupInputs() {
    canvas.addEventListener('contextmenu', e => {
        e.preventDefault();
        if (!selectedObject || !selectedObject.points || currentTool !== 'edit-poly' || isObjectLocked(selectedObject)) return;
        const point = getCanvasPointFromEvent(e);
        const worldPos = screenToWorld(point.x, point.y);
        if (selectedObject && selectedObject.points) {
            const hitVertex = getVertexHitIndex(selectedObject.points, worldPos, 100 / camera.zoom);
            if (hitVertex !== -1) {
                if (isTerrainStroke(selectedObject)) {
                    removeTerrainStrokePoint(selectedObject, hitVertex);
                } else {
                    selectedObject.points.splice(hitVertex, 1);
                }
                updateSidebar();
                scheduleRender();
            }
        }
    });

    canvas.addEventListener('dblclick', e => {
        if (!selectedObject || !selectedObject.points || currentTool !== 'edit-poly' || isObjectLocked(selectedObject)) return;
        const point = getCanvasPointFromEvent(e);
        const worldPos = screenToWorld(point.x, point.y);
        if (selectedObject && selectedObject.points) {
            if (isTerrainStroke(selectedObject)) {
                const insertIndex = getClosestTerrainSegmentIndex(selectedObject, worldPos, Math.max(80, selectedObject.radius) / camera.zoom);
                if (insertIndex !== -1) {
                    insertTerrainStrokePoint(selectedObject, insertIndex, worldPos);
                } else {
                    selectedObject.points.push([Math.round(worldPos.x), Math.round(worldPos.z)]);
                    refreshTerrainEditGeometry(selectedObject);
                    invalidateTerrainEdit(selectedObject);
                }
            } else {
                // Add vertex at mouse position
                selectedObject.points.push([Math.round(worldPos.x), Math.round(worldPos.z)]);
            }
            updateSidebar();
            scheduleRender();
        }
    });

    canvas.addEventListener('pointerdown', e => {
        const point = getCanvasPointFromEvent(e);
        if (!point.inside) return;
        const worldPos = screenToWorld(point.x, point.y);
        activePointerId = e.pointerId;
        canvas.setPointerCapture(e.pointerId);

        if (e.button === 1 || currentTool === 'pan') {
            isPanning = true;
            lastMouse = { x: point.x, y: point.y };
            setCanvasToolClass();
            return;
        }

        if (currentTool === 'edit-poly' && selectedObject && selectedObject.points && !isObjectLocked(selectedObject)) {
            const hitVertex = getVertexHitIndex(selectedObject.points, worldPos, 100 / camera.zoom);
            if (hitVertex !== -1) {
                draggedVertex = { object: selectedObject, index: hitVertex };
                return;
            }
        }

        if (currentTool.startsWith('terrain-')) {
            isPaintingTerrain = true;
            activeTerrainStroke = createTerrainStroke(worldPos);
            setSelection(activeTerrainStroke);
            return;
        }

        if (currentTool === 'add-city') {
            const center = [Math.round(worldPos.x / 100) * 100, Math.round(worldPos.z / 100) * 100];
            const newCity = {
                id: `city_${worldData.cities.length + 1}`,
                center,
                road: { seed: Math.floor(Math.random() * 1000), blockScale: 130, arterialSpacing: 500, density: 0.7 }
            };
            worldData.cities.push(newCity);
            const district = createPolygonDistrict(center);
            district.city_id = newCity.id;
            worldData.districts.push(district);
            setSelection(newCity);
            setTool('select');
            return;
        }

        if (currentTool === 'add-district') {
            const districtCenter = [Math.round(worldPos.x / 100) * 100, Math.round(worldPos.z / 100) * 100];
            const newDistrict = createPolygonDistrict(districtCenter);
            const parentCity = findCityForDistrictPlacement();
            if (parentCity) newDistrict.city_id = parentCity.id;
            worldData.districts.push(newDistrict);
            setSelection(newDistrict);
            setTool('edit-poly');
            return;
        }

        const found = findObjectAtWorldPos(worldPos);
        setSelection(found);
        if (found && !isTerrainEdit(found) && !isObjectLocked(found)) isDragging = true;
    });

    window.addEventListener('pointermove', e => {
        const point = getCanvasPointFromEvent(e);
        const worldPos = screenToWorld(point.x, point.y);
        hoverWorldPos = point.inside ? worldPos : null;
        if (!isPanning && !isDragging && !draggedVertex && !isPaintingTerrain) {
            const nextHoverObject = point.inside ? findObjectAtWorldPos(worldPos, { allowLocked: true }) : null;
            if (hoverObject !== nextHoverObject) {
                hoverObject = nextHoverObject;
                scheduleRender();
            }
        }
        if (point.inside) {
            coordsDiv.innerText = `X: ${Math.round(worldPos.x)}, Z: ${Math.round(worldPos.z)}`;
        }

        if (isPanning) {
            const dx = point.x - lastMouse.x;
            const dy = point.y - lastMouse.y;
            camera.x -= dx / camera.zoom;
            camera.z -= dy / camera.zoom;
            lastMouse = { x: point.x, y: point.y };
            scheduleRender();
            return;
        }

        if (draggedVertex) {
            const d = draggedVertex.object;
            const idx = draggedVertex.index;
            if (isTerrainStroke(d)) {
                moveTerrainStrokePoint(d, idx, worldPos);
            } else {
                d.points[idx][0] = Math.round(worldPos.x);
                d.points[idx][1] = Math.round(worldPos.z);
            }
            scheduleSidebarLiveUpdate();
            scheduleRender();
            return;
        }

        if (isPaintingTerrain) {
            if (activeTerrainStroke && appendTerrainStrokePoint(activeTerrainStroke, worldPos)) {
                selectedObject = activeTerrainStroke;
                scheduleSidebarLiveUpdate();
                scheduleRender();
            }
            return;
        }

        if (currentTool.startsWith('terrain-')) {
            scheduleRender();
        }

        if (isDragging && selectedObject) {
            if (selectedObject.center) {
                const nextX = Math.round(worldPos.x / 100) * 100;
                const nextZ = Math.round(worldPos.z / 100) * 100;
                if (isDistrict(selectedObject)) {
                    translateDistrict(selectedObject, nextX - selectedObject.center[0], nextZ - selectedObject.center[1]);
                } else if (isCity(selectedObject)) {
                    translateCity(selectedObject, nextX - selectedObject.center[0], nextZ - selectedObject.center[1]);
                } else {
                    selectedObject.center[0] = nextX;
                    selectedObject.center[1] = nextZ;
                }
            } else if (isTerrainEdit(selectedObject)) {
                invalidateTerrainEdit(selectedObject);
                selectedObject.x = Math.round(worldPos.x);
                selectedObject.z = Math.round(worldPos.z);
                invalidateTerrainEdit(selectedObject);
            } else {
                selectedObject.x = Math.round(worldPos.x);
                selectedObject.z = Math.round(worldPos.z);
            }
            scheduleSidebarLiveUpdate();
            scheduleRender();
        }
    });

    window.addEventListener('pointerup', e => {
        if (activePointerId !== null && e.pointerId === activePointerId) {
            if (canvas.hasPointerCapture(e.pointerId)) {
                canvas.releasePointerCapture(e.pointerId);
            }
            activePointerId = null;
        }
        isPanning = false;
        isDragging = false;
        draggedVertex = null;
        isPaintingTerrain = false;
        activeTerrainStroke = null;
        setCanvasToolClass();
    });

    window.addEventListener('pointercancel', () => {
        activePointerId = null;
        isPanning = false;
        isDragging = false;
        draggedVertex = null;
        isPaintingTerrain = false;
        activeTerrainStroke = null;
        setCanvasToolClass();
    });

    canvas.addEventListener('mouseleave', () => {
        hoverWorldPos = null;
        hoverObject = null;
        scheduleRender();
    });

    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const point = getCanvasPointFromEvent(e);
        const mouseWorldBefore = screenToWorld(point.x, point.y);
        const zoomSpeed = 1.1;
        if (e.deltaY < 0) camera.zoom *= zoomSpeed;
        else camera.zoom /= zoomSpeed;
        camera.zoom = Math.max(0.001, Math.min(1.0, camera.zoom));
        const mouseWorldAfter = screenToWorld(point.x, point.y);
        camera.x -= (mouseWorldAfter.x - mouseWorldBefore.x);
        camera.z -= (mouseWorldAfter.z - mouseWorldBefore.z);
        scheduleRender();
    }, { passive: false });

    layersGroupsDiv?.addEventListener('click', e => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        const groupToggle = target.closest('[data-layer-group-toggle]')?.getAttribute('data-layer-group-toggle');
        if (groupToggle) {
            layerState.collapsed.set(groupToggle, !(layerState.collapsed.get(groupToggle) === true));
            scheduleLayersPanelRender();
            return;
        }
        const groupVisible = target.closest('[data-layer-group-visible]')?.getAttribute('data-layer-group-visible');
        if (groupVisible) {
            layerState.groupVisibility.set(groupVisible, !isGroupVisible(groupVisible));
            clearSelectionIfUnavailable();
            updateSidebar();
            scheduleLayersPanelRender();
            scheduleRender();
            return;
        }
        const groupLock = target.closest('[data-layer-group-lock]')?.getAttribute('data-layer-group-lock');
        if (groupLock) {
            layerState.groupLocked.set(groupLock, !isGroupLocked(groupLock));
            clearSelectionIfUnavailable();
            updateSidebar();
            scheduleLayersPanelRender();
            scheduleRender();
            return;
        }
        const itemVisible = target.closest('[data-layer-item-visible]')?.getAttribute('data-layer-item-visible');
        if (itemVisible) {
            const obj = getObjectByLayerKey(itemVisible);
            if (obj) {
                layerState.itemVisibility.set(itemVisible, !isObjectVisible(obj));
                clearSelectionIfUnavailable();
                updateSidebar();
                scheduleLayersPanelRender();
                scheduleRender();
            }
            return;
        }
        const itemLock = target.closest('[data-layer-item-lock]')?.getAttribute('data-layer-item-lock');
        if (itemLock) {
            const obj = getObjectByLayerKey(itemLock);
            if (obj) {
                layerState.itemLocked.set(itemLock, !isObjectLocked(obj));
                clearSelectionIfUnavailable();
                updateSidebar();
                scheduleLayersPanelRender();
                scheduleRender();
            }
            return;
        }
        const itemSelect = target.closest('[data-layer-select]')?.getAttribute('data-layer-select');
        if (itemSelect) {
            const obj = getObjectByLayerKey(itemSelect);
            if (obj && canInteractWithObject(obj)) setSelection(obj);
        }
    });

    // Toolbar
    document.getElementById('tool-select').onclick = () => setTool('select');
    document.getElementById('tool-add-city').onclick = () => setTool('add-city');
    document.getElementById('tool-add-district').onclick = () => setTool('add-district');
    document.getElementById('tool-edit-poly').onclick = () => setTool('edit-poly');
    document.getElementById('tool-terrain-raise').onclick = () => setTool('terrain-raise');
    document.getElementById('tool-terrain-lower').onclick = () => setTool('terrain-lower');
    document.getElementById('tool-terrain-flatten').onclick = () => setTool('terrain-flatten');
    document.getElementById('tool-pan').onclick = () => setTool('pan');
    window.addEventListener('keydown', e => {
        const activeTag = document.activeElement?.tagName || '';
        if (activeTag === 'INPUT' || activeTag === 'SELECT' || activeTag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
        const tool = TOOL_SHORTCUTS[e.key.toLowerCase()];
        if (!tool) return;
        e.preventDefault();
        setTool(tool);
    });

    // Sidebar listeners
    ['prop-cx', 'prop-cz', 'prop-seed'].forEach(id => {
        document.getElementById(id).onchange = e => {
            if (!selectedObject || isObjectLocked(selectedObject)) return;
            const val = parseFloat(e.target.value);
            if (id === 'prop-cx') {
                if (isDistrict(selectedObject)) translateDistrict(selectedObject, val - selectedObject.center[0], 0);
                else if (isCity(selectedObject)) translateCity(selectedObject, val - selectedObject.center[0], 0);
                else if (isTerrainEdit(selectedObject)) {
                    if (Array.isArray(selectedObject.points) && selectedObject.points.length > 0) {
                        updateSidebar();
                        return;
                    }
                    invalidateTerrainEdit(selectedObject);
                    selectedObject.x = val;
                    refreshTerrainEditGeometry(selectedObject);
                    invalidateTerrainEdit(selectedObject);
                } else selectedObject.x = val;
            }
            if (id === 'prop-cz') {
                if (isDistrict(selectedObject)) translateDistrict(selectedObject, 0, val - selectedObject.center[1]);
                else if (isCity(selectedObject)) translateCity(selectedObject, 0, val - selectedObject.center[1]);
                else if (isTerrainEdit(selectedObject)) {
                    if (Array.isArray(selectedObject.points) && selectedObject.points.length > 0) {
                        updateSidebar();
                        return;
                    }
                    invalidateTerrainEdit(selectedObject);
                    selectedObject.z = val;
                    refreshTerrainEditGeometry(selectedObject);
                    invalidateTerrainEdit(selectedObject);
                } else selectedObject.z = val;
            }
            if (id === 'prop-seed') selectedObject.road.seed = val;
            scheduleRender();
        };
    });

    ['prop-density', 'prop-density-range', 'prop-alt', 'prop-alt-range', 'prop-tilt', 'prop-tilt-range'].forEach(id => {
        document.getElementById(id).oninput = e => {
            if (!selectedObject || isObjectLocked(selectedObject)) return;
            const val = parseFloat(e.target.value);
            if (!Number.isFinite(val)) return;
            if (id.startsWith('prop-density') && !isCity(selectedObject)) return;
            if ((id.startsWith('prop-alt') || id.startsWith('prop-tilt')) && (isCity(selectedObject) || isDistrict(selectedObject) || isTerrainEdit(selectedObject))) return;
            syncControlGroup(id, val);
            if (id.startsWith('prop-density')) selectedObject.road.density = val;
            if (id.startsWith('prop-alt')) selectedObject.y = val;
            if (id.startsWith('prop-tilt')) selectedObject.tilt = val;
            scheduleRender();
        };
    });

    document.getElementById('prop-district-type').onchange = e => {
        if (!isDistrict(selectedObject) || isObjectLocked(selectedObject)) return;
        selectedObject.district_type = DISTRICT_TYPES.includes(e.target.value) ? e.target.value : 'residential';
        scheduleRender();
    };

    ['prop-terrain-radius', 'prop-terrain-radius-range', 'prop-terrain-delta', 'prop-terrain-delta-range', 'prop-terrain-target', 'prop-terrain-target-range', 'prop-terrain-opacity', 'prop-terrain-opacity-range'].forEach(id => {
        document.getElementById(id).oninput = e => {
            if (!isTerrainEdit(selectedObject) || isObjectLocked(selectedObject)) return;
            const val = parseFloat(e.target.value);
            if (!Number.isFinite(val)) return;
            syncControlGroup(id, val);
            const prevBounds = getTerrainEditBounds(selectedObject);
            tileManager.invalidateWorldRect(prevBounds.minX, prevBounds.minZ, prevBounds.maxX, prevBounds.maxZ);
            if (id.startsWith('prop-terrain-radius')) selectedObject.radius = val;
            if (id.startsWith('prop-terrain-delta')) selectedObject.delta = val;
            if (id.startsWith('prop-terrain-target')) selectedObject.target_height = val;
            if (id.startsWith('prop-terrain-opacity')) selectedObject.opacity = val;
            refreshTerrainEditGeometry(selectedObject);
            invalidateTerrainEdit(selectedObject);
            scheduleSidebarLiveUpdate();
            scheduleRender();
        };
    });
    ['terrain-brush-radius', 'terrain-brush-radius-range', 'terrain-brush-strength', 'terrain-brush-strength-range'].forEach(id => {
        document.getElementById(id).oninput = e => {
            const val = parseFloat(e.target.value);
            if (!Number.isFinite(val)) return;
            syncControlGroup(id, val);
            if (id.startsWith('terrain-brush-radius')) terrainBrush.radius = val;
            if (id.startsWith('terrain-brush-strength')) terrainBrush.strength = val;
        };
    });

    document.getElementById('save-btn').onclick = save;
    document.getElementById('tool-delete').onclick = deleteObject;
    document.getElementById('jump-sim-btn').onclick = jumpToSim;

    CONTROL_GROUPS.forEach(group => syncControlGroup(group.ids[0], document.getElementById(group.ids[0])?.value ?? ''));
    renderLayersPanel();
}

function jumpToSim() {
    if (!selectedObject || selectedObject.center || isTerrainEdit(selectedObject)) return;
    const url = `/fsim.html?x=${selectedObject.x}&y=${selectedObject.y}&z=${selectedObject.z}&tilt=${selectedObject.tilt || 45}&fog=${selectedObject.fog || 0}&clouds=${selectedObject.clouds || 0}&lighting=${selectedObject.lighting || 'noon'}`;
    window.open(url, '_blank');
}

function deleteObject() {
    if (!selectedObject || isObjectLocked(selectedObject)) return;
    const label = selectedObject.id || (isDistrict(selectedObject) ? getDistrictType(selectedObject) : isTerrainEdit(selectedObject) ? selectedObject.kind : 'selection');
    if (confirm(`Delete ${label}?`)) {
        const cityIdx = worldData.cities.indexOf(selectedObject);
        if (cityIdx !== -1) {
            const cityId = selectedObject.id;
            worldData.cities.splice(cityIdx, 1);
            worldData.districts = worldData.districts.filter(district => district.city_id !== cityId);
        } else if (isDistrict(selectedObject)) {
            const dIdx = worldData.districts.indexOf(selectedObject);
            if (dIdx !== -1) worldData.districts.splice(dIdx, 1);
        } else if (isTerrainEdit(selectedObject)) {
            const editIdx = worldData.terrainEdits.indexOf(selectedObject);
            if (editIdx !== -1) worldData.terrainEdits.splice(editIdx, 1);
            invalidateTerrainEdit(selectedObject);
        } else {
            // Vantage point not yet removable here.
        }
        selectedObject = null;
        updateSidebar();
        renderLayersPanel();
        scheduleRender();
    }
}

function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll('.toolbar .tool-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('tool-' + tool).classList.add('active');
    setCanvasToolClass();
    updateSidebar();
    scheduleRender();
}

function updateSidebar({ full = true } = {}) {
    if (!full) {
        updateSidebarLiveFields();
        return;
    }
    clearSelectionIfUnavailable();
    const selPanel = document.getElementById('selection-panel');
    const noSel = document.getElementById('no-selection');
    const badge = document.getElementById('prop-type-badge');
    const cityProps = document.getElementById('city-only-props');
    const districtProps = document.getElementById('district-only-props');
    const terrainProps = document.getElementById('terrain-only-props');
    const vantageProps = document.getElementById('vantage-only-props');
    const terrainDeltaRow = document.getElementById('terrain-delta-row');
    const terrainTargetRow = document.getElementById('terrain-target-row');
    const terrainOpacityRow = document.getElementById('terrain-opacity-row');
    const coordX = document.getElementById('prop-cx');
    const coordZ = document.getElementById('prop-cz');
    const terrainPoints = document.getElementById('prop-terrain-points');
    const terrainHint = document.getElementById('terrain-edit-hint');

    if (selectedObject) {
        selPanel.style.display = 'block';
        noSel.style.display = 'none';

        const citySelected = isCity(selectedObject);
        const districtSelected = isDistrict(selectedObject);
        const terrainSelected = isTerrainEdit(selectedObject);
        badge.innerText = citySelected ? "CITY" : districtSelected ? "DISTRICT" : terrainSelected ? "TERRAIN" : "VANTAGE POINT";
        cityProps.style.display = citySelected ? "block" : "none";
        districtProps.style.display = districtSelected ? "block" : "none";
        terrainProps.style.display = terrainSelected ? "block" : "none";
        vantageProps.style.display = citySelected || districtSelected || terrainSelected ? "none" : "block";
        const terrainStrokeSelected = terrainSelected && Array.isArray(selectedObject.points) && selectedObject.points.length > 0;
        const isLocked = isObjectLocked(selectedObject);
        coordX.readOnly = terrainStrokeSelected || isLocked;
        coordZ.readOnly = terrainStrokeSelected || isLocked;
        badge.style.background = isLocked ? 'rgba(239, 68, 68, 0.2)' : 'rgba(56, 189, 248, 0.15)';
        badge.style.color = isLocked ? '#ff9da0' : 'var(--accent)';
        badge.style.borderColor = isLocked ? 'rgba(239,68,68,0.35)' : 'rgba(56, 189, 248, 0.2)';

        document.getElementById('prop-id').value = selectedObject.id || (districtSelected ? getDistrictType(selectedObject) : terrainSelected ? selectedObject.kind : "Vantage Point");
        document.getElementById('prop-cx').value = citySelected || districtSelected ? selectedObject.center[0] : selectedObject.x;
        document.getElementById('prop-cz').value = citySelected || districtSelected ? selectedObject.center[1] : selectedObject.z;

        if (citySelected) {
            if (selectedObject.road) {
                document.getElementById('prop-seed').value = selectedObject.road.seed;
                setSyncedControlValue('prop-density', selectedObject.road.density);
            }
        } else if (districtSelected) {
            document.getElementById('prop-district-type').value = getDistrictType(selectedObject);
        } else if (terrainSelected) {
            document.getElementById('prop-terrain-kind').value = selectedObject.kind;
            setSyncedControlValue('prop-terrain-radius', selectedObject.radius);
            terrainDeltaRow.style.display = selectedObject.kind === 'flatten' ? 'none' : 'flex';
            terrainTargetRow.style.display = selectedObject.kind === 'flatten' ? 'flex' : 'none';
            terrainOpacityRow.style.display = selectedObject.kind === 'flatten' ? 'flex' : 'none';
            terrainPoints.value = String(Array.isArray(selectedObject.points) ? selectedObject.points.length : 0);
            terrainHint.innerHTML = currentTool === 'edit-poly'
                ? 'Drag points to reshape the stroke. Double-click the stroke to add a point, and right-click a point to remove it.'
                : 'Switch to <strong>Edit Poly</strong> to reshape this stroke point-by-point.';
            if (selectedObject.kind !== 'flatten') {
                setSyncedControlValue('prop-terrain-delta', selectedObject.delta);
            } else {
                setSyncedControlValue('prop-terrain-target', selectedObject.target_height);
                setSyncedControlValue('prop-terrain-opacity', selectedObject.opacity);
            }
        } else {
            setSyncedControlValue('prop-alt', selectedObject.y);
            setSyncedControlValue('prop-tilt', selectedObject.tilt || 45);
        }
    } else {
        selPanel.style.display = 'none';
        noSel.style.display = 'block';
        coordX.readOnly = false;
        coordZ.readOnly = false;
        terrainPoints.value = '';
        badge.style.background = 'rgba(56, 189, 248, 0.15)';
        badge.style.color = 'var(--accent)';
        badge.style.borderColor = 'rgba(56, 189, 248, 0.2)';
        terrainHint.innerHTML = 'Use <strong>Edit Poly</strong> to drag stroke points, double-click the stroke to add one, and right-click a point to remove it.';
    }
    scheduleLayersPanelRender();
}

async function save() {
    const btn = document.getElementById('save-btn');
    btn.innerText = 'SAVING...';
    btn.style.opacity = '0.5';

    try {
        normalizeMapData(worldData);
        const mapPayload = {
            ...worldData,
            terrainEdits: (worldData.terrainEdits || []).map(({ bounds, ...edit }) => ({
                ...edit,
                points: Array.isArray(edit.points) ? edit.points.map(([x, z]) => [x, z]) : undefined
            }))
        };
        console.log(`[DEBUG] Attempting save to ${window.location.origin}/save`);
        const [resMap, resVantage] = await Promise.all([
            fetch('/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: 'tools/map.json', content: mapPayload })
            }),
            fetch('/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: 'config/vantage_points.json', content: vantageData })
            })
        ]);

        if (!resMap.ok || !resVantage.ok) {
            const err = !resMap.ok ? await resMap.text() : await resVantage.text();
            throw new Error(err || "Server returned error status");
        }

        btn.innerText = 'SAVED!';
        setTimeout(() => { btn.innerText = 'SAVE CHANGES'; btn.style.opacity = '1'; }, 2000);
    } catch (e) {
        alert("Failed to save: " + e.message);
        btn.innerText = 'SAVE FAILED';
        btn.style.opacity = '1';
    }
}

init();
