import { normalizeRoad } from '../../modules/world/MapDataUtils.js';
import { isCity, isDistrict, isRoad, isTerrainEdit } from '../../modules/editor/objectTypes.js';
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

function snapValue(value, gridSize = 100) {
    return Math.round(value / gridSize) * gridSize;
}

export function snapWorldPoint(worldPos, enabled, allowSnap = true) {
    if (!enabled || !allowSnap) return { x: Math.round(worldPos.x), z: Math.round(worldPos.z) };
    return { x: snapValue(worldPos.x), z: snapValue(worldPos.z) };
}

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

function getDistrictsForCity(worldData, cityId) {
    return (worldData.districts || []).filter(district => district.city_id === cityId);
}

function translateCity(worldData, city, dx, dz) {
    city.center[0] += dx;
    city.center[1] += dz;
    for (const district of getDistrictsForCity(worldData, city.id)) {
        translateDistrict(district, dx, dz);
    }
}

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

function duplicateEntity(entity) {
    const next = structuredClone(entity);
    delete next.__editorId;
    return next;
}

function removeEntityById(document, entityId) {
    const group = findEntityGroup(document, entityId);
    const entity = getEntityById(document, entityId);
    if (!group || !entity) return false;
    if (group === 'cities') {
        document.worldData.cities = document.worldData.cities.filter(item => item.__editorId !== entityId);
        document.worldData.districts = document.worldData.districts.filter(item => item.city_id !== entity.id);
        return true;
    }
    if (group === 'districts') {
        document.worldData.districts = document.worldData.districts.filter(item => item.__editorId !== entityId);
        return true;
    }
    if (group === 'roads') {
        document.worldData.roads = document.worldData.roads.filter(item => item.__editorId !== entityId);
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

export function applyEditorCommand(document, command, context = {}) {
    const nextDocument = cloneDocument(document);
    const { terrainStrokeDeps } = context;
    let selectionId = command.selectionId ?? null;

    switch (command.type) {
        case 'create-city': {
            const center = [command.center.x, command.center.z];
            const city = { id: command.cityId, center };
            const district = {
                district_type: 'commercial',
                center: [...center],
                radius: 500,
                points: [
                    [center[0] - 500, center[1] - 500],
                    [center[0] + 500, center[1] - 500],
                    [center[0] + 500, center[1] + 500],
                    [center[0] - 500, center[1] + 500]
                ],
                city_id: city.id
            };
            nextDocument.worldData.cities.push(city);
            nextDocument.worldData.districts.push(district);
            const finalized = createEditorDocument(nextDocument.worldData, nextDocument.vantageData, document);
            const created = finalized.worldData.cities[finalized.worldData.cities.length - 1];
            return { document: finalized, selectionId: created?.__editorId || null };
        }
        case 'create-district': {
            const district = {
                district_type: command.districtType || 'commercial',
                center: [command.center.x, command.center.z],
                radius: 500,
                points: [
                    [command.center.x - 500, command.center.z - 500],
                    [command.center.x + 500, command.center.z - 500],
                    [command.center.x + 500, command.center.z + 500],
                    [command.center.x - 500, command.center.z + 500]
                ]
            };
            if (command.cityId) district.city_id = command.cityId;
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
            const lastPoint = edit.points[edit.points.length - 1];
            if (lastPoint && Math.hypot(lastPoint[0] - command.worldPos.x, lastPoint[1] - command.worldPos.z) < Math.max(10, edit.radius * 0.12)) {
                return { document };
            }
            edit.points.push([Math.round(command.worldPos.x), Math.round(command.worldPos.z)]);
            refreshTerrainEditGeometry(edit);
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
            if (copy.center) {
                copy.center = [copy.center[0] + 200, copy.center[1] + 200];
            }
            if (Array.isArray(copy.points)) {
                copy.points = copy.points.map(([x, z]) => [x + 200, z + 200]);
            }
            if (isTerrainEdit(copy)) {
                copy.x += 200;
                copy.z += 200;
                refreshTerrainEditGeometry(copy);
            }
            if (isCity(copy)) {
                copy.id = `${copy.id || 'city'}_copy`;
                nextDocument.worldData.cities.push(copy);
            } else if (isDistrict(copy)) {
                nextDocument.worldData.districts.push(copy);
            } else if (isRoad(copy)) {
                normalizeRoad(copy);
                nextDocument.worldData.roads.push(copy);
            } else if (isTerrainEdit(copy)) {
                nextDocument.worldData.terrainEdits.push(copy);
            }
            const finalized = createEditorDocument(nextDocument.worldData, nextDocument.vantageData, document);
            const groupId = isCity(copy) ? 'cities' : isDistrict(copy) ? 'districts' : isRoad(copy) ? 'roads' : 'terrain';
            const createdId = finalized.index.groupIds[groupId][finalized.index.groupIds[groupId].length - 1] || null;
            return { document: finalized, selectionId: createdId };
        }
        case 'move-entity': {
            const entity = getEntityById(nextDocument, command.entityId);
            if (!entity) return { document };
            if (entity.center) {
                const dx = command.nextCenter[0] - entity.center[0];
                const dz = command.nextCenter[1] - entity.center[1];
                if (isDistrict(entity)) translateDistrict(entity, dx, dz);
                else if (isRoad(entity)) translateRoad(entity, dx, dz);
                else if (isCity(entity)) translateCity(nextDocument.worldData, entity, dx, dz);
                else {
                    entity.center[0] = command.nextCenter[0];
                    entity.center[1] = command.nextCenter[1];
                }
            } else {
                entity.x = command.nextPoint.x;
                entity.z = command.nextPoint.z;
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
            entity.points.splice(command.insertIndex, 0, [command.point.x, command.point.z]);
            if (isRoad(entity)) normalizeRoad(entity);
            if (isTerrainEdit(entity)) refreshTerrainEditGeometry(entity);
            return { document: createEditorDocument(nextDocument.worldData, nextDocument.vantageData, document), selectionId: command.entityId };
        }
        case 'remove-vertex': {
            const entity = getEntityById(nextDocument, command.entityId);
            if (!entity?.points || entity.points.length <= command.minPoints) return { document };
            entity.points.splice(command.vertexIndex, 1);
            if (isRoad(entity)) normalizeRoad(entity);
            if (isTerrainEdit(entity)) refreshTerrainEditGeometry(entity);
            return { document: createEditorDocument(nextDocument.worldData, nextDocument.vantageData, document), selectionId: command.entityId };
        }
        case 'change-property': {
            const entity = getEntityById(nextDocument, command.entityId);
            if (!entity) return { document };
            entity[command.key] = command.value;
            if (command.key === 'kind' || command.key === 'surface' || command.key === 'width' || command.key === 'feather') {
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

export function nudgeEntityCommand(document, entityId, delta, activeVertex = null) {
    const entity = getEntityById(document, entityId);
    if (!entity) return null;
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
    return {
        type: 'move-entity',
        entityId,
        nextPoint: { x: entity.x + delta.x, z: entity.z + delta.z }
    };
}
