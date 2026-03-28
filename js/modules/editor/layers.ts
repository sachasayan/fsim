export type LayerState = {
    groupVisibility: Map<string, boolean>;
    groupLocked: Map<string, boolean>;
    collapsed: Map<string, boolean>;
    itemVisibility: Map<string, boolean>;
    itemLocked: Map<string, boolean>;
};

export type LayerItem<T> = { obj: T; label: string; id?: string };
export type LayerGroup<T> = { id: string; label: string; items: LayerItem<T>[] };

/** @returns {LayerState} */
export function createLayerState() {
    return {
        groupVisibility: new Map(),
        groupLocked: new Map(),
        collapsed: new Map(),
        itemVisibility: new Map(),
        itemLocked: new Map()
    };
}

/**
 * @template T
 * @param {(obj: T) => string} getLayerGroupId
 */
export function createLayerIdentity(getLayerGroupId) {
    const objectUidByRef = new WeakMap();
    let nextObjectUid = 1;

    /** @param {T} obj */
    function getObjectUid(obj) {
        if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return 'none';
        if (!objectUidByRef.has(obj)) objectUidByRef.set(obj, nextObjectUid++);
        return String(objectUidByRef.get(obj));
    }

    /** @param {T} obj */
    function getLayerKey(obj) {
        return `${getLayerGroupId(obj)}:${getObjectUid(obj)}`;
    }

    return { getObjectUid, getLayerKey };
}

/**
 * @param {LayerState} layerState
 * @param {string} groupId
 * @returns {boolean}
 */
export function isGroupVisible(layerState, groupId) {
    return layerState.groupVisibility.get(groupId) !== false;
}

/**
 * @param {LayerState} layerState
 * @param {string} groupId
 * @returns {boolean}
 */
export function isGroupLocked(layerState, groupId) {
    return layerState.groupLocked.get(groupId) === true;
}

/**
 * @template T
 * @param {LayerState} layerState
 * @param {T} obj
 * @param {(obj: T) => string} getLayerGroupId
 * @param {(obj: T) => string} getLayerKey
 * @returns {boolean}
 */
export function isObjectVisible(layerState, obj, getLayerGroupId, getLayerKey) {
    const groupId = getLayerGroupId(obj);
    if (!isGroupVisible(layerState, groupId)) return false;
    return layerState.itemVisibility.get(getLayerKey(obj)) !== false;
}

/**
 * @template T
 * @param {LayerState} layerState
 * @param {T} obj
 * @param {(obj: T) => string} getLayerGroupId
 * @param {(obj: T) => string} getLayerKey
 * @returns {boolean}
 */
export function isObjectLocked(layerState, obj, getLayerGroupId, getLayerKey) {
    const groupId = getLayerGroupId(obj);
    if (isGroupLocked(layerState, groupId)) return true;
    return layerState.itemLocked.get(getLayerKey(obj)) === true;
}

/**
 * @template T
 * @param {{ districts?: T[], roads?: T[], terrainEdits?: T[] } | null | undefined} worldData
 * @param {{ obj: T, id: string }[]} vantageEntries
 * @param {(obj: T, index: number, fallback: string) => string} objectLabel
 * @returns {LayerGroup<T>[]}
 */
export function getLayerGroupsData(worldData, vantageEntries, objectLabel) {
    const districts = (worldData?.districts || []).map((district, index) => ({ obj: district, label: objectLabel(district, index, 'District') }));
    const roads = (worldData?.roads || []).map((road, index) => ({ obj: road, label: objectLabel(road, index, 'Road') }));
    const terrain = (worldData?.terrainEdits || []).map((edit, index) => ({ obj: edit, label: objectLabel(edit, index, 'Terrain Edit') }));
    const vantage = vantageEntries.map((entry, index) => ({ obj: entry.obj, label: objectLabel(entry.obj, index, entry.id), id: entry.id }));

    return [
        { id: 'districts', label: 'Districts', items: districts },
        { id: 'roads', label: 'Roads', items: roads },
        { id: 'terrain', label: 'Terrain Edits', items: terrain },
        { id: 'vantage', label: 'Vantage Points', items: vantage }
    ];
}

/**
 * @template T
 * @param {string} layerKey
 * @param {LayerGroup<T>[]} groups
 * @param {(obj: T) => string} getObjectUid
 * @returns {T | null}
 */
export function getObjectByLayerKey(layerKey, groups, getObjectUid) {
    const [groupId, uid] = String(layerKey).split(':');
    for (let i = 0; i < groups.length; i++) {
        if (groups[i].id !== groupId) continue;
        const items = groups[i].items;
        for (let j = 0; j < items.length; j++) {
            if (getObjectUid(items[j].obj) === uid) return items[j].obj;
        }
    }
    return null;
}
