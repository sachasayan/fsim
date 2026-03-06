import { Noise } from './modules/noise.js';
import { QuadtreeMapSampler, setStaticSampler, getTerrainHeight } from './modules/world/terrain/TerrainUtils.js';

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

// Constants
const COLORS = {
    city: 'rgba(76, 201, 240, 0.4)',
    citySelected: 'rgba(76, 201, 240, 0.8)',
    runway: 'rgba(255, 255, 255, 0.5)',
    district: 'rgba(255, 255, 100, 0.2)',
    districtSelected: 'rgba(255, 255, 100, 0.6)',
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

function setupHotReload() {
    const es = new EventSource('/events');
    es.addEventListener('reload-city', async () => {
        console.log("🔄 World rebuild detected, refreshing terrain...");
        try {
            const resp = await fetch('/world/world.bin');
            if (resp.ok) {
                const buf = await resp.arrayBuffer();
                const sampler = new QuadtreeMapSampler(buf);
                setStaticSampler(sampler);
                cacheValid = false;
                render();
                console.log("✨ Terrain refreshed!");
            }
        } catch (e) {
            console.error("Failed to hot-reload world.bin", e);
        }
    });
}

function resize() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    render();
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

// Enhanced Palette
function getTerrainColor(h, slopeX = 0, slopeZ = 0) {
    let baseColor;
    if (h < 5) baseColor = [29, 79, 136]; // water
    else if (h < 15) baseColor = [214, 210, 176]; // sand
    else if (h < 100) baseColor = [79, 126, 66]; // grass
    else if (h < 300) baseColor = [122, 140, 88]; // hills
    else baseColor = [242, 242, 242]; // snow

    // Hillshading: Directional lighting from top-left (135 degrees)
    const lightDir = { x: -0.707, z: -0.707 };
    const shadow = (slopeX * lightDir.x + slopeZ * lightDir.z) * 0.5;

    const r = Math.max(0, Math.min(255, baseColor[0] + shadow * 100));
    const g = Math.max(0, Math.min(255, baseColor[1] + shadow * 100));
    const b = Math.max(0, Math.min(255, baseColor[2] + shadow * 100));

    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

const terrainCache = document.createElement('canvas');
const tCtx = terrainCache.getContext('2d');
let cacheValid = false;

function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Terrain (Heavily Enhanced with Hillshading)
    if (!cacheValid || terrainCache.width !== canvas.width || terrainCache.height !== canvas.height) {
        terrainCache.width = canvas.width;
        terrainCache.height = canvas.height;

        // Multi-scale sampling based on zoom
        const pixelStep = camera.zoom > 0.1 ? 8 : (camera.zoom > 0.02 ? 16 : 32);
        const worldStep = pixelStep / camera.zoom;
        const slopeOffset = worldStep * 0.5; // distance to sample for slope

        for (let x = 0; x < canvas.width; x += pixelStep) {
            for (let y = 0; y < canvas.height; y += pixelStep) {
                const worldPos = screenToWorld(x + pixelStep / 2, y + pixelStep / 2);
                const h = getTerrainHeight(worldPos.x, worldPos.z, Noise);

                // Sample neighbors for hillshading
                const hRight = getTerrainHeight(worldPos.x + slopeOffset, worldPos.z, Noise);
                const hDown = getTerrainHeight(worldPos.x, worldPos.z + slopeOffset, Noise);

                const slopeX = (hRight - h) / slopeOffset;
                const slopeZ = (hDown - h) / slopeOffset;

                tCtx.fillStyle = getTerrainColor(h, slopeX, slopeZ);
                tCtx.fillRect(x, y, pixelStep, pixelStep);
            }
        }
        cacheValid = true;
    }
    ctx.drawImage(terrainCache, 0, 0);

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
    worldData.cities.forEach(city => {
        const pos = worldToScreen(city.center[0], city.center[1]);
        const rad = city.radius * camera.zoom;

        // Districts
        if (city.districts) {
            city.districts.forEach(d => {
                if (d.points && d.points.length > 0) {
                    // Draw Polygon
                    ctx.beginPath();
                    const startPos = worldToScreen(d.center[0] + d.points[0][0], d.center[1] + d.points[0][1]);
                    ctx.moveTo(startPos.x, startPos.y);
                    for (let i = 1; i < d.points.length; i++) {
                        const p = worldToScreen(d.center[0] + d.points[i][0], d.center[1] + d.points[i][1]);
                        ctx.lineTo(p.x, p.y);
                    }
                    ctx.closePath();
                    ctx.fillStyle = (selectedObject === d) ? COLORS.districtSelected : COLORS.district;
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
                    ctx.stroke();

                    // Draw Vertices if selected and in edit-poly mode
                    if (selectedObject === d && currentTool === 'edit-poly') {
                        d.points.forEach((p, i) => {
                            const vp = worldToScreen(d.center[0] + p[0], d.center[1] + p[1]);
                            ctx.fillStyle = (draggedVertex && draggedVertex.object === d && draggedVertex.index === i) ? '#fff' : COLORS.accent;
                            ctx.beginPath();
                            ctx.arc(vp.x, vp.y, 5, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.stroke();
                        });
                    }
                } else {
                    // Draw Circle
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
        }

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, rad, 0, Math.PI * 2);
        ctx.fillStyle = (selectedObject === city) ? COLORS.citySelected : COLORS.city;
        ctx.fill();
        ctx.strokeStyle = COLORS.accent;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = '12px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(city.id, pos.x, pos.y - rad - 10);
    });

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
            let hitVertex = -1;
            selectedObject.points.forEach((p, i) => {
                const vx = selectedObject.center[0] + p[0];
                const vz = selectedObject.center[1] + p[1];
                const dist = Math.hypot(worldPos.x - vx, worldPos.z - vz);
                if (dist < 100 / camera.zoom) hitVertex = i;
            });

            if (hitVertex !== -1) {
                selectedObject.points.splice(hitVertex, 1);
                render();
            }
        }
    });

    canvas.addEventListener('dblclick', e => {
        const worldPos = screenToWorld(e.offsetX, e.offsetY);
        if (currentTool === 'edit-poly' && selectedObject && selectedObject.points) {
            // Add vertex at mouse position
            const localX = Math.round(worldPos.x - selectedObject.center[0]);
            const localZ = Math.round(worldPos.z - selectedObject.center[1]);
            selectedObject.points.push([localX, localZ]);
            render();
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
            let hitVertex = -1;
            selectedObject.points.forEach((p, i) => {
                const vx = selectedObject.center[0] + p[0];
                const vz = selectedObject.center[1] + p[1];
                const dist = Math.hypot(worldPos.x - vx, worldPos.z - vz);
                if (dist < 100 / camera.zoom) hitVertex = i;
            });

            if (hitVertex !== -1) {
                draggedVertex = { object: selectedObject, index: hitVertex };
                return;
            }
        }

        if (currentTool === 'add-city') {
            const newCity = {
                id: `city_${worldData.cities.length + 1}`,
                center: [Math.round(worldPos.x / 100) * 100, Math.round(worldPos.z / 100) * 100],
                radius: 3000,
                road: { seed: Math.floor(Math.random() * 1000), blockScale: 130, arterialSpacing: 500, density: 0.7 },
                districts: [{ type: 'commercial', center: [Math.round(worldPos.x / 100) * 100, Math.round(worldPos.z / 100) * 100], radius: 800 }]
            };
            worldData.cities.push(newCity);
            selectedObject = newCity;
            updateSidebar();
            setTool('select');
            render();
            return;
        }

        // Selection logic
        let found = null;
        if (worldData) {
            // Check districts first (z-order)
            worldData.cities.forEach(city => {
                if (city.districts) {
                    city.districts.forEach(d => {
                        const dist = Math.hypot(worldPos.x - d.center[0], worldPos.z - d.center[1]);
                        if (dist < d.radius) found = d;
                    });
                }
            });
            // Check cities
            if (!found) {
                worldData.cities.forEach(city => {
                    const dist = Math.hypot(worldPos.x - city.center[0], worldPos.z - city.center[1]);
                    if (dist < city.radius) found = city;
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
        if (selectedObject) isDragging = true;
        render();
    });

    window.addEventListener('mousemove', e => {
        const worldPos = screenToWorld(e.offsetX, e.offsetY);
        coordsDiv.innerText = `X: ${Math.round(worldPos.x)}, Z: ${Math.round(worldPos.z)}`;

        if (isPanning) {
            const dx = e.offsetX - lastMouse.x;
            const dy = e.offsetY - lastMouse.y;
            camera.x -= dx / camera.zoom;
            camera.z -= dy / camera.zoom;
            lastMouse = { x: e.offsetX, y: e.offsetY };
            cacheValid = false;
            render();
        }

        if (draggedVertex) {
            const d = draggedVertex.object;
            const idx = draggedVertex.index;
            d.points[idx][0] = Math.round(worldPos.x - d.center[0]);
            d.points[idx][1] = Math.round(worldPos.z - d.center[1]);
            render();
            return;
        }

        if (isDragging && selectedObject) {
            if (selectedObject.center) {
                selectedObject.center[0] = Math.round(worldPos.x / 100) * 100;
                selectedObject.center[1] = Math.round(worldPos.z / 100) * 100;
            } else {
                selectedObject.x = Math.round(worldPos.x);
                selectedObject.z = Math.round(worldPos.z);
            }
            updateSidebar();
            render();
        }
    });

    window.addEventListener('mouseup', () => {
        isPanning = false;
        isDragging = false;
        draggedVertex = null;
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
        cacheValid = false;
        render();
    });

    // Toolbar
    document.getElementById('tool-select').onclick = () => setTool('select');
    document.getElementById('tool-add-city').onclick = () => setTool('add-city');
    document.getElementById('tool-edit-poly').onclick = () => setTool('edit-poly');
    document.getElementById('tool-pan').onclick = () => setTool('pan');

    // Sidebar listeners
    ['prop-cx', 'prop-cz', 'prop-radius', 'prop-seed', 'prop-density', 'prop-alt', 'prop-tilt'].forEach(id => {
        document.getElementById(id).onchange = e => {
            if (!selectedObject) return;
            const val = parseFloat(e.target.value);
            if (id === 'prop-cx') {
                if (selectedObject.center) selectedObject.center[0] = val;
                else selectedObject.x = val;
            }
            if (id === 'prop-cz') {
                if (selectedObject.center) selectedObject.center[1] = val;
                else selectedObject.z = val;
            }
            if (id === 'prop-radius') selectedObject.radius = val;
            if (id === 'prop-seed') selectedObject.road.seed = val;
            if (id === 'prop-density') selectedObject.road.density = val;
            if (id === 'prop-alt') selectedObject.y = val;
            if (id === 'prop-tilt') selectedObject.tilt = val;
            render();
        };
    });

    document.getElementById('save-btn').onclick = save;
    document.getElementById('tool-delete').onclick = deleteObject;
    document.getElementById('jump-sim-btn').onclick = jumpToSim;
}

function jumpToSim() {
    if (!selectedObject || selectedObject.center) return;
    const url = `/fsim.html?x=${selectedObject.x}&y=${selectedObject.y}&z=${selectedObject.z}&tilt=${selectedObject.tilt || 45}&fog=${selectedObject.fog || 0}&clouds=${selectedObject.clouds || 0}&lighting=${selectedObject.lighting || 'noon'}`;
    window.open(url, '_blank');
}

function deleteObject() {
    if (!selectedObject) return;
    if (confirm(`Delete ${selectedObject.id || selectedObject.type}?`)) {
        // Find if it's a city or district
        const cityIdx = worldData.cities.indexOf(selectedObject);
        if (cityIdx !== -1) {
            worldData.cities.splice(cityIdx, 1);
        } else {
            // Must be a district
            worldData.cities.forEach(city => {
                const dIdx = city.districts?.indexOf(selectedObject);
                if (dIdx !== -1) city.districts.splice(dIdx, 1);
            });
        }
        selectedObject = null;
        updateSidebar();
        render();
    }
}

function setTool(tool) {
    currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('tool-' + tool).classList.add('active');
}

function updateSidebar() {
    const selPanel = document.getElementById('selection-panel');
    const noSel = document.getElementById('no-selection');
    const badge = document.getElementById('prop-type-badge');
    const cityProps = document.getElementById('city-only-props');
    const vantageProps = document.getElementById('vantage-only-props');

    if (selectedObject) {
        selPanel.style.display = 'block';
        noSel.style.display = 'none';

        const isCity = !!selectedObject.center;
        badge.innerText = isCity ? (selectedObject.road ? "CITY" : "DISTRICT") : "VANTAGE POINT";
        cityProps.style.display = isCity ? "block" : "none";
        vantageProps.style.display = isCity ? "none" : "block";

        document.getElementById('prop-id').value = selectedObject.id || selectedObject.type || "Vantage Point";
        document.getElementById('prop-cx').value = isCity ? selectedObject.center[0] : selectedObject.x;
        document.getElementById('prop-cz').value = isCity ? selectedObject.center[1] : selectedObject.z;

        if (isCity) {
            document.getElementById('prop-radius').value = selectedObject.radius;
            if (selectedObject.road) {
                document.getElementById('prop-seed').value = selectedObject.road.seed;
                document.getElementById('prop-density').value = selectedObject.road.density;
            }
        } else {
            document.getElementById('prop-alt').value = selectedObject.y;
            document.getElementById('prop-tilt').value = selectedObject.tilt || 45;
        }
    } else {
        selPanel.style.display = 'none';
        noSel.style.display = 'block';
    }
}

async function save() {
    const btn = document.getElementById('save-btn');
    btn.innerText = 'SAVING...';
    btn.style.opacity = '0.5';

    try {
        console.log(`[DEBUG] Attempting save to ${window.location.origin}/save`);
        const [resMap, resVantage] = await Promise.all([
            fetch('/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: 'tools/map.json', content: worldData })
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
