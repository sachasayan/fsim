// @ts-check

import { normalizeRoad } from '../../modules/world/MapDataUtils.js';
import { isAirport, isAuthoredObject, isDistrict, isRoad, isTerrainEdit, isTerrainRegion } from '../../modules/editor/objectTypes.js';
import { getAirportWorldFootprintBounds } from '../../modules/world/AirportLayout';
import { normalizeAuthoredObjectHeightMode } from '../../modules/world/AuthoredObjectCatalog';
import { findTerrainRegionOverlap, getTerrainRegionTileSize, normalizeTerrainRegion } from '../../modules/world/terrain/TerrainRegions.js';
import {
    createTerrainStroke,
    refreshTerrainEditGeometry
} from '../../modules/editor/terrainEdits.js';
import {
    cloneDocument,
    createEditorDocument,
    findEntityGroup,
    getEntityById,
    resolveSelectionAfterReload
} from './document.js';

/** @typedef {import('./types.js').EditorActiveVertex} EditorActiveVertex */
/** @typedef {import('./types.js').EditorAirport} EditorAirport */
/** @typedef {import('./types.js').EditorAuthoredObject} EditorAuthoredObject */
/** @typedef {import('./types.js').EditorCommand} EditorCommand */
/** @typedef {import('./types.js').EditorCommandResult} EditorCommandResult */
/** @typedef {import('./types.js').EditorDocument} EditorDocument */
/** @typedef {import('./types.js').EditorDistrict} EditorDistrict */
/** @typedef {import('./types.js').EditorEntity} EditorEntity */
/** @typedef {import('./types.js').EditorEntityId} EditorEntityId */
/** @typedef {import('./types.js').EditorRoad} EditorRoad */
/** @typedef {import('./types.js').EditorTerrainEdit} EditorTerrainEdit */
/** @typedef {import('./types.js').EditorTerrainRegion} EditorTerrainRegion */
/** @typedef {import('./types.js').EditorWorldPoint} EditorWorldPoint */

/**
 * @param {number} value
 * @param {number} [gridSize]
 * @returns {number}
 */
function snapValue(value, gridSize = 100) {
    return Math.round(value / gridSize) * gridSize;
}

/**
 * @param {EditorWorldPoint} worldPos
 * @param {boolean} enabled
 * @param {boolean} [allowSnap]
 * @param {EditorDocument | null} [document]
 * @param {EditorEntityId | null} [ignoreEntityId]
 * @returns {EditorWorldPoint}
 */
export function snapWorldPoint(worldPos, enabled, allowSnap = true, document = null, ignoreEntityId = null) {
    if (!enabled || !allowSnap) return { x: Math.round(worldPos.x), z: Math.round(worldPos.z) };
    
    // Road snapping strategy: snap to existing road endpoints or vertices if disabled, but grid snap takes precedence if enabled?
    // Wait, typically we always want to snap to roads if close enough, even if grid snap is off, or only if grid snap is on?
    // Let's snap to roads regardless if we are dragging a road vertex, but `allowSnap` handles that.
    if (document && document.worldData && document.worldData.roads) {
        let bestDist = Infinity;
        let bestPoint = null;
        const snapRadius = 40; // 40 meters
        
        for (const road of document.worldData.roads) {
            if (road.__editorId === ignoreEntityId) continue;
            if (!road.points) continue;
            
            for (const pt of road.points) {
                const dist = Math.hypot(pt[0] - worldPos.x, pt[1] - worldPos.z);
                if (dist < snapRadius && dist < bestDist) {
                    bestDist = dist;
                    bestPoint = { x: pt[0], z: pt[1] };
                }
            }
        }
        if (bestPoint) return bestPoint;
    }

    return { x: snapValue(worldPos.x), z: snapValue(worldPos.z) };
}

/**
 * @param {EditorDistrict} district
 * @param {number} dx
 * @param {number} dz
 */
function translateDistrict(district, dx, dz) {
    district.center[0] += dx;
    district.center[1] += dz;
    if (district.points?.length) {
        for (const point of district.points) {
            point[0] += dx;
            point[1] += dz;
        }
    }
}

/**
 * @param {EditorRoad} road
 * @param {number} dx
 * @param {number} dz
 */
function translateRoad(road, dx, dz) {
    if (Array.isArray(road.points)) {
        for (const point of road.points) {
            point[0] += dx;
            point[1] += dz;
        }
    }
    if (Array.isArray(road.center)) {
        road.center[0] += dx;
        road.center[1] += dz;
    }
    normalizeRoad(road);
}

/**
 * @param {EditorTerrainRegion} region
 * @param {number} nextTileX
 * @param {number} nextTileZ
 * @param {EditorTerrainRegion[]} regions
 * @returns {boolean}
 */
function moveTerrainRegion(region, nextTileX, nextTileZ, regions) {
    const movedRegion = normalizeTerrainRegion({
        ...region,
        tileX: nextTileX,
        tileZ: nextTileZ
    });
    const overlap = findTerrainRegionOverlap(movedRegion, regions, region);
    if (overlap) return false;

    region.tileX = movedRegion.tileX;
    region.tileZ = movedRegion.tileZ;
    region.tileWidth = movedRegion.tileWidth;
    region.tileHeight = movedRegion.tileHeight;
    region.bounds = movedRegion.bounds;
    region.center = movedRegion.center;
    return true;
}

/**
 * @param {EditorEntity} entity
 * @returns {EditorEntity}
 */
function duplicateEntity(entity) {
    const next = /** @type {EditorEntity} */ (structuredClone(entity));
    delete next.__editorId;
    return next;
}

/**
 * @param {EditorDocument} document
 * @param {EditorEntityId | null | undefined} entityId
 * @returns {boolean}
 */
function removeEntityById(document, entityId) {
    const group = findEntityGroup(document, entityId);
    const entity = getEntityById(document, entityId);
    if (!group || !entity) return false;
    if (group === 'districts') {
        document.worldData.districts = document.worldData.districts.filter(item => item.__editorId !== entityId);
        return true;
    }
    if (group === 'roads') {
        document.worldData.roads = document.worldData.roads.filter(item => item.__editorId !== entityId);
        return true;
    }
    if (group === 'terrainRegions') {
        document.worldData.terrainRegions = document.worldData.terrainRegions.filter(item => item.__editorId !== entityId);
        return true;
    }
    if (group === 'airports') {
        document.worldData.airports = document.worldData.airports.filter(item => item.__editorId !== entityId);
        return true;
    }
    if (group === 'objects') {
        document.worldData.authoredObjects = document.worldData.authoredObjects.filter(item => item.__editorId !== entityId);
        return true;
    }
    if (group === 'terrain') {
        document.worldData.terrainEdits = document.worldData.terrainEdits.filter(item => item.__editorId !== entityId);
        return true;
    }
    const entry = Object.entries(document.vantageData).find(([, value]) => value.__editorId === entityId);
    if (entry) {
        delete document.vantageData[entry[0]];
        return true;
    }
    return false;
}

/**
 * @param {EditorDocument} document
 * @param {EditorCommand} command
 * @param {{ terrainStrokeDeps?: Record<string, unknown> }} [context]
 * @returns {EditorCommandResult}
 */
export function applyEditorCommand(document, command, context = {}) {
    const nextDocument = cloneDocument(document);
    const { terrainStrokeDeps } = context;
    let selectionId = command.selectionId ?? null;

    switch (command.type) {
        case 'create-district': {
            /** @type {EditorDistrict} */
            const district = {
                district_type: command.districtType || 'commercial',
                center: /** @type {[number, number]} */ ([command.center.x, command.center.z]),
                radius: 500,
                points: /** @type {import('./types.js').EditorPoint2[]} */ ([
                    [command.center.x - 500, command.center.z - 500],
                    [command.center.x + 500, command.center.z - 500],
                    [command.center.x + 500, command.center.z + 500],
                    [command.center.x - 500, command.center.z + 500]
                ])
            };
            nextDocument.worldData.districts.push(district);
            const finalized = createEditorDocument(nextDocument.worldData, nextDocument.vantageData, document);
            const created = finalized.worldData.districts[finalized.worldData.districts.length - 1];
            return { document: finalized, selectionId: created?.__editorId || null };
        }
        case 'create-road': {
            const road = normalizeRoad({
                kind: command.kind || 'road',
                surface: command.surface || 'asphalt',
                width: command.kind === 'taxiway' ? 30 : 24,
                feather: command.kind === 'taxiway' ? 10 : 8,
                points: [
                    [command.center.x - 240, command.center.z],
                    [command.center.x + 240, command.center.z]
                ]
            });
            nextDocument.worldData.roads.push(road);
            const finalized = createEditorDocument(nextDocument.worldData, nextDocument.vantageData, document);
            const created = finalized.worldData.roads[finalized.worldData.roads.length - 1];
            return { document: finalized, selectionId: created?.__editorId || null };
        }
        case 'create-terrain-region': {
            const region = normalizeTerrainRegion({
                tileX: command.tileX,
                tileZ: command.tileZ,
                tileWidth: command.tileWidth,
                tileHeight: command.tileHeight,
                terrainGenerator: command.terrainGenerator
            });
            const overlap = findTerrainRegionOverlap(region, nextDocument.worldData.terrainRegions || []);
            if (overlap) {
                throw new Error('Selected tiles already belong to another terrain region');
            }
            nextDocument.worldData.terrainRegions.push(region);
            const finalized = createEditorDocument(nextDocument.worldData, nextDocument.vantageData, document);
            const created = finalized.worldData.terrainRegions[finalized.worldData.terrainRegions.length - 1];
            return { document: finalized, selectionId: created?.__editorId || null };
        }
        case 'create-authored-object': {
            const authoredObject = {
                assetId: command.assetId,
                x: command.center.x,
                z: command.center.z,
                y: Number.isFinite(command.y) ? command.y : 0,
                yaw: Number.isFinite(command.yaw) ? command.yaw : 0,
                scale: Number.isFinite(command.scale) ? command.scale : 1,
                heightMode: normalizeAuthoredObjectHeightMode(command.heightMode)
            };
            nextDocument.worldData.authoredObjects.push(authoredObject);
            const finalized = createEditorDocument(nextDocument.worldData, nextDocument.vantageData, document);
            const created = finalized.worldData.authoredObjects[finalized.worldData.authoredObjects.length - 1];
            return { document: finalized, selectionId: created?.__editorId || null };
        }
        case 'create-airport': {
            const airport = {
                template: 'default',
                x: command.center.x,
                z: command.center.z,
                yaw: Number.isFinite(command.yaw) ? command.yaw : 0
            };
            airport.bounds = getAirportWorldFootprintBounds(airport);
            nextDocument.worldData.airports.push(airport);
            const finalized = createEditorDocument(nextDocument.worldData, nextDocument.vantageData, document);
            const created = finalized.worldData.airports[finalized.worldData.airports.length - 1];
            return { document: finalized, selectionId: created?.__editorId || null };
        }
        case 'create-terrain-stroke': {
            if (!terrainStrokeDeps) {
                throw new Error('Missing terrain stroke dependencies');
            }
            createTerrainStroke(command.worldPos, {
                ...terrainStrokeDeps,
                currentTool: command.tool,
                worldData: nextDocument.worldData
            });
            const finalized = createEditorDocument(nextDocument.worldData, nextDocument.vantageData, document);
            const created = finalized.worldData.terrainEdits[finalized.worldData.terrainEdits.length - 1];
            return { document: finalized, selectionId: created?.__editorId || null };
        }
        case 'append-terrain-point': {
            const edit = getEntityById(nextDocument, command.entityId);
            if (!edit || !Array.isArray(edit.points)) return { document };
            const terrainEdit = /** @type {EditorTerrainEdit} */ (edit);
            const lastPoint = terrainEdit.points?.[terrainEdit.points.length - 1];
            if (lastPoint && Math.hypot(lastPoint[0] - command.worldPos.x, lastPoint[1] - command.worldPos.z) < Math.max(10, (terrainEdit.radius || 0) * 0.12)) {
                return { document };
            }
            terrainEdit.points?.push([Math.round(command.worldPos.x), Math.round(command.worldPos.z)]);
            refreshTerrainEditGeometry(terrainEdit);
            return { document: createEditorDocument(nextDocument.worldData, nextDocument.vantageData, document), selectionId: command.entityId };
        }
        case 'delete-entity': {
            removeEntityById(nextDocument, command.entityId);
            return { document: createEditorDocument(nextDocument.worldData, nextDocument.vantageData, document), selectionId: null };
        }
        case 'duplicate-entity': {
            const entity = getEntityById(nextDocument, command.entityId);
            const group = findEntityGroup(nextDocument, command.entityId);
            if (!entity || group === 'vantage') return { document };
            const copy = duplicateEntity(entity);
            if ('center' in copy && Array.isArray(copy.center)) {
                copy.center = /** @type {[number, number]} */ ([copy.center[0] + 200, copy.center[1] + 200]);
            }
            if (Array.isArray(copy.points)) {
                copy.points = copy.points.map(([x, z]) => [x + 200, z + 200]);
            }
            if (isTerrainEdit(copy)) {
                copy.x += 200;
                copy.z += 200;
                refreshTerrainEditGeometry(copy);
            }
            if (isAuthoredObject(copy)) {
                copy.x += 200;
                copy.z += 200;
            }
            if (isAirport(copy)) {
                copy.x += 400;
                copy.z += 400;
                copy.bounds = getAirportWorldFootprintBounds(copy);
            }
            if (isDistrict(copy)) {
                nextDocument.worldData.districts.push(copy);
            } else if (isRoad(copy)) {
                normalizeRoad(copy);
                nextDocument.worldData.roads.push(copy);
            } else if (isAirport(copy)) {
                nextDocument.worldData.airports.push(copy);
            } else if (isAuthoredObject(copy)) {
                nextDocument.worldData.authoredObjects.push(copy);
            } else if (isTerrainEdit(copy)) {
                nextDocument.worldData.terrainEdits.push(copy);
            }
            const finalized = createEditorDocument(nextDocument.worldData, nextDocument.vantageData, document);
            const groupId = isDistrict(copy)
                ? 'districts'
                : isRoad(copy)
                    ? 'roads'
                    : isAirport(copy)
                        ? 'airports'
                        : isAuthoredObject(copy)
                            ? 'objects'
                            : 'terrain';
            const createdId = finalized.index.groupIds[groupId][finalized.index.groupIds[groupId].length - 1] || null;
            return { document: finalized, selectionId: createdId };
        }
        case 'move-entity': {
            const entity = getEntityById(nextDocument, command.entityId);
            if (!entity) return { document };
            if (isTerrainRegion(entity)) {
                const moved = moveTerrainRegion(
                    entity,
                    command.nextTileX ?? entity.tileX,
                    command.nextTileZ ?? entity.tileZ,
                    nextDocument.worldData.terrainRegions || []
                );
                if (!moved) return { document };
                return { document: createEditorDocument(nextDocument.worldData, nextDocument.vantageData, document), selectionId: command.entityId };
            }
            if (entity.center) {
                const dx = command.nextCenter[0] - entity.center[0];
                const dz = command.nextCenter[1] - entity.center[1];
                if (isDistrict(entity)) translateDistrict(entity, dx, dz);
                else if (isRoad(entity)) translateRoad(entity, dx, dz);
                else {
                    entity.center[0] = command.nextCenter[0];
                    entity.center[1] = command.nextCenter[1];
                }
            } else {
                entity.x = command.nextPoint.x;
                entity.z = command.nextPoint.z;
                if (isAirport(entity)) {
                    entity.bounds = getAirportWorldFootprintBounds(entity);
                }
                if (isTerrainEdit(entity)) refreshTerrainEditGeometry(entity);
            }
            return { document: createEditorDocument(nextDocument.worldData, nextDocument.vantageData, document), selectionId: command.entityId };
        }
        case 'move-vertex': {
            const entity = getEntityById(nextDocument, command.entityId);
            if (!entity?.points?.[command.vertexIndex]) return { document };
            entity.points[command.vertexIndex][0] = command.point.x;
            entity.points[command.vertexIndex][1] = command.point.z;
            if (isRoad(entity)) normalizeRoad(entity);
            if (isTerrainEdit(entity)) refreshTerrainEditGeometry(entity);
            return { document: createEditorDocument(nextDocument.worldData, nextDocument.vantageData, document), selectionId: command.entityId };
        }
        case 'insert-vertex': {
            const entity = getEntityById(nextDocument, command.entityId);
            if (!entity?.points) return { document };
            /** @type {import('./types.js').EditorPoint2[]} */ (entity.points).splice(command.insertIndex, 0, [command.point.x, command.point.z]);
            if (isRoad(entity)) normalizeRoad(entity);
            if (isTerrainEdit(entity)) refreshTerrainEditGeometry(entity);
            return { document: createEditorDocument(nextDocument.worldData, nextDocument.vantageData, document), selectionId: command.entityId };
        }
        case 'remove-vertex': {
            const entity = getEntityById(nextDocument, command.entityId);
            if (!entity?.points || !Array.isArray(entity.points) || entity.points.length <= command.minPoints) return { document };
            /** @type {import('./types.js').EditorPoint2[]} */ (entity.points).splice(command.vertexIndex, 1);
            if (isRoad(entity)) normalizeRoad(entity);
            if (isTerrainEdit(entity)) refreshTerrainEditGeometry(entity);
            return { document: createEditorDocument(nextDocument.worldData, nextDocument.vantageData, document), selectionId: command.entityId };
        }
        case 'change-property': {
            const entity = getEntityById(nextDocument, command.entityId);
            if (!entity) return { document };
            if (isTerrainRegion(entity) && command.key === 'terrainGenerator') {
                entity.terrainGenerator = /** @type {import('./types.js').EditorTerrainGenerator} */ (command.value);
                return { document: createEditorDocument(nextDocument.worldData, nextDocument.vantageData, document), selectionId: command.entityId };
            }
            entity[command.key] = command.value;
            if (isAirport(entity) && (command.key === 'yaw' || command.key === 'x' || command.key === 'z')) {
                entity.bounds = getAirportWorldFootprintBounds(entity);
            }
            if (isRoad(entity) && (command.key === 'kind' || command.key === 'surface' || command.key === 'width' || command.key === 'feather')) {
                normalizeRoad(entity);
            }
            if (isTerrainEdit(entity) && ['radius', 'delta', 'target_height', 'opacity'].includes(command.key)) {
                refreshTerrainEditGeometry(entity);
            }
            return { document: createEditorDocument(nextDocument.worldData, nextDocument.vantageData, document), selectionId: command.entityId };
        }
        case 'replace-document': {
            const reloaded = createEditorDocument(command.worldData, command.vantageData, document);
            return {
                document: reloaded,
                selectionId: resolveSelectionAfterReload(document, reloaded, command.selectedId)
            };
        }
        default:
            return { document, selectionId };
    }
}

/**
 * @param {EditorDocument} document
 * @param {EditorEntityId} entityId
 * @param {EditorWorldPoint} delta
 * @param {EditorActiveVertex | null} [activeVertex]
 * @returns {EditorCommand | null}
 */
export function nudgeEntityCommand(document, entityId, delta, activeVertex = null) {
    const entity = getEntityById(document, entityId);
    if (!entity) return null;
    if (isTerrainRegion(entity)) {
        const tileSize = getTerrainRegionTileSize();
        return {
            type: 'move-entity',
            entityId,
            nextTileX: entity.tileX + Math.round(delta.x / tileSize),
            nextTileZ: entity.tileZ + Math.round(delta.z / tileSize)
        };
    }
    if (activeVertex && entity.points?.[activeVertex.index]) {
        return {
            type: 'move-vertex',
            entityId,
            vertexIndex: activeVertex.index,
            point: {
                x: entity.points[activeVertex.index][0] + delta.x,
                z: entity.points[activeVertex.index][1] + delta.z
            }
        };
    }
    if (entity.center) {
        return {
            type: 'move-entity',
            entityId,
            nextCenter: [entity.center[0] + delta.x, entity.center[1] + delta.z]
        };
    }
    const pointEntity = /** @type {EditorAirport | EditorAuthoredObject | EditorTerrainEdit} */ (entity);
    return {
        type: 'move-entity',
        entityId,
        nextPoint: { x: pointEntity.x + delta.x, z: pointEntity.z + delta.z }
    };
}
