const AUTHORED_OBJECT_ASSETS = [
  {
    id: 'air-traffic-control-1',
    label: 'Air Traffic Control Tower',
    url: '/world/objects/airport/air-traffic-control-1.glb',
    color: '#86efac'
  },
  {
    id: 'airliner-blue',
    label: 'Blue Airliner',
    url: '/world/objects/airport/airliner-blue.glb',
    color: '#60a5fa'
  },
  {
    id: 'airliner-white',
    label: 'White Airliner',
    url: '/world/objects/airport/airliner-white.glb',
    color: '#e5e7eb'
  },
  {
    id: 'airplane-quad-engine',
    label: 'Quad Engine Airplane',
    url: '/world/objects/airport/airplane-quad-engine.glb',
    color: '#fca5a5'
  },
  {
    id: 'prop-biplane',
    label: 'Prop Biplane',
    url: '/world/objects/airport/prop-biplane.glb',
    color: '#fdba74'
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
  return AUTHORED_OBJECT_ASSET_BY_ID.get(assetId || '') || AUTHORED_OBJECT_ASSET_BY_ID.get(getDefaultAuthoredObjectAssetId()) || null;
}

export function getAuthoredObjectLabel(assetId) {
  return getAuthoredObjectAsset(assetId)?.label || assetId || 'Object';
}

export function isValidAuthoredObjectAsset(assetId) {
  return typeof assetId === 'string' && AUTHORED_OBJECT_ASSET_BY_ID.has(assetId);
}

export function normalizeAuthoredObject(rawObject) {
  return {
    ...(rawObject || {}),
    assetId: isValidAuthoredObjectAsset(rawObject?.assetId)
      ? rawObject.assetId
      : getDefaultAuthoredObjectAssetId(),
    x: Math.round(Number.isFinite(rawObject?.x) ? rawObject.x : 0),
    z: Math.round(Number.isFinite(rawObject?.z) ? rawObject.z : 0),
    heightMode: normalizeAuthoredObjectHeightMode(rawObject?.heightMode),
    y: Number.isFinite(rawObject?.y) ? rawObject.y : 0,
    yaw: clampNumber(Number(rawObject?.yaw), -180, 180, 0),
    scale: clampNumber(Number(rawObject?.scale), 0.1, 20, 1)
  };
}
