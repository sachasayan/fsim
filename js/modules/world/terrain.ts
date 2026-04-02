// @ts-check

import * as THREE from 'three';
import { createWaterNormalMap, createTreeBillboardTexture, createTreeContactTexture, createPackedTerrainDetailTexture, createNormalMapFromHeightImage } from './terrain/TerrainTextures.js';
import {
  makeTreeBillboardMaterial,
  makeTreeDepthMaterial,
  createDetailedBuildingMat,
  setupTerrainMaterial,
  setupWaterMaterial,
  setupBuildingPopIn
} from './terrain/TerrainMaterials.js';
import { getRoadMarkingStyle, DASH_SCALE } from './terrain/RoadMarkingOverlay.js';
import { buildRoadNetworkGraph, generateRoadNetworkGeometries } from './terrain/RoadNetworkGeometry.js';

const tempMainCameraPosUniform = { value: new THREE.Vector3() };
import {
  getTerrainHeight,
  getTerrainMaskSet,
  getStaticSampler,
  getStaticWorldMetadata
} from './terrain/TerrainUtils.js';
import { SEA_LEVEL, WATER_DEPTH_BANDS, getTerrainBaseSrgb, getWaterDepthSrgb } from './terrain/TerrainPalette.js';
import { getTerrainSurfaceWeights } from './terrain/TerrainSurfaceWeights.js';
import { normalizeLodSettings } from './LodSystem.js';
import {
  fetchDistrictIndex,
  clearDistrictCache
} from './terrain/CityChunkLoader.js';
import {
  generateChunkBase as genBase,
  generateChunkProps as genProps,
  dispatchTerrainWorker,
  getTerrainGenerationDiagnostics,
  getOverlappingDistricts,
  loadStaticWorld,
  recordTerrainGenerationPerf,
  CHUNK_SIZE
} from './terrain/TerrainGeneration.js';
import { animateWindmillProps, spawnCityBuildingsForChunk, spawnDistrictPropsForChunk } from './terrain/BuildingSpawner.js';
import { createQuadtreeSelectionController } from './terrain/QuadtreeSelectionController.js';
import { createTerrainChunkRuntime } from './terrain/TerrainChunkRuntime.js';
import { createTerrainDebugConfigRuntime } from './terrain/TerrainDebugConfig.js';
import { createTerrainLeafSurfaceRuntime } from './terrain/TerrainLeafSurfaceRuntime.js';
import {
  buildTerrainSelection,
  smoothActiveChunkLods,
  updateLeafChunkLods
} from './terrain/TerrainSelectionRuntime.js';
import { debugLog } from '../core/logging.js';
import { createRuntimeLodSettings } from './LodSystem.js';

/** @typedef {ReturnType<typeof createRuntimeLodSettings>} RuntimeLodSettings */
/** @typedef {Parameters<typeof getTerrainHeight>[2]} TerrainNoiseLike */
type RuntimeLodSettings = ReturnType<typeof createRuntimeLodSettings>;
type TerrainNoiseLike = Parameters<typeof getTerrainHeight>[2];

type PhysicsLike = {
  position: { x: number; z: number };
  velocity?: { x?: number; z?: number };
};

type TerrainBrowserWindow = Window & typeof globalThis & {
  fsimWorld?: unknown;
  _isReadyLogCounter?: number;
};

type TerrainSystemOptions = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  Noise: TerrainNoiseLike;
  PHYSICS?: unknown;
  lodSettings?: RuntimeLodSettings | null;
  loadStaticWorldFn?: typeof loadStaticWorld;
};

type LakeSurfaceGeometryOptions = {
  segments?: number;
  radialSteps?: number;
  shorelinePadding?: number;
  minRenderableRadius?: number;
};

type LeafBuildBreakdown = {
  count: number;
  sampleHeightMs: number;
  terrainGeometryMs: number;
  waterGeometryMs: number;
  waterDepthTextureMs: number;
  materialSetupMs: number;
  sceneAttachMs: number;
  totalMs: number;
  maxTotalMs: number;
  workerComputeMs: number;
};

type TerrainSelectionSnapshot = {
  mode: string;
  selectedLeafCount: number;
  blockingLeafCount: number;
  pendingBlockingLeafCount: number;
  activeChunkCount: number;
  blockingChunkCount: number;
  selectedNodeCount: number;
  blockingLeafStates: any[];
  quadtreeSelectionRegion: any;
  leafResponsiveness?: unknown;
};

/**
 * @typedef TerrainSystem
 * @property {THREE.MeshStandardMaterial} waterMaterial
 * @property {(x: number, z: number, octaves?: number) => number} getTerrainHeight
 * @property {() => unknown} updateTerrain
 * @property {(timeSeconds?: number) => void} animateWindmills
 * @property {(camera?: THREE.Camera | null, weatherColor?: THREE.Color | null) => void} updateTerrainAtmosphere
 * @property {(center: THREE.Vector3 | null | undefined, extent: number) => void} updateSurfaceShadowCoverage
 * @property {() => unknown} getTerrainSelectionDiagnostics
 * @property {() => unknown} getSurfaceShadowDiagnostics
 * @property {() => { applyMs: number, applies: number }} consumeLeafBuildApplyTiming
 * @property {(maxAppliesPerFrame?: number, timeBudgetMs?: number) => { durationMs: number, applies: number }} flushPendingLeafApplies
 * @property {Record<string, unknown>} terrainDebugSettings
 * @property {(options?: { rebuildSurfaces?: boolean, refreshSelection?: boolean, rebuildProps?: boolean, rebuildHydrology?: boolean }) => void} applyTerrainDebugSettings
 * @property {() => boolean} isReady
 * @property {() => boolean} hasPendingTerrainWork
 * @property {() => void} refreshBakedTerrain
 * @property {() => void} reloadHydrology
 * @property {(cityId?: string | null) => Promise<void>} reloadCity
 * @property {() => unknown[]} getShaderValidationVariants
 * @property {() => void} completeBootstrap
 */

export function createRiverStripGeometry(points, width, sampler, widths = null) {
  if (!Array.isArray(points) || points.length < 2 || !sampler || typeof sampler.getAltitudeAt !== 'function') return null;
  const cleanedPoints = [];
  const cleanedWidths = [];

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (!Array.isArray(point) || point.length < 2) continue;
    const x = Number(point[0]);
    const z = Number(point[1]);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const localWidth = Array.isArray(widths) && Number.isFinite(widths[index]) ? Number(widths[index]) : Number(width);
    if (!Number.isFinite(localWidth)) continue;
    const lastPoint = cleanedPoints[cleanedPoints.length - 1];
    if (lastPoint && lastPoint[0] === x && lastPoint[1] === z) {
      cleanedWidths[cleanedWidths.length - 1] = Math.max(cleanedWidths[cleanedWidths.length - 1], localWidth);
      continue;
    }
    cleanedPoints.push([x, z]);
    cleanedWidths.push(localWidth);
  }

  if (cleanedPoints.length < 2) return null;

  const positions = [];
  const indices = [];
  let vertexBase = 0;

  function findDistinctPoint(startIndex, direction) {
    const origin = cleanedPoints[startIndex];
    let cursor = startIndex + direction;
    while (cursor >= 0 && cursor < cleanedPoints.length) {
      const point = cleanedPoints[cursor];
      if (point[0] !== origin[0] || point[1] !== origin[1]) return point;
      cursor += direction;
    }
    return origin;
  }

  for (let index = 0; index < cleanedPoints.length; index += 1) {
    const [x, z] = cleanedPoints[index];
    const prev = index === 0 ? cleanedPoints[index] : findDistinctPoint(index, -1);
    const next = index === cleanedPoints.length - 1 ? cleanedPoints[index] : findDistinctPoint(index, 1);
    const dx = next[0] - prev[0];
    const dz = next[1] - prev[1];
    const length = Math.hypot(dx, dz);
    if (!Number.isFinite(length) || length <= 1e-3) continue;

    const nx = -dz / length;
    const nz = dx / length;
    const halfWidth = Math.max(4, cleanedWidths[index] * 0.5);
    const y = sampler.getAltitudeAt(x, z) + 0.65;

    positions.push(x + nx * halfWidth, y, z + nz * halfWidth);
    positions.push(x - nx * halfWidth, y, z - nz * halfWidth);

    if (vertexBase >= 2) {
      const base = vertexBase - 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    vertexBase += 2;
  }

  if (positions.length < 12 || indices.length < 6) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createRoadGeometry(points, width, colorHex, sampler, yOffset = 0.35) {
  if (!Array.isArray(points) || points.length < 2 || !sampler || typeof sampler.getAltitudeAt !== 'function') return null;
  const cleanedPoints = [];
  const MAX_SEG_LEN = 2.0;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (!Array.isArray(point) || point.length < 2) continue;
    const x = Number(point[0]);
    const z = Number(point[1]);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    
    if (cleanedPoints.length > 0) {
      const lastPoint = cleanedPoints[cleanedPoints.length - 1];
      if (lastPoint[0] === x && lastPoint[1] === z) continue;
      
      const dx = x - lastPoint[0];
      const dz = z - lastPoint[1];
      const dist = Math.hypot(dx, dz);
      
      if (dist > MAX_SEG_LEN) {
        const segments = Math.ceil(dist / MAX_SEG_LEN);
        for (let i = 1; i <= segments; i++) {
          const t = i / segments;
          cleanedPoints.push([
            lastPoint[0] + dx * t,
            lastPoint[1] + dz * t
          ]);
        }
        continue;
      }
    }
    
    cleanedPoints.push([x, z]);
  }

  if (cleanedPoints.length < 2) return null;

  const positions = [];
  const indices = [];
  const colors = [];
  let colorObj = null;
  if (colorHex != null) {
      colorObj = new THREE.Color(colorHex);
  }

  let vertexBase = 0;

  function findDistinctPoint(startIndex, direction) {
    const origin = cleanedPoints[startIndex];
    let cursor = startIndex + direction;
    while (cursor >= 0 && cursor < cleanedPoints.length) {
      const point = cleanedPoints[cursor];
      if (point[0] !== origin[0] || point[1] !== origin[1]) return point;
      cursor += direction;
    }
    return origin;
  }

  for (let index = 0; index < cleanedPoints.length; index += 1) {
    const [x, z] = cleanedPoints[index];
    const prev = index === 0 ? cleanedPoints[index] : findDistinctPoint(index, -1);
    const next = index === cleanedPoints.length - 1 ? cleanedPoints[index] : findDistinctPoint(index, 1);
    const dx = next[0] - prev[0];
    const dz = next[1] - prev[1];
    const length = Math.hypot(dx, dz);
    if (!Number.isFinite(length) || length <= 1e-3) continue;

    const nx = -dz / length;
    const nz = dx / length;
    const halfWidth = Math.max(0.1, width * 0.5);
    const y = sampler.getAltitudeAt(x, z) + yOffset;

    positions.push(x + nx * halfWidth, y, z + nz * halfWidth);
    positions.push(x - nx * halfWidth, y, z - nz * halfWidth);
    
    if (colorObj != null) {
      colors.push(colorObj.r, colorObj.g, colorObj.b);
      colors.push(colorObj.r, colorObj.g, colorObj.b);
    }

    if (vertexBase >= 2) {
      const base = vertexBase - 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    vertexBase += 2;
  }

  if (positions.length < 12 || indices.length < 6) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colorObj != null) {
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  }
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildRoadFlattenSegments(roads, settings, Noise) {
  if (!Array.isArray(roads) || roads.length === 0) return [];
  const centerPadding = Math.max(0, Number.isFinite(settings?.centerPadding) ? settings.centerPadding : 32);
  const shoulderWidth = Math.max(0, Number.isFinite(settings?.shoulderWidth) ? settings.shoulderWidth : 48);
  const segments = [];

  for (const road of roads) {
    continue;
    if (!Array.isArray(road?.points) || road.points.length < 2) continue;
    let roadWidth = road.width;
    if (!Number.isFinite(roadWidth)) {
      roadWidth = road.kind === 'taxiway' ? 12.0 : 8.0;
    }
    const halfWidth = roadWidth * 0.5 + centerPadding;
    const embankment = shoulderWidth;
    const totalRadius = halfWidth + embankment;

    for (let i = 0; i < road.points.length - 1; i += 1) {
      const p1 = road.points[i];
      const p2 = road.points[i + 1];
      segments.push({
        p1,
        p2,
        halfWidth,
        embankment,
        totalRadius,
        startHeight: getTerrainHeight(p1[0], p1[1], Noise),
        endHeight: getTerrainHeight(p2[0], p2[1], Noise)
      });
    }
  }

  return segments;
}

function createRoadAwareSampler(baseSampler, roads, settings, Noise) {
  return baseSampler;
}

export function createLakeSurfaceGeometry(lake, sampler, options: LakeSurfaceGeometryOptions = {}) {
  if (!lake || !sampler || typeof sampler.getAltitudeAt !== 'function') return null;
  const centerX = Number(lake.x);
  const centerZ = Number(lake.z);
  const maxRadius = Number(lake.radius);
  if (!Number.isFinite(centerX) || !Number.isFinite(centerZ) || !Number.isFinite(maxRadius) || maxRadius <= 0) return null;

  const baseLevel = Number.isFinite(lake.level) ? Number(lake.level) : sampler.getAltitudeAt(centerX, centerZ) + 0.2;
  if (!Number.isFinite(baseLevel)) return null;

  const segments = Math.max(18, Math.round(options.segments ?? 40));
  const radialSteps = Math.max(6, Math.round(options.radialSteps ?? 12));
  const shorelinePadding = Number.isFinite(options.shorelinePadding) ? options.shorelinePadding : 0.35;
  const minRenderableRadius = Number.isFinite(options.minRenderableRadius) ? options.minRenderableRadius : 18;

  const centerGround = sampler.getAltitudeAt(centerX, centerZ);
  const waterLevel = Math.max(baseLevel, centerGround + 0.08);
  const positions = [centerX, waterLevel, centerZ];
  const indices = [];
  const shoreline = [];

  for (let segment = 0; segment < segments; segment += 1) {
    const angle = (segment / segments) * Math.PI * 2;
    let shorelineRadius = 0;

    for (let stepIndex = 1; stepIndex <= radialSteps; stepIndex += 1) {
      const t = stepIndex / radialSteps;
      const radius = maxRadius * t;
      const x = centerX + Math.cos(angle) * radius;
      const z = centerZ + Math.sin(angle) * radius;
      const terrainY = sampler.getAltitudeAt(x, z);
      if (terrainY <= waterLevel + shorelinePadding) {
        shorelineRadius = radius;
      } else {
        break;
      }
    }

    shoreline.push(shorelineRadius);
  }

  const maxShorelineRadius = shoreline.reduce((best, radius) => Math.max(best, radius), 0);
  if (maxShorelineRadius < minRenderableRadius) return null;

  for (let segment = 0; segment < segments; segment += 1) {
    const radius = shoreline[segment];
    const angle = (segment / segments) * Math.PI * 2;
    const x = centerX + Math.cos(angle) * radius;
    const z = centerZ + Math.sin(angle) * radius;
    positions.push(x, waterLevel, z);
  }

  for (let segment = 0; segment < segments; segment += 1) {
    const current = segment + 1;
    const next = ((segment + 1) % segments) + 1;
    indices.push(0, current, next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * @param {TerrainSystemOptions} options
 * @returns {TerrainSystem}
 */
export function createTerrainSystem({
  scene,
  renderer,
  Noise,
  PHYSICS,
  lodSettings = null,
  loadStaticWorldFn = loadStaticWorld
}) {
  const hasWindow = typeof window !== 'undefined';
  const windowRef = (hasWindow ? window : null) as TerrainBrowserWindow | null;
  const locationSearch = windowRef?.location?.search || '';
  lodSettings = lodSettings || createRuntimeLodSettings({ urlSearch: locationSearch });
  /** @type {PhysicsLike} */
  const physicsState = /** @type {PhysicsLike} */ (PHYSICS || { position: { x: 0, z: 0 }, velocity: { x: 0, z: 0 } });

  const waterMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.62,
    metalness: 0.05,
    normalScale: new THREE.Vector2(1.5, 1.5)
  });
  const baseWaterNormalScale = waterMaterial.normalScale.clone();
  waterMaterial.polygonOffset = true;
  waterMaterial.polygonOffsetFactor = 1; // Pull water slightly back to let terrain shorelines/river-splines win if near
  waterMaterial.polygonOffsetUnits = 1;

  const hydrologyGroup = new THREE.Group();
  hydrologyGroup.name = 'terrain-hydrology';
  scene.add(hydrologyGroup);

  const roadMarkingSplineGroup = new THREE.Group();
  roadMarkingSplineGroup.name = 'terrain-spline-markings';
  roadMarkingSplineGroup.visible = true;
  scene.add(roadMarkingSplineGroup);
  const splineMarkingMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  splineMarkingMaterial.polygonOffset = true;
  splineMarkingMaterial.polygonOffsetFactor = -4;
  splineMarkingMaterial.polygonOffsetUnits = -4;

  const roadSurfaceSplineGroup = new THREE.Group();
  roadSurfaceSplineGroup.name = 'terrain-spline-surfaces';
  roadSurfaceSplineGroup.visible = true;
  scene.add(roadSurfaceSplineGroup);
  const splineSurfaceMaterial = new THREE.MeshBasicMaterial({
    color: 0x1d1e21, // asphalt base color
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  splineSurfaceMaterial.polygonOffset = true;
  // Use a slightly weaker push than the centerlines so the lines render ON TOP of the asphalt
  splineSurfaceMaterial.polygonOffsetFactor = -3;
  splineSurfaceMaterial.polygonOffsetUnits = -3;

  const hydrologyLakeMaterial = new THREE.MeshBasicMaterial({
    color: 0x3a84dc,
    transparent: true,
    opacity: 0.72,
    depthWrite: false
  });
  hydrologyLakeMaterial.polygonOffset = true;
  hydrologyLakeMaterial.polygonOffsetFactor = -2; // Ensure lakes/rivers win over ocean if overlapping
  hydrologyLakeMaterial.polygonOffsetUnits = -2;
  const hydrologyRiverMaterial = new THREE.MeshBasicMaterial({
    color: 0x4cb1ff,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  hydrologyRiverMaterial.polygonOffset = true;
  hydrologyRiverMaterial.polygonOffsetFactor = -2;
  hydrologyRiverMaterial.polygonOffsetUnits = -2;

  const atmosphereCameraPos = new THREE.Vector3();
  const atmosphereColor = new THREE.Color(0x90939f);
  const atmosphereUniforms = {
    uAtmosCameraPos: { value: atmosphereCameraPos },
    uAtmosColor: { value: atmosphereColor },
    uAtmosNear: { value: 9000.0 },
    uAtmosFar: { value: 68000.0 },
    uSurfaceShadowDistance: { value: 20000.0 },
    uSurfaceShadowFadeStart: { value: 16000.0 },
    uShadowCoverageCenter: { value: new THREE.Vector3() },
    uShadowCoverageExtent: { value: 16000.0 },
    uShadowCoverageFadeStart: { value: 12800.0 }
  };
  const waterSurfaceUniforms = {
    uWaterDepthTex: { value: null },
    uWaterBoundsMin: { value: new THREE.Vector2(0, 0) },
    uWaterBoundsSize: { value: new THREE.Vector2(1, 1) },
    uWaterDepthScale: { value: WATER_DEPTH_BANDS.deepEnd },
    uWaterFoamDepth: { value: WATER_DEPTH_BANDS.foam },
    uWaterShallowStart: { value: WATER_DEPTH_BANDS.shallowStart },
    uWaterShallowEnd: { value: WATER_DEPTH_BANDS.shallowEnd },
    uWaterDeepEnd: { value: WATER_DEPTH_BANDS.deepEnd },
    uWaterFoamColor: { value: new THREE.Color() },
    uWaterShallowColor: { value: new THREE.Color() },
    uWaterDeepColor: { value: new THREE.Color() }
  };
  const defaultWaterDepthTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  defaultWaterDepthTexture.colorSpace = THREE.NoColorSpace;
  defaultWaterDepthTexture.needsUpdate = true;
  waterSurfaceUniforms.uWaterDepthTex.value = defaultWaterDepthTexture;

  // Parse URL params once — these never change at runtime
  const urlParams = new URLSearchParams(locationSearch);
  const _fogDisabled = urlParams.get('fog') === '0';
  const _isFastLoad  = urlParams.get('fastload') === '1';
  normalizeLodSettings(lodSettings);

  if (_fogDisabled) {
    atmosphereUniforms.uAtmosNear.value = 1e6;
    atmosphereUniforms.uAtmosFar.value = 1e7;
  }
  const tmpColorA = new THREE.Color();
  const tmpColorB = new THREE.Color();
  const skirtDepth = 28;

  function srgbToLinear(value) {
    return (value < 0.04045) ? value * 0.0773993808 : Math.pow(value * 0.9478672986 + 0.0521327014, 2.4);
  }

  function srgbArrayToLinear(rgb) {
    return {
      r: srgbToLinear(rgb[0] / 255),
      g: srgbToLinear(rgb[1] / 255),
      b: srgbToLinear(rgb[2] / 255)
    };
  }

  function setColorFromLinearArray(target, rgb) {
    const color = srgbArrayToLinear(rgb);
    target.setRGB(color.r, color.g, color.b);
  }

  function clearHydrologyMeshes() {
    while (hydrologyGroup.children.length > 0) {
      const mesh = hydrologyGroup.children[hydrologyGroup.children.length - 1];
      hydrologyGroup.remove(mesh);
      mesh.geometry?.dispose?.();
    }
  }

  function clearRoadMarkingMeshes() {
    while (roadMarkingSplineGroup.children.length > 0) {
      const mesh = roadMarkingSplineGroup.children[roadMarkingSplineGroup.children.length - 1];
      roadMarkingSplineGroup.remove(mesh);
      mesh.geometry?.dispose?.();
    }
    while (roadSurfaceSplineGroup.children.length > 0) {
      const mesh = roadSurfaceSplineGroup.children[roadSurfaceSplineGroup.children.length - 1];
      roadSurfaceSplineGroup.remove(mesh);
      mesh.geometry?.dispose?.();
    }
  }

  function rebuildHydrologyMeshes() {
    clearHydrologyMeshes();
    clearRoadMarkingMeshes();
    const sampler = getStaticSampler();
    const metadata = getStaticWorldMetadata() || windowRef?.fsimWorld || null;
    const hydrology = metadata?.hydrology || null;
    if (sampler && metadata?.roads) {
      const graph = buildRoadNetworkGraph(metadata.roads);
      const networkGeom = generateRoadNetworkGeometries(graph, sampler, 0.20);
      
      if (networkGeom && networkGeom.surfaceGeometry) {
        const surfaceMesh = new THREE.Mesh(networkGeom.surfaceGeometry, splineSurfaceMaterial);
        roadSurfaceSplineGroup.add(surfaceMesh);
      }

      for (const road of metadata.roads) {
        // 2. the centerline markings - keeping individual splines for now, but drawing over the intersections
        const style = getRoadMarkingStyle(road, DASH_SCALE);
        if (style) {
          const markingGeo = createRoadGeometry(road.points, style.width, style.color, sampler, 0.35);
          if (markingGeo) {
            const markingMesh = new THREE.Mesh(markingGeo, splineMarkingMaterial);
            roadMarkingSplineGroup.add(markingMesh);
          }
        }
      }
    }

    if (!sampler || !hydrology) return;

    for (const lake of hydrology.lakes || []) {
      const geometry = createLakeSurfaceGeometry(lake, sampler);
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, hydrologyLakeMaterial);
      hydrologyGroup.add(mesh);
    }

    for (const river of hydrology.rivers || []) {
      const geometry = createRiverStripGeometry(river.points, river.width || 16, sampler, river.widths || null);
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, hydrologyRiverMaterial);
      hydrologyGroup.add(mesh);
    }
  }

  const waterFarMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true
  });

  const waterTimeUniform = { value: 0 };
  waterMaterial.userData.timeUniform = waterTimeUniform;

  setupWaterMaterial(waterMaterial, atmosphereUniforms, waterTimeUniform, false, waterSurfaceUniforms);
  setupWaterMaterial(waterFarMaterial, atmosphereUniforms, null, true, waterSurfaceUniforms);

  const LOD_LEVELS = lodSettings.terrain.lodLevels;

  const activeLeaves = new Map();
  const chunkLeafOwners = new Map();
  const readyLeafSurfaceChunkCounts = new Map();
  const WARM_CHUNK_CACHE_MAX = 24;
  const BOOTSTRAP_MAX_LEAVES = 28;
  let bootstrapMode = true;
  let quadtreeSelectionController = null;
  let blockingLeafIds = new Set<string>();
  let currentBlockingChunkKeys = new Set<string>();
  const HIGH_LOD_SURFACE_RESOLUTION = 64;
  const SURFACE_SHADOW_SYNC_MOVE_THRESHOLD = 128;
  const SURFACE_SHADOW_SYNC_INTERVAL_MS = 250;
  const terrainDebugSettings = {
    selectionInterestRadius: CHUNK_SIZE * Math.max(3, lodSettings.terrain.renderDistance + 1),
    selectionBlockingRadius: CHUNK_SIZE * 2,
    selectionMinCellSize: CHUNK_SIZE * 0.25,
    selectionSplitDistanceFactor: 0.6,
    selectionLookaheadSeconds: 1.6,
    selectionLookaheadMaxDistance: CHUNK_SIZE * 1.5,
    selectionLookaheadRadiusPadding: CHUNK_SIZE * 0.5,
    selectionMaxDepth: 7,
    bootstrapRadius: 10000,
    resolution64MaxNodeSize: CHUNK_SIZE * 0.25,
    resolution32MaxNodeSize: CHUNK_SIZE * 0.5,
    resolution16MaxNodeSize: CHUNK_SIZE,
    resolution8MaxNodeSize: CHUNK_SIZE * 2,
    resolution4MaxNodeSize: CHUNK_SIZE * 4,
    showTerrainWireframe: false,
    surfaceShadowDistance: 20000,
    terrainShadowContrast: 0.3,
    showWaterWireframe: false,
    waterShadowMode: 'auto',
    waterRoughness: 0.62,
    waterMetalness: 0.05,
    waterNormalStrength: 1.5,
    waterNormalAnimation: true,
    waterAtmosphereStrength: 0.74,
    waterAtmosphereDesaturation: 0.08,
    waterShadowContrast: 0.3,
    showTrees: true,
    showBuildings: true
  };
  let lastTerrainSelection: TerrainSelectionSnapshot = {
    mode: 'grid_fallback',
    selectedLeafCount: 0,
    blockingLeafCount: 0,
    pendingBlockingLeafCount: 0,
    activeChunkCount: 0,
    blockingChunkCount: 0,
    selectedNodeCount: 0,
    blockingLeafStates: [],
    quadtreeSelectionRegion: null
  };
  const leafResponsivenessState = {
    recentCompletions: [],
    maxRecentCompletions: 64
  };
  const terrainPerfState = {
    lastUpdate: {
      selectionBuildMs: 0,
      queueSchedulingMs: 0,
      queuePruneMs: 0,
      leafBuildMs: 0,
      leafBuildDispatchMs: 0,
      leafBuildApplyMs: 0,
      chunkBuildQueueMs: 0,
      propBuildQueueMs: 0,
      totalMs: 0,
      leafBuilds: 0,
      leafBuildApplies: 0,
      chunkBuildsStarted: 0,
      propBuildsStarted: 0
    },
    warmChunkCache: {
      hits: 0,
      misses: 0,
      evictions: 0
    },
    chunkBaseRole: {
      currentVisibleChunkCount: 0,
      currentHiddenByReadyLeafCount: 0,
      buildStarts: 0,
      buildCompletes: 0,
      hideByLeafReadyCount: 0,
      visibleSessions: [],
      maxVisibleSessions: 64,
      visibilityByChunk: new Map()
    },
    pendingFrameLeafApplyMs: 0,
    pendingFrameLeafApplyCount: 0,
    leafBuildBreakdown: {
      count: 0,
      sampleHeightMs: 0,
      terrainGeometryMs: 0,
      waterGeometryMs: 0,
      waterDepthTextureMs: 0,
      materialSetupMs: 0,
      sceneAttachMs: 0,
      workerComputeMs: 0,
      totalMs: 0,
      maxTotalMs: 0
    }
  };
  const dirtyLeafShadowIds = new Set<string>();
  const dirtyChunkShadowKeys = new Set<string>();
  const lastSurfaceShadowSyncPos = new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN);
  let lastSurfaceShadowSyncAtMs = -Infinity;
  let surfaceShadowSyncAllDirty = true;

  function markAllSurfaceShadowsDirty() {
    surfaceShadowSyncAllDirty = true;
  }

  function markLeafShadowDirty(leafId) {
    if (!leafId) return;
    dirtyLeafShadowIds.add(leafId);
  }

  function markChunkShadowDirty(chunkKey) {
    if (!chunkKey) return;
    dirtyChunkShadowKeys.add(chunkKey);
  }

  const chunkRuntime = createTerrainChunkRuntime({
    scene,
    CHUNK_SIZE,
    WARM_CHUNK_CACHE_MAX,
    terrainPerfState,
    readyLeafSurfaceChunkCounts,
    createChunkBounds,
    shouldSurfaceCastShadow,
    shouldSurfaceReceiveShadow,
    shouldWaterReceiveShadow,
    markChunkShadowDirty,
    trackChunkBaseVisibility,
    isBootstrapMode: () => bootstrapMode,
    getCurrentBlockingChunkKeys: () => currentBlockingChunkKeys,
    getChunkPriorityBoost,
    generateChunkBase,
    generateChunkProps
  });
  const {
    terrainChunks,
    warmChunkCache,
    pendingChunkBuilds,
    pendingChunkKeys,
    pendingPropBuilds,
    pendingPropKeys,
    chunkPools
  } = chunkRuntime;

  function resetLeafBuildBreakdown() {
    terrainPerfState.leafBuildBreakdown = {
      count: 0,
      sampleHeightMs: 0,
      terrainGeometryMs: 0,
      waterGeometryMs: 0,
      waterDepthTextureMs: 0,
      materialSetupMs: 0,
      sceneAttachMs: 0,
      workerComputeMs: 0,
      totalMs: 0,
      maxTotalMs: 0
    } as LeafBuildBreakdown;
  }

  function recordLeafBuildBreakdown(sample) {
    const bucket = terrainPerfState.leafBuildBreakdown;
    if (!bucket || !sample) return;
    bucket.count += 1;
    bucket.sampleHeightMs += sample.sampleHeightMs || 0;
    bucket.terrainGeometryMs += sample.terrainGeometryMs || 0;
    bucket.waterGeometryMs += sample.waterGeometryMs || 0;
    bucket.waterDepthTextureMs += sample.waterDepthTextureMs || 0;
    bucket.materialSetupMs += sample.materialSetupMs || 0;
    bucket.sceneAttachMs += sample.sceneAttachMs || 0;
    bucket.totalMs += sample.totalMs || 0;
    bucket.workerComputeMs = (bucket.workerComputeMs || 0) + (sample.workerComputeMs || 0);
    bucket.maxTotalMs = Math.max(bucket.maxTotalMs, sample.totalMs || 0);
  }

  function recordLeafBuildApplyTiming(durationMs) {
    const applyMs = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
    terrainPerfState.pendingFrameLeafApplyMs += applyMs;
    terrainPerfState.pendingFrameLeafApplyCount += 1;
  }

  /** @returns {{ applyMs: number, applies: number }} */
  function consumeLeafBuildApplyTiming() {
    const summary = {
      applyMs: terrainPerfState.pendingFrameLeafApplyMs,
      applies: terrainPerfState.pendingFrameLeafApplyCount
    };
    terrainPerfState.pendingFrameLeafApplyMs = 0;
    terrainPerfState.pendingFrameLeafApplyCount = 0;
    return summary;
  }

  function getLeafBuildBreakdownSummary() {
    const bucket = terrainPerfState.leafBuildBreakdown;
    const count = bucket?.count || 0;
    if (count <= 0) {
      return {
        count: 0,
        sampleHeightAvgMs: null,
        terrainGeometryAvgMs: null,
        waterGeometryAvgMs: null,
        waterDepthTextureAvgMs: null,
        materialSetupAvgMs: null,
        sceneAttachAvgMs: null,
        workerComputeAvgMs: null,
        totalAvgMs: null,
        maxTotalMs: null
      };
    }
    const avg = (value) => Math.round((value / count) * 1000) / 1000;
    return {
      count,
      sampleHeightAvgMs: avg(bucket.sampleHeightMs),
      terrainGeometryAvgMs: avg(bucket.terrainGeometryMs),
      waterGeometryAvgMs: avg(bucket.waterGeometryMs),
      waterDepthTextureAvgMs: avg(bucket.waterDepthTextureMs),
      materialSetupAvgMs: avg(bucket.materialSetupMs),
      sceneAttachAvgMs: avg(bucket.sceneAttachMs),
      workerComputeAvgMs: avg(bucket.workerComputeMs || 0),
      totalAvgMs: avg(bucket.totalMs),
      maxTotalMs: Math.round(bucket.maxTotalMs * 1000) / 1000
    };
  }

  function finalizeChunkBaseVisibilitySession(chunkKey, now = performance.now()) {
    const visibilityState = terrainPerfState.chunkBaseRole.visibilityByChunk.get(chunkKey);
    if (!visibilityState || !Number.isFinite(visibilityState.visibleSinceAtMs)) return;
    const durationMs = Math.max(0, now - visibilityState.visibleSinceAtMs);
    terrainPerfState.chunkBaseRole.visibleSessions.push(durationMs);
    if (terrainPerfState.chunkBaseRole.visibleSessions.length > terrainPerfState.chunkBaseRole.maxVisibleSessions) {
      terrainPerfState.chunkBaseRole.visibleSessions.splice(
        0,
        terrainPerfState.chunkBaseRole.visibleSessions.length - terrainPerfState.chunkBaseRole.maxVisibleSessions
      );
    }
    visibilityState.visibleSinceAtMs = null;
  }

  function trackChunkBaseVisibility(chunkKey, isVisible, hiddenByReadyLeaf, now = performance.now()) {
    const roleState = terrainPerfState.chunkBaseRole;
    let visibilityState = roleState.visibilityByChunk.get(chunkKey);
    if (!visibilityState) {
      visibilityState = {
        visible: false,
        hiddenByReadyLeaf: false,
        visibleSinceAtMs: null
      };
      roleState.visibilityByChunk.set(chunkKey, visibilityState);
    }

    if (isVisible && !visibilityState.visible) {
      visibilityState.visibleSinceAtMs = now;
    } else if (!isVisible && visibilityState.visible) {
      finalizeChunkBaseVisibilitySession(chunkKey, now);
      if (hiddenByReadyLeaf) {
        roleState.hideByLeafReadyCount += 1;
      }
    }

    visibilityState.visible = isVisible;
    visibilityState.hiddenByReadyLeaf = hiddenByReadyLeaf;
  }

  function clearChunkBaseVisibilityTracking(chunkKey, now = performance.now()) {
    finalizeChunkBaseVisibilitySession(chunkKey, now);
    terrainPerfState.chunkBaseRole.visibilityByChunk.delete(chunkKey);
  }

  function getChunkBaseRoleSummary() {
    const roleState = terrainPerfState.chunkBaseRole;
    const visibleSessionSummary = summarizeNumberSet(roleState.visibleSessions);
    return {
      currentVisibleChunkCount: roleState.currentVisibleChunkCount,
      currentHiddenByReadyLeafCount: roleState.currentHiddenByReadyLeafCount,
      buildStarts: roleState.buildStarts,
      buildCompletes: roleState.buildCompletes,
      hideByLeafReadyCount: roleState.hideByLeafReadyCount,
      visibleDwellMs: visibleSessionSummary
    };
  }
  const terrainDetailTex = createPackedTerrainDetailTexture();
  const terrainTextureLoader = new THREE.TextureLoader();
  const GRASS_TEXTURE_SCALE = 0.08;
  const GRASS_TEXTURE_STRENGTH = 1.0;
  const GRASS_TEXTURE_NEAR_START = 150;
  const GRASS_TEXTURE_NEAR_END = 3200;
  const GRASS_TEXTURE_ENABLED = true;
  const GRASS_DEBUG_MASK_ENABLED = false;
  const GRASS_BUMP_ENABLED = true;
  const GRASS_BUMP_SCALE = 2.0;
  const GRASS_NORMAL_ENABLED = false;
  const GRASS_NORMAL_SCALE = 0.8;
  const grassTexture = terrainTextureLoader.load('/world/textures/processed/grass/grass_albedo.jpg');
  const grassBumpTexture = terrainTextureLoader.load('/world/textures/processed/grass/grass_bump.png');
  let grassNormalTexture = null;
  let terrainDebugRuntime = null;

  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  terrainDetailTex.anisotropy = maxAnisotropy;
  for (const texture of [grassTexture, grassBumpTexture]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipMapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = maxAnisotropy;
  }
  grassTexture.colorSpace = THREE.SRGBColorSpace;
  grassBumpTexture.colorSpace = THREE.NoColorSpace;
  const terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02, flatShading: false });
  const terrainFarMaterial = terrainMaterial.clone();
  terrainFarMaterial.roughness = 1.0;
  terrainFarMaterial.metalness = 0.0;

  const terrainDetailUniforms = {
    uTerrainDetailTex: { value: terrainDetailTex },
    uTerrainGrassTex: { value: grassTexture },
    uTerrainDetailScale: { value: 0.16 },
    uTerrainDetailStrength: { value: 1.1 },
    uTerrainSlopeStart: { value: 0.26 },
    uTerrainSlopeEnd: { value: 0.62 },
    uTerrainRockHeightStart: { value: 220.0 },
    uTerrainRockHeightEnd: { value: 560.0 },
    uTerrainAtmosStrength: { value: 0.25 },
    uTerrainGrassTexScale: { value: GRASS_TEXTURE_SCALE },
    uTerrainGrassTexStrength: { value: GRASS_TEXTURE_STRENGTH },
    uTerrainGrassTexNearStart: { value: GRASS_TEXTURE_NEAR_START },
    uTerrainGrassTexNearEnd: { value: GRASS_TEXTURE_NEAR_END },
    uTerrainGrassShowTexture: { value: GRASS_TEXTURE_ENABLED ? 1.0 : 0.0 },
    uTerrainGrassDebugMask: { value: GRASS_DEBUG_MASK_ENABLED ? 1.0 : 0.0 },
    uTerrainSandColor: { value: new THREE.Color(194 / 255, 178 / 255, 128 / 255) },
    uTerrainGrassColor: { value: new THREE.Color(42 / 255, 75 / 255, 42 / 255) },
    uTerrainRockColor: { value: new THREE.Color(85 / 255, 85 / 255, 85 / 255) },
    uTerrainSnowColor: { value: new THREE.Color(1, 1, 1) }
  };

  setupTerrainMaterial(
    terrainMaterial,
    terrainDetailUniforms,
    atmosphereUniforms,
    waterTimeUniform,
    false,
    { shadowContrast: terrainDebugSettings.terrainShadowContrast }
  );
  setupTerrainMaterial(
    terrainFarMaterial,
    terrainDetailUniforms,
    atmosphereUniforms,
    waterTimeUniform,
    true,
    { shadowContrast: terrainDebugSettings.terrainShadowContrast }
  );
  function rebuildGrassNormalTexture() {
    if (!grassBumpTexture.image) return;
    const nextNormalTexture = createNormalMapFromHeightImage(grassBumpTexture.image, 2.4);
    if (!nextNormalTexture) return;
    nextNormalTexture.anisotropy = maxAnisotropy;
    nextNormalTexture.repeat.copy(grassBumpTexture.repeat);
    if (grassNormalTexture) grassNormalTexture.dispose?.();
    grassNormalTexture = nextNormalTexture;
    applyTerrainGrassMapSettings();
  }
  if (grassBumpTexture.image) rebuildGrassNormalTexture();
  else {
    grassBumpTexture.onUpdate = () => {
      grassBumpTexture.onUpdate = null;
      rebuildGrassNormalTexture();
    };
  }
  setColorFromLinearArray(waterSurfaceUniforms.uWaterFoamColor.value, getWaterDepthSrgb(0));
  setColorFromLinearArray(waterSurfaceUniforms.uWaterShallowColor.value, getWaterDepthSrgb(WATER_DEPTH_BANDS.shallowStart + 0.01));
  setColorFromLinearArray(waterSurfaceUniforms.uWaterDeepColor.value, getWaterDepthSrgb(WATER_DEPTH_BANDS.deepEnd + 1));
  terrainDebugRuntime = createTerrainDebugConfigRuntime({
    terrainDebugSettings,
    CHUNK_SIZE,
    terrainMaterial,
    terrainFarMaterial,
    terrainDetailUniforms,
    atmosphereUniforms,
    waterTimeUniform,
    waterMaterial,
    waterFarMaterial,
    waterSurfaceUniforms,
    baseWaterNormalScale,
    grassTexture,
    grassBumpTexture,
    getGrassNormalTexture: () => grassNormalTexture,
    grassSettings: {
      scale: GRASS_TEXTURE_SCALE,
      strength: GRASS_TEXTURE_STRENGTH,
      nearStart: GRASS_TEXTURE_NEAR_START,
      nearEnd: GRASS_TEXTURE_NEAR_END,
      enabled: GRASS_TEXTURE_ENABLED,
      debugMaskEnabled: GRASS_DEBUG_MASK_ENABLED,
      bumpEnabled: GRASS_BUMP_ENABLED,
      bumpScale: GRASS_BUMP_SCALE,
      normalEnabled: GRASS_NORMAL_ENABLED,
      normalScale: GRASS_NORMAL_SCALE
    },
    distanceToLeafBoundsSq,
    atmosphereCameraPos,
    getActiveLeaves: () => activeLeaves.values(),
    getTerrainChunks: () => terrainChunks.values(),
    syncSurfaceShadowReception,
    invalidateActiveLeafSurfaces,
    rebuildHydrologyMeshes,
    invalidateChunkProps,
    updateTerrain
  });
  applyTerrainDebugSettings({ rebuildSurfaces: false, refreshSelection: false });
  const pooledLeafWaterMaterials = [];
  const pooledLeafWaterDepthTextures = new Map();

  function acquireWaterDepthTextureFromPayload(payload) {
    if (!payload?.data || !Number.isFinite(payload.size)) return null;
    const size = Math.max(1, Math.floor(payload.size));
    const pool = pooledLeafWaterDepthTextures.get(size);
    const texture = pool && pool.length > 0
      ? pool.pop()
      : new THREE.DataTexture(payload.data, size, size, THREE.RGBAFormat);
    texture.image = texture.image || {};
    texture.image.data = payload.data;
    texture.image.width = size;
    texture.image.height = size;
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  function recycleWaterDepthTexture(texture) {
    if (!texture?.image) return;
    const size = Number(texture.image.width);
    if (!Number.isFinite(size) || size <= 0) return;
    let pool = pooledLeafWaterDepthTextures.get(size);
    if (!pool) {
      pool = [];
      pooledLeafWaterDepthTextures.set(size, pool);
    }
    pool.push(texture);
  }

  function acquireLeafWaterMaterial(waterDepthTexture, node) {
    const material = pooledLeafWaterMaterials.pop() || waterMaterial.clone();
    material.normalMap = waterMaterial.normalMap;
    material.normalScale = material.normalScale?.clone?.() || waterMaterial.normalScale.clone();
    const waterUniforms = material.userData?.waterSurfaceUniforms || {
      uWaterDepthTex: { value: null },
      uWaterBoundsMin: { value: new THREE.Vector2() },
      uWaterBoundsSize: { value: new THREE.Vector2() },
      uWaterDepthScale: { value: WATER_DEPTH_BANDS.deepEnd },
      uWaterFoamDepth: { value: WATER_DEPTH_BANDS.foam },
      uWaterShallowStart: { value: WATER_DEPTH_BANDS.shallowStart },
      uWaterShallowEnd: { value: WATER_DEPTH_BANDS.shallowEnd },
      uWaterDeepEnd: { value: WATER_DEPTH_BANDS.deepEnd },
      uWaterFoamColor: { value: waterSurfaceUniforms.uWaterFoamColor.value.clone() },
      uWaterShallowColor: { value: waterSurfaceUniforms.uWaterShallowColor.value.clone() },
      uWaterDeepColor: { value: waterSurfaceUniforms.uWaterDeepColor.value.clone() }
    };
    if (!waterUniforms.uWaterBoundsMin || typeof waterUniforms.uWaterBoundsMin !== 'object') {
      waterUniforms.uWaterBoundsMin = { value: new THREE.Vector2() };
    } else if (!waterUniforms.uWaterBoundsMin.value || typeof waterUniforms.uWaterBoundsMin.value.set !== 'function') {
      waterUniforms.uWaterBoundsMin.value = new THREE.Vector2();
    }
    if (!waterUniforms.uWaterBoundsSize || typeof waterUniforms.uWaterBoundsSize !== 'object') {
      waterUniforms.uWaterBoundsSize = { value: new THREE.Vector2() };
    } else if (!waterUniforms.uWaterBoundsSize.value || typeof waterUniforms.uWaterBoundsSize.value.set !== 'function') {
      waterUniforms.uWaterBoundsSize.value = new THREE.Vector2();
    }
    if (!waterUniforms.uWaterFoamColor?.value || typeof waterUniforms.uWaterFoamColor.value.copy !== 'function') {
      waterUniforms.uWaterFoamColor = { value: waterSurfaceUniforms.uWaterFoamColor.value.clone() };
    }
    if (!waterUniforms.uWaterShallowColor?.value || typeof waterUniforms.uWaterShallowColor.value.copy !== 'function') {
      waterUniforms.uWaterShallowColor = { value: waterSurfaceUniforms.uWaterShallowColor.value.clone() };
    }
    if (!waterUniforms.uWaterDeepColor?.value || typeof waterUniforms.uWaterDeepColor.value.copy !== 'function') {
      waterUniforms.uWaterDeepColor = { value: waterSurfaceUniforms.uWaterDeepColor.value.clone() };
    }
    waterUniforms.uWaterDepthTex.value = waterDepthTexture;
    waterUniforms.uWaterBoundsMin.value.set(node.minX, node.minZ);
    waterUniforms.uWaterBoundsSize.value.set(node.size, node.size);
    waterUniforms.uWaterDepthScale.value = WATER_DEPTH_BANDS.deepEnd;
    waterUniforms.uWaterFoamDepth.value = WATER_DEPTH_BANDS.foam;
    waterUniforms.uWaterShallowStart.value = WATER_DEPTH_BANDS.shallowStart;
    waterUniforms.uWaterShallowEnd.value = WATER_DEPTH_BANDS.shallowEnd;
    waterUniforms.uWaterDeepEnd.value = WATER_DEPTH_BANDS.deepEnd;
    waterUniforms.uWaterFoamColor.value.copy(waterSurfaceUniforms.uWaterFoamColor.value);
    waterUniforms.uWaterShallowColor.value.copy(waterSurfaceUniforms.uWaterShallowColor.value);
    waterUniforms.uWaterDeepColor.value.copy(waterSurfaceUniforms.uWaterDeepColor.value);
    configureWaterMaterialDebug(material, {
      isFarLOD: false,
      waterUniforms
    });
    return material;
  }

  function recycleLeafWaterMaterial(material) {
    if (!material) return;
    const waterUniforms = material.userData?.waterSurfaceUniforms || null;
    if (waterUniforms?.uWaterDepthTex) {
      waterUniforms.uWaterDepthTex.value = null;
    }
    pooledLeafWaterMaterials.push(material);
  }
  const leafSurfaceRuntime = createTerrainLeafSurfaceRuntime({
    scene,
    activeLeaves,
    readyLeafSurfaceChunkCounts,
    terrainMaterial,
    waterMaterial,
    waterSurfaceUniforms,
    dispatchTerrainWorker,
    getStaticSampler,
    getNativeSurfaceResolution,
    getPhysicsState: () => physicsState,
    isBootstrapMode: () => bootstrapMode,
    CHUNK_SIZE,
    HIGH_LOD_SURFACE_RESOLUTION,
    skirtDepth,
    SEA_LEVEL,
    WATER_DEPTH_BANDS,
    srgbArrayToLinear,
    getTerrainBaseSrgb,
    getWaterDepthSrgb,
    getTerrainSurfaceWeights,
    getTerrainMaskSet,
    configureWaterMaterialDebug,
    acquireLeafWaterMaterial,
    acquireWaterDepthTextureFromPayload,
    shouldSurfaceCastShadow,
    shouldSurfaceReceiveShadow,
    shouldWaterReceiveShadow,
    disposeLeafRuntimeLeaf,
    recordLeafCompletion,
    recordLeafBuildBreakdown,
    recordLeafBuildApplyTiming,
    recordTerrainGenerationPerf,
    resolveRetiredLeafTransitions,
    syncLeafSurfaceTransitionVisibility,
    syncChunkBaseSurfaceVisibility,
    distanceToLeafBoundsSq
  });
  const {
    pendingLeafBuilds,
    pendingLeafBuildIds,
    flushCompletedLeafApplies,
    hasPendingLeafApplies
  } = leafSurfaceRuntime;

  function disposeLeafRuntimeLeaf(leafState) {
    if (!leafState) return;
    if (leafState.readyChunkCoverageActive) {
      for (const key of leafState.chunkKeys || []) {
        const nextCount = (readyLeafSurfaceChunkCounts.get(key) || 0) - 1;
        if (nextCount > 0) readyLeafSurfaceChunkCounts.set(key, nextCount);
        else readyLeafSurfaceChunkCounts.delete(key);
      }
      leafState.readyChunkCoverageActive = false;
    }
    if (leafState.terrainMesh) {
      scene.remove(leafState.terrainMesh);
      leafState.terrainMesh.geometry?.dispose?.();
      leafState.terrainMesh = null;
    }
    if (leafState.waterMesh) {
      scene.remove(leafState.waterMesh);
      recycleLeafWaterMaterial(leafState.waterMesh.material);
      leafState.waterMesh.geometry?.dispose?.();
      leafState.waterMesh = null;
    }
    if (leafState.waterDepthTexture) {
      recycleWaterDepthTexture(leafState.waterDepthTexture);
      leafState.waterDepthTexture = null;
    }
    leafState.hasWater = false;
    leafState.workerBuildPromise = null;
    leafState.workerBuildStartedAtMs = null;
    dirtyLeafShadowIds.delete(leafState.leafId);
  }

  function createNativeLeafRuntime(leaf) {
    const now = performance.now();
    return {
      leafId: leaf.leafId,
      nodeId: leaf.nodeId,
      depth: leaf.depth,
      bounds: leaf.bounds,
      size: leaf.size,
      chunkLod: leaf.chunkLod,
      blockingReady: leaf.blockingReady,
      chunkKeys: [...(leaf.chunkKeys || [])],
      state: 'pending_surface',
      terrainMesh: null,
      waterMesh: null,
      waterDepthTexture: null,
      hasWater: false,
      surfaceResolution: null,
      firstSelectedAtMs: now,
      lastSelectedAtMs: now,
      pendingSinceAtMs: now,
      enqueuedAtMs: now,
      lastBuildStartedAtMs: null,
      workerBuildStartedAtMs: null,
      workerBuildPromise: null,
      lastSurfaceReadyAtMs: null,
      lastWaitMs: null,
      maxWaitMs: null,
      buildVersion: 0,
      readyChunkCoverageActive: false,
      retired: false
    };
  }

  function createChunkBounds(cx, cz) {
    return {
      minX: cx * CHUNK_SIZE,
      minZ: cz * CHUNK_SIZE,
      maxX: (cx + 1) * CHUNK_SIZE,
      maxZ: (cz + 1) * CHUNK_SIZE
    };
  }

  function markLeafPendingSurface(leafState, { resetPendingStart = false } = {}) {
    if (!leafState) return;
    const now = performance.now();
    if (leafState.readyChunkCoverageActive) {
      for (const key of leafState.chunkKeys || []) {
        const nextCount = (readyLeafSurfaceChunkCounts.get(key) || 0) - 1;
        if (nextCount > 0) readyLeafSurfaceChunkCounts.set(key, nextCount);
        else readyLeafSurfaceChunkCounts.delete(key);
      }
      leafState.readyChunkCoverageActive = false;
    }
    leafState.state = 'pending_surface';
    leafState.pendingSinceAtMs = resetPendingStart || !Number.isFinite(leafState.pendingSinceAtMs)
      ? now
      : leafState.pendingSinceAtMs;
    leafState.enqueuedAtMs = now;
  }

  function recordLeafCompletion(leafState, now) {
    if (!leafState) return;
    const waitMs = Number.isFinite(leafState.pendingSinceAtMs) ? Math.max(0, now - leafState.pendingSinceAtMs) : null;
    leafState.lastSurfaceReadyAtMs = now;
    leafState.lastWaitMs = waitMs;
    leafState.maxWaitMs = Math.max(leafState.maxWaitMs || 0, waitMs || 0);
    leafState.pendingSinceAtMs = null;
    leafResponsivenessState.recentCompletions.push({
      leafId: leafState.leafId,
      waitMs,
      selectedToReadyMs: Math.max(0, now - (leafState.firstSelectedAtMs || now)),
      blockingReady: leafState.blockingReady,
      size: leafState.size ?? null,
      completedAtMs: now
    });
    if (leafResponsivenessState.recentCompletions.length > leafResponsivenessState.maxRecentCompletions) {
      leafResponsivenessState.recentCompletions.splice(
        0,
        leafResponsivenessState.recentCompletions.length - leafResponsivenessState.maxRecentCompletions
      );
    }
  }

  function getNativeSurfaceResolution(nodeSize, { bootstrapBlocking = false } = {}) {
    let resolution = 2;
    if (nodeSize <= terrainDebugSettings.resolution64MaxNodeSize) resolution = HIGH_LOD_SURFACE_RESOLUTION;
    else if (nodeSize <= terrainDebugSettings.resolution32MaxNodeSize) resolution = 32;
    else if (nodeSize <= terrainDebugSettings.resolution16MaxNodeSize) resolution = 16;
    else if (nodeSize <= terrainDebugSettings.resolution8MaxNodeSize) resolution = 8;
    else if (nodeSize <= terrainDebugSettings.resolution4MaxNodeSize) resolution = 4;

    if (bootstrapMode && bootstrapBlocking) {
      if (resolution >= HIGH_LOD_SURFACE_RESOLUTION) return 32;
      if (resolution >= 32) return 16;
      if (resolution >= 16) return 8;
      if (resolution >= 8) return 4;
    }

    return resolution;
  }

  function normalizeTerrainDebugSettings() {
    terrainDebugRuntime?.normalizeTerrainDebugSettings();
  }

  function applyTerrainWireframeSetting() {
    terrainDebugRuntime?.applyTerrainWireframeSetting();
  }

  function applyTerrainMaterialDebugSettings() {
    terrainDebugRuntime?.applyTerrainMaterialDebugSettings();
  }

  function shouldSurfaceReceiveShadow(bounds = null) {
    return terrainDebugRuntime?.shouldSurfaceReceiveShadow(bounds) ?? false;
  }

  function shouldSurfaceCastShadow(bounds = null) {
    return terrainDebugRuntime?.shouldSurfaceCastShadow(bounds) ?? false;
  }

  function shouldWaterReceiveShadow(bounds = null) {
    return terrainDebugRuntime?.shouldWaterReceiveShadow(bounds) ?? false;
  }

  function configureWaterMaterialDebug(material, options = {}) {
    terrainDebugRuntime?.configureWaterMaterialDebug(material, options);
  }

  function applyWaterDebugSettings() {
    terrainDebugRuntime?.applyWaterDebugSettings();
  }

  function applyTerrainGrassMapSettings() {
    terrainDebugRuntime?.applyTerrainGrassMapSettings();
  }

  function applyTerrainGrassShaderSettings() {
    terrainDebugRuntime?.applyTerrainGrassShaderSettings();
  }

  function invalidateActiveLeafSurfaces() {
    clearWarmChunkCache();
    for (const leafState of activeLeaves.values()) {
      if (leafState.retired) continue;
      if (leafState.terrainMesh || leafState.waterMesh) {
        disposeLeafRuntimeLeaf(leafState);
      }
      leafState.state = 'pending_surface';
      enqueueLeafBuild(leafState, getLeafBuildPriority(leafState));
      markLeafShadowDirty(leafState.leafId);
    }
  }

  function refreshBakedTerrain() {
    invalidateActiveLeafSurfaces();
    rebuildHydrologyMeshes();
    updateTerrain();
  }

  function clearWarmChunkCache() {
    chunkRuntime.clearWarmChunkCache();
  }

  function cacheWarmChunkState(key, chunkState) {
    return chunkRuntime.cacheWarmChunkState(key, chunkState);
  }

  function restoreWarmChunkState(key, lod) {
    return chunkRuntime.restoreWarmChunkState(key, lod);
  }

  function invalidateChunkProps() {
    chunkRuntime.invalidateChunkProps();
  }

  /**
   * @param {{ rebuildSurfaces?: boolean, refreshSelection?: boolean, rebuildProps?: boolean, rebuildHydrology?: boolean }} [options]
   */
  function applyTerrainDebugSettings({ rebuildSurfaces = false, refreshSelection = false, rebuildProps = false, rebuildHydrology = false } = {}) {
    terrainDebugRuntime?.applyTerrainDebugSettings({
      rebuildSurfaces,
      refreshSelection,
      rebuildProps,
      rebuildHydrology
    });
  }

  function enqueueLeafBuild(leafState, priority = 0) {
    leafSurfaceRuntime.enqueueLeafBuild(leafState, priority);
  }

  function getLeafBuildPriority(leafState) {
    return leafSurfaceRuntime.getLeafBuildPriority(leafState);
  }

  function boundsOverlap(boundsA, boundsB) {
    if (!boundsA || !boundsB) return false;
    return !(
      boundsA.maxX <= boundsB.minX
      || boundsA.minX >= boundsB.maxX
      || boundsA.maxZ <= boundsB.minZ
      || boundsA.minZ >= boundsB.maxZ
    );
  }

  function shouldRetainLeafDuringTransition(leafState, selectedLeafStates) {
    if (!leafState?.terrainMesh) return false;
    for (const nextLeafState of selectedLeafStates) {
      if (!nextLeafState || nextLeafState.retired) continue;
      if (!boundsOverlap(leafState.bounds, nextLeafState.bounds)) continue;
      if (nextLeafState.state !== 'surface_ready') {
        return true;
      }
    }
    return false;
  }

  function collectSelectedLeafStates(selectedLeaves = []) {
    const selectedLeafStates = [];
    for (const leaf of selectedLeaves || []) {
      const leafState = activeLeaves.get(leaf.leafId);
      if (leafState) selectedLeafStates.push(leafState);
    }
    return selectedLeafStates;
  }

  function countBlockingChunks(nextBlockingLeafIds) {
    let blockingChunkCount = 0;
    for (const owners of chunkLeafOwners.values()) {
      for (const ownerId of owners) {
        if (nextBlockingLeafIds.has(ownerId)) {
          blockingChunkCount += 1;
          break;
        }
      }
    }
    return blockingChunkCount;
  }

  function countActiveSelectedLeaves() {
    let selectedLeafCount = 0;
    for (const leaf of activeLeaves.values()) {
      if (!leaf?.retired) selectedLeafCount += 1;
    }
    return selectedLeafCount;
  }

  function resolveRetiredLeafTransitions(selectedLeafStates = []) {
    const visibilityDirtyChunkKeys = new Set<string>();
    const retiredLeafIdsToDispose = [];

    for (const [leafId, leafState] of activeLeaves.entries()) {
      if (!leafState?.retired || !leafState.bounds) continue;
      let foundOverlap = false;
      let transitionReady = true;
      for (const selectedLeafState of selectedLeafStates) {
        if (!selectedLeafState || selectedLeafState.retired) continue;
        if (!boundsOverlap(leafState.bounds, selectedLeafState.bounds)) continue;
        foundOverlap = true;
        if (selectedLeafState.state !== 'surface_ready' || !selectedLeafState.terrainMesh) {
          transitionReady = false;
          break;
        }
        if (selectedLeafState.hasWater && !selectedLeafState.waterMesh) {
          transitionReady = false;
          break;
        }
      }
      if (!foundOverlap) transitionReady = true;
      if (transitionReady) {
        retiredLeafIdsToDispose.push(leafId);
        addChunkKeysToSet(visibilityDirtyChunkKeys, leafState.chunkKeys);
      }
    }

    for (const leafId of retiredLeafIdsToDispose) {
      const leafState = activeLeaves.get(leafId);
      if (!leafState) continue;
      disposeLeafRuntimeLeaf(leafState);
      activeLeaves.delete(leafId);
      pendingLeafBuildIds.delete(leafId);
    }

    return visibilityDirtyChunkKeys;
  }

  function syncLeafSurfaceTransitionVisibility(selectedLeafStates = []) {
    const retainedLeafStates = [];
    for (const leafState of activeLeaves.values()) {
      if (leafState?.retired && leafState.terrainMesh) retainedLeafStates.push(leafState);
    }
    retainedLeafStates.sort((a, b) => {
      const sizeDelta = (b.size ?? 0) - (a.size ?? 0);
      if (sizeDelta !== 0) return sizeDelta;
      return (a.firstSelectedAtMs ?? 0) - (b.firstSelectedAtMs ?? 0);
    });
    const visibleRetainedLeafStates = [];
    for (const retainedLeafState of retainedLeafStates) {
      const hiddenByOtherRetainedLeaf = visibleRetainedLeafStates.some((visibleRetainedLeafState) =>
        boundsOverlap(visibleRetainedLeafState.bounds, retainedLeafState.bounds)
      );
      const visible = !hiddenByOtherRetainedLeaf;
      if (retainedLeafState.terrainMesh) retainedLeafState.terrainMesh.visible = visible;
      if (retainedLeafState.waterMesh) retainedLeafState.waterMesh.visible = visible;
      if (visible) visibleRetainedLeafStates.push(retainedLeafState);
    }
    for (const leafState of selectedLeafStates) {
      const terrainMesh = leafState?.terrainMesh || null;
      const waterMesh = leafState?.waterMesh || null;
      if (!terrainMesh && !waterMesh) continue;
      const hiddenByRetainedLeaf = visibleRetainedLeafStates.some((retainedLeafState) =>
        boundsOverlap(retainedLeafState.bounds, leafState.bounds)
      );
      const visible = !hiddenByRetainedLeaf;
      if (terrainMesh) terrainMesh.visible = visible;
      if (waterMesh) waterMesh.visible = visible;
    }
  }

  function processLeafBuildQueue(maxBuildsPerFrame = 4) {
    return leafSurfaceRuntime.processLeafBuildQueue(maxBuildsPerFrame);
  }

  function flushPendingLeafAppliesBudget(maxAppliesPerFrame = 1, timeBudgetMs = 3) {
    return flushCompletedLeafApplies(maxAppliesPerFrame, timeBudgetMs);
  }

  // Load static world data after uniforms exist so the moving road-marking atlas can populate immediately.
  Promise.resolve(loadStaticWorldFn()).then(success => {
    if (success && windowRef?.fsimWorld) {
      quadtreeSelectionController = createQuadtreeSelectionController({
        sampler: getStaticSampler(),
        chunkSize: CHUNK_SIZE,
        blockingRadius: terrainDebugSettings.selectionBlockingRadius,
        interestRadius: terrainDebugSettings.selectionInterestRadius,
        minCellSize: terrainDebugSettings.selectionMinCellSize,
        splitDistanceFactor: terrainDebugSettings.selectionSplitDistanceFactor,
        maxDepth: terrainDebugSettings.selectionMaxDepth
      });
      rebuildHydrologyMeshes();
    }
  });

  const treeBillboardGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
  treeBillboardGeo.translate(0, 0.5, 0);
  const treeGroundGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
  treeGroundGeo.rotateX(-Math.PI / 2);
  const treeTrunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1, 6);
  treeTrunkGeo.translate(0, 0.5, 0);
  const treeTextures = {
    broadleaf: createTreeBillboardTexture('broadleaf', { crownOnly: true }),
    poplar: createTreeBillboardTexture('poplar', { crownOnly: true }),
    dry: createTreeBillboardTexture('dry', { crownOnly: true })
  };
  const treeContactTexture = createTreeContactTexture();
  const treeCanopyMats = {
    broadleaf: makeTreeBillboardMaterial(treeTextures.broadleaf, 0x9bb784, { cameraFacing: true, lockYAxis: false }),
    poplar: makeTreeBillboardMaterial(treeTextures.poplar, 0xa7be88, { cameraFacing: true, lockYAxis: false }),
    dry: makeTreeBillboardMaterial(treeTextures.dry, 0xb3af7e, { cameraFacing: true, lockYAxis: false })
  };
  const treeDepthMats = {
    broadleaf: makeTreeDepthMaterial(treeTextures.broadleaf, tempMainCameraPosUniform, { cameraFacing: true, lockYAxis: false, shadowFadeNear: 1400, shadowFadeFar: 2100 }),
    poplar: makeTreeDepthMaterial(treeTextures.poplar, tempMainCameraPosUniform, { cameraFacing: true, lockYAxis: false, shadowFadeNear: 1400, shadowFadeFar: 2100 }),
    dry: makeTreeDepthMaterial(treeTextures.dry, tempMainCameraPosUniform, { cameraFacing: true, lockYAxis: false, shadowFadeNear: 1400, shadowFadeFar: 2100 })
  };
  const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4d31, roughness: 0.94, metalness: 0.0 });
  const treeTypeConfigs = {
    broadleaf: { canopyMat: treeCanopyMats.broadleaf, depthMat: treeDepthMats.broadleaf, hRange: [12, 21], wScale: 0.68, baseTint: new THREE.Color(0x9bb784) },
    poplar: { canopyMat: treeCanopyMats.poplar, depthMat: treeDepthMats.poplar, hRange: [13, 24], wScale: 0.4, baseTint: new THREE.Color(0xa7be88) },
    dry: { canopyMat: treeCanopyMats.dry, depthMat: treeDepthMats.dry, hRange: [9, 17], wScale: 0.58, baseTint: new THREE.Color(0xb3af7e) }
  };
  const treeGroundMats = {
    near: new THREE.MeshBasicMaterial({ map: treeContactTexture, color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false }),
    mid: new THREE.MeshBasicMaterial({ map: treeContactTexture, color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false })
  };
  treeGroundMats.near.toneMapped = false;
  treeGroundMats.mid.toneMapped = false;

  const hullGeo = new THREE.BoxGeometry(2.5, 1.2, 8); hullGeo.translate(0, 0.6, 0);
  const cabinGeo = new THREE.BoxGeometry(2.0, 1.5, 3); cabinGeo.translate(0, 1.9, -1);
  const mastGeo = new THREE.CylinderGeometry(0.07, 0.08, 1.8, 6); mastGeo.translate(0, 2.8, 0.2);
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.6 });
  const mastMat = new THREE.MeshStandardMaterial({ color: 0xd9d9d9, roughness: 0.4, metalness: 0.6 });

  const baseBuildingGeo = new THREE.BoxGeometry(1, 1, 1); baseBuildingGeo.translate(0, 0.5, 0);
  const detailedBuildingMats = {
    commercial: createDetailedBuildingMat('commercial', tempMainCameraPosUniform),
    residential: createDetailedBuildingMat('residential', tempMainCameraPosUniform),
    industrial: createDetailedBuildingMat('industrial', tempMainCameraPosUniform)
  };
  const baseBuildingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.3 });
  const roofCapGeo = new THREE.BoxGeometry(1.06, 0.18, 1.06); roofCapGeo.translate(0, 0.09, 0);
  const roofCapMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.1 });
  const podiumGeo = new THREE.BoxGeometry(1.02, 1, 1.02); podiumGeo.translate(0, 0.5, 0);
  const podiumMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0.12 });
  const spireGeo = new THREE.CylinderGeometry(0.06, 0.12, 1, 8); spireGeo.translate(0, 0.5, 0);
  const spireMat = new THREE.MeshStandardMaterial({ color: 0xc7c7c7, roughness: 0.3, metalness: 0.9 });
  const hvacGeo = new THREE.BoxGeometry(1, 1, 1); hvacGeo.translate(0, 0.5, 0);
  const hvacMat = new THREE.MeshStandardMaterial({ color: 0x909090, roughness: 0.7, metalness: 0.4 });
  const windmillTowerGeo = new THREE.CylinderGeometry(0.5, 0.7, 1, 10); windmillTowerGeo.translate(0, 0.5, 0);
  const windmillNacelleGeo = new THREE.BoxGeometry(1, 1, 1); windmillNacelleGeo.translate(0.5, 0, 0);
  const windmillHubGeo = new THREE.SphereGeometry(0.5, 10, 10);
  const windmillBladeGeo = new THREE.BoxGeometry(0.14, 1, 0.06); windmillBladeGeo.translate(0, 0.5, 0);
  const windmillTowerMat = new THREE.MeshStandardMaterial({ color: 0xe7ebef, roughness: 0.82, metalness: 0.08 });
  const windmillNacelleMat = new THREE.MeshStandardMaterial({ color: 0xdfe5ea, roughness: 0.78, metalness: 0.1 });
  const windmillHubMat = new THREE.MeshStandardMaterial({ color: 0xc8d0d7, roughness: 0.68, metalness: 0.14 });
  const windmillBladeMat = new THREE.MeshStandardMaterial({ color: 0xf7f9fb, roughness: 0.7, metalness: 0.04 });

  // Apply distance-based pop-in to all plain building materials
  [baseBuildingMat, roofCapMat, podiumMat, spireMat, hvacMat].forEach(mat => setupBuildingPopIn(mat, tempMainCameraPosUniform));


  const dummy = new THREE.Object3D();

  function getPooledInstancedMesh(geometry, material, count, options = {}) {
    return chunkRuntime.getPooledInstancedMesh(geometry, material, count, options);
  }

  function disposeChunkGroup(chunkGroup) {
    chunkRuntime.disposeChunkGroup(chunkGroup);
  }

  function getChunkBaseSurfaceMeshes(chunkGroup) {
    return chunkRuntime.getChunkBaseSurfaceMeshes(chunkGroup);
  }

  function setChunkBaseSurfaceMeshes(chunkGroup, terrainMesh, waterMesh) {
    chunkRuntime.setChunkBaseSurfaceMeshes(chunkGroup, terrainMesh, waterMesh);
  }

  function addChunkKeysToSet(target, chunkKeys) {
    if (!target || !chunkKeys) return;
    for (const key of chunkKeys) {
      target.add(key);
    }
  }

  function syncChunkBaseSurfaceVisibility(chunkKeys = null) {
    chunkRuntime.syncChunkBaseSurfaceVisibility(chunkKeys);
  }

  function syncSurfaceShadowReception({ forceFull = false } = {}) {
    const syncAll = forceFull || surfaceShadowSyncAllDirty;
    const leafEntries = syncAll
      ? activeLeaves.values()
      : Array.from(dirtyLeafShadowIds)
        .map((leafId) => activeLeaves.get(leafId))
        .filter(Boolean);
    for (const leafState of leafEntries) {
      if (leafState?.terrainMesh) {
        leafState.terrainMesh.castShadow = shouldSurfaceCastShadow(leafState.bounds);
        leafState.terrainMesh.receiveShadow = shouldSurfaceReceiveShadow(leafState.bounds);
      }
      if (leafState?.waterMesh) {
        leafState.waterMesh.receiveShadow = shouldWaterReceiveShadow(leafState.bounds);
      }
    }

    const syncChunkShadowEntry = (chunkKey, state) => {
      if (!state) return;
      const chunkBounds = state?.bounds || (
        Number.isFinite(state?.cx) && Number.isFinite(state?.cz)
          ? createChunkBounds(state.cx, state.cz)
          : null
      );
      const terrainMesh = state?.group?.userData?.chunkBaseTerrainMesh || null;
      const waterMesh = state?.group?.userData?.chunkBaseWaterMesh || null;
      if (terrainMesh) {
        terrainMesh.castShadow = shouldSurfaceCastShadow(chunkBounds);
        terrainMesh.receiveShadow = shouldSurfaceReceiveShadow(chunkBounds);
      }
      if (waterMesh) waterMesh.receiveShadow = shouldWaterReceiveShadow(chunkBounds);
    };
    if (syncAll) {
      for (const [chunkKey, state] of terrainChunks.entries()) {
        syncChunkShadowEntry(chunkKey, state);
      }
    } else {
      for (const chunkKey of dirtyChunkShadowKeys) {
        syncChunkShadowEntry(chunkKey, terrainChunks.get(chunkKey));
      }
    }
    dirtyLeafShadowIds.clear();
    dirtyChunkShadowKeys.clear();
    surfaceShadowSyncAllDirty = false;
    lastSurfaceShadowSyncPos.copy(atmosphereCameraPos);
    lastSurfaceShadowSyncAtMs = performance.now();
  }

  function getSurfaceCenter(bounds = null) {
    if (!bounds) return null;
    return {
      x: (bounds.minX + bounds.maxX) * 0.5,
      z: (bounds.minZ + bounds.maxZ) * 0.5
    };
  }

  function describeSurfaceShadowEntry(type, source, mesh, bounds) {
    if (!mesh || !bounds) return null;
    const focusX = atmosphereCameraPos.x;
    const focusZ = atmosphereCameraPos.z;
    const center = getSurfaceCenter(bounds);
    return {
      type,
      source,
      visible: mesh.visible === true,
      receiveShadow: mesh.receiveShadow === true,
      distanceToBounds: Math.round(Math.sqrt(distanceToLeafBoundsSq({ bounds }, focusX, focusZ))),
      center,
      bounds: {
        minX: Math.round(bounds.minX),
        minZ: Math.round(bounds.minZ),
        maxX: Math.round(bounds.maxX),
        maxZ: Math.round(bounds.maxZ)
      },
      material: {
        type: mesh.material?.type || null,
        roughness: Number.isFinite(mesh.material?.roughness) ? mesh.material.roughness : null,
        metalness: Number.isFinite(mesh.material?.metalness) ? mesh.material.metalness : null
      }
    };
  }

  function getNearestSurfaceShadowEntry(type) {
    let best = null;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    const focusX = atmosphereCameraPos.x;
    const focusZ = atmosphereCameraPos.z;

    for (const leafState of activeLeaves.values()) {
      const mesh = type === 'water' ? leafState?.waterMesh : leafState?.terrainMesh;
      if (!mesh || mesh.visible !== true || !leafState?.bounds) continue;
      const distanceSq = distanceToLeafBoundsSq(leafState.bounds ? { bounds: leafState.bounds } : null, focusX, focusZ);
      if (distanceSq >= bestDistanceSq) continue;
      bestDistanceSq = distanceSq;
      best = describeSurfaceShadowEntry(type, 'leaf', mesh, leafState.bounds);
      if (best) {
        best.leafId = leafState.leafId ?? null;
        best.surfaceState = leafState.state ?? null;
      }
    }

    for (const [chunkKey, state] of terrainChunks.entries()) {
      const mesh = type === 'water'
        ? state?.group?.userData?.chunkBaseWaterMesh || null
        : state?.group?.userData?.chunkBaseTerrainMesh || null;
      const bounds = state?.bounds || null;
      if (!mesh || mesh.visible !== true || !bounds) continue;
      const distanceSq = distanceToLeafBoundsSq({ bounds }, focusX, focusZ);
      if (distanceSq >= bestDistanceSq) continue;
      bestDistanceSq = distanceSq;
      best = describeSurfaceShadowEntry(type, 'chunk-base', mesh, bounds);
      if (best) {
        best.chunkKey = chunkKey;
        best.lod = state?.lod ?? null;
      }
    }

    return best;
  }

  function getSurfaceShadowDiagnostics() {
    return {
      focus: {
        x: Math.round(atmosphereCameraPos.x),
        y: Math.round(atmosphereCameraPos.y),
        z: Math.round(atmosphereCameraPos.z)
      },
      settings: {
        surfaceShadowDistance: terrainDebugSettings.surfaceShadowDistance,
        surfaceShadowFadeStart: atmosphereUniforms.uSurfaceShadowFadeStart.value,
        shadowCoverageExtent: atmosphereUniforms.uShadowCoverageExtent.value,
        shadowCoverageFadeStart: atmosphereUniforms.uShadowCoverageFadeStart.value,
        waterShadowMode: terrainDebugSettings.waterShadowMode,
        terrainShadowContrast: terrainDebugSettings.terrainShadowContrast,
        waterShadowContrast: terrainDebugSettings.waterShadowContrast
      },
      nearestTerrain: getNearestSurfaceShadowEntry('terrain'),
      nearestWater: getNearestSurfaceShadowEntry('water')
    };
  }

  function generateChunkBase(cx, cz, lod = 0) {
    /** @type {Parameters<typeof genBase>[3]} */
    const baseContext = /** @type {Parameters<typeof genBase>[3]} */ ({
      LOD_LEVELS,
      chunkPools,
      terrainMaterial,
      terrainFarMaterial,
      waterMaterial,
      waterFarMaterial,
      Noise,
      scene
    });
    return genBase(cx, cz, lod, baseContext, terrainChunks.get(`${cx}, ${cz}`)?.group || null)
      .then((group) => {
        const { terrainMesh, waterMesh } = getChunkBaseSurfaceMeshes(group);
        if (terrainMesh) {
          terrainMesh.visible = false;
          terrainMesh.receiveShadow = false;
        }
        if (waterMesh) {
          waterMesh.visible = false;
          waterMesh.receiveShadow = false;
        }
        return group;
      });
  }

  function generateChunkProps(chunkGroup, cx, cz, lod = 0) {
    return genProps(chunkGroup, cx, cz, lod, {
      LOD_LEVELS, Noise, treeBillboardGeo, treeGroundGeo, treeTrunkGeo, treeTrunkMat, treeGroundMats, treeTypeConfigs, detailedBuildingMats, baseBuildingMat, baseBuildingGeo,
      roofCapGeo, roofCapMat, podiumGeo, podiumMat, spireGeo, spireMat, hvacGeo, hvacMat, getPooledInstancedMesh,
      windmillTowerGeo, windmillTowerMat, windmillNacelleGeo, windmillNacelleMat, windmillHubGeo, windmillHubMat, windmillBladeGeo, windmillBladeMat,
      hullGeo, hullMat, cabinGeo, cabinMat, mastGeo, mastMat, dummy, atmosphereUniforms,
      terrainMaterial, terrainFarMaterial, terrainDetailUniforms, timeUniform: waterTimeUniform, terrainDebugSettings
    });
  }

  function enqueueChunkBuild(cx, cz, lod, priority) {
    chunkRuntime.enqueueChunkBuild(cx, cz, lod, priority);
  }

  function getChunkPriorityBoost(key) {
    const owners = chunkLeafOwners.get(key);
    if (!owners || owners.size === 0) return 0;

    let blockingOwners = 0;
    for (const ownerId of owners) {
      if (blockingLeafIds.has(ownerId)) {
        blockingOwners += 1;
      }
    }

    if (blockingOwners === 0) return 0;
    return 1000 + (blockingOwners * 10);
  }

  function distanceToLeafBoundsSq(leaf, x, z) {
    const bounds = leaf?.bounds || leaf;
    if (!bounds) return Infinity;
    const dx = x < bounds.minX ? bounds.minX - x : (x > bounds.maxX ? x - bounds.maxX : 0);
    const dz = z < bounds.minZ ? bounds.minZ - z : (z > bounds.maxZ ? z - bounds.maxZ : 0);
    return dx * dx + dz * dz;
  }

  function ensureQuadtreeSelectionController() {
    if (quadtreeSelectionController) return quadtreeSelectionController;
    const sampler = getStaticSampler();
    if (!sampler) return null;
    quadtreeSelectionController = createQuadtreeSelectionController({
      sampler,
      chunkSize: CHUNK_SIZE,
      blockingRadius: terrainDebugSettings.selectionBlockingRadius,
      interestRadius: terrainDebugSettings.selectionInterestRadius,
      minCellSize: terrainDebugSettings.selectionMinCellSize,
      splitDistanceFactor: terrainDebugSettings.selectionSplitDistanceFactor,
      maxDepth: terrainDebugSettings.selectionMaxDepth
    });
    return quadtreeSelectionController;
  }

  function getLeafStateForChunkKeys(chunkKeys) {
    let hasBaseGroup = true;
    let pendingBase = false;
    let error = false;

    for (const key of chunkKeys || []) {
      const state = terrainChunks.get(key);
      if (!state) {
        hasBaseGroup = false;
        pendingBase = true;
        continue;
      }

      const chunkHasBaseGroup = Boolean(state.group || state.pendingGroup);
      const chunkBaseReady = chunkHasBaseGroup && state.state !== 'building_base' && state.state !== 'error';
      hasBaseGroup = hasBaseGroup && chunkBaseReady;
      pendingBase = pendingBase || state.state === 'building_base' || !chunkHasBaseGroup;
      error = error || state.state === 'error';
    }

    if (error) return 'error';
    if (hasBaseGroup) return 'base_ready';
    if (pendingBase) return 'pending_base';
    return 'waiting';
  }

  function syncActiveLeaves(selectedLeaves, nextBlockingLeafIds, selectionRegion, mode) {
    chunkLeafOwners.clear();
    const visibilityDirtyChunkKeys = new Set();

    const selectedIds = new Set((selectedLeaves || []).map((leaf) => leaf.leafId));

    for (const leaf of selectedLeaves || []) {
      const existing = activeLeaves.get(leaf.leafId);
      const nextState = getLeafStateForChunkKeys(leaf.chunkKeys);
      let leafState = existing;

      if (!leafState) {
        leafState = createNativeLeafRuntime(leaf);
        activeLeaves.set(leaf.leafId, leafState);
        enqueueLeafBuild(leafState, getLeafBuildPriority(leafState));
        addChunkKeysToSet(visibilityDirtyChunkKeys, leafState.chunkKeys);
      } else {
        const previousChunkKeys = [...(leafState.chunkKeys || [])];
        const wasSurfaceReady = leafState.state === 'surface_ready';
        const hadReadyChunkCoverage = leafState.readyChunkCoverageActive === true;
        const changedNode = leafState.nodeId !== leaf.nodeId || leafState.depth !== leaf.depth || leafState.size !== leaf.size;
        leafState.nodeId = leaf.nodeId;
        leafState.depth = leaf.depth;
        leafState.bounds = leaf.bounds;
        leafState.size = leaf.size;
        leafState.chunkLod = leaf.chunkLod;
        leafState.blockingReady = nextBlockingLeafIds.has(leaf.leafId);
        leafState.chunkKeys = [...(leaf.chunkKeys || [])];
        leafState.retired = false;
        leafState.lastSelectedAtMs = performance.now();
        const desiredResolution = getNativeSurfaceResolution(leaf.size ?? CHUNK_SIZE, {
          bootstrapBlocking: nextBlockingLeafIds.has(leaf.leafId)
        });
        if (changedNode && leafState.terrainMesh) {
          markLeafPendingSurface(leafState, { resetPendingStart: true });
          enqueueLeafBuild(leafState, getLeafBuildPriority(leafState));
          markLeafShadowDirty(leafState.leafId);
          addChunkKeysToSet(visibilityDirtyChunkKeys, previousChunkKeys);
          addChunkKeysToSet(visibilityDirtyChunkKeys, leafState.chunkKeys);
        } else if (leafState.state === 'surface_ready' && leafState.surfaceResolution !== desiredResolution) {
          markLeafPendingSurface(leafState, { resetPendingStart: true });
          enqueueLeafBuild(leafState, getLeafBuildPriority(leafState));
          markLeafShadowDirty(leafState.leafId);
          addChunkKeysToSet(visibilityDirtyChunkKeys, leafState.chunkKeys);
        } else if (previousChunkKeys.length !== leafState.chunkKeys.length
          || previousChunkKeys.some((key, index) => key !== leafState.chunkKeys[index])) {
          if (hadReadyChunkCoverage) {
            for (const key of previousChunkKeys) {
              const nextCount = (readyLeafSurfaceChunkCounts.get(key) || 0) - 1;
              if (nextCount > 0) readyLeafSurfaceChunkCounts.set(key, nextCount);
              else readyLeafSurfaceChunkCounts.delete(key);
            }
            for (const key of leafState.chunkKeys || []) {
              readyLeafSurfaceChunkCounts.set(key, (readyLeafSurfaceChunkCounts.get(key) || 0) + 1);
            }
          }
          addChunkKeysToSet(visibilityDirtyChunkKeys, previousChunkKeys);
          addChunkKeysToSet(visibilityDirtyChunkKeys, leafState.chunkKeys);
          markLeafShadowDirty(leafState.leafId);
        } else if (wasSurfaceReady !== (leafState.state === 'surface_ready')) {
          addChunkKeysToSet(visibilityDirtyChunkKeys, leafState.chunkKeys);
          markLeafShadowDirty(leafState.leafId);
        }
      }

      if ((!leafState.terrainMesh || (leafState.hasWater && !leafState.waterMesh)) && leafState.state !== 'building_surface') {
        markLeafPendingSurface(leafState);
        markLeafShadowDirty(leafState.leafId);
        addChunkKeysToSet(visibilityDirtyChunkKeys, leafState.chunkKeys);
      } else if (leafState.state !== 'error' && leafState.state !== 'building_surface') {
        leafState.state = 'surface_ready';
      }

      leafState.state = leafState.state === 'surface_ready' ? 'surface_ready' : leafState.state;
      leafState.propState = nextState;
      leafState.retired = false;

      for (const key of leafState.chunkKeys) {
        let owners = chunkLeafOwners.get(key);
        if (!owners) {
          owners = new Set();
          chunkLeafOwners.set(key, owners);
        }
        owners.add(leafState.leafId);
      }
    }

    const selectedLeafStates = collectSelectedLeafStates(selectedLeaves);

    for (const [leafId, leafState] of activeLeaves.entries()) {
      if (selectedIds.has(leafId)) continue;
      if (shouldRetainLeafDuringTransition(leafState, selectedLeafStates)) {
        leafState.retired = true;
        leafState.blockingReady = false;
        markLeafShadowDirty(leafState.leafId);
        continue;
      }
      addChunkKeysToSet(visibilityDirtyChunkKeys, leafState.chunkKeys);
      disposeLeafRuntimeLeaf(leafState);
      activeLeaves.delete(leafId);
      pendingLeafBuildIds.delete(leafId);
    }

    const resolvedTransitionDirtyChunkKeys = resolveRetiredLeafTransitions(selectedLeafStates);
    addChunkKeysToSet(visibilityDirtyChunkKeys, resolvedTransitionDirtyChunkKeys);

    if (visibilityDirtyChunkKeys.size > 0) {
      for (const chunkKey of visibilityDirtyChunkKeys) markChunkShadowDirty(chunkKey);
      syncLeafSurfaceTransitionVisibility(selectedLeafStates);
      syncChunkBaseSurfaceVisibility(visibilityDirtyChunkKeys);
    }

    lastTerrainSelection = {
      mode,
      selectedLeafCount: selectedLeaves?.length || 0,
      blockingLeafCount: nextBlockingLeafIds.size,
      pendingBlockingLeafCount: 0,
      activeChunkCount: chunkLeafOwners.size,
      blockingChunkCount: countBlockingChunks(nextBlockingLeafIds),
      selectedNodeCount: selectedLeaves?.length || 0,
      blockingLeafStates: [],
      quadtreeSelectionRegion: selectionRegion || null
    };
  }

  function refreshTerrainSelectionDiagnostics() {
    const pendingBlockingLeaves = [];
    const pendingLeafAges = [];
    const pendingBlockingLeafAges = [];
    const stalledPendingLeaves = [];
    const now = performance.now();
    for (const leafId of blockingLeafIds) {
      const leaf = activeLeaves.get(leafId);
      if (!leaf || leaf.state === 'surface_ready') continue;
      pendingBlockingLeaves.push(`${leafId}:${leaf.state}`);
    }
    for (const leaf of activeLeaves.values()) {
      if (!leaf || leaf.retired || leaf.state === 'surface_ready' || leaf.state === 'error') continue;
      const ageMs = Number.isFinite(leaf.pendingSinceAtMs) ? Math.max(0, now - leaf.pendingSinceAtMs) : null;
      if (Number.isFinite(ageMs)) {
        pendingLeafAges.push(ageMs);
        if (leaf.blockingReady) pendingBlockingLeafAges.push(ageMs);
      }
      stalledPendingLeaves.push({
        leafId: leaf.leafId,
        state: leaf.state,
        ageMs,
        blockingReady: leaf.blockingReady,
        distanceSq: distanceToLeafBoundsSq(leaf, physicsState.position.x, physicsState.position.z)
      });
    }
    stalledPendingLeaves.sort((a, b) => (b.ageMs || 0) - (a.ageMs || 0));
    lastTerrainSelection.pendingBlockingLeafCount = pendingBlockingLeaves.length;
    lastTerrainSelection.blockingLeafStates = pendingBlockingLeaves.slice(0, 10);
    lastTerrainSelection.selectedLeafCount = countActiveSelectedLeaves();
    lastTerrainSelection.blockingLeafCount = blockingLeafIds.size;
    lastTerrainSelection.activeChunkCount = chunkLeafOwners.size;
    lastTerrainSelection.leafResponsiveness = summarizeLeafResponsiveness({
      pendingLeafAges,
      pendingBlockingLeafAges,
      stalledPendingLeaves
    });
  }

  function summarizeNumberSet(values) {
    if (!Array.isArray(values) || values.length === 0) {
      return {
        count: 0,
        avgMs: null,
        p50Ms: null,
        p95Ms: null,
        maxMs: null
      };
    }
    const sorted = [...values].sort((a, b) => a - b);
    const total = sorted.reduce((sum, value) => sum + value, 0);
    const pick = (ratio) => {
      const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio)));
      return Math.round(sorted[index] * 1000) / 1000;
    };
    return {
      count: sorted.length,
      avgMs: Math.round((total / sorted.length) * 1000) / 1000,
      p50Ms: pick(0.5),
      p95Ms: pick(0.95),
      maxMs: Math.round(sorted[sorted.length - 1] * 1000) / 1000
    };
  }

  function summarizeLeafResponsiveness({ pendingLeafAges = [], pendingBlockingLeafAges = [], stalledPendingLeaves = [] } = {}) {
    const recentCompletions = leafResponsivenessState.recentCompletions.slice(-32);
    const readyWaits = recentCompletions
      .map((entry) => entry.waitMs)
      .filter((value) => Number.isFinite(value));
    const blockingReadyWaits = recentCompletions
      .filter((entry) => entry.blockingReady)
      .map((entry) => entry.waitMs)
      .filter((value) => Number.isFinite(value));

    return {
      readyWaitMs: summarizeNumberSet(readyWaits),
      blockingReadyWaitMs: summarizeNumberSet(blockingReadyWaits),
      pendingAgeMs: summarizeNumberSet(pendingLeafAges),
      pendingBlockingAgeMs: summarizeNumberSet(pendingBlockingLeafAges),
      worstPendingLeaves: stalledPendingLeaves.slice(0, 8).map((entry) => ({
        leafId: entry.leafId,
        state: entry.state,
        ageMs: Number.isFinite(entry.ageMs) ? Math.round(entry.ageMs * 1000) / 1000 : null,
        blockingReady: entry.blockingReady,
        distanceSq: Number.isFinite(entry.distanceSq) ? Math.round(entry.distanceSq * 1000) / 1000 : null
      }))
    };
  }

  function removePendingPropJobs(key) {
    chunkRuntime.removePendingPropJobs(key);
  }

  function processChunkBuildQueue(maxBuildsPerFrame = 2) {
    return chunkRuntime.processChunkBuildQueue(maxBuildsPerFrame);
  }

  function processPropBuildQueue(maxBuildsPerFrame = 1) {
    return chunkRuntime.processPropBuildQueue(maxBuildsPerFrame);
  }

  let lastProcessedChunkX = -999999;
  let lastProcessedChunkZ = -999999;
  let lastReady = false;

  /** @returns {unknown} */
  function updateTerrain() {
    const updateStartedAtMs = performance.now();
    resetLeafBuildBreakdown();
    const px = Math.floor(physicsState.position.x / CHUNK_SIZE);
    const pz = Math.floor(physicsState.position.z / CHUNK_SIZE);

    lastProcessedChunkX = px;
    lastProcessedChunkZ = pz;

    const selectionStartedAtMs = performance.now();
    const selectionState = buildTerrainSelection({
      centerChunkX: px,
      centerChunkZ: pz,
      controller: ensureQuadtreeSelectionController(),
      physicsState,
      bootstrapMode,
      terrainDebugSettings,
      CHUNK_SIZE,
      lodSettings,
      terrainChunks,
      bootstrapMaxLeaves: BOOTSTRAP_MAX_LEAVES,
      createChunkBounds
    });
    const activeChunks = smoothActiveChunkLods(selectionState.activeChunks);
    updateLeafChunkLods(selectionState.selectedLeaves, activeChunks);
    blockingLeafIds = selectionState.blockingLeafIds || new Set();
    currentBlockingChunkKeys = selectionState.blockingKeys || new Set();
    syncActiveLeaves(
      selectionState.selectedLeaves || [],
      blockingLeafIds,
      selectionState.selectionRegion || null,
      selectionState.mode || (bootstrapMode ? 'grid_bootstrap' : 'grid_fallback')
    );
    const selectionBuildMs = performance.now() - selectionStartedAtMs;

    const queueSchedulingStartedAtMs = performance.now();
    for (const [key, entry] of activeChunks.entries()) {
      const { cx, cz, lod } = entry;
      const ringDistance = Math.max(Math.abs(cx - px), Math.abs(cz - pz));
      const priority = ringDistance - getChunkPriorityBoost(key);
      if (!terrainChunks.has(key)) enqueueChunkBuild(cx, cz, lod, priority);
      else {
        const chunkState = terrainChunks.get(key);
        if (chunkState.lod !== lod) enqueueChunkBuild(cx, cz, lod, priority + 0.25);
      }
    }
    const queueSchedulingMs = performance.now() - queueSchedulingStartedAtMs;

    const queuePruneStartedAtMs = performance.now();
    for (let i = pendingChunkBuilds.length - 1; i >= 0; i--) {
      const job = pendingChunkBuilds[i];
      if (!chunkLeafOwners.has(job.key)) { pendingChunkKeys.delete(job.key); pendingChunkBuilds.splice(i, 1); chunkRuntime.markChunkQueueDirty(); }
    }
    for (let i = pendingPropBuilds.length - 1; i >= 0; i--) {
      const job = pendingPropBuilds[i];
      if (!chunkLeafOwners.has(job.key)) { pendingPropKeys.delete(job.key); pendingPropBuilds.splice(i, 1); chunkRuntime.markPropQueueDirty(); }
    }
    for (const [key, chunkState] of terrainChunks.entries()) {
      if (!chunkLeafOwners.has(key)) {
        removePendingPropJobs(key);
        if (chunkState.group) {
          const cached = cacheWarmChunkState(key, chunkState);
          if (!cached) disposeChunkGroup(chunkState.group);
        }
        if (chunkState.pendingGroup) disposeChunkGroup(chunkState.pendingGroup);
        clearChunkBaseVisibilityTracking(key);
        terrainChunks.delete(key);
      }
    }
    const queuePruneMs = performance.now() - queuePruneStartedAtMs;
    const generationDiagnostics = getTerrainGenerationDiagnostics();
    const workerDiagnostics = generationDiagnostics.worker || {};
    const activeWorkerCount = Math.max(1, workerDiagnostics.activeWorkerCount || 0);
    const inFlightJobs = Math.max(0, workerDiagnostics.inFlightJobs || 0);
    const idleWorkerCount = Math.max(0, activeWorkerCount - inFlightJobs);
    const buildBudgetBase = pendingChunkBuilds.length > 160 ? 4 : pendingChunkBuilds.length > 80 ? 3 : 2;
    const leafBuildBudgetBase = pendingLeafBuilds.length > 200 ? 4 : pendingLeafBuilds.length > 120 ? 3 : 2;
    const propBuildBudgetBase = pendingPropBuilds.length > 160 ? 3 : pendingPropBuilds.length > 80 ? 2 : 1;
    let buildBudget = buildBudgetBase * (_isFastLoad ? 40 : bootstrapMode ? 2 : 1);
    const leafBuildBudget = leafBuildBudgetBase * (_isFastLoad ? 24 : bootstrapMode ? 4 : 1);
    let propBuildBudget = propBuildBudgetBase * (_isFastLoad ? 80 : bootstrapMode ? (pendingChunkBuilds.length === 0 ? 6 : 3) : 1);
    if (bootstrapMode && idleWorkerCount > 0) {
      const bootstrapChunkTarget = Math.min(pendingChunkBuilds.length, activeWorkerCount + idleWorkerCount * 2);
      const bootstrapPropTarget = Math.min(pendingPropBuilds.length, activeWorkerCount + idleWorkerCount * 2);
      buildBudget = Math.max(buildBudget, bootstrapChunkTarget);
      propBuildBudget = Math.max(propBuildBudget, bootstrapPropTarget);
    }
    const leafBuildStats = processLeafBuildQueue(leafBuildBudget);
    const chunkBuildStats = processChunkBuildQueue(buildBudget);
    const propBuildStats = processPropBuildQueue(propBuildBudget);
    const leafApplyStats = consumeLeafBuildApplyTiming();
    syncSurfaceShadowReception({ forceFull: surfaceShadowSyncAllDirty });
    refreshTerrainSelectionDiagnostics();
    terrainPerfState.lastUpdate = {
      selectionBuildMs,
      queueSchedulingMs,
      queuePruneMs,
      leafBuildMs: leafBuildStats.durationMs + leafApplyStats.applyMs,
      leafBuildDispatchMs: leafBuildStats.durationMs,
      leafBuildApplyMs: leafApplyStats.applyMs,
      chunkBuildQueueMs: chunkBuildStats.durationMs,
      propBuildQueueMs: propBuildStats.durationMs,
      totalMs: performance.now() - updateStartedAtMs,
      leafBuilds: leafBuildStats.builds,
      leafBuildApplies: leafApplyStats.applies,
      chunkBuildsStarted: chunkBuildStats.builds,
      propBuildsStarted: propBuildStats.builds
    };

    if (pendingChunkKeys.size > 0 || pendingPropKeys.size > 0) {
      debugLog(`[terrain] Pending chunks: ${pendingChunkKeys.size}, Pending props: ${pendingPropKeys.size}`);
    } else if (terrainChunks.size > 0) {
      const ready = isReady();
      if (ready && !lastReady) {
        debugLog('[terrain] All chunks and props fully loaded.');
      }
      lastReady = ready;
    }

    return getTerrainSelectionDiagnostics();
  }

  function getChunkStateCounts() {
    const counts = {
      building_base: 0,
      base_done: 0,
      building_props: 0,
      done: 0,
      error: 0,
      other: 0
    };

    for (const chunkState of terrainChunks.values()) {
      const key = chunkState?.state;
      if (Object.prototype.hasOwnProperty.call(counts, key)) counts[key] += 1;
      else counts.other += 1;
    }

    return counts;
  }

  /** @returns {unknown} */
  function getTerrainSelectionDiagnostics() {
    const generationDiagnostics = getTerrainGenerationDiagnostics();
    const pendingLeafApplyMs = terrainPerfState.pendingFrameLeafApplyMs;
    const pendingLeafApplies = terrainPerfState.pendingFrameLeafApplyCount;
    return {
      ...lastTerrainSelection,
      blockingChunkCount: lastTerrainSelection.blockingChunkCount,
      activeChunkCount: chunkLeafOwners.size,
      queueDepths: {
        pendingBaseChunkJobs: pendingChunkBuilds.length,
        pendingPropJobs: pendingPropBuilds.length,
        pendingLeafBuilds: pendingLeafBuilds.length
      },
      leafResponsiveness: lastTerrainSelection.leafResponsiveness ?? null,
      leafBuildBreakdown: getLeafBuildBreakdownSummary(),
      chunkStates: getChunkStateCounts(),
      chunkBaseRole: getChunkBaseRoleSummary(),
      warmChunkCache: {
        size: warmChunkCache.size,
        maxSize: WARM_CHUNK_CACHE_MAX,
        ...terrainPerfState.warmChunkCache
      },
      worker: generationDiagnostics.worker,
      generation: generationDiagnostics.generation,
      timings: {
        ...terrainPerfState.lastUpdate,
        leafBuildMs: (terrainPerfState.lastUpdate.leafBuildMs || 0) + pendingLeafApplyMs,
        leafBuildApplyMs: (terrainPerfState.lastUpdate.leafBuildApplyMs || 0) + pendingLeafApplyMs,
        leafBuildApplies: (terrainPerfState.lastUpdate.leafBuildApplies || 0) + pendingLeafApplies
      }
    };
  }

  /**
   * @param {THREE.Camera | null} [camera]
   * @param {THREE.Color | null} [weatherColor]
   */
  function updateTerrainAtmosphere(camera, weatherColor = null) {
    terrainDetailUniforms.uTerrainAtmosStrength.value = 0.25;
    if (camera) {
      atmosphereCameraPos.copy(camera.position);
      tempMainCameraPosUniform.value.copy(camera.position);
      const movedSinceLastSyncSq = Number.isFinite(lastSurfaceShadowSyncPos.x)
        ? lastSurfaceShadowSyncPos.distanceToSquared(atmosphereCameraPos)
        : Number.POSITIVE_INFINITY;
      const shouldForceFullShadowSync = movedSinceLastSyncSq >= (SURFACE_SHADOW_SYNC_MOVE_THRESHOLD * SURFACE_SHADOW_SYNC_MOVE_THRESHOLD)
        || (performance.now() - lastSurfaceShadowSyncAtMs) >= SURFACE_SHADOW_SYNC_INTERVAL_MS;
      if (surfaceShadowSyncAllDirty || dirtyLeafShadowIds.size > 0 || dirtyChunkShadowKeys.size > 0 || shouldForceFullShadowSync) {
        syncSurfaceShadowReception({ forceFull: shouldForceFullShadowSync });
      }
    }
    if (weatherColor) atmosphereColor.copy(weatherColor);
    else {
      tmpColorA.setRGB(0.62, 0.66, 0.72); tmpColorB.setRGB(0.78, 0.81, 0.86);
      atmosphereColor.copy(tmpColorA.lerp(tmpColorB, 0.4));
    }
    if (_fogDisabled) {
      atmosphereUniforms.uAtmosNear.value = 1e6;
      atmosphereUniforms.uAtmosFar.value = 1e7;
    } else {
      atmosphereUniforms.uAtmosNear.value = 15000.0;
      atmosphereUniforms.uAtmosFar.value = 90000.0;
    }
  }

  /**
   * @param {number} [timeSeconds]
   */
  function animateWindmills(timeSeconds = performance.now() * 0.001) {
    for (const state of terrainChunks.values()) {
      if (state.group) animateWindmillProps(state.group, timeSeconds, dummy);
      if (state.pendingGroup) animateWindmillProps(state.pendingGroup, timeSeconds, dummy);
    }
  }

  /** @type {TerrainSystem['getTerrainHeight']} */
  const getTerrainHeightWithNoise = (x, z, octaves = 6) => getTerrainHeight(x, z, Noise, octaves);

  /**
   * @param {THREE.Vector3 | null | undefined} center
   * @param {number} extent
   */
  function updateSurfaceShadowCoverage(center, extent) {
    if (!center || !Number.isFinite(extent) || extent <= 0) return;
    atmosphereUniforms.uShadowCoverageCenter.value.copy(center);
    atmosphereUniforms.uShadowCoverageExtent.value = extent;
    atmosphereUniforms.uShadowCoverageFadeStart.value = extent * 0.8;
  }

  function createTerrainWarmupGeometry() {
    const terrainGeo = new THREE.PlaneGeometry(256, 256, 1, 1);
    terrainGeo.rotateX(-Math.PI / 2);
    terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(terrainGeo.attributes.position.count * 3).fill(1), 3));
    terrainGeo.setAttribute('surfaceWeights', new THREE.Float32BufferAttribute(new Float32Array([
      0.05, 0.85, 0.10, 0.00,
      0.00, 0.75, 0.25, 0.00,
      0.00, 0.30, 0.70, 0.00,
      0.00, 0.05, 0.15, 0.80
    ]), 4));
    return terrainGeo;
  }

  function createWaterWarmupGeometry() {
    const waterGeo = new THREE.PlaneGeometry(256, 256, 1, 1);
    waterGeo.rotateX(-Math.PI / 2);
    waterGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(waterGeo.attributes.position.count * 3).fill(0.7), 3));
    return waterGeo;
  }

  function createTreeWarmupGeometry() {
    const treeGeo = new THREE.PlaneGeometry(1, 1, 1, 1);
    treeGeo.translate(0, 0.5, 0);
    return treeGeo;
  }

  function createBuildingWarmupGeometry() {
    const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
    buildingGeo.translate(0, 0.5, 0);
    return buildingGeo;
  }

  function makeWarmupInstancedMesh(geometry, material, position, tint = null) {
    const warmupDummy = new THREE.Object3D();
    const mesh = new THREE.InstancedMesh(geometry, material, 1);
    warmupDummy.position.copy(position);
    warmupDummy.scale.set(18, 18, 18);
    warmupDummy.rotation.set(0, 0, 0);
    warmupDummy.updateMatrix();
    mesh.setMatrixAt(0, warmupDummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
    if (tint) {
      mesh.setColorAt(0, tint);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    mesh.updateMatrixWorld(true);
    return mesh;
  }

  /** @returns {unknown[]} */
  function getShaderValidationVariants() {
    return [
      {
        id: 'terrain-near-surface',
        metadata: { system: 'terrain', variant: 'terrain-near' },
        build(camera) {
          updateTerrainAtmosphere(camera);
          const terrainGeo = createTerrainWarmupGeometry();
          const mesh = new THREE.Mesh(terrainGeo, terrainMaterial);
          mesh.position.set(-320, 0, 0);
          mesh.updateMatrixWorld(true);
          return {
            objects: [mesh],
            dispose() {
              terrainGeo.dispose();
            }
          };
        }
      },
      {
        id: 'terrain-far-surface',
        metadata: { system: 'terrain', variant: 'terrain-far' },
        build(camera) {
          updateTerrainAtmosphere(camera);
          const terrainGeo = createTerrainWarmupGeometry();
          const mesh = new THREE.Mesh(terrainGeo, terrainFarMaterial);
          mesh.position.set(0, 0, 0);
          mesh.updateMatrixWorld(true);
          return {
            objects: [mesh],
            dispose() {
              terrainGeo.dispose();
            }
          };
        }
      },
      {
        id: 'water-near-surface',
        metadata: { system: 'terrain', variant: 'water-near' },
        build(camera) {
          updateTerrainAtmosphere(camera);
          const waterGeo = createWaterWarmupGeometry();
          const mesh = new THREE.Mesh(waterGeo, waterMaterial);
          mesh.position.set(320, 0, 0);
          mesh.updateMatrixWorld(true);
          return {
            objects: [mesh],
            dispose() {
              waterGeo.dispose();
            }
          };
        }
      },
      {
        id: 'water-far-surface',
        metadata: { system: 'terrain', variant: 'water-far' },
        build(camera) {
          updateTerrainAtmosphere(camera);
          const waterGeo = createWaterWarmupGeometry();
          const mesh = new THREE.Mesh(waterGeo, waterFarMaterial);
          mesh.position.set(640, 0, 0);
          mesh.updateMatrixWorld(true);
          return {
            objects: [mesh],
            dispose() {
              waterGeo.dispose();
            }
          };
        }
      },
      {
        id: 'tree-billboard',
        metadata: { system: 'terrain', variant: 'tree-billboard' },
        build() {
          const treeGeo = createTreeWarmupGeometry();
          const mesh = makeWarmupInstancedMesh(treeGeo, treeCanopyMats.broadleaf, new THREE.Vector3(960, 0, 0));
          return {
            objects: [mesh],
            dispose() {
              treeGeo.dispose();
            }
          };
        }
      },
      {
        id: 'tree-depth',
        metadata: { system: 'terrain', variant: 'tree-depth' },
        build() {
          const treeGeo = createTreeWarmupGeometry();
          const mesh = makeWarmupInstancedMesh(treeGeo, treeDepthMats.broadleaf, new THREE.Vector3(1120, 0, 0));
          return {
            objects: [mesh],
            dispose() {
              treeGeo.dispose();
            }
          };
        }
      },
      {
        id: 'building-commercial',
        metadata: { system: 'terrain', variant: 'building-commercial' },
        build() {
          const buildingGeo = createBuildingWarmupGeometry();
          const mesh = makeWarmupInstancedMesh(buildingGeo, detailedBuildingMats.commercial, new THREE.Vector3(1280, 0, 0));
          return {
            objects: [mesh],
            dispose() {
              buildingGeo.dispose();
            }
          };
        }
      },
      {
        id: 'building-residential',
        metadata: { system: 'terrain', variant: 'building-residential' },
        build() {
          const buildingGeo = createBuildingWarmupGeometry();
          const mesh = makeWarmupInstancedMesh(buildingGeo, detailedBuildingMats.residential, new THREE.Vector3(1440, 0, 0));
          return {
            objects: [mesh],
            dispose() {
              buildingGeo.dispose();
            }
          };
        }
      },
      {
        id: 'building-industrial',
        metadata: { system: 'terrain', variant: 'building-industrial' },
        build() {
          const buildingGeo = createBuildingWarmupGeometry();
          const mesh = makeWarmupInstancedMesh(buildingGeo, detailedBuildingMats.industrial, new THREE.Vector3(1600, 0, 0));
          return {
            objects: [mesh],
            dispose() {
              buildingGeo.dispose();
            }
          };
        }
      },
      {
        id: 'building-pop-in-base',
        metadata: { system: 'terrain', variant: 'building-pop-in-base' },
        build() {
          const buildingGeo = createBuildingWarmupGeometry();
          const mesh = makeWarmupInstancedMesh(buildingGeo, baseBuildingMat, new THREE.Vector3(1760, 0, 0));
          return {
            objects: [mesh],
            dispose() {
              buildingGeo.dispose();
            }
          };
        }
      }
    ];
  }

  function completeBootstrap() {
    if (!bootstrapMode) return;
    bootstrapMode = false;
    debugLog('[terrain] Bootstrap LOD complete; refining outer rings.');
  }

  const isReady = () => {
    if (activeLeaves.size === 0) return false;

    const px = Math.floor(physicsState.position.x / CHUNK_SIZE);
    const pz = Math.floor(physicsState.position.z / CHUNK_SIZE);
    if (px !== lastProcessedChunkX || pz !== lastProcessedChunkZ) return false;

    const blocking = [];
    if (blockingLeafIds.size > 0) {
      for (const leafId of blockingLeafIds) {
        const leaf = activeLeaves.get(leafId);
        if (!leaf) continue;
        if (leaf.state !== 'surface_ready') {
          blocking.push(`${leafId}:${leaf.state}`);
        }
      }
    } else {
      for (const [leafId, leaf] of activeLeaves.entries()) {
        if (!leaf || leaf.retired) continue;
        if (leaf.state !== 'surface_ready') {
          blocking.push(`${leafId}:${leaf.state}`);
        }
      }
    }

    if (blocking.length > 0 && (windowRef?._isReadyLogCounter || 0) % 120 === 0) {
      debugLog(`[isReady] leaves=${activeLeaves.size} blocking=[${blocking.slice(0, 5)}]`);
    }
    if (windowRef) {
      windowRef._isReadyLogCounter = (windowRef._isReadyLogCounter || 0) + 1;
    }

    return blocking.length === 0;
  };

  /** @returns {boolean} */
  function hasPendingTerrainWork() {
    if (pendingLeafBuilds.length > 0 || hasPendingLeafApplies?.() || pendingChunkBuilds.length > 0 || pendingPropBuilds.length > 0) {
      return true;
    }

    for (const leaf of activeLeaves.values()) {
      if (!leaf.retired && leaf.state !== 'surface_ready' && leaf.state !== 'error') {
        return true;
      }
    }

    for (const chunkState of terrainChunks.values()) {
      if (chunkState.state === 'building_base' || chunkState.state === 'building_props' || !chunkState.propsBuilt) {
        return true;
      }
    }

    return false;
  }

  /**
   * @param {string | null} [cityId]
   * @returns {Promise<void>}
   */
  async function reloadCity(cityId = null) {
    debugLog(`[terrain] Hot-swapping district data: ${cityId || 'all'}`);
    clearDistrictCache(cityId);

    await fetchDistrictIndex();

    const ctx = {
      LOD_LEVELS, Noise, treeBillboardGeo, treeGroundGeo, treeTrunkGeo, treeTrunkMat, treeGroundMats, treeTypeConfigs, detailedBuildingMats, baseBuildingMat, baseBuildingGeo,
      roofCapGeo, roofCapMat, podiumGeo, podiumMat, spireGeo, spireMat, hvacGeo, hvacMat, getPooledInstancedMesh,
      windmillTowerGeo, windmillTowerMat, windmillNacelleGeo, windmillNacelleMat, windmillHubGeo, windmillHubMat, windmillBladeGeo, windmillBladeMat,
      hullGeo, hullMat, cabinGeo, cabinMat, mastGeo, mastMat, dummy, atmosphereUniforms,
      terrainMaterial, terrainFarMaterial, terrainDetailUniforms, timeUniform: waterTimeUniform
    };

    for (const [key, state] of terrainChunks.entries()) {
      if (!state.group) continue;
      const cx = state.cx;
      const cz = state.cz;
      if (!Number.isFinite(cx) || !Number.isFinite(cz)) continue;

      const overlapping = await getOverlappingDistricts(cx, cz);
      const matching = overlapping.filter(district => !cityId || district.id === cityId);
      if (matching.length > 0) {
        // Clear spawned prop meshes (keep terrain/water at index 0,1)
        state.group.userData.windmillBladeMeshes = null;
        while (state.group.children.length > 2) {
          const child = state.group.children[state.group.children.length - 1];
          state.group.remove(child);
          if (child.isInstancedMesh) {
            // In a real production app we'd pool these, but for hot-reload simplicity 
            // we just let them be GC'd or handled by disposeChunkGroup if we were disposing the whole thing.
            // Actually, terrain.js uses a pool. Let's just remove them.
          }
        }

        const { loadDistrictChunk } = await import('./terrain/CityChunkLoader.js');
        const loadedDistricts = await Promise.all(matching.map(district => loadDistrictChunk(district.id)));
        loadedDistricts.forEach(loadedData => {
          if (!loadedData) return;
          spawnCityBuildingsForChunk(state.group, cx, cz, loadedData, state.lod, ctx, CHUNK_SIZE);
          spawnDistrictPropsForChunk(state.group, cx, cz, loadedData, state.lod, ctx, CHUNK_SIZE);
        });
      }
    }
  }

  return {
    waterMaterial,
    getTerrainHeight: getTerrainHeightWithNoise,
    updateTerrain,
    animateWindmills,
    updateTerrainAtmosphere,
    updateSurfaceShadowCoverage,
    getTerrainSelectionDiagnostics,
    getSurfaceShadowDiagnostics,
    consumeLeafBuildApplyTiming,
    flushPendingLeafApplies: flushPendingLeafAppliesBudget,
    terrainDebugSettings,
    applyTerrainDebugSettings,
    isReady,
    hasPendingTerrainWork,
    refreshBakedTerrain,
    reloadHydrology: rebuildHydrologyMeshes,
    reloadCity,
    getShaderValidationVariants,
    completeBootstrap
  };
}
