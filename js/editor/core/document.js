import { normalizeMapData, normalizeRoad } from '../../modules/world/MapDataUtils.js';
import { objectLabel } from '../../modules/editor/objectTypes.js';

const ENTITY_GROUPS = ['cities', 'districts', 'roads', 'terrain', 'vantage'];

function clone(value) {
    return structuredClone(value);
}

function createEmptyIndex() {
    return {
        entitiesById: new Map(),
        groupIds: {
            cities: [],
            districts: [],
            roads: [],
            terrain: [],
            vantage: []
        },
        stableKeyById: new Map(),
        idByStableKey: new Map()
    };
}

function computeStableKey(type, entity, aux = '') {
    if (type === 'city') {
        return `city:${entity.id || aux}`;
    }
    if (type === 'district') {
        const center = Array.isArray(entity.center) ? entity.center.join(',') : 'na';
        return `district:${entity.city_id || 'none'}:${entity.district_type || entity.type || 'district'}:${center}:${aux}`;
    }
    if (type === 'road') {
        const points = Array.isArray(entity.points)
            ? entity.points.slice(0, 4).map(point => point.join(',')).join('|')
            : 'na';
        return `road:${entity.kind || 'road'}:${entity.surface || 'surface'}:${points}:${aux}`;
    }
    if (type === 'terrain') {
        const points = Array.isArray(entity.points)
            ? entity.points.slice(0, 4).map(point => point.join(',')).join('|')
            : `${entity.x},${entity.z}`;
        return `terrain:${entity.kind}:${points}:${aux}`;
    }
    return `vantage:${aux}`;
}

function createEntityId(document) {
    const id = `ent_${document.nextEntityId++}`;
    return id;
}

function indexGroup(document, prevDocument, entities, type, groupId, auxBuilder) {
    for (let index = 0; index < entities.length; index++) {
        const entity = entities[index];
        const aux = auxBuilder(entity, index);
        const stableKey = computeStableKey(type, entity, aux);

        if (!entity.__editorId) {
            const reused = prevDocument?.index.idByStableKey.get(stableKey);
            entity.__editorId = reused || createEntityId(document);
        }

        document.index.entitiesById.set(entity.__editorId, entity);
        document.index.groupIds[groupId].push(entity.__editorId);
        document.index.stableKeyById.set(entity.__editorId, stableKey);
        document.index.idByStableKey.set(stableKey, entity.__editorId);
    }
}

export function createEditorDocument(worldData, vantageData, prevDocument = null) {
    const document = {
        worldData: clone(worldData),
        vantageData: clone(vantageData),
        nextEntityId: Math.max(1, prevDocument?.nextEntityId || 1),
        index: createEmptyIndex()
    };

    normalizeMapData(document.worldData);
    for (const road of document.worldData.roads || []) {
        normalizeRoad(road);
    }

    indexGroup(document, prevDocument, document.worldData.cities || [], 'city', 'cities', (entity, index) => entity.id || String(index));
    indexGroup(document, prevDocument, document.worldData.districts || [], 'district', 'districts', (_entity, index) => String(index));
    indexGroup(document, prevDocument, document.worldData.roads || [], 'road', 'roads', (_entity, index) => String(index));
    indexGroup(document, prevDocument, document.worldData.terrainEdits || [], 'terrain', 'terrain', (_entity, index) => String(index));

    const vantageEntries = Object.entries(document.vantageData || {});
    for (let index = 0; index < vantageEntries.length; index++) {
        const [id, entity] = vantageEntries[index];
        const stableKey = computeStableKey('vantage', entity, id);
        if (!entity.__editorId) {
            const reused = prevDocument?.index.idByStableKey.get(stableKey);
            entity.__editorId = reused || createEntityId(document);
        }
        document.index.entitiesById.set(entity.__editorId, entity);
        document.index.groupIds.vantage.push(entity.__editorId);
        document.index.stableKeyById.set(entity.__editorId, stableKey);
        document.index.idByStableKey.set(stableKey, entity.__editorId);
    }

    return document;
}

export function cloneDocument(document) {
    return createEditorDocument(document.worldData, document.vantageData, document);
}

export function getEntityById(document, entityId) {
    return document.index.entitiesById.get(entityId) || null;
}

export function findEntityGroup(document, entityId) {
    if (document.index.groupIds.cities.includes(entityId)) return 'cities';
    if (document.index.groupIds.districts.includes(entityId)) return 'districts';
    if (document.index.groupIds.roads.includes(entityId)) return 'roads';
    if (document.index.groupIds.terrain.includes(entityId)) return 'terrain';
    if (document.index.groupIds.vantage.includes(entityId)) return 'vantage';
    return null;
}

export function getGroupEntityIds(document, groupId) {
    return document.index.groupIds[groupId] || [];
}

export function getEntityLabel(document, entityId) {
    const entity = getEntityById(document, entityId);
    if (!entity) return 'Unknown';
    if (findEntityGroup(document, entityId) === 'vantage') {
        const stableKey = document.index.stableKeyById.get(entityId);
        return stableKey?.split(':')[1] || 'Vantage Point';
    }
    return objectLabel(entity, 0, 'Item');
}

export function stripEditorMetadata(value) {
    if (Array.isArray(value)) return value.map(stripEditorMetadata);
    if (!value || typeof value !== 'object') return value;
    const next = {};
    for (const [key, child] of Object.entries(value)) {
        if (key.startsWith('__editor')) continue;
        next[key] = stripEditorMetadata(child);
    }
    return next;
}

export function serializeEditorDocument(document) {
    const mapPayload = stripEditorMetadata(document.worldData);
    const vantagePayload = stripEditorMetadata(document.vantageData);

    mapPayload.roads = (mapPayload.roads || []).map(({ center, ...road }) => ({
        ...road,
        points: Array.isArray(road.points) ? road.points.map(([x, z]) => [x, z]) : []
    }));
    mapPayload.terrainEdits = (mapPayload.terrainEdits || []).map(({ bounds, ...edit }) => ({
        ...edit,
        points: Array.isArray(edit.points) ? edit.points.map(([x, z]) => [x, z]) : undefined
    }));

    return { mapPayload, vantagePayload };
}

export function resolveSelectionAfterReload(prevDocument, nextDocument, selectedId) {
    if (!selectedId) return null;
    if (nextDocument.index.entitiesById.has(selectedId)) return selectedId;
    const stableKey = prevDocument.index.stableKeyById.get(selectedId);
    if (!stableKey) return null;
    return nextDocument.index.idByStableKey.get(stableKey) || null;
}

export function getEntityBounds(document, entityId) {
    const entity = getEntityById(document, entityId);
    const group = findEntityGroup(document, entityId);
    if (!entity || !group) return null;

    if (group === 'cities') {
        return {
            minX: entity.center[0] - 500,
            maxX: entity.center[0] + 500,
            minZ: entity.center[1] - 500,
            maxZ: entity.center[1] + 500
        };
    }
    if (group === 'districts') {
        const points = Array.isArray(entity.points) && entity.points.length > 0 ? entity.points : [entity.center];
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
        return { minX, maxX, minZ, maxZ };
    }
    if (group === 'roads') {
        const points = entity.points || [entity.center || [0, 0]];
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
        const pad = (entity.width || 0) * 0.5 + (entity.feather || 0);
        return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
    }
    if (group === 'terrain') {
        if (entity.bounds) return entity.bounds;
        return {
            minX: entity.x - entity.radius,
            maxX: entity.x + entity.radius,
            minZ: entity.z - entity.radius,
            maxZ: entity.z + entity.radius
        };
    }
    return {
        minX: entity.x - 400,
        maxX: entity.x + 400,
        minZ: entity.z - 400,
        maxZ: entity.z + 400
    };
}

export function listLayerGroups(document) {
    const entries = [];
    for (const groupId of ENTITY_GROUPS) {
        const ids = getGroupEntityIds(document, groupId);
        entries.push({
            id: groupId,
            label: groupId === 'terrain' ? 'Terrain Edits' : groupId[0].toUpperCase() + groupId.slice(1),
            items: ids.map(entityId => ({ id: entityId, label: getEntityLabel(document, entityId) }))
        });
    }
    return entries;
}
