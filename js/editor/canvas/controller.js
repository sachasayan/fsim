import { QuadtreeMapSampler, setStaticSampler, getTerrainHeight } from '../../modules/world/terrain/TerrainUtils.js';
import { applyTerrainEdits } from '../../modules/world/terrain/TerrainEdits.js';
import { createTerrainSynthesizer } from '../../modules/world/terrain/TerrainSynthesis.js';
import { MapTileManager } from '../../modules/ui/MapTileManager.js';
import { getClosestTerrainSegmentIndex, getVertexHitIndex } from '../../modules/editor/geometry.js';
import { TOOL_SHORTCUTS } from '../../modules/editor/constants.js';
import { isRoad, isTerrainEdit } from '../../modules/editor/objectTypes.js';
import { debugLog } from '../../modules/core/logging.js';
import { Noise } from '../../modules/noise.js';
import { nudgeEntityCommand, snapWorldPoint } from '../core/commands.js';
import { getEntityById, getEntityBounds } from '../core/document.js';
import { createCoordinateHelpers, findObjectsAtWorldPos, renderEditorScene } from './render.js';
import { createTerrainPreviewWorkerManager } from './TerrainPreviewWorkerManager.js';
import { createEditorMapTileWorkerManager } from './EditorMapTileWorkerManager.js';

const VERTEX_HIT_RADIUS_PX = 12;
const PAN_DRAG_THRESHOLD_PX = 4;

export function createEditorCanvasController({ canvas, coordsElement, store }) {
    const ctx = canvas.getContext('2d');
    let rafPending = false;
    let isPanning = false;
    let pendingCanvasPan = null;
    let lastMouse = { x: 0, y: 0 };
    let activePointerId = null;
    let isDragging = false;
    let dragMode = null;
    let activeTerrainStrokeId = null;
    let previousDocumentRef = store.getState().document;
    let tileManager = null;
    let synthCacheKey = null;
    let synthCache = null;
    let terrainLabPreviewKey = null;
    let isUpdatingTerrainLabPreview = false;
    let pendingTerrainLabPreview = false;
    let terrainPreviewJobSerial = 0;
    let hoverCoordsRafPending = false;
    let pendingHoverSample = null;
    let activeHoverSampleSerial = 0;
    let latestHoverSampleSerial = 0;
    let lastHoverId = null;
    let lastHoverWorldPos = null;
    let previousTerrainLabKey = JSON.stringify(store.getState().ui.terrainLab.draftConfig);
    const terrainPreviewWorker = createTerrainPreviewWorkerManager();
    const mapTileWorker = createEditorMapTileWorkerManager();

    function getTerrainSynthesizer() {
        const draftConfig = store.getState().ui.terrainLab.draftConfig;
        const nextKey = JSON.stringify(draftConfig);
        if (synthCache && synthCacheKey === nextKey) return synthCache;
        synthCacheKey = nextKey;
        synthCache = createTerrainSynthesizer({
            Noise,
            worldSize: 50000,
            config: draftConfig
        });
        return synthCache;
    }

    function buildPreviewBounds() {
        const state = store.getState();
        return {
            minX: state.viewport.x - canvas.width / 2 / state.viewport.zoom,
            maxX: state.viewport.x + canvas.width / 2 / state.viewport.zoom,
            minZ: state.viewport.z - canvas.height / 2 / state.viewport.zoom,
            maxZ: state.viewport.z + canvas.height / 2 / state.viewport.zoom
        };
    }

    async function updateTerrainLabPreview(force = false) {
        if (isUpdatingTerrainLabPreview) {
            pendingTerrainLabPreview = true;
            return;
        }
        const state = store.getState();
        const terrainLab = state.ui.terrainLab;
        if (!terrainLab.draftConfig.preview.enabled) return;
        const bounds = buildPreviewBounds();
        const previewKey = JSON.stringify({
            bounds: Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, Math.round(value)])),
            overlay: terrainLab.selectedOverlay,
            resolution: terrainLab.draftConfig.preview.resolution,
            opacity: terrainLab.draftConfig.preview.opacity,
            contours: terrainLab.draftConfig.preview.showContours,
            config: terrainLab.draftConfig
        });
        if (!force && terrainLabPreviewKey === previewKey && terrainLab.previewDirty !== true) return;

        isUpdatingTerrainLabPreview = true;
        pendingTerrainLabPreview = false;
        const jobSerial = ++terrainPreviewJobSerial;
        try {
            store.dispatch({ type: 'set-terrain-preview-status', status: 'generating' });
            const { snapshot, metadata } = await terrainPreviewWorker.buildPreview({
                bounds,
                config: terrainLab.draftConfig,
                overlayKind: terrainLab.selectedOverlay,
                resolution: terrainLab.draftConfig.preview.resolution,
                opacity: terrainLab.draftConfig.preview.opacity,
                showContours: terrainLab.draftConfig.preview.showContours
            });
            if (jobSerial !== terrainPreviewJobSerial) return;
            terrainLabPreviewKey = previewKey;
            store.dispatch({
                type: 'set-terrain-preview',
                status: 'ready',
                previewKey,
                snapshot,
                previewDirty: false,
                metadata
            });
        } catch (error) {
            console.error('Failed to generate terrain preview', error);
            if (jobSerial === terrainPreviewJobSerial) {
                store.dispatch({ type: 'set-terrain-preview-status', status: 'idle' });
            }
        } finally {
            isUpdatingTerrainLabPreview = false;
            if (pendingTerrainLabPreview || store.getState().ui.terrainLab.previewDirty === true) {
                pendingTerrainLabPreview = false;
                updateTerrainLabPreview(true);
            }
        }
    }

    function sampleTerrainHeight(x, z) {
        const state = store.getState();
        const baseHeight = state.ui.terrainLab.draftConfig
            ? getTerrainSynthesizer().sampleHeight(x, z)
            : getTerrainHeight(x, z, Noise);
        return applyTerrainEdits(baseHeight, x, z, state.document.worldData.terrainEdits || []);
    }

    tileManager = new MapTileManager({
        sampleTerrainHeight,
        tileSize: 256,
        useHillshading: true,
        renderTileAsync: ({ tx, tz, lod, canvasW, canvasH, tileSize, pixelRatio, useHillshading }) => mapTileWorker.renderTile({
            tx,
            tz,
            lod,
            canvasW,
            canvasH,
            tileSize,
            pixelRatio,
            useHillshading,
            config: store.getState().ui.terrainLab.draftConfig,
            terrainEdits: store.getState().document.worldData.terrainEdits || []
        }),
        onTileReady: scheduleRender
    });

    function scheduleRender() {
        if (isUpdatingTerrainLabPreview) {
            pendingTerrainLabPreview = true;
        } else {
            updateTerrainLabPreview();
        }
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
            rafPending = false;
            render();
        });
    }

    function updateHoverCoordsText(world, overlayValue, overlayLabel) {
        if (!coordsElement) return;
        if (Number.isFinite(overlayValue)) {
            coordsElement.textContent = `X: ${Math.round(world.x)}, Z: ${Math.round(world.z)}, ${overlayLabel}: ${overlayValue.toFixed(2)}`;
            return;
        }
        coordsElement.textContent = `X: ${Math.round(world.x)}, Z: ${Math.round(world.z)}`;
    }

    function flushHoverCoords() {
        hoverCoordsRafPending = false;
        const sample = pendingHoverSample;
        pendingHoverSample = null;
        if (!sample || !coordsElement) return;

        const { world, overlayKind, config } = sample;
        const sampleSerial = ++latestHoverSampleSerial;
        updateHoverCoordsText(world, NaN, overlayKind);
        terrainPreviewWorker.sampleOverlay({
            x: world.x,
            z: world.z,
            overlayKind,
            config
        }).then(({ value }) => {
            if (sampleSerial < activeHoverSampleSerial) return;
            activeHoverSampleSerial = sampleSerial;
            updateHoverCoordsText(world, value, overlayKind);
        }).catch((error) => {
            console.error('Failed to sample terrain overlay', error);
        });
    }

    function scheduleHoverCoords(world) {
        if (!coordsElement) return;
        const terrainLab = store.getState().ui.terrainLab;
        pendingHoverSample = {
            world,
            overlayKind: terrainLab.selectedOverlay,
            config: terrainLab.draftConfig
        };
        if (hoverCoordsRafPending) return;
        hoverCoordsRafPending = true;
        requestAnimationFrame(() => {
            flushHoverCoords();
        });
    }

    function syncHoverState(point, world, state) {
        const nextHoverId = point.inside ? findObjectsAtWorldPos(state, world)[0] || null : null;
        const needsBrushPreview = state.tools.currentTool.startsWith('terrain-');
        const nextHoverWorldPos = point.inside && needsBrushPreview ? world : null;
        const sameHoverId = nextHoverId === lastHoverId;
        const sameHoverWorldPos = (
            nextHoverWorldPos === null && lastHoverWorldPos === null
        ) || (
            nextHoverWorldPos !== null
            && lastHoverWorldPos !== null
            && nextHoverWorldPos.x === lastHoverWorldPos.x
            && nextHoverWorldPos.z === lastHoverWorldPos.z
        );

        if (sameHoverId && sameHoverWorldPos) return false;

        lastHoverId = nextHoverId;
        lastHoverWorldPos = nextHoverWorldPos ? { x: nextHoverWorldPos.x, z: nextHoverWorldPos.z } : null;
        store.dispatch({
            type: 'set-hover',
            hoverId: nextHoverId,
            hoverWorldPos: nextHoverWorldPos
        });
        return true;
    }

    function updateCanvasSize() {
        const parent = canvas.parentElement;
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        scheduleRender();
    }

    function getWorldPoint(event) {
        const rect = canvas.getBoundingClientRect();
        const point = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            inside: event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
        };
        const { screenToWorld } = createCoordinateHelpers(canvas, store.getState().viewport);
        return { point, world: screenToWorld(point.x, point.y) };
    }

    function setSelection(selectedId, activeVertex = null) {
        store.dispatch({ type: 'set-selection', selectedId, activeVertex });
    }

    function getSelectionCycle(foundIds) {
        const selectedId = store.getState().selection.selectedId;
        if (!selectedId || foundIds.length <= 1) return foundIds[0] || null;
        const currentIndex = foundIds.indexOf(selectedId);
        return foundIds[(currentIndex + 1) % foundIds.length] || foundIds[0] || null;
    }

    function queueToast(message, tone = 'info') {
        store.dispatch({ type: 'set-toast', toast: { message, tone, timestamp: Date.now() } });
        window.setTimeout(() => {
            const current = store.getState().ui.toast;
            if (current?.message === message) store.dispatch({ type: 'set-toast', toast: null });
        }, 2200);
    }

    function beginVertexDrag(selectedId, hitIndex, nextTool = null) {
        if (nextTool) {
            store.dispatch({ type: 'set-tool', tool: nextTool });
        }
        dragMode = 'vertex';
        isDragging = true;
        store.dispatch({ type: 'set-active-vertex', activeVertex: { entityId: selectedId, index: hitIndex } });
    }

    function render() {
        renderEditorScene(ctx, canvas, tileManager, store.getState());
    }

    async function reloadStaticWorld() {
        try {
            const worldBinResponse = await fetch('/world/world.bin');
            if (!worldBinResponse.ok) return false;
            const buffer = await worldBinResponse.arrayBuffer();
            setStaticSampler(new QuadtreeMapSampler(buffer));
            tileManager.clearCache();
            terrainLabPreviewKey = null;
            store.dispatch({ type: 'mark-terrain-preview-dirty', status: 'idle' });
            debugLog(`[Editor] Reloaded static world.bin (${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);
            scheduleRender();
            return true;
        } catch (error) {
            console.error('Failed to reload world.bin for editor', error);
            return false;
        }
    }

    function frameSelection() {
        const state = store.getState();
        const entityId = state.selection.selectedId;
        if (!entityId) return;
        const bounds = getEntityBounds(state.document, entityId);
        if (!bounds) return;
        const width = Math.max(100, bounds.maxX - bounds.minX);
        const height = Math.max(100, bounds.maxZ - bounds.minZ);
        const nextZoom = Math.min(
            0.4,
            Math.max(0.01, Math.min(canvas.width / (width * 1.6), canvas.height / (height * 1.6)))
        );
        store.dispatch({
            type: 'set-camera',
            viewport: {
                x: (bounds.minX + bounds.maxX) / 2,
                z: (bounds.minZ + bounds.maxZ) / 2,
                zoom: nextZoom
            }
        });
    }

    function resetView() {
        store.dispatch({ type: 'set-camera', viewport: { x: 0, z: 0, zoom: 0.05 } });
    }

    function bindEvents() {
        window.addEventListener('resize', updateCanvasSize);

        canvas.addEventListener('contextmenu', event => {
            event.preventDefault();
            const state = store.getState();
            const selected = getEntityById(state.document, state.selection.selectedId);
            if (!selected?.points || state.tools.currentTool !== 'edit-poly') return;
            const { world } = getWorldPoint(event);
            const hitIndex = getVertexHitIndex(selected.points, world, VERTEX_HIT_RADIUS_PX / state.viewport.zoom);
            if (hitIndex === -1) return;
            const minimum = isRoad(selected) ? 2 : 1;
            store.runCommand({
                type: 'remove-vertex',
                entityId: state.selection.selectedId,
                vertexIndex: hitIndex,
                minPoints: minimum
            });
        });

        canvas.addEventListener('dblclick', event => {
            const state = store.getState();
            const selected = getEntityById(state.document, state.selection.selectedId);
            if (!selected?.points || state.tools.currentTool !== 'edit-poly') return;
            const { world } = getWorldPoint(event);
            const insertIndex = getClosestTerrainSegmentIndex(
                selected,
                world,
                Math.max(isRoad(selected) ? selected.width + selected.feather : 80, 30 / state.viewport.zoom)
            );
            const point = snapWorldPoint(world, state.tools.snappingEnabled, !isTerrainEdit(selected), state.document, state.selection.selectedId);
            store.runCommand({
                type: 'insert-vertex',
                entityId: state.selection.selectedId,
                insertIndex: insertIndex === -1 ? selected.points.length : insertIndex,
                point
            });
        });

        canvas.addEventListener('pointerdown', event => {
            const state = store.getState();
            const { point, world } = getWorldPoint(event);
            if (!point.inside) return;
            activePointerId = event.pointerId;
            canvas.setPointerCapture(event.pointerId);

            if (event.button === 1 || state.tools.currentTool === 'pan') {
                isPanning = true;
                lastMouse = { x: point.x, y: point.y };
                scheduleRender();
                return;
            }

            const selected = getEntityById(state.document, state.selection.selectedId);
            if (selected?.points) {
                const hitIndex = getVertexHitIndex(selected.points, world, VERTEX_HIT_RADIUS_PX / state.viewport.zoom);
                if (hitIndex !== -1) {
                    const canEditVertex = state.tools.currentTool === 'edit-poly'
                        || (state.tools.currentTool.startsWith('terrain-') && isTerrainEdit(selected));
                    if (canEditVertex) {
                        beginVertexDrag(
                            state.selection.selectedId,
                            hitIndex,
                            state.tools.currentTool === 'edit-poly' ? null : 'edit-poly'
                        );
                        return;
                    }
                }
            }

            if (state.tools.currentTool.startsWith('terrain-')) {
                const result = store.runCommand({
                    type: 'create-terrain-stroke',
                    worldPos: world,
                    tool: state.tools.currentTool
                }, {
                    context: {
                        terrainStrokeDeps: {
                            terrainBrush: state.tools.terrainBrush,
                            sampleTerrainHeight,
                            tileManager
                        }
                    }
                });
                activeTerrainStrokeId = result.selectionId;
                dragMode = 'terrain';
                isDragging = true;
                return;
            }

            if (state.tools.currentTool === 'add-city') {
                const pointSnapped = snapWorldPoint(world, state.tools.snappingEnabled, true, state.document);
                store.runCommand({
                    type: 'create-city',
                    center: pointSnapped,
                    cityId: `city_${store.getState().document.worldData.cities.length + 1}`
                });
                queueToast('City created');
                store.dispatch({ type: 'set-tool', tool: 'select' });
                return;
            }

            if (state.tools.currentTool === 'add-district') {
                const pointSnapped = snapWorldPoint(world, state.tools.snappingEnabled, true, state.document);
                const selectedEntity = getEntityById(state.document, state.selection.selectedId);
                const cityId = selectedEntity?.id && selectedEntity.center && !selectedEntity.points ? selectedEntity.id : selectedEntity?.city_id || null;
                store.runCommand({
                    type: 'create-district',
                    center: pointSnapped,
                    cityId
                });
                store.dispatch({ type: 'set-tool', tool: 'edit-poly' });
                return;
            }

            if (state.tools.currentTool === 'add-road') {
                const pointSnapped = snapWorldPoint(world, state.tools.snappingEnabled, true, state.document);
                store.runCommand({
                    type: 'create-road',
                    center: pointSnapped
                });
                store.dispatch({ type: 'set-tool', tool: 'edit-poly' });
                return;
            }

            const foundIds = findObjectsAtWorldPos(state, world);
            if (foundIds.length > 0) {
                const nextId = getSelectionCycle(foundIds);
                setSelection(nextId);
                if (nextId) {
                    dragMode = 'entity';
                    isDragging = true;
                }
                return;
            }

            if (state.tools.currentTool === 'select') {
                pendingCanvasPan = { x: point.x, y: point.y };
                lastMouse = { x: point.x, y: point.y };
                return;
            }

            setSelection(null);
        });

        window.addEventListener('pointermove', event => {
            const state = store.getState();
            const { point, world } = getWorldPoint(event);
            const hoverChanged = syncHoverState(point, world, state);
            if (coordsElement && point.inside) {
                scheduleHoverCoords(world);
            } else if (coordsElement && !point.inside) {
                coordsElement.textContent = '';
            }

            if (pendingCanvasPan && !isPanning) {
                const dragDistance = Math.hypot(point.x - pendingCanvasPan.x, point.y - pendingCanvasPan.y);
                if (dragDistance >= PAN_DRAG_THRESHOLD_PX) {
                    isPanning = true;
                }
            }

            if (isPanning) {
                const dx = point.x - lastMouse.x;
                const dy = point.y - lastMouse.y;
                lastMouse = { x: point.x, y: point.y };
                store.dispatch({
                    type: 'set-camera',
                    viewport: {
                        x: state.viewport.x - dx / state.viewport.zoom,
                        z: state.viewport.z - dy / state.viewport.zoom
                    }
                });
                return;
            }

            if (!isDragging) {
                if (hoverChanged || point.inside && state.tools.currentTool.startsWith('terrain-')) {
                    scheduleRender();
                }
                return;
            }

            if (dragMode === 'terrain' && activeTerrainStrokeId) {
                const selected = getEntityById(store.getState().document, activeTerrainStrokeId);
                if (selected) {
                    store.runCommand({
                        type: 'append-terrain-point',
                        entityId: activeTerrainStrokeId,
                        worldPos: world
                    }, { coalesceKey: `terrain:${activeTerrainStrokeId}` });
                }
                scheduleRender();
                return;
            }

            if (dragMode === 'vertex') {
                const activeVertex = store.getState().selection.activeVertex;
                if (!activeVertex) return;
                const selected = getEntityById(store.getState().document, activeVertex.entityId);
                const snapped = snapWorldPoint(world, state.tools.snappingEnabled, !isTerrainEdit(selected), store.getState().document, activeVertex.entityId);
                store.runCommand({
                    type: 'move-vertex',
                    entityId: activeVertex.entityId,
                    vertexIndex: activeVertex.index,
                    point: snapped
                }, { coalesceKey: `vertex:${activeVertex.entityId}:${activeVertex.index}` });
                return;
            }

            if (dragMode === 'entity') {
                const entity = getEntityById(store.getState().document, store.getState().selection.selectedId);
                if (!entity) return;
                if (entity.center) {
                    const snapped = snapWorldPoint(world, state.tools.snappingEnabled, true, store.getState().document, store.getState().selection.selectedId);
                    store.runCommand({
                        type: 'move-entity',
                        entityId: store.getState().selection.selectedId,
                        nextCenter: [snapped.x, snapped.z]
                    }, { coalesceKey: `move:${store.getState().selection.selectedId}` });
                } else {
                    const snapped = snapWorldPoint(world, state.tools.snappingEnabled, !isTerrainEdit(entity), store.getState().document, store.getState().selection.selectedId);
                    store.runCommand({
                        type: 'move-entity',
                        entityId: store.getState().selection.selectedId,
                        nextPoint: snapped
                    }, { coalesceKey: `move:${store.getState().selection.selectedId}` });
                }
            }
        });

        function releasePointer(event) {
            if (activePointerId !== null && event.pointerId === activePointerId && canvas.hasPointerCapture(event.pointerId)) {
                canvas.releasePointerCapture(event.pointerId);
            }
            activePointerId = null;
            pendingCanvasPan = null;
            isPanning = false;
            isDragging = false;
            dragMode = null;
            activeTerrainStrokeId = null;
            scheduleRender();
        }

        window.addEventListener('pointerup', releasePointer);
        window.addEventListener('pointercancel', releasePointer);

        canvas.addEventListener('mouseleave', () => {
            if (lastHoverId !== null || lastHoverWorldPos !== null) {
                lastHoverId = null;
                lastHoverWorldPos = null;
                store.dispatch({ type: 'set-hover', hoverId: null, hoverWorldPos: null });
                scheduleRender();
            }
        });

        canvas.addEventListener('wheel', event => {
            event.preventDefault();
            const { point } = getWorldPoint(event);
            const { screenToWorld } = createCoordinateHelpers(canvas, store.getState().viewport);
            const mouseWorldBefore = screenToWorld(point.x, point.y);
            const nextZoom = event.deltaY < 0
                ? store.getState().viewport.zoom * 1.1
                : store.getState().viewport.zoom / 1.1;
            store.dispatch({
                type: 'set-camera',
                viewport: { zoom: Math.max(0.001, Math.min(1, nextZoom)) }
            });
            const mouseWorldAfter = createCoordinateHelpers(canvas, store.getState().viewport).screenToWorld(point.x, point.y);
            store.dispatch({
                type: 'set-camera',
                viewport: {
                    x: store.getState().viewport.x - (mouseWorldAfter.x - mouseWorldBefore.x),
                    z: store.getState().viewport.z - (mouseWorldAfter.z - mouseWorldBefore.z)
                }
            });
        }, { passive: false });

        window.addEventListener('keydown', event => {
            const activeTag = document.activeElement?.tagName || '';
            if (['INPUT', 'SELECT', 'TEXTAREA'].includes(activeTag) || document.activeElement?.isContentEditable) return;

            const isMeta = event.metaKey || event.ctrlKey;
            if (isMeta && event.key.toLowerCase() === 'z') {
                event.preventDefault();
                if (event.shiftKey) store.dispatch({ type: 'redo' });
                else store.dispatch({ type: 'undo' });
                return;
            }
            if (isMeta && event.key.toLowerCase() === 'y') {
                event.preventDefault();
                store.dispatch({ type: 'redo' });
                return;
            }
            if (event.key === '?') {
                event.preventDefault();
                store.dispatch({ type: 'toggle-help' });
                return;
            }
            const shortcutTool = TOOL_SHORTCUTS[event.key.toLowerCase()];
            if (shortcutTool && !isMeta) {
                event.preventDefault();
                store.dispatch({ type: 'set-tool', tool: shortcutTool });
                return;
            }
            if (event.key.toLowerCase() === 'g') {
                event.preventDefault();
                store.dispatch({ type: 'set-snapping', value: !store.getState().tools.snappingEnabled });
                return;
            }
            if (event.key.toLowerCase() === '0') {
                event.preventDefault();
                resetView();
                return;
            }
            if (event.key.toLowerCase() === 'f') {
                if (!event.metaKey && !event.ctrlKey && store.getState().tools.currentTool === 'select') {
                    event.preventDefault();
                    frameSelection();
                }
                return;
            }

            const selectedId = store.getState().selection.selectedId;
            const selected = getEntityById(store.getState().document, selectedId);
            if (!selected) return;

            if (event.key.toLowerCase() === 'd' && isMeta) {
                event.preventDefault();
                store.runCommand({ type: 'duplicate-entity', entityId: selectedId });
                return;
            }
            if (event.key === 'Delete' || event.key === 'Backspace') {
                event.preventDefault();
                store.runCommand({ type: 'delete-entity', entityId: selectedId });
                return;
            }

            const step = event.shiftKey ? 500 : event.altKey ? 10 : 100;
            const delta = {
                ArrowUp: { x: 0, z: -step },
                ArrowDown: { x: 0, z: step },
                ArrowLeft: { x: -step, z: 0 },
                ArrowRight: { x: step, z: 0 }
            }[event.key];
            if (delta) {
                event.preventDefault();
                const command = nudgeEntityCommand(store.getState().document, selectedId, delta, store.getState().selection.activeVertex);
                if (command) store.runCommand(command);
            }
        });
    }

    const unsubscribe = store.subscribe(() => {
        const nextState = store.getState();
        const terrainPreviewState = nextState.ui.terrainLab;
        if (nextState.document !== previousDocumentRef) {
            previousDocumentRef = nextState.document;
            tileManager.clearCache();
        }
        const nextTerrainLabKey = JSON.stringify(terrainPreviewState.draftConfig);
        if (nextTerrainLabKey !== previousTerrainLabKey) {
            previousTerrainLabKey = nextTerrainLabKey;
            tileManager.clearCache();
        }
        scheduleRender();
    });

    return {
        async init() {
            updateCanvasSize();
            await reloadStaticWorld();
            bindEvents();
            render();
        },
        destroy() {
            unsubscribe();
            tileManager.destroy();
            terrainPreviewWorker.destroy();
            mapTileWorker.destroy();
        },
        frameSelection,
        frameTerrainHydrology() {
            const metadata = getTerrainSynthesizer().getMetadata();
            const points = [
                ...metadata.hydrology.rivers.flatMap(river => river.points),
                ...metadata.hydrology.lakes.flatMap(lake => [[lake.x - lake.radius, lake.z - lake.radius], [lake.x + lake.radius, lake.z + lake.radius]])
            ];
            if (points.length === 0) return;
            let minX = Infinity;
            let maxX = -Infinity;
            let minZ = Infinity;
            let maxZ = -Infinity;
            for (const [x, z] of points) {
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minZ = Math.min(minZ, z);
                maxZ = Math.max(maxZ, z);
            }
            const width = Math.max(1000, maxX - minX);
            const height = Math.max(1000, maxZ - minZ);
            store.dispatch({
                type: 'set-camera',
                viewport: {
                    x: (minX + maxX) * 0.5,
                    z: (minZ + maxZ) * 0.5,
                    zoom: Math.min(0.4, Math.max(0.01, Math.min(canvas.width / (width * 1.4), canvas.height / (height * 1.4))))
                }
            });
            updateTerrainLabPreview(true);
        },
        reloadStaticWorld,
        resetView,
        scheduleRender
    };
}
