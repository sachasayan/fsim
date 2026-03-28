const AUTHORED_OBJECT_ASSETS = [
    {
        id: 'air-traffic-control-1',
        label: 'Air Traffic Control Tower',
        url: '/world/objects/airport/air-traffic-control-1.glb',
        color: '#86efac'
    },
    {
        id: 'aircraft-carrier',
        label: 'Aircraft Carrier',
        url: '/world/objects/scenery/aircraft-carrier.glb',
        color: '#93c5fd'
    },
    {
        id: 'ancient-greek-ruins',
        label: 'Ancient Greek Ruins',
        url: '/world/objects/scenery/ancient-greek-ruins.glb',
        color: '#fcd34d'
    },
    {
        id: 'ancient-tribal-ruins',
        label: 'Ancient Tribal Ruins',
        url: '/world/objects/scenery/ancient-tribal-ruins.glb',
        color: '#f59e0b'
    },
    {
        id: 'balloon',
        label: 'Balloon',
        url: '/world/objects/scenery/balloon.glb',
        color: '#f472b6'
    },
    {
        id: 'lighthouse',
        label: 'Lighthouse',
        url: '/world/objects/scenery/lighthouse.glb',
        color: '#fde68a'
    },
    {
        id: 'mountain-statue',
        label: 'Mountain Statue',
        url: '/world/objects/scenery/mountain-statue.glb',
        color: '#c4b5fd'
    },
    {
        id: 'oil-rig',
        label: 'Oil Rig',
        url: '/world/objects/scenery/oil-rig.glb',
        color: '#67e8f9'
    }
];

const AUTHORED_OBJECT_ASSET_BY_ID = new Map(
    AUTHORED_OBJECT_ASSETS.map((asset) => [asset.id, asset])
);

function clampNumber(value, min, max, fallback) {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
}

export function normalizeAuthoredObjectHeightMode(heightMode) {
    if (heightMode === 'absolute') return 'absolute';
    if (heightMode === 'sea-level') return 'sea-level';
    return 'terrain';
}

export function listAuthoredObjectAssets() {
    return AUTHORED_OBJECT_ASSETS.map((asset) => ({ ...asset }));
}

export function getDefaultAuthoredObjectAssetId() {
    return AUTHORED_OBJECT_ASSET_BY_ID.has('aircraft-carrier')
        ? 'aircraft-carrier'
        : AUTHORED_OBJECT_ASSETS[0]?.id || 'lighthouse';
}

export function getAuthoredObjectAsset(assetId) {
    return AUTHORED_OBJECT_ASSET_BY_ID.get(assetId) || AUTHORED_OBJECT_ASSET_BY_ID.get(getDefaultAuthoredObjectAssetId()) || null;
}

export function getAuthoredObjectLabel(assetId) {
    return getAuthoredObjectAsset(assetId)?.label || assetId || 'Object';
}

export function isValidAuthoredObjectAsset(assetId) {
    return AUTHORED_OBJECT_ASSET_BY_ID.has(assetId);
}

export function normalizeAuthoredObject(rawObject) {
    const authoredObject = rawObject || {};
    authoredObject.assetId = isValidAuthoredObjectAsset(authoredObject.assetId)
        ? authoredObject.assetId
        : getDefaultAuthoredObjectAssetId();
    authoredObject.x = Math.round(Number.isFinite(authoredObject.x) ? authoredObject.x : 0);
    authoredObject.z = Math.round(Number.isFinite(authoredObject.z) ? authoredObject.z : 0);
    authoredObject.heightMode = normalizeAuthoredObjectHeightMode(authoredObject.heightMode);
    authoredObject.y = Number.isFinite(authoredObject.y) ? authoredObject.y : 0;
    authoredObject.yaw = clampNumber(Number(authoredObject.yaw), -180, 180, 0);
    authoredObject.scale = clampNumber(Number(authoredObject.scale), 0.1, 20, 1);
    return authoredObject;
}
