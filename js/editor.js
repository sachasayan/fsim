import { Noise } from './modules/noise.js';
import { QuadtreeMapSampler, setStaticSampler, getTerrainHeight } from './modules/world/terrain/TerrainUtils.js';
import { MapTileManager } from './modules/ui/MapTileManager.js';
import { applyTerrainEdits } from './modules/world/terrain/TerrainEdits.js';
import { DISTRICT_TYPES, getDistrictType, getDistrictsForCity, normalizeMapData } from './modules/world/MapDataUtils.js';

const canvas = document.getElementById('map-canvas');
const ctx = canvas.getContext('2d');
const coordsDiv = document.getElementById('coords');

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

let _rafPending = false;
const CONTROL_GROUPS = [
    { ids: ['prop-density', 'prop-density-range'], valueId: 'prop-density-value' },
    { ids: ['prop-terrain-radius', 'prop-terrain-radius-range'], valueId: 'prop-terrain-radius-value' },
    { ids: ['prop-terrain-delta', 'prop-terrain-delta-range'], valueId: 'prop-terrain-delta-value' },
    { ids: ['prop-terrain-target', 'prop-terrain-target-range'], valueId: 'prop-terrain-target-value' },
    { ids: ['prop-terrain-opacity', 'prop-terrain-opacity-range'], valueId: 'prop-terrain-opacity-value' },
    { ids: ['prop-alt', 'prop-alt-range'], valueId: 'prop-alt-value' },
    { ids: ['prop-tilt', 'prop-tilt-range'], valueId: 'prop-tilt-value' },
    { ids: ['terrain-brush-radius', 'terrain-brush-radius-range'], valueId: 'terrain-brush-radius-value' },
    { ids: ['terrain-brush-strength', 'terrain-brush-strength-range'], valueId: 'terrain-brush-strength-value' }
];
const CONTROL_GROUP_BY_ID = new Map(
    CONTROL_GROUPS.flatMap(group => group.ids.map(id => [id, group]))
);

function scheduleRender() {
    if (!_rafPending) {
        _rafPending = true;
        requestAnimationFrame(() => { _rafPending = false; render(); });
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

// Constants
const COLORS = {
    city: 'rgba(76, 201, 240, 0.4)',
    citySelected: 'rgba(76, 201, 240, 0.8)',
    runway: 'rgba(255, 255, 255, 0.5)',
    district: 'rgba(255, 255, 100, 0.2)',
    districtSelected: 'rgba(255, 255, 100, 0.6)',
    accent: '#7dd3fc',
    grid: 'rgba(255, 255, 255, 0.05)',
    vantage: 'rgba(158, 255, 102, 0.6)',
    vantageSelected: 'rgba(158, 255, 102, 1.0)'
};

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
    setupHotReload();
}

function isDistrict(obj) {
    return !!obj?.center && !obj?.road && (!!obj?.district_type || !!obj?.type || Array.isArray(obj?.points));
}

function isCity(obj) {
    return !!obj?.center && !!obj?.road;
}

function isPointInPolygon(x, z, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = points[i][0], zi = points[i][1];
        const xj = points[j][0], zj = points[j][1];
        const intersect = ((zi > z) !== (zj > z)) &&
            (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function districtContainsPoint(district, x, z) {
    if (district.points?.length >= 3) return isPointInPolygon(x, z, district.points);
    if (district.radius) return Math.hypot(x - district.center[0], z - district.center[1]) < district.radius;
    return false;
}

function cityContainsPoint(city, x, z) {
    return getDistrictsForCity(worldData, city.id).some(district => districtContainsPoint(district, x, z));
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

function isTerrainEdit(obj) {
    return !!obj && typeof obj.kind === 'string' && Number.isFinite(obj.x) && Number.isFinite(obj.z);
}

function getTerrainEditBounds(edit) {
    if (edit?.bounds) return edit.bounds;
    if (Array.isArray(edit?.points) && edit.points.length > 0) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (const [x, z] of edit.points) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
        }
        return {
            minX: minX - edit.radius,
            maxX: maxX + edit.radius,
            minZ: minZ - edit.radius,
            maxZ: maxZ + edit.radius
        };
    }
    return {
        minX: edit.x - edit.radius,
        maxX: edit.x + edit.radius,
        minZ: edit.z - edit.radius,
        maxZ: edit.z + edit.radius
    };
}

function refreshTerrainEditGeometry(edit) {
    if (Array.isArray(edit?.points) && edit.points.length > 0) {
        let sumX = 0;
        let sumZ = 0;
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        for (const [x, z] of edit.points) {
            sumX += x;
            sumZ += z;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minZ = Math.min(minZ, z);
            maxZ = Math.max(maxZ, z);
        }
        edit.x = Math.round(sumX / edit.points.length);
        edit.z = Math.round(sumZ / edit.points.length);
        edit.bounds = {
            minX: minX - edit.radius,
            maxX: maxX + edit.radius,
            minZ: minZ - edit.radius,
            maxZ: maxZ + edit.radius
        };
        return;
    }
    edit.bounds = {
        minX: edit.x - edit.radius,
        maxX: edit.x + edit.radius,
        minZ: edit.z - edit.radius,
        maxZ: edit.z + edit.radius
    };
}

function invalidateTerrainEdit(edit) {
    const bounds = getTerrainEditBounds(edit);
    tileManager.invalidateWorldRect(bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ);
}

function isTerrainStroke(edit) {
    return isTerrainEdit(edit) && Array.isArray(edit.points) && edit.points.length > 0;
}

function getVertexHitIndex(points, worldPos, threshold) {
    for (let i = points.length - 1; i >= 0; i--) {
        const [x, z] = points[i];
        if (Math.hypot(worldPos.x - x, worldPos.z - z) <= threshold) return i;
    }
    return -1;
}

function getClosestTerrainSegmentIndex(edit, worldPos, threshold) {
    if (!isTerrainStroke(edit) || edit.points.length < 2) return -1;
    let bestIndex = -1;
    let bestDistance = threshold;
    for (let i = 1; i < edit.points.length; i++) {
        const [ax, az] = edit.points[i - 1];
        const [bx, bz] = edit.points[i];
        const dist = getDistanceToSegment(worldPos.x, worldPos.z, ax, az, bx, bz);
        if (dist <= bestDistance) {
            bestDistance = dist;
            bestIndex = i;
        }
    }
    return bestIndex;
}

function moveTerrainStrokePoint(edit, index, worldPos) {
    if (!isTerrainStroke(edit) || index < 0 || index >= edit.points.length) return;
    invalidateTerrainEdit(edit);
    edit.points[index][0] = Math.round(worldPos.x);
    edit.points[index][1] = Math.round(worldPos.z);
    refreshTerrainEditGeometry(edit);
    invalidateTerrainEdit(edit);
}

function insertTerrainStrokePoint(edit, insertIndex, worldPos) {
    if (!isTerrainStroke(edit)) return false;
    invalidateTerrainEdit(edit);
    edit.points.splice(insertIndex, 0, [Math.round(worldPos.x), Math.round(worldPos.z)]);
    refreshTerrainEditGeometry(edit);
    invalidateTerrainEdit(edit);
    return true;
}

function removeTerrainStrokePoint(edit, index) {
    if (!isTerrainStroke(edit) || edit.points.length <= 1 || index < 0 || index >= edit.points.length) return false;
    invalidateTerrainEdit(edit);
    edit.points.splice(index, 1);
    refreshTerrainEditGeometry(edit);
    invalidateTerrainEdit(edit);
    return true;
}

function createTerrainStroke(worldPos) {
    const baseHeight = sampleTerrainHeight(worldPos.x, worldPos.z);
    const edit = {
        kind: currentTool.replace('terrain-', ''),
        x: Math.round(worldPos.x),
        z: Math.round(worldPos.z),
        radius: terrainBrush.radius,
        delta: terrainBrush.strength,
        points: [[Math.round(worldPos.x), Math.round(worldPos.z)]]
    };
    if (edit.kind === 'flatten') {
        edit.opacity = Math.max(0, Math.min(1, terrainBrush.strength));
        edit.target_height = Math.round(baseHeight);
        delete edit.delta;
    }
    refreshTerrainEditGeometry(edit);
    worldData.terrainEdits.push(edit);
    invalidateTerrainEdit(edit);
    return edit;
}

function appendTerrainStrokePoint(edit, worldPos) {
    if (!Array.isArray(edit?.points) || edit.points.length === 0) return false;
    const nextPoint = [Math.round(worldPos.x), Math.round(worldPos.z)];
    const lastPoint = edit.points[edit.points.length - 1];
    const minSpacing = Math.max(10, edit.radius * 0.12);
    if (Math.hypot(nextPoint[0] - lastPoint[0], nextPoint[1] - lastPoint[1]) < minSpacing) return false;
    const prevBounds = getTerrainEditBounds(edit);
    tileManager.invalidateWorldRect(prevBounds.minX, prevBounds.minZ, prevBounds.maxX, prevBounds.maxZ);
    edit.points.push(nextPoint);
    refreshTerrainEditGeometry(edit);
    invalidateTerrainEdit(edit);
    return true;
}

function getDistanceToSegment(x, z, ax, az, bx, bz) {
    const abx = bx - ax;
    const abz = bz - az;
    const lenSq = abx * abx + abz * abz;
    if (lenSq <= 1e-6) return Math.hypot(x - ax, z - az);
    const t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / lenSq));
    const px = ax + abx * t;
    const pz = az + abz * t;
    return Math.hypot(x - px, z - pz);
}

function terrainEditContainsPoint(edit, x, z) {
    if (Array.isArray(edit?.points) && edit.points.length > 0) {
        for (let i = 0; i < edit.points.length; i++) {
            const [px, pz] = edit.points[i];
            if (Math.hypot(x - px, z - pz) <= edit.radius) return true;
            if (i > 0) {
                const [ax, az] = edit.points[i - 1];
                if (getDistanceToSegment(x, z, ax, az, px, pz) <= edit.radius) return true;
            }
        }
        return false;
    }
    return Math.hypot(x - edit.x, z - edit.z) <= edit.radius;
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
            updateSidebar();
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Terrain using Tile System (with hillshading)
    tileManager.draw(ctx, camera.x, camera.z, camera.zoom, canvas.width, canvas.height);

    // 2. Draw Grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    const gridSpacing = 1000; // 1km
    const start = screenToWorld(0, 0);
    const end = screenToWorld(canvas.width, canvas.height);

    ctx.beginPath();
    for (let gx = Math.floor(start.x / gridSpacing) * gridSpacing; gx <= end.x; gx += gridSpacing) {
        const sx = worldToScreen(gx, 0).x;
        ctx.moveTo(sx, 0); ctx.lineTo(sx, canvas.height);
    }
    for (let gz = Math.floor(start.z / gridSpacing) * gridSpacing; gz <= end.z; gz += gridSpacing) {
        const sy = worldToScreen(0, gz).y;
        ctx.moveTo(0, sy); ctx.lineTo(canvas.width, sy);
    }
    ctx.stroke();

    if (!worldData) return;

    // 3. Draw Runway (Fixed at 0,0 for now in fsim)
    const rwPos = worldToScreen(0, 0);
    ctx.save();
    ctx.translate(rwPos.x, rwPos.y);
    ctx.fillStyle = COLORS.runway;
    const rwW = 100 * camera.zoom;
    const rwL = 4000 * camera.zoom;
    ctx.fillRect(-rwW / 2, -rwL / 2, rwW, rwL);
    ctx.restore();

    // 4. Draw Cities
    worldData.districts.forEach(d => {
        if (d.points && d.points.length > 0) {
            ctx.beginPath();
            const startPos = worldToScreen(d.points[0][0], d.points[0][1]);
            ctx.moveTo(startPos.x, startPos.y);
            for (let i = 1; i < d.points.length; i++) {
                const p = worldToScreen(d.points[i][0], d.points[i][1]);
                ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();
            ctx.fillStyle = (selectedObject === d) ? COLORS.districtSelected : COLORS.district;
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.stroke();

            if (selectedObject === d && currentTool === 'edit-poly') {
                d.points.forEach((p, i) => {
                    const vp = worldToScreen(p[0], p[1]);
                    ctx.fillStyle = (draggedVertex && draggedVertex.object === d && draggedVertex.index === i) ? '#fff' : COLORS.accent;
                    ctx.beginPath();
                    ctx.arc(vp.x, vp.y, 5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                });
            }
        } else {
            const dPos = worldToScreen(d.center[0], d.center[1]);
            const dRad = d.radius * camera.zoom;
            ctx.beginPath();
            ctx.arc(dPos.x, dPos.y, dRad, 0, Math.PI * 2);
            ctx.fillStyle = (selectedObject === d) ? COLORS.districtSelected : COLORS.district;
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.stroke();
        }
    });

    worldData.cities.forEach(city => {
        const pos = worldToScreen(city.center[0], city.center[1]);

        const markerSize = selectedObject === city ? 9 : 6;
        ctx.strokeStyle = (selectedObject === city) ? COLORS.citySelected : COLORS.city;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pos.x - markerSize, pos.y);
        ctx.lineTo(pos.x + markerSize, pos.y);
        ctx.moveTo(pos.x, pos.y - markerSize);
        ctx.lineTo(pos.x, pos.y + markerSize);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = (selectedObject === city) ? COLORS.citySelected : COLORS.city;
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = '12px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(city.id, pos.x, pos.y - 18);
    });

    worldData.terrainEdits.forEach(edit => {
        const fillStyle = edit.kind === 'lower'
            ? 'rgba(255, 89, 94, 0.12)'
            : edit.kind === 'flatten'
                ? 'rgba(255, 173, 51, 0.12)'
                : 'rgba(56, 189, 248, 0.12)';
        const strokeStyle = selectedObject === edit ? '#fff' : (edit.kind === 'lower' ? '#ff595e' : edit.kind === 'flatten' ? '#ffad33' : '#38bdf8');
        const points = Array.isArray(edit.points) ? edit.points : null;

        if (points?.length > 1) {
            ctx.beginPath();
            points.forEach(([x, z], index) => {
                const pos = worldToScreen(x, z);
                if (index === 0) ctx.moveTo(pos.x, pos.y);
                else ctx.lineTo(pos.x, pos.y);
            });
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = edit.radius * camera.zoom * 2;
            ctx.strokeStyle = fillStyle;
            ctx.stroke();

            ctx.beginPath();
            points.forEach(([x, z], index) => {
                const pos = worldToScreen(x, z);
                if (index === 0) ctx.moveTo(pos.x, pos.y);
                else ctx.lineTo(pos.x, pos.y);
            });
            ctx.lineWidth = Math.max(2, Math.min(6, edit.radius * camera.zoom * 0.18));
            ctx.strokeStyle = strokeStyle;
            ctx.stroke();
            ctx.lineCap = 'butt';
            ctx.lineJoin = 'miter';

            if (selectedObject === edit && currentTool === 'edit-poly') {
                edit.points.forEach((point, index) => {
                    const vp = worldToScreen(point[0], point[1]);
                    ctx.fillStyle = (draggedVertex && draggedVertex.object === edit && draggedVertex.index === index) ? '#fff' : strokeStyle;
                    ctx.beginPath();
                    ctx.arc(vp.x, vp.y, 5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#08111f';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                });
            }
            return;
        }

        const [px, pz] = points?.[0] || [edit.x, edit.z];
        const pos = worldToScreen(px, pz);
        const radius = edit.radius * camera.zoom;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = fillStyle;
        ctx.fill();
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = 1;
        ctx.stroke();
    });

    if (hoverWorldPos && currentTool.startsWith('terrain-') && !isPaintingTerrain) {
        const pos = worldToScreen(hoverWorldPos.x, hoverWorldPos.z);
        const previewColor = currentTool === 'terrain-lower'
            ? 'rgba(255, 89, 94, 0.85)'
            : currentTool === 'terrain-flatten'
                ? 'rgba(255, 173, 51, 0.85)'
                : 'rgba(56, 189, 248, 0.85)';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, terrainBrush.radius * camera.zoom, 0, Math.PI * 2);
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

    // 5. Draw Vantage Points
    if (vantageData) {
        Object.entries(vantageData).forEach(([id, vp]) => {
            const pos = worldToScreen(vp.x, vp.z);
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
            ctx.fillStyle = (selectedObject === vp) ? COLORS.vantageSelected : COLORS.vantage;
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.stroke();

            ctx.fillStyle = '#fff';
            ctx.font = '10px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(id, pos.x, pos.y + 20);
        });
    }
}


function setupInputs() {
    canvas.addEventListener('contextmenu', e => {
        e.preventDefault();
        const worldPos = screenToWorld(e.offsetX, e.offsetY);
        if (currentTool === 'edit-poly' && selectedObject && selectedObject.points) {
            // Right-click to delete vertex
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
        const worldPos = screenToWorld(e.offsetX, e.offsetY);
        if (currentTool === 'edit-poly' && selectedObject && selectedObject.points) {
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

    canvas.addEventListener('mousedown', e => {
        const worldPos = screenToWorld(e.offsetX, e.offsetY);

        if (e.button === 1 || currentTool === 'pan') {
            isPanning = true;
            lastMouse = { x: e.offsetX, y: e.offsetY };
            return;
        }

        if (currentTool === 'edit-poly' && selectedObject && selectedObject.points) {
            // Check vertex hits
            const hitVertex = getVertexHitIndex(selectedObject.points, worldPos, 100 / camera.zoom);

            if (hitVertex !== -1) {
                draggedVertex = { object: selectedObject, index: hitVertex };
                return;
            }
        }

        if (currentTool.startsWith('terrain-')) {
            isPaintingTerrain = true;
            activeTerrainStroke = createTerrainStroke(worldPos);
            selectedObject = activeTerrainStroke;
            updateSidebar();
            scheduleRender();
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
            selectedObject = newCity;
            updateSidebar();
            setTool('select');
            scheduleRender();
            return;
        }

        if (currentTool === 'add-district') {
            const districtCenter = [Math.round(worldPos.x / 100) * 100, Math.round(worldPos.z / 100) * 100];
            const newDistrict = createPolygonDistrict(districtCenter);
            const parentCity = findCityForDistrictPlacement();
            if (parentCity) newDistrict.city_id = parentCity.id;
            worldData.districts.push(newDistrict);
            selectedObject = newDistrict;
            updateSidebar();
            setTool('edit-poly');
            scheduleRender();
            return;
        }

        // Selection logic
        let found = null;
        if (worldData) {
            // Check districts first (z-order)
            worldData.districts.forEach(d => {
                if (districtContainsPoint(d, worldPos.x, worldPos.z)) found = d;
            });
            // Check cities
            if (!found) {
                worldData.cities.forEach(city => {
                    const dist = Math.hypot(worldPos.x - city.center[0], worldPos.z - city.center[1]);
                    if (dist < 250 / camera.zoom) found = city;
                });
            }
            if (!found) {
                worldData.terrainEdits.forEach(edit => {
                    if (terrainEditContainsPoint(edit, worldPos.x, worldPos.z)) found = edit;
                });
            }
            // Check vantage points
            if (!found && vantageData) {
                Object.values(vantageData).forEach(vp => {
                    const dist = Math.hypot(worldPos.x - vp.x, worldPos.z - vp.z);
                    if (dist < 500) found = vp; // larger hit area for icons
                });
            }
        }

        selectedObject = found;
        updateSidebar();
        if (selectedObject && !isTerrainEdit(selectedObject)) isDragging = true;
        scheduleRender();
    });

    window.addEventListener('mousemove', e => {
        const worldPos = screenToWorld(e.offsetX, e.offsetY);
        hoverWorldPos = worldPos;
        coordsDiv.innerText = `X: ${Math.round(worldPos.x)}, Z: ${Math.round(worldPos.z)}`;

        if (isPanning) {
            const dx = e.offsetX - lastMouse.x;
            const dy = e.offsetY - lastMouse.y;
            camera.x -= dx / camera.zoom;
            camera.z -= dy / camera.zoom;
            lastMouse = { x: e.offsetX, y: e.offsetY };
            scheduleRender();
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
            updateSidebar();
            scheduleRender();
            return;
        }

        if (isPaintingTerrain) {
            if (activeTerrainStroke && appendTerrainStrokePoint(activeTerrainStroke, worldPos)) {
                selectedObject = activeTerrainStroke;
                updateSidebar();
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
            updateSidebar();
            scheduleRender();
        }
    });

    window.addEventListener('mouseup', () => {
        isPanning = false;
        isDragging = false;
        draggedVertex = null;
        isPaintingTerrain = false;
        activeTerrainStroke = null;
    });

    canvas.addEventListener('mouseleave', () => {
        hoverWorldPos = null;
        scheduleRender();
    });

    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const mouseWorldBefore = screenToWorld(e.offsetX, e.offsetY);
        const zoomSpeed = 1.1;
        if (e.deltaY < 0) camera.zoom *= zoomSpeed;
        else camera.zoom /= zoomSpeed;
        camera.zoom = Math.max(0.001, Math.min(1.0, camera.zoom));

        const mouseWorldAfter = screenToWorld(e.offsetX, e.offsetY);
        camera.x -= (mouseWorldAfter.x - mouseWorldBefore.x);
        camera.z -= (mouseWorldAfter.z - mouseWorldBefore.z);
        scheduleRender();
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

    // Sidebar listeners
    ['prop-cx', 'prop-cz', 'prop-seed'].forEach(id => {
        document.getElementById(id).onchange = e => {
            if (!selectedObject) return;
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
            if (!selectedObject) return;
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
        if (!isDistrict(selectedObject)) return;
        selectedObject.district_type = DISTRICT_TYPES.includes(e.target.value) ? e.target.value : 'residential';
        scheduleRender();
    };

    ['prop-terrain-radius', 'prop-terrain-radius-range', 'prop-terrain-delta', 'prop-terrain-delta-range', 'prop-terrain-target', 'prop-terrain-target-range', 'prop-terrain-opacity', 'prop-terrain-opacity-range'].forEach(id => {
        document.getElementById(id).oninput = e => {
            if (!isTerrainEdit(selectedObject)) return;
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
            updateSidebar();
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
}

function jumpToSim() {
    if (!selectedObject || selectedObject.center || isTerrainEdit(selectedObject)) return;
    const url = `/fsim.html?x=${selectedObject.x}&y=${selectedObject.y}&z=${selectedObject.z}&tilt=${selectedObject.tilt || 45}&fog=${selectedObject.fog || 0}&clouds=${selectedObject.clouds || 0}&lighting=${selectedObject.lighting || 'noon'}`;
    window.open(url, '_blank');
}

function deleteObject() {
    if (!selectedObject) return;
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
        scheduleRender();
    }
}

function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll('.toolbar .tool-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('tool-' + tool).classList.add('active');
    updateSidebar();
    scheduleRender();
}

function updateSidebar() {
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
        coordX.readOnly = terrainStrokeSelected;
        coordZ.readOnly = terrainStrokeSelected;

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
        terrainHint.innerHTML = 'Use <strong>Edit Poly</strong> to drag stroke points, double-click the stroke to add one, and right-click a point to remove it.';
    }
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
