import { QuadtreeMapSampler, setStaticSampler, getTerrainHeight } from '../../modules/world/terrain/TerrainUtils.js';
import { applyTerrainEdits } from '../../modules/world/terrain/TerrainEdits.js';
import { MapTileManager } from '../../modules/ui/MapTileManager.js';
import { getClosestTerrainSegmentIndex, getVertexHitIndex } from '../../modules/editor/geometry.js';
import { TOOL_SHORTCUTS } from '../../modules/editor/constants.js';
import { isRoad, isTerrainEdit } from '../../modules/editor/objectTypes.js';
import { debugLog } from '../../modules/core/logging.js';
import { Noise } from '../../modules/noise.js';
import { nudgeEntityCommand, snapWorldPoint } from '../core/commands.js';
import { getEntityById } from '../core/document.js';
import { createCoordinateHelpers, findObjectsAtWorldPos, renderEditorScene } from './render.js';

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

    function sampleTerrainHeight(x, z) {
        const state = store.getState();
        const baseHeight = getTerrainHeight(x, z, Noise);
        return applyTerrainEdits(baseHeight, x, z, state.document.worldData.terrainEdits || []);
    }

    tileManager = new MapTileManager({
        sampleTerrainHeight,
        tileSize: 256,
        useHillshading: true,
        onTileReady: scheduleRender
    });

    function scheduleRender() {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
            rafPending = false;
            render();
        });
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
            const point = snapWorldPoint(world, state.tools.snappingEnabled, !isTerrainEdit(selected));
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
                const pointSnapped = snapWorldPoint(world, state.tools.snappingEnabled, true);
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
                const pointSnapped = snapWorldPoint(world, state.tools.snappingEnabled, true);
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
                const pointSnapped = snapWorldPoint(world, state.tools.snappingEnabled, true);
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
            store.dispatch({
                type: 'set-hover',
                hoverId: point.inside ? findObjectsAtWorldPos(state, world)[0] || null : null,
                hoverWorldPos: point.inside ? world : null
            });
            if (coordsElement && point.inside) {
                coordsElement.textContent = `X: ${Math.round(world.x)}, Z: ${Math.round(world.z)}`;
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
                scheduleRender();
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
                const snapped = snapWorldPoint(world, state.tools.snappingEnabled, !isTerrainEdit(selected));
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
                    const snapped = snapWorldPoint(world, state.tools.snappingEnabled, true);
                    store.runCommand({
                        type: 'move-entity',
                        entityId: store.getState().selection.selectedId,
                        nextCenter: [snapped.x, snapped.z]
                    }, { coalesceKey: `move:${store.getState().selection.selectedId}` });
                } else {
                    const snapped = snapWorldPoint(world, state.tools.snappingEnabled, !isTerrainEdit(entity));
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
            store.dispatch({ type: 'set-hover', hoverId: null, hoverWorldPos: null });
            scheduleRender();
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
        if (nextState.document !== previousDocumentRef) {
            previousDocumentRef = nextState.document;
            tileManager.clearCache();
        }
        scheduleRender();
    });

    return {
        async init() {
            updateCanvasSize();
            try {
                const worldBinResponse = await fetch('/world/world.bin');
                if (worldBinResponse.ok) {
                    const buffer = await worldBinResponse.arrayBuffer();
                    setStaticSampler(new QuadtreeMapSampler(buffer));
                    debugLog(`[Editor] Loaded static world.bin (${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);
                }
            } catch (error) {
                console.error('Failed to load world.bin for editor', error);
            }
            bindEvents();
            render();
        },
        destroy() {
            unsubscribe();
        },
        frameSelection,
        resetView,
        scheduleRender
    };
}
