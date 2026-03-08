export function createLayerState() {
    return {
        groupVisibility: new Map(),
        groupLocked: new Map(),
        collapsed: new Map(),
        itemVisibility: new Map(),
        itemLocked: new Map()
    };
}

export function createLayerIdentity(getLayerGroupId) {
    const objectUidByRef = new WeakMap();
    let nextObjectUid = 1;

    function getObjectUid(obj) {
        if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return 'none';
        if (!objectUidByRef.has(obj)) objectUidByRef.set(obj, nextObjectUid++);
        return String(objectUidByRef.get(obj));
    }

    function getLayerKey(obj) {
        return `${getLayerGroupId(obj)}:${getObjectUid(obj)}`;
    }

    return { getObjectUid, getLayerKey };
}

export function isGroupVisible(layerState, groupId) {
    return layerState.groupVisibility.get(groupId) !== false;
}

export function isGroupLocked(layerState, groupId) {
    return layerState.groupLocked.get(groupId) === true;
}

export function isObjectVisible(layerState, obj, getLayerGroupId, getLayerKey) {
    const groupId = getLayerGroupId(obj);
    if (!isGroupVisible(layerState, groupId)) return false;
    return layerState.itemVisibility.get(getLayerKey(obj)) !== false;
}

export function isObjectLocked(layerState, obj, getLayerGroupId, getLayerKey) {
    const groupId = getLayerGroupId(obj);
    if (isGroupLocked(layerState, groupId)) return true;
    return layerState.itemLocked.get(getLayerKey(obj)) === true;
}

export function getLayerGroupsData(worldData, vantageEntries, objectLabel) {
    const cities = (worldData?.cities || []).map((city, index) => ({ obj: city, label: objectLabel(city, index, 'City') }));
    const districts = (worldData?.districts || []).map((district, index) => ({ obj: district, label: objectLabel(district, index, 'District') }));
    const terrain = (worldData?.terrainEdits || []).map((edit, index) => ({ obj: edit, label: objectLabel(edit, index, 'Terrain Edit') }));
    const vantage = vantageEntries.map((entry, index) => ({ obj: entry.obj, label: objectLabel(entry.obj, index, entry.id), id: entry.id }));

    return [
        { id: 'cities', label: 'Cities', items: cities },
        { id: 'districts', label: 'Districts', items: districts },
        { id: 'terrain', label: 'Terrain Edits', items: terrain },
        { id: 'vantage', label: 'Vantage Points', items: vantage }
    ];
}

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
