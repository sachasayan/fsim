// @ts-check

import { normalizeMapData, normalizeRoad } from '../../modules/world/MapDataUtils.js';
import { objectLabel } from '../../modules/editor/objectTypes.js';
import { getAirportWorldFootprintBounds } from '../../modules/world/AirportLayout';

/** @typedef {import('./types.js').EditorBounds} EditorBounds */
/** @typedef {import('./types.js').EditorDocument} EditorDocument */
/** @typedef {import('./types.js').EditorDocumentIndex} EditorDocumentIndex */
/** @typedef {import('./types.js').EditorDistrict} EditorDistrict */
/** @typedef {import('./types.js').EditorEntity} EditorEntity */
/** @typedef {import('./types.js').EditorEntityBase} EditorEntityBase */
/** @typedef {import('./types.js').EditorEntityId} EditorEntityId */
/** @typedef {import('./types.js').EditorGroupId} EditorGroupId */
/** @typedef {import('./types.js').EditorLayerGroup} EditorLayerGroup */
/** @typedef {import('./types.js').EditorRoad} EditorRoad */
/** @typedef {import('./types.js').EditorTerrainRegion} EditorTerrainRegion */
/** @typedef {import('./types.js').EditorAirport} EditorAirport */
/** @typedef {import('./types.js').EditorAuthoredObject} EditorAuthoredObject */
/** @typedef {import('./types.js').EditorTerrainEdit} EditorTerrainEdit */
/** @typedef {import('./types.js').EditorVantageEntity} EditorVantageEntity */
/** @typedef {import('./types.js').EditorVantageData} EditorVantageData */
/** @typedef {import('./types.js').EditorWorldData} EditorWorldData */

/** @type {EditorGroupId[]} */
const ENTITY_GROUPS = ['districts', 'roads', 'terrainRegions', 'airports', 'objects', 'terrain', 'vantage'];

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function clone(value) {
    return structuredClone(value);
}

/** @returns {EditorDocumentIndex} */
function createEmptyIndex() {
    return {
        entitiesById: new Map(),
        groupIds: {
            districts: [],
            roads: [],
            terrainRegions: [],
            airports: [],
            objects: [],
            terrain: [],
            vantage: []
        },
        stableKeyById: new Map(),
        idByStableKey: new Map()
    };
}

/**
 * @param {'district' | 'road' | 'terrain' | 'terrain-region' | 'airport' | 'authored-object' | 'vantage'} type
 * @param {EditorEntityBase} entity
 * @param {string} [aux]
 * @returns {string}
 */
function computeStableKey(type, entity, aux = '') {
    if (type === 'district') {
        const center = Array.isArray(entity.center) ? entity.center.join(',') : 'na';
        return `district:${entity.district_type || entity.type || 'district'}:${center}:${aux}`;
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
    if (type === 'terrain-region') {
        return `terrain-region:${entity.tileX},${entity.tileZ},${entity.tileWidth},${entity.tileHeight}:${aux}`;
    }
    if (type === 'airport') {
        return `airport:${entity.template || 'default'}:${entity.x},${entity.z}:${aux}`;
    }
    if (type === 'authored-object') {
        return `authored-object:${entity.assetId}:${entity.x},${entity.z}:${entity.heightMode || 'terrain'}:${aux}`;
    }
    return `vantage:${aux}`;
}

/**
 * @param {EditorDocument} document
 * @returns {EditorEntityId}
 */
function createEntityId(document) {
    /** @type {EditorEntityId} */
    const id = `ent_${document.nextEntityId++}`;
    return id;
}

/**
 * @param {EditorDocument} document
 * @param {EditorDocument | null | undefined} prevDocument
 * @param {EditorEntityBase[]} entities
 * @param {'district' | 'road' | 'terrain' | 'terrain-region' | 'airport' | 'authored-object'} type
 * @param {EditorGroupId} groupId
 * @param {(entity: EditorEntityBase, index: number) => string} auxBuilder
 */
function indexGroup(document, prevDocument, entities, type, groupId, auxBuilder) {
    for (let index = 0; index < entities.length; index++) {
        const entity = entities[index];
        const aux = auxBuilder(entity, index);
        const stableKey = computeStableKey(type, entity, aux);

        if (!entity.__editorId) {
            const reused = prevDocument?.index.idByStableKey.get(stableKey);
            entity.__editorId = reused || createEntityId(document);
        }

        document.index.entitiesById.set(entity.__editorId, /** @type {EditorEntity} */ (entity));
        document.index.groupIds[groupId].push(entity.__editorId);
        document.index.stableKeyById.set(entity.__editorId, stableKey);
        document.index.idByStableKey.set(stableKey, entity.__editorId);
    }
}

/**
 * @param {EditorWorldData} worldData
 * @param {EditorVantageData} vantageData
 * @param {EditorDocument | null} [prevDocument]
 * @returns {EditorDocument}
 */
export function createEditorDocument(worldData, vantageData, prevDocument = null) {
    /** @type {EditorDocument} */
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
    for (const airport of document.worldData.airports || []) {
        airport.bounds = getAirportWorldFootprintBounds(airport);
    }

    indexGroup(document, prevDocument, document.worldData.districts || [], 'district', 'districts', (_entity, index) => String(index));
    indexGroup(document, prevDocument, document.worldData.roads || [], 'road', 'roads', (_entity, index) => String(index));
    indexGroup(document, prevDocument, document.worldData.terrainRegions || [], 'terrain-region', 'terrainRegions', (_entity, index) => String(index));
    indexGroup(document, prevDocument, document.worldData.airports || [], 'airport', 'airports', (_entity, index) => String(index));
    indexGroup(document, prevDocument, document.worldData.authoredObjects || [], 'authored-object', 'objects', (_entity, index) => String(index));
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

/**
 * @param {EditorDocument} document
 * @returns {EditorDocument}
 */
export function cloneDocument(document) {
    return createEditorDocument(document.worldData, document.vantageData, document);
}

/**
 * @param {EditorDocument} document
 * @param {EditorEntityId | null | undefined} entityId
 * @returns {EditorEntity | null}
 */
export function getEntityById(document, entityId) {
    if (!entityId) return null;
    return document.index.entitiesById.get(entityId) || null;
}

/**
 * @param {EditorDocument} document
 * @param {EditorEntityId | null | undefined} entityId
 * @returns {EditorGroupId | null}
 */
export function findEntityGroup(document, entityId) {
    if (!entityId) return null;
    if (document.index.groupIds.districts.includes(entityId)) return 'districts';
    if (document.index.groupIds.roads.includes(entityId)) return 'roads';
    if (document.index.groupIds.terrainRegions.includes(entityId)) return 'terrainRegions';
    if (document.index.groupIds.airports.includes(entityId)) return 'airports';
    if (document.index.groupIds.objects.includes(entityId)) return 'objects';
    if (document.index.groupIds.terrain.includes(entityId)) return 'terrain';
    if (document.index.groupIds.vantage.includes(entityId)) return 'vantage';
    return null;
}

/**
 * @param {EditorDocument} document
 * @param {EditorGroupId} groupId
 * @returns {EditorEntityId[]}
 */
export function getGroupEntityIds(document, groupId) {
    return document.index.groupIds[groupId] || [];
}

/**
 * @param {EditorDocument} document
 * @param {EditorEntityId | null | undefined} entityId
 * @returns {string}
 */
export function getEntityLabel(document, entityId) {
    const entity = getEntityById(document, entityId);
    if (!entity) return 'Unknown';
    if (findEntityGroup(document, entityId) === 'vantage') {
        const stableKey = document.index.stableKeyById.get(entityId);
        return stableKey?.split(':')[1] || 'Vantage Point';
    }
    return objectLabel(entity, 0, 'Item');
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function stripEditorMetadata(value) {
    if (Array.isArray(value)) return /** @type {T} */ (value.map(stripEditorMetadata));
    if (!value || typeof value !== 'object') return value;
    /** @type {Record<string, unknown>} */
    const next = {};
    for (const [key, child] of Object.entries(value)) {
        if (key.startsWith('__editor')) continue;
        next[key] = stripEditorMetadata(child);
    }
    return /** @type {T} */ (next);
}

/**
 * @param {EditorDocument} document
 * @returns {{ mapPayload: EditorWorldData, vantagePayload: EditorVantageData }}
 */
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
    mapPayload.terrainRegions = (mapPayload.terrainRegions || []).map(({ bounds, center, ...region }) => ({
        ...region
    }));
    mapPayload.airports = (mapPayload.airports || []).map(({ bounds, ...airport }) => ({
        ...airport
    }));
    mapPayload.authoredObjects = (mapPayload.authoredObjects || []).map((object) => ({
        ...object
    }));

    return { mapPayload, vantagePayload };
}

/**
 * @param {EditorDocument} prevDocument
 * @param {EditorDocument} nextDocument
 * @param {EditorEntityId | null | undefined} selectedId
 * @returns {EditorEntityId | null}
 */
export function resolveSelectionAfterReload(prevDocument, nextDocument, selectedId) {
    if (!selectedId) return null;
    if (nextDocument.index.entitiesById.has(selectedId)) return selectedId;
    const stableKey = prevDocument.index.stableKeyById.get(selectedId);
    if (!stableKey) return null;
    return nextDocument.index.idByStableKey.get(stableKey) || null;
}

/**
 * @param {EditorDocument} document
 * @param {EditorEntityId | null | undefined} entityId
 * @returns {EditorBounds | null}
 */
export function getEntityBounds(document, entityId) {
    const entity = getEntityById(document, entityId);
    const group = findEntityGroup(document, entityId);
    if (!entity || !group) return null;

    if (group === 'districts') {
        const district = /** @type {EditorDistrict} */ (entity);
        const points = Array.isArray(district.points) && district.points.length > 0 ? district.points : [district.center];
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
        const road = /** @type {EditorRoad} */ (entity);
        const points = road.points || [road.center || [0, 0]];
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
        const pad = (road.width || 0) * 0.5 + (road.feather || 0);
        return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
    }
    if (group === 'terrainRegions') {
        const region = /** @type {EditorTerrainRegion} */ (entity);
        if (region.bounds) return region.bounds;
        return null;
    }
    if (group === 'airports') {
        const airport = /** @type {EditorAirport} */ (entity);
        return airport.bounds || {
            minX: airport.x - 2400,
            maxX: airport.x + 2400,
            minZ: airport.z - 2400,
            maxZ: airport.z + 2400
        };
    }
    if (group === 'objects') {
        const object = /** @type {EditorAuthoredObject} */ (entity);
        return {
            minX: object.x - 400,
            maxX: object.x + 400,
            minZ: object.z - 400,
            maxZ: object.z + 400
        };
    }
    if (group === 'terrain') {
        const terrainEdit = /** @type {EditorTerrainEdit} */ (entity);
        if (terrainEdit.bounds) return terrainEdit.bounds;
        return {
            minX: terrainEdit.x - (terrainEdit.radius || 0),
            maxX: terrainEdit.x + (terrainEdit.radius || 0),
            minZ: terrainEdit.z - (terrainEdit.radius || 0),
            maxZ: terrainEdit.z + (terrainEdit.radius || 0)
        };
    }
    const vantage = /** @type {EditorVantageEntity} */ (entity);
    return {
        minX: vantage.x - 400,
        maxX: vantage.x + 400,
        minZ: vantage.z - 400,
        maxZ: vantage.z + 400
    };
}

/**
 * @param {EditorDocument} document
 * @returns {EditorLayerGroup[]}
 */
export function listLayerGroups(document) {
    /** @type {EditorLayerGroup[]} */
    const entries = [];
    for (const groupId of ENTITY_GROUPS) {
        const ids = getGroupEntityIds(document, groupId);
        entries.push({
            id: groupId,
            label: groupId === 'terrain'
                ? 'Terrain Edits'
                : groupId === 'terrainRegions'
                    ? 'Terrain Regions'
                    : groupId === 'airports'
                        ? 'Airports'
                    : groupId === 'objects'
                        ? 'Objects'
                    : groupId[0].toUpperCase() + groupId.slice(1),
            items: ids.map(entityId => ({ id: entityId, label: getEntityLabel(document, entityId) }))
        });
    }
    return entries;
}
