import { QuadtreeMapSampler, setStaticSampler, getTerrainHeight } from '../../modules/world/terrain/TerrainUtils.js';
import { applyTerrainEdits } from '../../modules/world/terrain/TerrainEdits.js';
import { createTerrainSynthesizer } from '../../modules/world/terrain/TerrainSynthesis.js';
import { classifyTerrainRegionSelectionTiles, createRegionalTerrainSampler, createTerrainRegionFromTiles, findTerrainRegionOverlap, getTerrainRegionAtWorldPos, getTerrainRegionTileSize, normalizeTerrainRegion, normalizeTerrainRegions, TERRAIN_REGION_GRID_SIZE, worldToTerrainRegionTile } from '../../modules/world/terrain/TerrainRegions.js';
import { MapTileManager } from '../../modules/ui/MapTileManager.js';
import { getClosestTerrainSegmentIndex, getVertexHitIndex } from '../../modules/editor/geometry.js';
import { isTerrainBrushTool, TOOL_SHORTCUTS } from '../../modules/editor/constants.js';
import { isRoad, isTerrainEdit, isTerrainRegion } from '../../modules/editor/objectTypes.js';
import { debugLog } from '../../modules/core/logging.js';
import { Noise } from '../../modules/noise.js';
import { DEFAULT_WORLD_SIZE } from '../../modules/world/WorldConfig.js';
import { nudgeEntityCommand, snapWorldPoint } from '../core/commands.js';
import { getEntityById, getEntityBounds } from '../core/document.js';
import { createCoordinateHelpers, findObjectsAtWorldPos, renderEditorScene } from './render.js';
import { createTerrainPreviewWorkerManager } from './TerrainPreviewWorkerManager.js';
import { createEditorMapTileWorkerManager } from './EditorMapTileWorkerManager.js';

const VERTEX_HIT_RADIUS_PX = 12;
const PAN_DRAG_THRESHOLD_PX = 4;
const MIN_VIEWPORT_ZOOM = 0.001;
const MAX_VIEWPORT_ZOOM = 1;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

export function clampViewportToWorld(viewport, canvasSize, worldSize = DEFAULT_WORLD_SIZE) {
    const width = Math.max(1, canvasSize?.width || 1);
    const height = Math.max(1, canvasSize?.height || 1);
    const safeWorldSize = Math.max(1, worldSize);
    const minZoom = Math.max(MIN_VIEWPORT_ZOOM, width / safeWorldSize, height / safeWorldSize);
    const zoom = clamp(viewport?.zoom ?? MIN_VIEWPORT_ZOOM, minZoom, MAX_VIEWPORT_ZOOM);
    const halfWorldSize = safeWorldSize * 0.5;
    const halfViewportWidth = width * 0.5 / zoom;
    const halfViewportHeight = height * 0.5 / zoom;
    const xLimit = Math.max(0, halfWorldSize - halfViewportWidth);
    const zLimit = Math.max(0, halfWorldSize - halfViewportHeight);

    return {
        x: clamp(viewport?.x ?? 0, -xLimit, xLimit),
        z: clamp(viewport?.z ?? 0, -zLimit, zLimit),
        zoom
    };
}

export function shouldClearSelectionOnPointerRelease(state, pendingCanvasPan, isPanning) {
    if (!pendingCanvasPan || isPanning || state?.tools?.currentTool !== 'select') return false;
    const selected = getEntityById(state.document, state.selection.selectedId);
    return isTerrainRegion(selected);
}

export function getTerrainEditBoundsById(document) {
    const boundsById = new Map();
    for (const edit of document?.worldData?.terrainEdits || []) {
        if (!edit?.__editorId || !edit?.bounds) continue;
        boundsById.set(edit.__editorId, { ...edit.bounds });
    }
    return boundsById;
}

function getTerrainRegionBoundsById(document) {
    const boundsById = new Map();
    for (const region of document?.worldData?.terrainRegions || []) {
        if (!region?.__editorId || !region?.bounds) continue;
        boundsById.set(region.__editorId, { ...region.bounds });
    }
    return boundsById;
}

function getTerrainAffectingBoundsById(document) {
    return new Map([
        ...getTerrainEditBoundsById(document).entries(),
        ...getTerrainRegionBoundsById(document).entries()
    ]);
}

export function invalidateChangedTerrainTiles(tileManager, previousBoundsById, nextDocument) {
    const nextBoundsById = getTerrainAffectingBoundsById(nextDocument);
    const changedBounds = [];
    const allIds = new Set([...previousBoundsById.keys(), ...nextBoundsById.keys()]);

    for (const id of allIds) {
        const prevBounds = previousBoundsById.get(id);
        const nextBounds = nextBoundsById.get(id);
        if (!prevBounds || !nextBounds) {
            changedBounds.push(prevBounds || nextBounds);
            continue;
        }
        if (
            prevBounds.minX !== nextBounds.minX
            || prevBounds.maxX !== nextBounds.maxX
            || prevBounds.minZ !== nextBounds.minZ
            || prevBounds.maxZ !== nextBounds.maxZ
        ) {
            changedBounds.push(prevBounds, nextBounds);
        }
    }

    for (const bounds of changedBounds) {
        tileManager.invalidateWorldRect(bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ);
    }

    return nextBoundsById;
}

export function reconcileTerrainTileInvalidation({
    tileManager,
    previousDocumentRef,
    previousTerrainEditBoundsById,
    previousTerrainLabVersion,
    nextState
}) {
    let nextPreviousDocumentRef = previousDocumentRef;
    let nextPreviousTerrainEditBoundsById = previousTerrainEditBoundsById;
    let nextPreviousTerrainLabVersion = previousTerrainLabVersion;
    const terrainPreviewState = nextState.ui.terrainLab;

    if (nextState.document !== previousDocumentRef) {
        nextPreviousTerrainEditBoundsById = invalidateChangedTerrainTiles(tileManager, previousTerrainEditBoundsById, nextState.document);
        nextPreviousDocumentRef = nextState.document;
    }

    const nextTerrainLabVersion = terrainPreviewState.configVersion;
    if (nextTerrainLabVersion !== previousTerrainLabVersion) {
        nextPreviousTerrainLabVersion = nextTerrainLabVersion;
        tileManager.invalidateAll();
    }

    return {
        previousDocumentRef: nextPreviousDocumentRef,
        previousTerrainEditBoundsById: nextPreviousTerrainEditBoundsById,
        previousTerrainLabVersion: nextPreviousTerrainLabVersion
    };
}

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
    let regionalSynthCacheDocumentRef = null;
    let regionalSynthCacheConfigVersion = null;
    let regionalSynthCacheSelectedId = null;
    let regionalSynthCache = null;
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
    let hoverWorldPos = null;
    let terrainRegionHover = null;
    let terrainRegionSelection = null;
    let previousTerrainLabVersion = store.getState().ui.terrainLab.configVersion;
    let previousTerrainEditBoundsById = getTerrainAffectingBoundsById(store.getState().document);
    let activeTerrainRegionSelection = null;
    let activeTerrainRegionDrag = null;
    let cachedCanvasRect = null;
    let normalizedPreviewRegionsDocumentRef = null;
    let normalizedPreviewRegions = null;
    let previewRegionsSourceDocumentRef = null;
    let previewRegionsSourceConfigVersion = null;
    let previewRegionsSourceSelectedId = null;
    let previewRegions = null;
    const terrainPreviewWorker = createTerrainPreviewWorkerManager();
    const mapTileWorker = createEditorMapTileWorkerManager();

    function invalidateCanvasRect() {
        cachedCanvasRect = null;
    }

    function getCanvasRect(forceRefresh = false) {
        if (forceRefresh || !cachedCanvasRect) {
            cachedCanvasRect = canvas.getBoundingClientRect();
        }
        return cachedCanvasRect;
    }

    function getClampedViewport(viewportPatch = {}) {
        return clampViewportToWorld(
            { ...store.getState().viewport, ...viewportPatch },
            { width: canvas.width, height: canvas.height }
        );
    }

    function setClampedCamera(viewportPatch = {}) {
        const nextViewport = getClampedViewport(viewportPatch);
        store.dispatch({
            type: 'set-camera',
            viewport: nextViewport
        });
        return nextViewport;
    }

    function getTerrainSynthesizer() {
        const terrainLab = store.getState().ui.terrainLab;
        const draftConfig = terrainLab.draftConfig;
        const nextKey = terrainLab.configVersion;
        if (synthCache && synthCacheKey === nextKey) return synthCache;
        synthCacheKey = nextKey;
        synthCache = createTerrainSynthesizer({
            Noise,
            worldSize: DEFAULT_WORLD_SIZE,
            config: draftConfig
        });
        return synthCache;
    }

    function getPreviewRegions() {
        const state = store.getState();
        if (normalizedPreviewRegionsDocumentRef !== state.document) {
            normalizedPreviewRegionsDocumentRef = state.document;
            normalizedPreviewRegions = normalizeTerrainRegions(state.document.worldData.terrainRegions || []);
        }
        const selected = getEntityById(state.document, state.selection.selectedId);
        if (
            previewRegions
            && previewRegionsSourceDocumentRef === state.document
            && previewRegionsSourceConfigVersion === state.ui.terrainLab.configVersion
            && previewRegionsSourceSelectedId === state.selection.selectedId
        ) {
            return previewRegions;
        }
        const savedRegions = normalizedPreviewRegions;
        if (!isTerrainRegion(selected)) {
            previewRegions = savedRegions;
            previewRegionsSourceDocumentRef = state.document;
            previewRegionsSourceConfigVersion = state.ui.terrainLab.configVersion;
            previewRegionsSourceSelectedId = state.selection.selectedId;
            return previewRegions;
        }
        previewRegions = savedRegions.map(region => (
            region.__editorId === selected.__editorId
                ? {
                    ...region,
                    terrainGenerator: structuredClone(state.ui.terrainLab.draftConfig)
                }
                : region
        ));
        previewRegionsSourceDocumentRef = state.document;
        previewRegionsSourceConfigVersion = state.ui.terrainLab.configVersion;
        previewRegionsSourceSelectedId = state.selection.selectedId;
        return previewRegions;
    }

    function getRegionalTerrainSampler() {
        const state = store.getState();
        const nextPreviewRegions = getPreviewRegions();
        if (
            regionalSynthCache
            && regionalSynthCacheDocumentRef === state.document
            && regionalSynthCacheConfigVersion === state.ui.terrainLab.configVersion
            && regionalSynthCacheSelectedId === state.selection.selectedId
        ) {
            return regionalSynthCache;
        }
        regionalSynthCacheDocumentRef = state.document;
        regionalSynthCacheConfigVersion = state.ui.terrainLab.configVersion;
        regionalSynthCacheSelectedId = state.selection.selectedId;
        regionalSynthCache = createRegionalTerrainSampler({
            Noise,
            worldSize: DEFAULT_WORLD_SIZE,
            regions: nextPreviewRegions
        });
        return regionalSynthCache;
    }

    function buildPreviewBounds() {
        const state = store.getState();
        const selected = getEntityById(state.document, state.selection.selectedId);
        if (isTerrainRegion(selected) && selected.bounds) {
            return { ...selected.bounds };
        }
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
        const selected = getEntityById(state.document, state.selection.selectedId);
        if (!isTerrainRegion(selected)) {
            const previewAlreadyReset = (
                terrainLab.previewStatus === 'idle'
                && terrainLab.previewKey === null
                && terrainLab.previewSnapshot === null
                && terrainLab.previewDirty === false
                && terrainLab.lastMetadata === null
            );
            if (!previewAlreadyReset) {
                store.dispatch({
                    type: 'set-terrain-preview',
                    status: 'idle',
                    previewKey: null,
                    snapshot: null,
                    previewDirty: false,
                    metadata: null
                });
            }
            return;
        }
        if (!terrainLab.draftConfig.preview.enabled) return;
        const bounds = buildPreviewBounds();
        const roundedBounds = Object.values(bounds).map(value => Math.round(value)).join(':');
        const previewKey = [
            selected.__editorId,
            terrainLab.configVersion,
            roundedBounds,
            terrainLab.selectedOverlay,
            terrainLab.draftConfig.preview.resolution,
            terrainLab.draftConfig.preview.showContours ? 1 : 0
        ].join('|');
        if (!force && terrainLabPreviewKey === previewKey && terrainLab.previewDirty !== true) return;

        isUpdatingTerrainLabPreview = true;
        pendingTerrainLabPreview = false;
        const jobSerial = ++terrainPreviewJobSerial;
        try {
            store.dispatch({ type: 'set-terrain-preview-status', status: 'generating' });
            const { snapshot, metadata } = await terrainPreviewWorker.buildPreview({
                bounds,
                authoredBounds: selected.bounds ? { ...selected.bounds } : bounds,
                config: terrainLab.draftConfig,
                overlayKind: terrainLab.selectedOverlay,
                resolution: terrainLab.draftConfig.preview.resolution,
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
        const baseHeight = getRegionalTerrainSampler().sampleHeight(x, z);
        return applyTerrainEdits(baseHeight, x, z, state.document.worldData.terrainEdits || []);
    }

    tileManager = new MapTileManager({
        sampleTerrainHeight,
        tileSize: 256,
        lodDetailScale: 2,
        maxConcurrentRenders: 2,
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
            terrainRegions: getPreviewRegions(),
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
        const needsBrushPreview = isTerrainBrushTool(state.tools.currentTool);
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
        hoverWorldPos = nextHoverWorldPos ? { x: nextHoverWorldPos.x, z: nextHoverWorldPos.z } : null;
        return true;
    }

    function syncTerrainRegionHover(point, world, state) {
        if (state.tools.currentTool !== 'terrain-region' || !point.inside) {
            if (terrainRegionHover !== null) {
                terrainRegionHover = null;
                return true;
            }
            return false;
        }

        const tile = worldToTerrainRegionTile(world.x, world.z, DEFAULT_WORLD_SIZE);
        const owner = tile
            ? getTerrainRegionAtWorldPos(state.document.worldData.terrainRegions || [], world.x, world.z, DEFAULT_WORLD_SIZE)
            : null;
        const nextHover = tile ? { ...tile, ownerId: owner?.__editorId || null } : null;
        const currentHover = terrainRegionHover;
        const unchanged = (
            currentHover === null && nextHover === null
        ) || (
            currentHover !== null
            && nextHover !== null
            && currentHover.tileX === nextHover.tileX
            && currentHover.tileZ === nextHover.tileZ
            && currentHover.ownerId === nextHover.ownerId
        );
        if (unchanged) return false;
        terrainRegionHover = nextHover;
        return true;
    }

    function updateCanvasSize() {
        const parent = canvas.parentElement;
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        invalidateCanvasRect();
        setClampedCamera();
        scheduleRender();
    }

    function updateTerrainRegionMovePreview(world, state) {
        if (!activeTerrainRegionDrag) return null;
        const tileSize = getTerrainRegionTileSize(DEFAULT_WORLD_SIZE);
        const maxTileX = TERRAIN_REGION_GRID_SIZE - activeTerrainRegionDrag.tileWidth;
        const maxTileZ = TERRAIN_REGION_GRID_SIZE - activeTerrainRegionDrag.tileHeight;
        const nextTileX = clamp(
            activeTerrainRegionDrag.originTileX + Math.round((world.x - activeTerrainRegionDrag.startWorld.x) / tileSize),
            0,
            maxTileX
        );
        const nextTileZ = clamp(
            activeTerrainRegionDrag.originTileZ + Math.round((world.z - activeTerrainRegionDrag.startWorld.z) / tileSize),
            0,
            maxTileZ
        );
        const draftRegion = normalizeTerrainRegion({
            ...activeTerrainRegionDrag.region,
            tileX: nextTileX,
            tileZ: nextTileZ
        }, DEFAULT_WORLD_SIZE);
        const selectedRegion = getEntityById(state.document, activeTerrainRegionDrag.entityId);
        const valid = findTerrainRegionOverlap(draftRegion, state.document.worldData.terrainRegions || [], selectedRegion) === null;
        terrainRegionSelection = {
            mode: 'move',
            entityId: activeTerrainRegionDrag.entityId,
            tileX: nextTileX,
            tileZ: nextTileZ,
            bounds: draftRegion.bounds,
            valid,
            tiles: classifyTerrainRegionSelectionTiles(
                draftRegion,
                state.document.worldData.terrainRegions || [],
                selectedRegion
            )
        };
        return terrainRegionSelection;
    }

    function beginTerrainRegionMove(region, world, state) {
        if (!region?.__editorId) return false;
        setSelection(region.__editorId);
        activeTerrainRegionDrag = {
            entityId: region.__editorId,
            startWorld: { x: world.x, z: world.z },
            originTileX: region.tileX,
            originTileZ: region.tileZ,
            tileWidth: region.tileWidth,
            tileHeight: region.tileHeight,
            region: structuredClone(region)
        };
        dragMode = 'terrain-region-move';
        isDragging = true;
        updateTerrainRegionMovePreview(world, state);
        scheduleRender();
        return true;
    }

    function getWorldPoint(event) {
        const rect = getCanvasRect();
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
        renderEditorScene(ctx, canvas, tileManager, store.getState(), {
            hoverId: lastHoverId,
            hoverWorldPos,
            terrainRegionHover,
            terrainRegionSelection
        });
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
        setClampedCamera({
            x: (bounds.minX + bounds.maxX) / 2,
            z: (bounds.minZ + bounds.maxZ) / 2,
            zoom: nextZoom
        });
    }

    function resetView() {
        setClampedCamera({ x: 0, z: 0, zoom: 0.05 });
    }

    function bindEvents() {
        window.addEventListener('resize', updateCanvasSize);
        window.addEventListener('scroll', invalidateCanvasRect, true);

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
            getCanvasRect(true);
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
                        || (isTerrainBrushTool(state.tools.currentTool) && isTerrainEdit(selected));
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

            const hoveredRegion = getTerrainRegionAtWorldPos(state.document.worldData.terrainRegions || [], world.x, world.z, DEFAULT_WORLD_SIZE);
            if (
                hoveredRegion
                && isTerrainRegion(selected)
                && hoveredRegion.__editorId === selected.__editorId
                && (state.tools.currentTool === 'select' || state.tools.currentTool === 'terrain-region')
            ) {
                beginTerrainRegionMove(hoveredRegion, world, state);
                return;
            }

            if (state.tools.currentTool === 'terrain-region') {
                if (hoveredRegion) {
                    setSelection(hoveredRegion.__editorId);
                    return;
                }
                const startTile = worldToTerrainRegionTile(world.x, world.z, DEFAULT_WORLD_SIZE);
                if (!startTile) return;
                activeTerrainRegionSelection = { startTile, endTile: startTile };
                dragMode = 'terrain-region';
                isDragging = true;
                const draftRegion = createTerrainRegionFromTiles(startTile, startTile, {}, DEFAULT_WORLD_SIZE);
                terrainRegionSelection = {
                    startTile,
                    endTile: startTile,
                    bounds: draftRegion.bounds,
                    valid: findTerrainRegionOverlap(draftRegion, state.document.worldData.terrainRegions || []) === null,
                    tiles: classifyTerrainRegionSelectionTiles(draftRegion, state.document.worldData.terrainRegions || [])
                };
                scheduleRender();
                return;
            }

            if (isTerrainBrushTool(state.tools.currentTool)) {
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

            if (state.tools.currentTool === 'add-district') {
                const pointSnapped = snapWorldPoint(world, state.tools.snappingEnabled, true, state.document);
                store.runCommand({
                    type: 'create-district',
                    center: pointSnapped
                });
                store.dispatch({ type: 'set-tool', tool: 'edit-poly' });
                return;
            }

            if (state.tools.currentTool === 'add-airport') {
                const pointSnapped = snapWorldPoint(world, state.tools.snappingEnabled, true, state.document);
                const placement = state.tools.airportPlacement;
                store.runCommand({
                    type: 'create-airport',
                    center: pointSnapped,
                    yaw: placement.yaw
                });
                return;
            }

            if (state.tools.currentTool === 'add-object') {
                const pointSnapped = snapWorldPoint(world, state.tools.snappingEnabled, true, state.document);
                const placement = state.tools.objectPlacement;
                store.runCommand({
                    type: 'create-authored-object',
                    center: pointSnapped,
                    assetId: placement.assetId,
                    heightMode: placement.heightMode,
                    y: placement.y,
                    yaw: placement.yaw,
                    scale: placement.scale
                });
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
                    const nextEntity = getEntityById(state.document, nextId);
                    if (isTerrainRegion(nextEntity)) {
                        beginTerrainRegionMove(nextEntity, world, state);
                    } else {
                        dragMode = 'entity';
                        isDragging = true;
                    }
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
            const terrainRegionHoverChanged = syncTerrainRegionHover(point, world, state);
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
                setClampedCamera({
                    x: state.viewport.x - dx / state.viewport.zoom,
                    z: state.viewport.z - dy / state.viewport.zoom
                });
                return;
            }

            if (!isDragging) {
                if (hoverChanged || terrainRegionHoverChanged || point.inside && isTerrainBrushTool(state.tools.currentTool)) {
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

            if (dragMode === 'terrain-region' && activeTerrainRegionSelection) {
                const currentTile = worldToTerrainRegionTile(world.x, world.z, DEFAULT_WORLD_SIZE);
                if (!currentTile) return;
                activeTerrainRegionSelection = {
                    ...activeTerrainRegionSelection,
                    endTile: currentTile
                };
                const draftRegion = createTerrainRegionFromTiles(activeTerrainRegionSelection.startTile, currentTile, {}, DEFAULT_WORLD_SIZE);
                terrainRegionSelection = {
                    startTile: activeTerrainRegionSelection.startTile,
                    endTile: currentTile,
                    bounds: draftRegion.bounds,
                    valid: findTerrainRegionOverlap(draftRegion, store.getState().document.worldData.terrainRegions || []) === null,
                    tiles: classifyTerrainRegionSelectionTiles(draftRegion, store.getState().document.worldData.terrainRegions || [])
                };
                scheduleRender();
                return;
            }

            if (dragMode === 'terrain-region-move') {
                const preview = updateTerrainRegionMovePreview(world, store.getState());
                if (preview) {
                    scheduleRender();
                }
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
            if (shouldClearSelectionOnPointerRelease(store.getState(), pendingCanvasPan, isPanning)) {
                setSelection(null);
            }
            if (dragMode === 'terrain-region' && activeTerrainRegionSelection) {
                const draftRegion = createTerrainRegionFromTiles(
                    activeTerrainRegionSelection.startTile,
                    activeTerrainRegionSelection.endTile,
                    {},
                    DEFAULT_WORLD_SIZE
                );
                const overlap = findTerrainRegionOverlap(draftRegion, store.getState().document.worldData.terrainRegions || []);
                if (overlap) {
                    queueToast('Terrain region overlaps an existing region', 'error');
                } else {
                    const result = store.runCommand({
                        type: 'create-terrain-region',
                        tileX: draftRegion.tileX,
                        tileZ: draftRegion.tileZ,
                        tileWidth: draftRegion.tileWidth,
                        tileHeight: draftRegion.tileHeight,
                        terrainGenerator: structuredClone(store.getState().ui.terrainLab.draftConfig)
                    });
                    if (result.selectionId) {
                        setSelection(result.selectionId);
                    }
                }
                activeTerrainRegionSelection = null;
                terrainRegionSelection = null;
                terrainRegionHover = null;
            }
            if (dragMode === 'terrain-region-move' && activeTerrainRegionDrag) {
                const preview = terrainRegionSelection;
                if (preview?.valid === false) {
                    queueToast('Terrain region overlaps an existing region', 'error');
                } else if (
                    preview
                    && (
                        preview.tileX !== activeTerrainRegionDrag.originTileX
                        || preview.tileZ !== activeTerrainRegionDrag.originTileZ
                    )
                ) {
                    store.runCommand({
                        type: 'move-entity',
                        entityId: activeTerrainRegionDrag.entityId,
                        nextTileX: preview.tileX,
                        nextTileZ: preview.tileZ
                    }, { coalesceKey: `move:${activeTerrainRegionDrag.entityId}` });
                }
                activeTerrainRegionDrag = null;
                terrainRegionSelection = null;
            }
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
            if (lastHoverId !== null || lastHoverWorldPos !== null || terrainRegionHover !== null) {
                lastHoverId = null;
                lastHoverWorldPos = null;
                hoverWorldPos = null;
                terrainRegionHover = null;
                scheduleRender();
            }
        });

        canvas.addEventListener('wheel', event => {
            event.preventDefault();
            getCanvasRect(true);
            const { point } = getWorldPoint(event);
            const { screenToWorld } = createCoordinateHelpers(canvas, store.getState().viewport);
            const mouseWorldBefore = screenToWorld(point.x, point.y);
            const nextZoom = event.deltaY < 0
                ? store.getState().viewport.zoom * 1.1
                : store.getState().viewport.zoom / 1.1;
            setClampedCamera({ zoom: nextZoom });
            const mouseWorldAfter = createCoordinateHelpers(canvas, store.getState().viewport).screenToWorld(point.x, point.y);
            setClampedCamera({
                x: store.getState().viewport.x - (mouseWorldAfter.x - mouseWorldBefore.x),
                z: store.getState().viewport.z - (mouseWorldAfter.z - mouseWorldBefore.z)
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
        if (nextState.tools.currentTool !== 'terrain-region' && terrainRegionHover !== null) {
            terrainRegionHover = null;
        }
        const nextInvalidationState = reconcileTerrainTileInvalidation({
            tileManager,
            previousDocumentRef,
            previousTerrainEditBoundsById,
            previousTerrainLabVersion,
            nextState
        });
        previousDocumentRef = nextInvalidationState.previousDocumentRef;
        previousTerrainEditBoundsById = nextInvalidationState.previousTerrainEditBoundsById;
        previousTerrainLabVersion = nextInvalidationState.previousTerrainLabVersion;
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
            window.removeEventListener('scroll', invalidateCanvasRect, true);
            tileManager.destroy();
            terrainPreviewWorker.destroy();
            mapTileWorker.destroy();
        },
        frameSelection,
        frameTerrainHydrology() {
            const selected = getEntityById(store.getState().document, store.getState().selection.selectedId);
            const metadata = isTerrainRegion(selected)
                ? createTerrainSynthesizer({
                    Noise,
                    worldSize: DEFAULT_WORLD_SIZE,
                    config: store.getState().ui.terrainLab.draftConfig
                }).getMetadata()
                : getTerrainSynthesizer().getMetadata();
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
            setClampedCamera({
                x: (minX + maxX) * 0.5,
                z: (minZ + maxZ) * 0.5,
                zoom: Math.min(0.4, Math.max(0.01, Math.min(canvas.width / (width * 1.4), canvas.height / (height * 1.4))))
            });
            updateTerrainLabPreview(true);
        },
        reloadStaticWorld,
        resetView,
        scheduleRender
    };
}
