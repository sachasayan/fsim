function clampInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.round(numeric));
}

function cloneLodLevels(levels) {
  return levels.map((level) => ({ ...level }));
}

export function createRuntimeLodSettings({ urlSearch = '' } = {}) {
  const urlParams = new URLSearchParams(urlSearch);
  const isFastLoad = urlParams.get('fastload') === '1';
  const renderDistParam = urlParams.get('renderDist');
  const renderDistance = renderDistParam !== null ? clampInteger(renderDistParam, 8) : (isFastLoad ? 4 : 8);

  return {
    world: {
      updateIntervalMs: 120,
      cameraMoveThreshold: 10
    },
    airport: {
      thresholds: {
        mid: 12000,
        low: 25000,
        cull: 30000
      },
      distanceHysteresis: 750,
      shadowHighDetailDistance: 10000
    },
    terrain: {
      renderDistance,
      ringThresholds: [3, 6, 12],
      ringHysteresis: 1,
        lodLevels: cloneLodLevels([
        {
          terrainRes: 224, waterRes: 72, propDensity: 1.0, enableBuildings: true, enableTrees: true, enableBoats: true,
          treeRenderMode: 'hybrid',
          enableTreeContactShadows: true,
          treeShadowFadeNear: 0,
          treeShadowFadeFar: 0
        },
        {
          terrainRes: 32, waterRes: 16, propDensity: 0.7, enableBuildings: true, enableTrees: true, enableBoats: false,
          treeRenderMode: 'billboard',
          enableTreeContactShadows: true,
          treeShadowFadeNear: 1400,
          treeShadowFadeFar: 2100
        },
        {
          terrainRes: 12, waterRes: 4, propDensity: 0.2, enableBuildings: true, enableTrees: false, enableBoats: false,
          treeRenderMode: 'disabled',
          enableTreeContactShadows: false,
          treeShadowFadeNear: 0,
          treeShadowFadeFar: 0
        },
        {
          terrainRes: 2, waterRes: 2, propDensity: 0.0, enableBuildings: false, enableTrees: false, enableBoats: false,
          treeRenderMode: 'disabled',
          enableTreeContactShadows: false,
          treeShadowFadeNear: 0,
          treeShadowFadeFar: 0
        }
      ])
    }
  };
}

export function normalizeDistanceThresholds(thresholds) {
  const normalized = [];
  for (let index = 0; index < thresholds.length; index++) {
    const current = clampInteger(thresholds[index], normalized[index - 1] ?? 0);
    normalized.push(index === 0 ? current : Math.max(normalized[index - 1], current));
  }
  return normalized;
}

export function resolveDistanceLod(distance, currentLod, thresholds, hysteresis = 0) {
  const normalizedThresholds = normalizeDistanceThresholds(thresholds);
  let baseLod = normalizedThresholds.length;
  for (let index = 0; index < normalizedThresholds.length; index++) {
    if (distance <= normalizedThresholds[index]) {
      baseLod = index;
      break;
    }
  }

  if (!Number.isInteger(currentLod) || hysteresis <= 0) {
    return baseLod;
  }

  const lowerBound = currentLod > 0 ? normalizedThresholds[currentLod - 1] - hysteresis : -Infinity;
  const upperBound = currentLod < normalizedThresholds.length ? normalizedThresholds[currentLod] + hysteresis : Infinity;
  if (distance >= lowerBound && distance <= upperBound) {
    return currentLod;
  }

  return baseLod;
}

export function normalizeTerrainRingThresholds(thresholds) {
  const normalized = normalizeDistanceThresholds(thresholds);
  while (normalized.length < 3) {
    const last = normalized[normalized.length - 1] ?? 0;
    normalized.push(last);
  }
  return normalized.slice(0, 3);
}

export function resolveTerrainRingLod(ringDistance, currentLod = null, terrainSettings = null) {
  const thresholds = normalizeTerrainRingThresholds(terrainSettings?.ringThresholds || [1, 3, 6]);
  const hysteresis = clampInteger(terrainSettings?.ringHysteresis ?? 1, 1);
  const [lod0Max, lod1Max, lod2Max] = thresholds;

  if (currentLod === 0) {
    if (ringDistance <= lod0Max) return 0;
    if (ringDistance <= lod1Max) return 1;
    if (ringDistance <= lod2Max) return 2;
    return 3;
  }
  if (currentLod === 1) {
    if (ringDistance <= lod0Max) return 0;
    if (ringDistance <= lod1Max + hysteresis) return 1;
    if (ringDistance <= lod2Max + hysteresis) return 2;
    return 3;
  }
  if (currentLod === 2) {
    if (ringDistance <= lod0Max + hysteresis) return 1;
    if (ringDistance <= lod2Max + hysteresis) return 2;
    return 3;
  }
  if (currentLod === 3) {
    if (ringDistance <= lod2Max) return 2;
    return 3;
  }

  if (ringDistance <= lod0Max) return 0;
  if (ringDistance <= lod1Max) return 1;
  if (ringDistance <= lod2Max) return 2;
  return 3;
}

export function normalizeLodSettings(lodSettings) {
  lodSettings.world.updateIntervalMs = Math.max(16, clampInteger(lodSettings.world.updateIntervalMs, 120));
  lodSettings.world.cameraMoveThreshold = Math.max(0, clampInteger(lodSettings.world.cameraMoveThreshold, 10));

  const airportThresholds = normalizeDistanceThresholds([
    lodSettings.airport.thresholds.mid,
    lodSettings.airport.thresholds.low,
    lodSettings.airport.thresholds.cull
  ]);
  [lodSettings.airport.thresholds.mid, lodSettings.airport.thresholds.low, lodSettings.airport.thresholds.cull] = airportThresholds;
  lodSettings.airport.distanceHysteresis = clampInteger(lodSettings.airport.distanceHysteresis, 0);
  lodSettings.airport.shadowHighDetailDistance = clampInteger(lodSettings.airport.shadowHighDetailDistance, 0);

  lodSettings.terrain.renderDistance = clampInteger(lodSettings.terrain.renderDistance, 0);
  const normalizedRingThresholds = normalizeTerrainRingThresholds(lodSettings.terrain.ringThresholds);
  if (Array.isArray(lodSettings.terrain.ringThresholds)) {
    lodSettings.terrain.ringThresholds.length = 0;
    lodSettings.terrain.ringThresholds.push(...normalizedRingThresholds);
  } else {
    lodSettings.terrain.ringThresholds = normalizedRingThresholds;
  }
  lodSettings.terrain.ringHysteresis = clampInteger(lodSettings.terrain.ringHysteresis, 1);
  return lodSettings;
}

export function getAirportThresholds(lodSettings) {
  return normalizeDistanceThresholds([
    lodSettings.airport.thresholds.mid,
    lodSettings.airport.thresholds.low,
    lodSettings.airport.thresholds.cull
  ]);
}
