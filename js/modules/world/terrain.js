import * as THREE from 'three';
import { createWaterNormalMap, createTreeBillboardTexture, createTreeContactTexture, createPackedTerrainDetailTexture } from './terrain/TerrainTextures.js';
import {
  makeTreeBillboardMaterial,
  makeTreeDepthMaterial,
  createDetailedBuildingMat,
  setupTerrainMaterial,
  setupWaterMaterial,
  setupBuildingPopIn
} from './terrain/TerrainMaterials.js';
import { RoadMarkingOverlay, ROAD_MARKING_OVERLAY_DEFAULTS } from './terrain/RoadMarkingOverlay.js';

const tempMainCameraPosUniform = { value: new THREE.Vector3() };
import {
  getTerrainHeight,
  getLodForRingDistance,
  getTerrainMaskSet,
  getStaticSampler,
  getStaticWorldMetadata
} from './terrain/TerrainUtils.js';
import { SEA_LEVEL, WATER_DEPTH_BANDS, getTerrainBaseSrgb, getWaterDepthSrgb } from './terrain/TerrainPalette.js';
import { getTerrainSurfaceWeights } from './terrain/TerrainSurfaceWeights.js';
import { getTerrainSurfaceOverrides } from './terrain/TerrainSurfaceOverrides.js';
import { normalizeLodSettings } from './LodSystem.js';
import {
  fetchDistrictIndex,
  clearDistrictCache
} from './terrain/CityChunkLoader.js';
import {
  generateChunkBase as genBase,
  generateChunkProps as genProps,
  getTerrainGenerationDiagnostics,
  getOverlappingDistricts,
  loadStaticWorld,
  CHUNK_SIZE
} from './terrain/TerrainGeneration.js';
import { animateWindmillProps, spawnCityBuildingsForChunk, spawnDistrictPropsForChunk } from './terrain/BuildingSpawner.js';
import { createQuadtreeSelectionController } from './terrain/QuadtreeSelectionController.js';
import { debugLog } from '../core/logging.js';
import { createRuntimeLodSettings } from './LodSystem.js';

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

export function createLakeSurfaceGeometry(lake, sampler, options = {}) {
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

export function createTerrainSystem({
  scene,
  renderer,
  Noise,
  PHYSICS,
  lodSettings = null,
  loadStaticWorldFn = loadStaticWorld
}) {
  const hasWindow = typeof window !== 'undefined';
  const windowRef = hasWindow ? window : null;
  const locationSearch = windowRef?.location?.search || '';
  lodSettings = lodSettings || createRuntimeLodSettings({ urlSearch: locationSearch });

  const waterMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.62,
    metalness: 0.05,
    normalMap: createWaterNormalMap(Noise),
    normalScale: new THREE.Vector2(1.5, 1.5)
  });
  const hydrologyGroup = new THREE.Group();
  hydrologyGroup.name = 'terrain-hydrology';
  scene.add(hydrologyGroup);
  const hydrologyLakeMaterial = new THREE.MeshBasicMaterial({
    color: 0x3a84dc,
    transparent: true,
    opacity: 0.72,
    depthWrite: false
  });
  hydrologyLakeMaterial.polygonOffset = true;
  hydrologyLakeMaterial.polygonOffsetFactor = -1;
  hydrologyLakeMaterial.polygonOffsetUnits = -1;
  const hydrologyRiverMaterial = new THREE.MeshBasicMaterial({
    color: 0x4cb1ff,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  hydrologyRiverMaterial.polygonOffset = true;
  hydrologyRiverMaterial.polygonOffsetFactor = -1;
  hydrologyRiverMaterial.polygonOffsetUnits = -1;

  const atmosphereCameraPos = new THREE.Vector3();
  const atmosphereColor = new THREE.Color(0x90939f);
  const atmosphereUniforms = {
    uAtmosCameraPos: { value: atmosphereCameraPos },
    uAtmosColor: { value: atmosphereColor },
    uAtmosNear: { value: 9000.0 },
    uAtmosFar: { value: 68000.0 }
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

  function rebuildHydrologyMeshes() {
    clearHydrologyMeshes();
    const sampler = getStaticSampler();
    const metadata = getStaticWorldMetadata() || windowRef?.fsimWorld || null;
    const hydrology = metadata?.hydrology || null;
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

  function computeGridNormals(positions, segments) {
    const verticesPerSide = segments + 1;
    const normals = new Float32Array(positions.length);

    for (let row = 0; row < verticesPerSide; row += 1) {
      const rowOffset = row * verticesPerSide;
      const rowUp = Math.max(0, row - 1) * verticesPerSide;
      const rowDown = Math.min(verticesPerSide - 1, row + 1) * verticesPerSide;

      for (let col = 0; col < verticesPerSide; col += 1) {
        const colLeft = Math.max(0, col - 1);
        const colRight = Math.min(verticesPerSide - 1, col + 1);
        const centerIndex = (rowOffset + col) * 3;
        const leftIndex = (rowOffset + colLeft) * 3;
        const rightIndex = (rowOffset + colRight) * 3;
        const upIndex = (rowUp + col) * 3;
        const downIndex = (rowDown + col) * 3;

        const dx = positions[rightIndex] - positions[leftIndex];
        const dz = positions[downIndex + 2] - positions[upIndex + 2];
        const dyX = positions[rightIndex + 1] - positions[leftIndex + 1];
        const dyZ = positions[downIndex + 1] - positions[upIndex + 1];

        let nx = -dz * dyX;
        let ny = dz * dx;
        let nz = -dyZ * dx;
        const length = Math.hypot(nx, ny, nz) || 1;

        nx /= length;
        ny /= length;
        nz /= length;

        normals[centerIndex] = nx;
        normals[centerIndex + 1] = ny;
        normals[centerIndex + 2] = nz;
      }
    }

    return normals;
  }

  function buildBorderLoopIndices(stride) {
    const indices = [];
    for (let x = 0; x < stride; x += 1) indices.push(x);
    for (let z = 1; z < stride; z += 1) indices.push((z * stride) + (stride - 1));
    for (let x = stride - 2; x >= 0; x -= 1) indices.push(((stride - 1) * stride) + x);
    for (let z = stride - 2; z > 0; z -= 1) indices.push(z * stride);
    return indices;
  }

  function createLeafSurfaceGeometry({
    node,
    heights,
    stride,
    worldData,
    sampler,
    materialKind
  }) {
    const resolution = stride - 1;
    const topVertexCount = stride * stride;
    const borderLoop = buildBorderLoopIndices(stride);
    const vertexCount = topVertexCount + borderLoop.length;
    const positions = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const surfaceWeights = materialKind === 'terrain' ? new Float32Array(vertexCount * 4) : null;
    const surfaceOverrides = materialKind === 'terrain' ? new Float32Array(vertexCount * 4) : null;
    const segmentSize = node.size / resolution;
    const gridStride = stride;

    for (let z = 0; z < stride; z += 1) {
      for (let x = 0; x < stride; x += 1) {
        const index = z * stride + x;
        const positionIndex = index * 3;
        const worldX = node.minX + x * segmentSize;
        const worldZ = node.minZ + z * segmentSize;
        const height = materialKind === 'terrain' ? heights[index] : SEA_LEVEL;
        const rightIndex = z * gridStride + Math.min(resolution, x + 1);
        const downIndex = Math.min(resolution, z + 1) * gridStride + x;
        const slope = materialKind === 'terrain'
          ? Math.max(
            Math.abs(heights[rightIndex] - heights[index]),
            Math.abs(heights[downIndex] - heights[index])
          ) / Math.max(1e-3, segmentSize)
          : 0;
        const color = materialKind === 'terrain'
          ? srgbArrayToLinear(getTerrainBaseSrgb(height))
          : srgbArrayToLinear(getWaterDepthSrgb(Math.max(0, SEA_LEVEL - heights[index])));

        positions[positionIndex] = x * segmentSize;
        positions[positionIndex + 1] = height;
        positions[positionIndex + 2] = z * segmentSize;
        uvs[index * 2] = worldX / 512;
        uvs[index * 2 + 1] = worldZ / 512;
        colors[positionIndex] = color.r;
        colors[positionIndex + 1] = color.g;
        colors[positionIndex + 2] = color.b;

        if (materialKind === 'terrain') {
          const weightIndex = index * 4;
          const weights = getTerrainSurfaceWeights(height, slope, getTerrainMaskSet(worldX, worldZ));
          const overrides = getTerrainSurfaceOverrides(worldX, worldZ, worldData);
          surfaceWeights[weightIndex] = weights[0];
          surfaceWeights[weightIndex + 1] = weights[1];
          surfaceWeights[weightIndex + 2] = weights[2];
          surfaceWeights[weightIndex + 3] = weights[3];
          surfaceOverrides[weightIndex] = overrides[0];
          surfaceOverrides[weightIndex + 1] = overrides[1];
          surfaceOverrides[weightIndex + 2] = overrides[2];
          surfaceOverrides[weightIndex + 3] = overrides[3];
        }
      }
    }

    const topNormals = computeGridNormals(positions.slice(0, topVertexCount * 3), resolution);
    const normals = new Float32Array(vertexCount * 3);
    normals.set(topNormals, 0);

    for (let index = 0; index < borderLoop.length; index += 1) {
      const topIndex = borderLoop[index];
      const sourcePositionIndex = topIndex * 3;
      const sourceWeightIndex = topIndex * 4;
      const skirtVertexIndex = topVertexCount + index;
      const skirtPositionIndex = skirtVertexIndex * 3;

      positions[skirtPositionIndex] = positions[sourcePositionIndex];
      positions[skirtPositionIndex + 1] = positions[sourcePositionIndex + 1] - skirtDepth;
      positions[skirtPositionIndex + 2] = positions[sourcePositionIndex + 2];
      uvs[skirtVertexIndex * 2] = uvs[topIndex * 2];
      uvs[(skirtVertexIndex * 2) + 1] = uvs[(topIndex * 2) + 1];

      colors[skirtPositionIndex] = colors[sourcePositionIndex];
      colors[skirtPositionIndex + 1] = colors[sourcePositionIndex + 1];
      colors[skirtPositionIndex + 2] = colors[sourcePositionIndex + 2];
      normals[skirtPositionIndex] = normals[sourcePositionIndex];
      normals[skirtPositionIndex + 1] = normals[sourcePositionIndex + 1];
      normals[skirtPositionIndex + 2] = normals[sourcePositionIndex + 2];

      if (materialKind === 'terrain') {
        const skirtWeightIndex = skirtVertexIndex * 4;
        surfaceWeights[skirtWeightIndex] = surfaceWeights[sourceWeightIndex];
        surfaceWeights[skirtWeightIndex + 1] = surfaceWeights[sourceWeightIndex + 1];
        surfaceWeights[skirtWeightIndex + 2] = surfaceWeights[sourceWeightIndex + 2];
        surfaceWeights[skirtWeightIndex + 3] = surfaceWeights[sourceWeightIndex + 3];
        surfaceOverrides[skirtWeightIndex] = surfaceOverrides[sourceWeightIndex];
        surfaceOverrides[skirtWeightIndex + 1] = surfaceOverrides[sourceWeightIndex + 1];
        surfaceOverrides[skirtWeightIndex + 2] = surfaceOverrides[sourceWeightIndex + 2];
        surfaceOverrides[skirtWeightIndex + 3] = surfaceOverrides[sourceWeightIndex + 3];
      }
    }

    const topIndexCount = resolution * resolution * 6;
    const skirtIndexCount = borderLoop.length * 6;
    const indices = new Uint32Array(topIndexCount + skirtIndexCount);
    let writeIndex = 0;

    for (let z = 0; z < resolution; z += 1) {
      for (let x = 0; x < resolution; x += 1) {
        const a = z * stride + x;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices[writeIndex++] = a;
        indices[writeIndex++] = c;
        indices[writeIndex++] = b;
        indices[writeIndex++] = b;
        indices[writeIndex++] = c;
        indices[writeIndex++] = d;
      }
    }

    for (let index = 0; index < borderLoop.length; index += 1) {
      const next = (index + 1) % borderLoop.length;
      const topA = borderLoop[index];
      const topB = borderLoop[next];
      const skirtA = topVertexCount + index;
      const skirtB = topVertexCount + next;
      indices[writeIndex++] = topA;
      indices[writeIndex++] = topB;
      indices[writeIndex++] = skirtA;
      indices[writeIndex++] = skirtA;
      indices[writeIndex++] = topB;
      indices[writeIndex++] = skirtB;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    if (materialKind === 'terrain') {
      geometry.setAttribute('surfaceWeights', new THREE.Float32BufferAttribute(surfaceWeights, 4));
      geometry.setAttribute('surfaceOverrides', new THREE.Float32BufferAttribute(surfaceOverrides, 4));
    }
    return geometry;
  }

  const waterFarMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true
  });

  const waterTimeUniform = { value: 0 };
  waterMaterial.userData.timeUniform = waterTimeUniform;

  setupWaterMaterial(waterMaterial, atmosphereUniforms, waterTimeUniform, false, waterSurfaceUniforms);
  setupWaterMaterial(waterFarMaterial, atmosphereUniforms, null, true, waterSurfaceUniforms);

  const LOD_LEVELS = lodSettings.terrain.lodLevels;

  const terrainChunks = new Map();
  const activeLeaves = new Map();
  const chunkLeafOwners = new Map();
  const pendingChunkBuilds = [];
  const pendingChunkKeys = new Set();
  let pendingQueueDirty = false;
  const pendingPropBuilds = [];
  const pendingPropKeys = new Set();
  let pendingPropQueueDirty = false;
  const chunkPools = [[], [], [], []];
  const instancedMeshPools = new Map();
  let bootstrapMode = true;
  let quadtreeSelectionController = null;
  let blockingLeafIds = new Set();
  const terrainDebugSettings = {
    selectionInterestRadius: CHUNK_SIZE * Math.max(3, lodSettings.terrain.renderDistance + 1),
    selectionBlockingRadius: CHUNK_SIZE * 2,
    selectionMinCellSize: CHUNK_SIZE * 0.25,
    selectionSplitDistanceFactor: 0.6,
    selectionMaxDepth: 6,
    bootstrapRadius: 10000,
    resolution32MaxNodeSize: CHUNK_SIZE * 0.25,
    resolution16MaxNodeSize: CHUNK_SIZE * 0.5,
    resolution8MaxNodeSize: CHUNK_SIZE,
    resolution4MaxNodeSize: CHUNK_SIZE * 2,
    showTerrainWireframe: false,
    showTrees: true,
    showBuildings: true
  };
  const roadMarkingDebugSettings = {
    worldSize: ROAD_MARKING_OVERLAY_DEFAULTS.worldSize,
    recenterDistance: ROAD_MARKING_OVERLAY_DEFAULTS.recenterDistance,
    roadWidth: ROAD_MARKING_OVERLAY_DEFAULTS.roadWidth,
    roadDashLength: ROAD_MARKING_OVERLAY_DEFAULTS.roadDashLength,
    roadGapLength: ROAD_MARKING_OVERLAY_DEFAULTS.roadGapLength,
    taxiwayWidth: ROAD_MARKING_OVERLAY_DEFAULTS.taxiwayWidth,
    taxiwayDashLength: ROAD_MARKING_OVERLAY_DEFAULTS.taxiwayDashLength,
    taxiwayGapLength: ROAD_MARKING_OVERLAY_DEFAULTS.taxiwayGapLength,
    opacity: 1.0,
    fadeStart: 800.0,
    fadeEnd: 1400.0
  };
  let lastTerrainSelection = {
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
      chunkBuildQueueMs: 0,
      propBuildQueueMs: 0,
      totalMs: 0,
      leafBuilds: 0,
      chunkBuildsStarted: 0,
      propBuildsStarted: 0
    },
    leafBuildBreakdown: {
      count: 0,
      sampleHeightMs: 0,
      terrainGeometryMs: 0,
      waterGeometryMs: 0,
      waterDepthTextureMs: 0,
      materialSetupMs: 0,
      sceneAttachMs: 0,
      totalMs: 0,
      maxTotalMs: 0
    }
  };

  function resetLeafBuildBreakdown() {
    terrainPerfState.leafBuildBreakdown = {
      count: 0,
      sampleHeightMs: 0,
      terrainGeometryMs: 0,
      waterGeometryMs: 0,
      waterDepthTextureMs: 0,
      materialSetupMs: 0,
      sceneAttachMs: 0,
      totalMs: 0,
      maxTotalMs: 0
    };
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
  const terrainDetailTex = createPackedTerrainDetailTexture();
  const roadMarkingOverlay = new RoadMarkingOverlay({
    worldSize: roadMarkingDebugSettings.worldSize,
    recenterDistance: roadMarkingDebugSettings.recenterDistance
  });
  const terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02, flatShading: false });
  const terrainFarMaterial = terrainMaterial.clone();
  terrainFarMaterial.roughness = 1.0;
  terrainFarMaterial.metalness = 0.0;

  const terrainDetailUniforms = {
    uTerrainDetailTex: { value: terrainDetailTex },
    uRoadMarkingTex: { value: roadMarkingOverlay.texture },
    uRoadMarkingCenter: { value: new THREE.Vector2(0, 0) },
    uRoadMarkingWorldSize: { value: roadMarkingOverlay.worldSize },
    uRoadMarkingOpacity: { value: roadMarkingDebugSettings.opacity },
    uRoadMarkingFadeStart: { value: roadMarkingDebugSettings.fadeStart },
    uRoadMarkingFadeEnd: { value: roadMarkingDebugSettings.fadeEnd },
    uRoadMarkingBodyStart: { value: 0.2 },
    uRoadMarkingBodyEnd: { value: 0.45 },
    uRoadMarkingCoreStart: { value: 0.55 },
    uRoadMarkingCoreEnd: { value: 0.8 },
    uTerrainDetailScale: { value: 0.16 },
    uTerrainDetailStrength: { value: 1.1 },
    uTerrainSlopeStart: { value: 0.26 },
    uTerrainSlopeEnd: { value: 0.62 },
    uTerrainRockHeightStart: { value: 220.0 },
    uTerrainRockHeightEnd: { value: 560.0 },
    uTerrainAtmosStrength: { value: 0.25 },
    uTerrainFoliageNearStart: { value: 120.0 },
    uTerrainFoliageNearEnd: { value: 1200.0 },
    uTerrainFoliageStrength: { value: 0.38 },
    uTerrainSandColor: { value: new THREE.Color(194 / 255, 178 / 255, 128 / 255) },
    uTerrainGrassColor: { value: new THREE.Color(42 / 255, 75 / 255, 42 / 255) },
    uTerrainRockColor: { value: new THREE.Color(85 / 255, 85 / 255, 85 / 255) },
    uTerrainSnowColor: { value: new THREE.Color(1, 1, 1) },
    uTerrainAsphaltColor: { value: new THREE.Color(0x000000) }
  };

  setupTerrainMaterial(terrainMaterial, terrainDetailUniforms, atmosphereUniforms, waterTimeUniform, false);
  setupTerrainMaterial(terrainFarMaterial, terrainDetailUniforms, atmosphereUniforms, waterTimeUniform, true);
  setColorFromLinearArray(waterSurfaceUniforms.uWaterFoamColor.value, getWaterDepthSrgb(0));
  setColorFromLinearArray(waterSurfaceUniforms.uWaterShallowColor.value, getWaterDepthSrgb(WATER_DEPTH_BANDS.shallowStart + 0.01));
  setColorFromLinearArray(waterSurfaceUniforms.uWaterDeepColor.value, getWaterDepthSrgb(WATER_DEPTH_BANDS.deepEnd + 1));
  applyTerrainDebugSettings({ rebuildSurfaces: false, refreshSelection: false });
  applyRoadMarkingDebugSettings({ redraw: false });

  const pendingLeafBuilds = [];
  const pendingLeafBuildIds = new Set();
  let pendingLeafQueueDirty = false;

  function disposeLeafRuntimeLeaf(leafState) {
    if (!leafState) return;
    if (leafState.terrainMesh) {
      scene.remove(leafState.terrainMesh);
      leafState.terrainMesh.geometry?.dispose?.();
      leafState.terrainMesh = null;
    }
    if (leafState.waterMesh) {
      scene.remove(leafState.waterMesh);
      leafState.waterMesh.material?.dispose?.();
      leafState.waterMesh.geometry?.dispose?.();
      leafState.waterMesh = null;
    }
    if (leafState.waterDepthTexture) {
      leafState.waterDepthTexture.dispose?.();
      leafState.waterDepthTexture = null;
    }
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
      surfaceResolution: null,
      firstSelectedAtMs: now,
      lastSelectedAtMs: now,
      pendingSinceAtMs: now,
      enqueuedAtMs: now,
      lastBuildStartedAtMs: null,
      lastSurfaceReadyAtMs: null,
      lastWaitMs: null,
      maxWaitMs: null,
      buildVersion: 0,
      retired: false
    };
  }

  function markLeafPendingSurface(leafState, { resetPendingStart = false } = {}) {
    if (!leafState) return;
    const now = performance.now();
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
    if (nodeSize <= terrainDebugSettings.resolution32MaxNodeSize) resolution = 32;
    else if (nodeSize <= terrainDebugSettings.resolution16MaxNodeSize) resolution = 16;
    else if (nodeSize <= terrainDebugSettings.resolution8MaxNodeSize) resolution = 8;
    else if (nodeSize <= terrainDebugSettings.resolution4MaxNodeSize) resolution = 4;

    if (bootstrapMode && bootstrapBlocking) {
      if (resolution >= 32) return 16;
      if (resolution >= 16) return 8;
      if (resolution >= 8) return 4;
    }

    return resolution;
  }

  function normalizeTerrainDebugSettings() {
    terrainDebugSettings.selectionInterestRadius = Math.max(CHUNK_SIZE * 0.25, terrainDebugSettings.selectionInterestRadius);
    terrainDebugSettings.selectionBlockingRadius = Math.max(CHUNK_SIZE * 0.125, terrainDebugSettings.selectionBlockingRadius);
    terrainDebugSettings.selectionMinCellSize = Math.max(32, terrainDebugSettings.selectionMinCellSize);
    terrainDebugSettings.selectionSplitDistanceFactor = Math.max(0.05, terrainDebugSettings.selectionSplitDistanceFactor);
    terrainDebugSettings.selectionMaxDepth = Math.max(0, Math.min(12, Math.round(terrainDebugSettings.selectionMaxDepth)));
    terrainDebugSettings.bootstrapRadius = Math.max(CHUNK_SIZE * 0.25, terrainDebugSettings.bootstrapRadius);

    const thresholds = [
      Math.max(32, terrainDebugSettings.resolution32MaxNodeSize),
      Math.max(32, terrainDebugSettings.resolution16MaxNodeSize),
      Math.max(32, terrainDebugSettings.resolution8MaxNodeSize),
      Math.max(32, terrainDebugSettings.resolution4MaxNodeSize)
    ].sort((a, b) => a - b);
    [
      terrainDebugSettings.resolution32MaxNodeSize,
      terrainDebugSettings.resolution16MaxNodeSize,
      terrainDebugSettings.resolution8MaxNodeSize,
      terrainDebugSettings.resolution4MaxNodeSize
    ] = thresholds;
  }

  function normalizeRoadMarkingDebugSettings() {
    roadMarkingDebugSettings.worldSize = Math.max(128, roadMarkingDebugSettings.worldSize);
    roadMarkingDebugSettings.recenterDistance = Math.max(0, roadMarkingDebugSettings.recenterDistance);
    roadMarkingDebugSettings.roadWidth = Math.max(0, roadMarkingDebugSettings.roadWidth);
    roadMarkingDebugSettings.roadDashLength = Math.max(0, roadMarkingDebugSettings.roadDashLength);
    roadMarkingDebugSettings.roadGapLength = Math.max(0, roadMarkingDebugSettings.roadGapLength);
    roadMarkingDebugSettings.taxiwayWidth = Math.max(0, roadMarkingDebugSettings.taxiwayWidth);
    roadMarkingDebugSettings.taxiwayDashLength = Math.max(0, roadMarkingDebugSettings.taxiwayDashLength);
    roadMarkingDebugSettings.taxiwayGapLength = Math.max(0, roadMarkingDebugSettings.taxiwayGapLength);
    roadMarkingDebugSettings.opacity = Math.max(0, Math.min(1, roadMarkingDebugSettings.opacity));
    roadMarkingDebugSettings.fadeStart = Math.max(0, roadMarkingDebugSettings.fadeStart);
    roadMarkingDebugSettings.fadeEnd = Math.max(roadMarkingDebugSettings.fadeStart, roadMarkingDebugSettings.fadeEnd);
  }

  function applyTerrainWireframeSetting() {
    terrainMaterial.wireframe = terrainDebugSettings.showTerrainWireframe;
    terrainFarMaterial.wireframe = terrainDebugSettings.showTerrainWireframe;
    terrainMaterial.needsUpdate = true;
    terrainFarMaterial.needsUpdate = true;
  }

  function invalidateActiveLeafSurfaces() {
    for (const leafState of activeLeaves.values()) {
      if (leafState.retired) continue;
      if (leafState.terrainMesh || leafState.waterMesh) {
        disposeLeafRuntimeLeaf(leafState);
      }
      leafState.state = 'pending_surface';
      enqueueLeafBuild(leafState, getLeafBuildPriority(leafState));
    }
  }

  function refreshBakedTerrain() {
    invalidateActiveLeafSurfaces();
    rebuildHydrologyMeshes();
    updateTerrain();
  }

  function clearChunkPropMeshes(chunkGroup) {
    if (!chunkGroup) return;
    chunkGroup.userData.windmillBladeMeshes = null;
    while (chunkGroup.children.length > 2) {
      const child = chunkGroup.children[chunkGroup.children.length - 1];
      chunkGroup.remove(child);
      if (child.isInstancedMesh) {
        child.count = 0;
        if (child.instanceMatrix) child.instanceMatrix.needsUpdate = false;
        if (child.instanceColor) child.instanceColor.needsUpdate = false;
        if (child.userData?.windmillBladeInstances) child.userData.windmillBladeInstances = null;
        child.userData = {};
        const key = child.geometry.uuid + '_' + child.material.uuid;
        let pool = instancedMeshPools.get(key);
        if (!pool) {
          pool = [];
          instancedMeshPools.set(key, pool);
        }
        pool.push(child);
      }
    }
  }

  function invalidateChunkProps() {
    for (const [key, state] of terrainChunks.entries()) {
      removePendingPropJobs(key);
      const targetGroup = state.pendingGroup || state.group;
      if (!targetGroup) continue;
      clearChunkPropMeshes(targetGroup);
      state.propsBuilt = false;
      if (state.state !== 'building_base' && state.state !== 'error') {
        state.state = 'base_done';
        const [cxRaw, czRaw] = key.split(',');
        const cx = Number(cxRaw.trim());
        const cz = Number(czRaw.trim());
        enqueuePropBuild(cx, cz, state.lod, -getChunkPriorityBoost(key), key, targetGroup);
      }
    }
  }

  function applyTerrainDebugSettings({ rebuildSurfaces = false, refreshSelection = false, rebuildProps = false } = {}) {
    normalizeTerrainDebugSettings();
    applyTerrainWireframeSetting();
    if (rebuildSurfaces) {
      invalidateActiveLeafSurfaces();
    }
    if (rebuildProps) {
      invalidateChunkProps();
    }
    if (refreshSelection) {
      updateTerrain();
    }
  }

  function applyRoadMarkingDebugSettings({ redraw = true } = {}) {
    normalizeRoadMarkingDebugSettings();
    roadMarkingOverlay.configure(roadMarkingDebugSettings);
    terrainDetailUniforms.uRoadMarkingWorldSize.value = roadMarkingDebugSettings.worldSize;
    terrainDetailUniforms.uRoadMarkingOpacity.value = roadMarkingDebugSettings.opacity;
    terrainDetailUniforms.uRoadMarkingFadeStart.value = roadMarkingDebugSettings.fadeStart;
    terrainDetailUniforms.uRoadMarkingFadeEnd.value = roadMarkingDebugSettings.fadeEnd;

    if (redraw && windowRef?.fsimWorld) {
      roadMarkingOverlay.refresh(windowRef.fsimWorld);
      if (roadMarkingOverlay.center) {
        terrainDetailUniforms.uRoadMarkingCenter.value.set(roadMarkingOverlay.center.x, roadMarkingOverlay.center.z);
      }
    }
  }

  function sampleNodeHeightGrid(sampler, node, resolution, depth) {
    if (!sampler || !node || !Number.isFinite(resolution) || resolution < 1) {
      return null;
    }

    const decodedLeaf = resolution === 32 ? sampler.decodeLeafHeightSamples(node.id, depth) : null;
    if (decodedLeaf && decodedLeaf.resolution === resolution) {
      return decodedLeaf;
    }

    const stride = resolution + 1;
    const heights = new Float32Array(stride * stride);
    for (let z = 0; z <= resolution; z += 1) {
      const wz = node.minZ + (z / resolution) * node.size;
      for (let x = 0; x <= resolution; x += 1) {
        const wx = node.minX + (x / resolution) * node.size;
        heights[z * stride + x] = sampler.getAltitudeAt(wx, wz);
      }
    }

    return {
      resolution,
      stride,
      heights
    };
  }

  function createWaterDepthTexture(node, sampler, resolution = 64) {
    const size = Math.max(4, resolution);
    const data = new Uint8Array(size * size * 4);
    for (let z = 0; z < size; z += 1) {
      const vz = size === 1 ? 0 : z / (size - 1);
      const worldZ = node.minZ + vz * node.size;
      for (let x = 0; x < size; x += 1) {
        const ux = size === 1 ? 0 : x / (size - 1);
        const worldX = node.minX + ux * node.size;
        const terrainHeight = sampler.getAltitudeAt(worldX, worldZ);
        const depth = Math.max(0, Math.min(WATER_DEPTH_BANDS.deepEnd, SEA_LEVEL - terrainHeight));
        const encoded = Math.round((depth / WATER_DEPTH_BANDS.deepEnd) * 255);
        const index = (z * size + x) * 4;
        data[index] = encoded;
        data[index + 1] = encoded;
        data[index + 2] = encoded;
        data[index + 3] = 255;
      }
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  function createLeafWaterMaterial(waterDepthTexture, node) {
    const material = waterMaterial.clone();
    material.normalMap = waterMaterial.normalMap;
    material.normalScale = waterMaterial.normalScale.clone();

    const leafWaterUniforms = {
      uWaterDepthTex: { value: waterDepthTexture },
      uWaterBoundsMin: { value: new THREE.Vector2(node.minX, node.minZ) },
      uWaterBoundsSize: { value: new THREE.Vector2(node.size, node.size) },
      uWaterDepthScale: { value: WATER_DEPTH_BANDS.deepEnd },
      uWaterFoamDepth: { value: WATER_DEPTH_BANDS.foam },
      uWaterShallowStart: { value: WATER_DEPTH_BANDS.shallowStart },
      uWaterShallowEnd: { value: WATER_DEPTH_BANDS.shallowEnd },
      uWaterDeepEnd: { value: WATER_DEPTH_BANDS.deepEnd },
      uWaterFoamColor: { value: waterSurfaceUniforms.uWaterFoamColor.value.clone() },
      uWaterShallowColor: { value: waterSurfaceUniforms.uWaterShallowColor.value.clone() },
      uWaterDeepColor: { value: waterSurfaceUniforms.uWaterDeepColor.value.clone() }
    };

    setupWaterMaterial(material, atmosphereUniforms, waterTimeUniform, false, leafWaterUniforms);
    return material;
  }

  function enqueueLeafBuild(leafState, priority = 0) {
    if (!leafState || pendingLeafBuildIds.has(leafState.leafId)) return;
    leafState.enqueuedAtMs = performance.now();
    if (!Number.isFinite(leafState.pendingSinceAtMs)) {
      leafState.pendingSinceAtMs = leafState.enqueuedAtMs;
    }
    pendingLeafBuildIds.add(leafState.leafId);
    pendingLeafBuilds.push({ leafId: leafState.leafId, priority });
    pendingLeafQueueDirty = true;
  }

  function refreshLeafBuildQueuePriorities() {
    if (pendingLeafBuilds.length === 0) return;
    for (const job of pendingLeafBuilds) {
      const leafState = activeLeaves.get(job.leafId);
      if (!leafState || leafState.retired || leafState.state === 'surface_ready') continue;
      job.priority = getLeafBuildPriority(leafState);
    }
    pendingLeafQueueDirty = true;
  }

  function getLeafCenter(leafState) {
    const bounds = leafState?.bounds;
    if (!bounds) return null;
    return {
      x: (bounds.minX + bounds.maxX) * 0.5,
      z: (bounds.minZ + bounds.maxZ) * 0.5
    };
  }

  function getLeafBuildPriority(leafState) {
    if (!leafState) return Number.POSITIVE_INFINITY;
    const distanceSq = distanceToLeafBoundsSq(leafState, PHYSICS.position.x, PHYSICS.position.z);
    const velocityX = Number.isFinite(PHYSICS?.velocity?.x) ? PHYSICS.velocity.x : 0;
    const velocityZ = Number.isFinite(PHYSICS?.velocity?.z) ? PHYSICS.velocity.z : 0;
    const speed = Math.hypot(velocityX, velocityZ);
    let effectiveDistanceSq = distanceSq;
    let forwardBoost = 0;

    if (speed > 1) {
      const lookaheadTimes = [0.4, 0.9, 1.6];
      for (const lookaheadSeconds of lookaheadTimes) {
        const predictedX = PHYSICS.position.x + velocityX * lookaheadSeconds;
        const predictedZ = PHYSICS.position.z + velocityZ * lookaheadSeconds;
        effectiveDistanceSq = Math.min(effectiveDistanceSq, distanceToLeafBoundsSq(leafState, predictedX, predictedZ));
      }

      const center = getLeafCenter(leafState);
      if (center) {
        const toLeafX = center.x - PHYSICS.position.x;
        const toLeafZ = center.z - PHYSICS.position.z;
        const toLeafLength = Math.hypot(toLeafX, toLeafZ);
        if (toLeafLength > 1e-3) {
          const alignment = ((toLeafX * velocityX) + (toLeafZ * velocityZ)) / (toLeafLength * speed);
          if (alignment > 0) {
            forwardBoost = alignment * Math.min(60000, speed * 220);
          }
        }
      }
    }

    const pendingAgeMs = Number.isFinite(leafState.pendingSinceAtMs)
      ? Math.max(0, performance.now() - leafState.pendingSinceAtMs)
      : 0;
    const pendingAgeBoost = Math.min(120000, pendingAgeMs * 150);
    const blockingBoost = leafState.blockingReady ? 1_000_000 : 0;
    const nearBoost = effectiveDistanceSq < (800 * 800) ? 120000 : effectiveDistanceSq < (1600 * 1600) ? 40000 : 0;
    const baseReadyBoost = leafState.propState === 'base_ready' ? 20000 : 0;
    const sizeBias = Number.isFinite(leafState.size) ? leafState.size * 0.01 : 0;
    return effectiveDistanceSq - blockingBoost - forwardBoost - pendingAgeBoost - nearBoost - baseReadyBoost - sizeBias;
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
    if (!leafState?.terrainMesh || !leafState?.waterMesh) return false;
    for (const nextLeafState of selectedLeafStates) {
      if (!nextLeafState || nextLeafState.retired) continue;
      if (!boundsOverlap(leafState.bounds, nextLeafState.bounds)) continue;
      if (nextLeafState.state !== 'surface_ready') {
        return true;
      }
    }
    return false;
  }

  function buildNativeLeafSurface(leafState) {
    const buildStartedAtMs = performance.now();
    const sampler = getStaticSampler();
    if (!sampler || !Number.isInteger(leafState.nodeId)) {
      leafState.state = 'error';
      return;
    }

    const node = sampler.getNode(leafState.nodeId, leafState.depth);
    const surfaceResolution = getNativeSurfaceResolution(node?.size ?? CHUNK_SIZE, {
      bootstrapBlocking: leafState.blockingReady
    });
    const sampleStartedAtMs = performance.now();
    const decoded = sampleNodeHeightGrid(sampler, node, surfaceResolution, leafState.depth);
    if (!node || !decoded) {
      leafState.state = 'error';
      return;
    }
    const sampleHeightMs = performance.now() - sampleStartedAtMs;

    const worldData = getStaticWorldMetadata() || windowRef?.fsimWorld || null;
    const materialSetupStartedAtMs = performance.now();
    const terrainGeometryStartedAtMs = performance.now();
    const terrainGeometry = createLeafSurfaceGeometry({
      node,
      heights: decoded.heights,
      stride: decoded.stride,
      worldData,
      sampler,
      materialKind: 'terrain'
    });
    const terrainGeometryMs = performance.now() - terrainGeometryStartedAtMs;
    const waterGeometryStartedAtMs = performance.now();
    const waterGeometry = createLeafSurfaceGeometry({
      node,
      heights: decoded.heights,
      stride: decoded.stride,
      worldData,
      sampler,
      materialKind: 'water'
    });
    const waterGeometryMs = performance.now() - waterGeometryStartedAtMs;
    const terrainMesh = new THREE.Mesh(terrainGeometry, terrainMaterial);
    terrainMesh.receiveShadow = true;
    terrainMesh.position.set(node.minX, 0, node.minZ);
    const waterDepthStartedAtMs = performance.now();
    const waterDepthTexture = createWaterDepthTexture(node, sampler, (bootstrapMode && leafState.blockingReady) ? 16 : (bootstrapMode ? 32 : 64));
    const waterDepthTextureMs = performance.now() - waterDepthStartedAtMs;
    const leafWaterMaterial = createLeafWaterMaterial(waterDepthTexture, node);
    const waterMesh = new THREE.Mesh(waterGeometry, leafWaterMaterial);
    waterMesh.receiveShadow = leafState.chunkLod === 0;
    waterMesh.position.set(node.minX, 0, node.minZ);
    const materialSetupMs = performance.now() - materialSetupStartedAtMs;

    const sceneAttachStartedAtMs = performance.now();
    if (leafState.terrainMesh || leafState.waterMesh) {
      disposeLeafRuntimeLeaf(leafState);
    }
    leafState.terrainMesh = terrainMesh;
    leafState.waterMesh = waterMesh;
    leafState.waterDepthTexture = waterDepthTexture;
    leafState.surfaceResolution = surfaceResolution;
    leafState.state = 'surface_ready';
    recordLeafCompletion(leafState, performance.now());
    scene.add(terrainMesh);
    scene.add(waterMesh);
    const sceneAttachMs = performance.now() - sceneAttachStartedAtMs;
    recordLeafBuildBreakdown({
      sampleHeightMs,
      terrainGeometryMs,
      waterGeometryMs,
      waterDepthTextureMs,
      materialSetupMs,
      sceneAttachMs,
      totalMs: performance.now() - buildStartedAtMs
    });
  }

  function processLeafBuildQueue(maxBuildsPerFrame = 4) {
    const startedAtMs = performance.now();
    if (pendingLeafBuilds.length === 0) {
      return { durationMs: 0, builds: 0 };
    }
    refreshLeafBuildQueuePriorities();
    if (pendingLeafQueueDirty) {
      pendingLeafBuilds.sort((a, b) => b.priority - a.priority);
      pendingLeafQueueDirty = false;
    }

    let builds = 0;
    while (builds < maxBuildsPerFrame && pendingLeafBuilds.length > 0) {
      const job = pendingLeafBuilds.pop();
      pendingLeafBuildIds.delete(job.leafId);
      const leafState = activeLeaves.get(job.leafId);
      if (!leafState || leafState.retired || leafState.state === 'surface_ready') continue;
      leafState.buildVersion += 1;
      leafState.lastBuildStartedAtMs = performance.now();
      buildNativeLeafSurface(leafState);
      builds += 1;
    }

    return {
      durationMs: performance.now() - startedAtMs,
      builds
    };
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
      roadMarkingOverlay.update(PHYSICS.position.x, PHYSICS.position.z, windowRef.fsimWorld);
      terrainDetailUniforms.uRoadMarkingCenter.value.set(roadMarkingOverlay.center.x, roadMarkingOverlay.center.z);
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

  function getPooledInstancedMesh(geometry, material, count, { colorable = false } = {}) {
    const key = geometry.uuid + '_' + material.uuid;
    let pool = instancedMeshPools.get(key);
    if (!pool) { pool = []; instancedMeshPools.set(key, pool); }
    let bestIdx = -1;
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].instanceMatrix.count >= count) {
        if (bestIdx === -1 || pool[i].instanceMatrix.count < pool[bestIdx].instanceMatrix.count) bestIdx = i;
      }
    }
    if (bestIdx !== -1) {
      const mesh = pool.splice(bestIdx, 1)[0];
      mesh.count = count;
      return mesh;
    }
    const capacity = Math.max(count, 32);
    const isColorable = colorable || geometry === baseBuildingGeo || geometry === roofCapGeo || geometry === podiumGeo || geometry === spireGeo;
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    if (!mesh.instanceColor && isColorable) {
      const colorArray = new Float32Array(capacity * 3);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3);
    }
    mesh.count = count;
    return mesh;
  }

  function disposeChunkGroup(chunkGroup) {
    if (!chunkGroup) return;
    scene.remove(chunkGroup);
    chunkGroup.userData.windmillBladeMeshes = null;
    const lod = chunkGroup.userData.lod;
    if (lod !== undefined && chunkPools[lod]) {
      while (chunkGroup.children.length > 2) {
        const child = chunkGroup.children[chunkGroup.children.length - 1];
        chunkGroup.remove(child);
        if (child.isInstancedMesh) {
          child.count = 0;
          if (child.instanceMatrix) child.instanceMatrix.needsUpdate = false;
          if (child.instanceColor) child.instanceColor.needsUpdate = false;
          if (child.userData?.windmillBladeInstances) child.userData.windmillBladeInstances = null;
          child.userData = {};
          const key = child.geometry.uuid + '_' + child.material.uuid;
          let pool = instancedMeshPools.get(key);
          if (!pool) {
            pool = [];
            instancedMeshPools.set(key, pool);
          }
          pool.push(child);
        }
      }
      chunkPools[lod].push(chunkGroup);
    } else {
      chunkGroup.traverse((child) => { if (child.isMesh || child.isInstancedMesh) child.geometry.dispose(); });
    }
  }

  function generateChunkBase(cx, cz, lod = 0) {
    return genBase(cx, cz, lod, { LOD_LEVELS, chunkPools, terrainMaterial, terrainFarMaterial, waterMaterial, waterFarMaterial, Noise, scene })
      .then((group) => {
        if (group?.children?.[0]) {
          group.children[0].visible = false;
          group.children[0].receiveShadow = false;
        }
        if (group?.children?.[1]) {
          group.children[1].visible = false;
          group.children[1].receiveShadow = false;
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
    const key = `${cx}, ${cz}`;
    if (pendingChunkKeys.has(key)) return;
    pendingChunkKeys.add(key);
    pendingChunkBuilds.push({ cx, cz, lod, key, priority });
    pendingQueueDirty = true;
  }

  function getTargetLod(ringDistance, currentLod = null) {
    const lod = getLodForRingDistance(ringDistance, currentLod, lodSettings.terrain);
    return bootstrapMode ? (ringDistance === 0 ? lod : 3) : lod;
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
    const bounds = leaf?.bounds;
    if (!bounds) return Infinity;
    const dx = x < bounds.minX ? bounds.minX - x : (x > bounds.maxX ? x - bounds.maxX : 0);
    const dz = z < bounds.minZ ? bounds.minZ - z : (z > bounds.maxZ ? z - bounds.maxZ : 0);
    return dx * dx + dz * dz;
  }

  function trimBootstrapSelection(selection, cameraX, cameraZ) {
    if (!bootstrapMode || !selection || !Array.isArray(selection.selectedLeaves) || selection.selectedLeaves.length === 0) {
      return selection;
    }

    const prioritizedLeaves = [...selection.selectedLeaves].sort((a, b) => {
      const aDistanceSq = distanceToLeafBoundsSq(a, cameraX, cameraZ);
      const bDistanceSq = distanceToLeafBoundsSq(b, cameraX, cameraZ);
      if (aDistanceSq !== bDistanceSq) return aDistanceSq - bDistanceSq;
      if ((a.size ?? 0) !== (b.size ?? 0)) return (a.size ?? 0) - (b.size ?? 0);
      return String(a.leafId).localeCompare(String(b.leafId));
    });

    const keptLeaves = prioritizedLeaves.map((leaf) => ({ ...leaf }));
    const blockingLeafIdSet = new Set(
      keptLeaves
        .filter((leaf) => leaf.blockingReady)
        .map((leaf) => leaf.leafId)
    );

    const requiredChunkKeys = new Set();
    const blockingChunkKeys = new Set();
    const nonBlockingChunkKeys = new Set();
    const chunkLods = new Map();
    const selectedLeafIds = new Set();

    for (const leaf of keptLeaves) {
      leaf.blockingReady = blockingLeafIdSet.has(leaf.leafId);
      selectedLeafIds.add(leaf.leafId);
      for (const key of leaf.chunkKeys || []) {
        requiredChunkKeys.add(key);
        const previousLod = chunkLods.get(key);
        if (!Number.isInteger(previousLod) || leaf.chunkLod < previousLod) {
          chunkLods.set(key, leaf.chunkLod);
        }
        if (leaf.blockingReady) blockingChunkKeys.add(key);
      }
    }

    for (const key of requiredChunkKeys) {
      if (!blockingChunkKeys.has(key)) nonBlockingChunkKeys.add(key);
    }

    return {
      ...selection,
      selectedLeaves: keptLeaves,
      selectedLeafIds,
      blockingLeafIds: blockingLeafIdSet,
      requiredChunkKeys,
      blockingChunkKeys,
      nonBlockingChunkKeys,
      chunkLods
    };
  }

  function refineBlockingSelection(selection, cameraX, cameraZ) {
    if (bootstrapMode || !selection || !Array.isArray(selection.selectedLeaves) || selection.selectedLeaves.length === 0) {
      return selection;
    }

    const currentlyBlockingLeaves = selection.selectedLeaves.filter((leaf) => leaf.blockingReady);
    if (currentlyBlockingLeaves.length <= 24) {
      return selection;
    }

    const velocityX = Number.isFinite(PHYSICS?.velocity?.x) ? PHYSICS.velocity.x : 0;
    const velocityZ = Number.isFinite(PHYSICS?.velocity?.z) ? PHYSICS.velocity.z : 0;
    const speed = Math.hypot(velocityX, velocityZ);
    const nearDistanceSq = Math.pow(Math.max(CHUNK_SIZE * 0.6, terrainDebugSettings.selectionBlockingRadius * 0.45), 2);
    const targetBlockingLeafCount = Math.max(
      20,
      Math.min(
        currentlyBlockingLeaves.length,
        24 + Math.min(12, Math.round(speed / 35))
      )
    );

    function scoreLeaf(leaf) {
      const baseDistanceSq = distanceToLeafBoundsSq(leaf, cameraX, cameraZ);
      let effectiveDistanceSq = baseDistanceSq;
      let forwardBoost = 0;

      if (speed > 1) {
        const centerX = (leaf.bounds.minX + leaf.bounds.maxX) * 0.5;
        const centerZ = (leaf.bounds.minZ + leaf.bounds.maxZ) * 0.5;
        const toLeafX = centerX - cameraX;
        const toLeafZ = centerZ - cameraZ;
        const toLeafLength = Math.hypot(toLeafX, toLeafZ);
        if (toLeafLength > 1e-3) {
          const alignment = ((toLeafX * velocityX) + (toLeafZ * velocityZ)) / (toLeafLength * speed);
          if (alignment > 0) {
            forwardBoost = alignment * Math.min(50000, speed * 180);
          }
        }
        for (const lookaheadSeconds of [0.4, 0.9, 1.5]) {
          const predictedX = cameraX + velocityX * lookaheadSeconds;
          const predictedZ = cameraZ + velocityZ * lookaheadSeconds;
          effectiveDistanceSq = Math.min(effectiveDistanceSq, distanceToLeafBoundsSq(leaf, predictedX, predictedZ));
        }
      }

      const sizeBias = Number.isFinite(leaf.size) ? leaf.size * 0.01 : 0;
      return effectiveDistanceSq - forwardBoost - sizeBias;
    }

    const alwaysKeep = [];
    const candidates = [];
    for (const leaf of currentlyBlockingLeaves) {
      if (distanceToLeafBoundsSq(leaf, cameraX, cameraZ) <= nearDistanceSq) {
        alwaysKeep.push(leaf);
      } else {
        candidates.push(leaf);
      }
    }

    candidates.sort((a, b) => scoreLeaf(a) - scoreLeaf(b));
    const refinedBlockingLeafIds = new Set(alwaysKeep.map((leaf) => leaf.leafId));
    for (const leaf of candidates) {
      if (refinedBlockingLeafIds.size >= targetBlockingLeafCount) break;
      refinedBlockingLeafIds.add(leaf.leafId);
    }

    if (refinedBlockingLeafIds.size === currentlyBlockingLeaves.length) {
      return selection;
    }

    const selectedLeaves = selection.selectedLeaves.map((leaf) => ({
      ...leaf,
      blockingReady: refinedBlockingLeafIds.has(leaf.leafId)
    }));
    const blockingChunkKeys = new Set();
    const nonBlockingChunkKeys = new Set();
    for (const leaf of selectedLeaves) {
      for (const key of leaf.chunkKeys || []) {
        if (leaf.blockingReady) blockingChunkKeys.add(key);
      }
    }
    for (const key of selection.requiredChunkKeys || []) {
      if (!blockingChunkKeys.has(key)) nonBlockingChunkKeys.add(key);
    }

    return {
      ...selection,
      selectedLeaves,
      blockingLeafIds: refinedBlockingLeafIds,
      blockingChunkKeys,
      nonBlockingChunkKeys
    };
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

  function buildGridActiveChunks(centerChunkX, centerChunkZ) {
    const renderDistance = bootstrapMode ? 0 : lodSettings.terrain.renderDistance;
    const activeChunks = new Map();
    const nextBlockingChunkKeys = new Set();
    const selectedLeaves = [];
    const selectedLeafIds = new Set();
    const nextBlockingLeafIds = new Set();

    for (let dx = -renderDistance; dx <= renderDistance; dx++) {
      for (let dz = -renderDistance; dz <= renderDistance; dz++) {
        const cx = centerChunkX + dx;
        const cz = centerChunkZ + dz;
        const key = `${cx}, ${cz}`;
        const ringDistance = Math.max(Math.abs(dx), Math.abs(dz));
        const currentLod = terrainChunks.has(key) ? terrainChunks.get(key).lod : null;
        const lod = getTargetLod(ringDistance, currentLod);
        activeChunks.set(key, lod);
        nextBlockingChunkKeys.add(key);
        const leafId = `grid:${key}`;
        selectedLeafIds.add(leafId);
        nextBlockingLeafIds.add(leafId);
        selectedLeaves.push({
          leafId,
          nodeId: null,
          depth: 0,
          type: 'grid',
          bounds: {
            minX: cx * CHUNK_SIZE,
            minZ: cz * CHUNK_SIZE,
            maxX: (cx + 1) * CHUNK_SIZE,
            maxZ: (cz + 1) * CHUNK_SIZE
          },
          size: CHUNK_SIZE,
          chunkLod: lod,
          blockingReady: true,
          chunkKeys: [key]
        });
      }
    }

    return {
      selectedLeaves,
      selectedLeafIds,
      blockingLeafIds: nextBlockingLeafIds,
      activeChunks,
      blockingKeys: nextBlockingChunkKeys,
      selectedNodes: selectedLeaves,
      selectionRegion: null,
      mode: 'grid_fallback'
    };
  }

  function smoothActiveChunkLods(activeChunks) {
    if (!activeChunks || activeChunks.size === 0) return activeChunks;

    let changed = true;
    let iterations = 0;
    while (changed && iterations < 8) {
      changed = false;
      iterations += 1;

      for (const [key, lod] of activeChunks.entries()) {
        const [cxRaw, czRaw] = key.split(',');
        const cx = Number(cxRaw.trim());
        const cz = Number(czRaw.trim());
        if (!Number.isFinite(cx) || !Number.isFinite(cz)) continue;

        const neighbors = [
          `${cx - 1}, ${cz}`,
          `${cx + 1}, ${cz}`,
          `${cx}, ${cz - 1}`,
          `${cx}, ${cz + 1}`
        ];

        for (const neighborKey of neighbors) {
          if (!activeChunks.has(neighborKey)) continue;
          const neighborLod = activeChunks.get(neighborKey);
          if (!Number.isInteger(neighborLod)) continue;

          if (lod < neighborLod - 1) {
            activeChunks.set(neighborKey, lod + 1);
            changed = true;
          } else if (neighborLod < lod - 1) {
            activeChunks.set(key, neighborLod + 1);
            changed = true;
          }
        }
      }
    }

    return activeChunks;
  }

  function updateLeafChunkLods(selectedLeaves, activeChunks) {
    if (!Array.isArray(selectedLeaves)) return;
    for (const leaf of selectedLeaves) {
      let finestLod = Number.isInteger(leaf.chunkLod) ? leaf.chunkLod : null;
      for (const key of leaf.chunkKeys || []) {
        const chunkLod = activeChunks.get(key);
        if (!Number.isInteger(chunkLod)) continue;
        if (!Number.isInteger(finestLod) || chunkLod < finestLod) {
          finestLod = chunkLod;
        }
      }
      leaf.chunkLod = finestLod ?? leaf.chunkLod ?? 3;
    }
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

    const selectedIds = new Set((selectedLeaves || []).map((leaf) => leaf.leafId));

    for (const leaf of selectedLeaves || []) {
      const existing = activeLeaves.get(leaf.leafId);
      const nextState = getLeafStateForChunkKeys(leaf.chunkKeys);
      let leafState = existing;

      if (!leafState) {
        leafState = createNativeLeafRuntime(leaf);
        activeLeaves.set(leaf.leafId, leafState);
        enqueueLeafBuild(leafState, getLeafBuildPriority(leafState));
      } else {
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
        } else if (leafState.state === 'surface_ready' && leafState.surfaceResolution !== desiredResolution) {
          markLeafPendingSurface(leafState, { resetPendingStart: true });
          enqueueLeafBuild(leafState, getLeafBuildPriority(leafState));
        }
      }

      if (!leafState.terrainMesh || !leafState.waterMesh) {
        markLeafPendingSurface(leafState);
      } else if (leafState.state !== 'error') {
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

    const selectedLeafStates = (selectedLeaves || [])
      .map((leaf) => activeLeaves.get(leaf.leafId))
      .filter(Boolean);

    for (const [leafId, leafState] of activeLeaves.entries()) {
      if (selectedIds.has(leafId)) continue;
      if (shouldRetainLeafDuringTransition(leafState, selectedLeafStates)) {
        leafState.retired = true;
        leafState.blockingReady = false;
        continue;
      }
      disposeLeafRuntimeLeaf(leafState);
      activeLeaves.delete(leafId);
      pendingLeafBuildIds.delete(leafId);
    }

    lastTerrainSelection = {
      mode,
      selectedLeafCount: selectedLeaves?.length || 0,
      blockingLeafCount: nextBlockingLeafIds.size,
      pendingBlockingLeafCount: 0,
      activeChunkCount: chunkLeafOwners.size,
      blockingChunkCount: Array.from(chunkLeafOwners.entries()).filter(([, owners]) => {
        for (const ownerId of owners) {
          if (nextBlockingLeafIds.has(ownerId)) return true;
        }
        return false;
      }).length,
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
        distanceSq: distanceToLeafBoundsSq(leaf, PHYSICS.position.x, PHYSICS.position.z)
      });
    }
    stalledPendingLeaves.sort((a, b) => (b.ageMs || 0) - (a.ageMs || 0));
    lastTerrainSelection.pendingBlockingLeafCount = pendingBlockingLeaves.length;
    lastTerrainSelection.blockingLeafStates = pendingBlockingLeaves.slice(0, 10);
    lastTerrainSelection.selectedLeafCount = Array.from(activeLeaves.values()).filter((leaf) => !leaf.retired).length;
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

  function buildQuadtreeActiveChunks(centerChunkX, centerChunkZ) {
    const controller = ensureQuadtreeSelectionController();
    if (!controller) {
      return buildGridActiveChunks(centerChunkX, centerChunkZ);
    }

    const selection = controller.select({
      cameraX: PHYSICS.position.x,
      cameraZ: PHYSICS.position.z,
      blockingRadius: bootstrapMode ? terrainDebugSettings.bootstrapRadius : terrainDebugSettings.selectionBlockingRadius,
      interestRadius: bootstrapMode ? terrainDebugSettings.bootstrapRadius : terrainDebugSettings.selectionInterestRadius,
      minCellSize: terrainDebugSettings.selectionMinCellSize,
      splitDistanceFactor: terrainDebugSettings.selectionSplitDistanceFactor,
      maxSelectionDepth: terrainDebugSettings.selectionMaxDepth
    });
    const effectiveSelection = refineBlockingSelection(
      trimBootstrapSelection(selection, PHYSICS.position.x, PHYSICS.position.z),
      PHYSICS.position.x,
      PHYSICS.position.z
    );
    const activeChunks = new Map();

    for (const key of effectiveSelection.requiredChunkKeys) {
      const [cxRaw, czRaw] = key.split(',');
      const cx = Number(cxRaw.trim());
      const cz = Number(czRaw.trim());
      if (!Number.isFinite(cx) || !Number.isFinite(cz)) continue;
      const currentLod = terrainChunks.has(key) ? terrainChunks.get(key).lod : null;
      const selectedLod = effectiveSelection.chunkLods.get(key);
      const targetLod = Number.isInteger(selectedLod) ? selectedLod : currentLod;
      activeChunks.set(key, targetLod ?? 3);
    }

    return {
      selectedLeaves: effectiveSelection.selectedLeaves,
      selectedLeafIds: effectiveSelection.selectedLeafIds,
      blockingLeafIds: effectiveSelection.blockingLeafIds,
      activeChunks,
      blockingKeys: new Set(effectiveSelection.blockingChunkKeys),
      selectedNodes: effectiveSelection.selectedLeaves,
      selectionRegion: effectiveSelection.selectionRegion,
      mode: bootstrapMode ? 'native_bootstrap' : 'quadtree'
    };
  }

  function removePendingPropJobs(key) {
    if (!pendingPropKeys.has(key)) return;
    for (let i = pendingPropBuilds.length - 1; i >= 0; i--) {
      if (pendingPropBuilds[i].key === key) pendingPropBuilds.splice(i, 1);
    }
    pendingPropKeys.delete(key);
    pendingPropQueueDirty = true;
  }

  function enqueuePropBuild(cx, cz, lod, priority, key, groupRef) {
    if (pendingPropKeys.has(key)) return;
    pendingPropKeys.add(key);
    pendingPropBuilds.push({ cx, cz, lod, priority, key, groupRef });
    pendingPropQueueDirty = true;
  }

  function processChunkBuildQueue(maxBuildsPerFrame = 2) {
    const startedAtMs = performance.now();
    if (pendingChunkBuilds.length === 0) {
      return { durationMs: 0, builds: 0 };
    }
    if (pendingQueueDirty) { pendingChunkBuilds.sort((a, b) => b.priority - a.priority); pendingQueueDirty = false; }
    let builds = 0;
    while (builds < maxBuildsPerFrame && pendingChunkBuilds.length > 0) {
      const job = pendingChunkBuilds.pop();
      pendingChunkKeys.delete(job.key);
      const existing = terrainChunks.get(job.key);

      if (existing && existing.lod === job.lod) {
        if (!existing.propsBuilt && existing.state !== 'building_props') {
          enqueuePropBuild(job.cx, job.cz, job.lod, job.priority, job.key, existing.group || existing.pendingGroup);
        }
        continue;
      }

      if (existing && existing.state === 'building_base' && existing.lod === job.lod) {
        continue;
      }

      let oldGroup = null;
      if (existing) {
        removePendingPropJobs(job.key);
        oldGroup = existing.group;
        if (existing.pendingGroup) disposeChunkGroup(existing.pendingGroup);
      }

      terrainChunks.set(job.key, { group: oldGroup, pendingGroup: null, lod: job.lod, propsBuilt: false, state: 'building_base' });
      builds++;

      generateChunkBase(job.cx, job.cz, job.lod).then(group => {
        const current = terrainChunks.get(job.key);
        if (current && current.lod === job.lod && current.state === 'building_base') {
          current.pendingGroup = group;
          current.state = 'base_done';
          enqueuePropBuild(job.cx, job.cz, job.lod, job.priority, job.key, group);
        } else {
          disposeChunkGroup(group);
        }
      }).catch(err => {
        console.error(`[terrain] Base build failed for ${job.key}:`, err);
        const current = terrainChunks.get(job.key);
        if (current && current.state === 'building_base') current.state = 'error';
      });
    }

    return {
      durationMs: performance.now() - startedAtMs,
      builds
    };
  }

  function processPropBuildQueue(maxBuildsPerFrame = 1) {
    const startedAtMs = performance.now();
    if (pendingPropBuilds.length === 0) {
      return { durationMs: 0, builds: 0 };
    }
    if (pendingPropQueueDirty) { pendingPropBuilds.sort((a, b) => b.priority - a.priority); pendingPropQueueDirty = false; }
    let builds = 0;
    while (builds < maxBuildsPerFrame && pendingPropBuilds.length > 0) {
      const job = pendingPropBuilds.pop();
      pendingPropKeys.delete(job.key);
      const state = terrainChunks.get(job.key);

      const targetGroup = state ? (state.pendingGroup || state.group) : null;
      if (!state || targetGroup !== job.groupRef || state.lod !== job.lod || state.propsBuilt || state.state === 'building_props') {
        continue;
      }

      state.state = 'building_props';
      builds++;

      generateChunkProps(targetGroup, job.cx, job.cz, job.lod).then(() => {
        const current = terrainChunks.get(job.key);
        if (current && (current.pendingGroup === job.groupRef || current.group === job.groupRef) && current.lod === job.lod && current.state === 'building_props') {
          if (current.pendingGroup) {
            if (current.group) disposeChunkGroup(current.group);
            current.group = current.pendingGroup;
            scene.add(current.group);
            current.pendingGroup = null;
          } else if (current.group && !current.group.parent) {
            scene.add(current.group);
          }
          current.propsBuilt = true;
          current.state = 'done';
        }
      }).catch(err => {
        console.error(`[terrain] Prop build failed for ${job.key}:`, err);
        const current = terrainChunks.get(job.key);
        if (current && current.state === 'building_props') {
          if (current.pendingGroup) {
            if (current.group) disposeChunkGroup(current.group);
            current.group = current.pendingGroup;
            scene.add(current.group);
            current.pendingGroup = null;
          }
          current.state = 'done';
        }
      });
    }

    return {
      durationMs: performance.now() - startedAtMs,
      builds
    };
  }

  let lastProcessedChunkX = -999999;
  let lastProcessedChunkZ = -999999;
  let lastReady = false;

  function updateTerrain() {
    const updateStartedAtMs = performance.now();
    resetLeafBuildBreakdown();
    const px = Math.floor(PHYSICS.position.x / CHUNK_SIZE);
    const pz = Math.floor(PHYSICS.position.z / CHUNK_SIZE);

    lastProcessedChunkX = px;
    lastProcessedChunkZ = pz;

    const selectionStartedAtMs = performance.now();
    const selectionState = buildQuadtreeActiveChunks(px, pz);
    const activeChunks = smoothActiveChunkLods(selectionState.activeChunks);
    updateLeafChunkLods(selectionState.selectedLeaves, activeChunks);
    blockingLeafIds = selectionState.blockingLeafIds || new Set();
    syncActiveLeaves(
      selectionState.selectedLeaves || [],
      blockingLeafIds,
      selectionState.selectionRegion || null,
      selectionState.mode || (bootstrapMode ? 'grid_bootstrap' : 'grid_fallback')
    );
    const selectionBuildMs = performance.now() - selectionStartedAtMs;

    const queueSchedulingStartedAtMs = performance.now();
    for (const [key, lod] of activeChunks.entries()) {
      const [cxRaw, czRaw] = key.split(',');
      const cx = Number(cxRaw.trim());
      const cz = Number(czRaw.trim());
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
      if (!chunkLeafOwners.has(job.key)) { pendingChunkKeys.delete(job.key); pendingChunkBuilds.splice(i, 1); pendingQueueDirty = true; }
    }
    for (let i = pendingPropBuilds.length - 1; i >= 0; i--) {
      const job = pendingPropBuilds[i];
      if (!chunkLeafOwners.has(job.key)) { pendingPropKeys.delete(job.key); pendingPropBuilds.splice(i, 1); pendingPropQueueDirty = true; }
    }
    for (const [key, chunkState] of terrainChunks.entries()) {
      if (!chunkLeafOwners.has(key)) {
        removePendingPropJobs(key);
        if (chunkState.group) disposeChunkGroup(chunkState.group);
        if (chunkState.pendingGroup) disposeChunkGroup(chunkState.pendingGroup);
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
    refreshTerrainSelectionDiagnostics();
    terrainPerfState.lastUpdate = {
      selectionBuildMs,
      queueSchedulingMs,
      queuePruneMs,
      leafBuildMs: leafBuildStats.durationMs,
      chunkBuildQueueMs: chunkBuildStats.durationMs,
      propBuildQueueMs: propBuildStats.durationMs,
      totalMs: performance.now() - updateStartedAtMs,
      leafBuilds: leafBuildStats.builds,
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

  function getTerrainSelectionDiagnostics() {
    const generationDiagnostics = getTerrainGenerationDiagnostics();
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
      worker: generationDiagnostics.worker,
      generation: generationDiagnostics.generation,
      timings: { ...terrainPerfState.lastUpdate }
    };
  }

  function updateTerrainAtmosphere(camera, weatherColor = null) {
    terrainDetailUniforms.uTerrainAtmosStrength.value = 0.25;
    if (camera) {
      atmosphereCameraPos.copy(camera.position);
      tempMainCameraPosUniform.value.copy(camera.position);
      if (windowRef?.fsimWorld && roadMarkingOverlay.update(camera.position.x, camera.position.z, windowRef.fsimWorld)) {
        terrainDetailUniforms.uRoadMarkingCenter.value.set(roadMarkingOverlay.center.x, roadMarkingOverlay.center.z);
      }
    }
    const windmillTime = performance.now() * 0.001;
    for (const state of terrainChunks.values()) {
      if (state.group) animateWindmillProps(state.group, windmillTime, dummy);
      if (state.pendingGroup) animateWindmillProps(state.pendingGroup, windmillTime, dummy);
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

  const getTerrainHeightWithNoise = (x, z, octaves = 6) => getTerrainHeight(x, z, Noise, octaves);

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
    terrainGeo.setAttribute('surfaceOverrides', new THREE.Float32BufferAttribute(new Float32Array(terrainGeo.attributes.position.count * 4), 4));
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

    const px = Math.floor(PHYSICS.position.x / CHUNK_SIZE);
    const pz = Math.floor(PHYSICS.position.z / CHUNK_SIZE);
    if (px !== lastProcessedChunkX || pz !== lastProcessedChunkZ) return false;

    const readyLeafIds = blockingLeafIds.size > 0
      ? blockingLeafIds
      : new Set(
        Array.from(activeLeaves.entries())
          .filter(([, leaf]) => !leaf.retired)
          .map(([leafId]) => leafId)
      );
    const blocking = [];
    for (const leafId of readyLeafIds) {
      const leaf = activeLeaves.get(leafId);
      if (!leaf) continue;
      if (leaf.state !== 'surface_ready') {
        blocking.push(`${leafId}:${leaf.state}`);
      }
    }

    if (blocking.length > 0 && window._isReadyLogCounter % 120 === 0) {
      debugLog(`[isReady] leaves=${activeLeaves.size} blocking=[${blocking.slice(0, 5)}]`);
    }
    window._isReadyLogCounter = (window._isReadyLogCounter || 0) + 1;

    return blocking.length === 0;
  };

  function hasPendingTerrainWork() {
    if (pendingLeafBuilds.length > 0 || pendingChunkBuilds.length > 0 || pendingPropBuilds.length > 0) {
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
      const [cx, cz] = key.split(',').map(Number);

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
    updateTerrainAtmosphere,
    getTerrainSelectionDiagnostics,
    terrainDebugSettings,
    roadMarkingDebugSettings,
    applyTerrainDebugSettings,
    applyRoadMarkingDebugSettings,
    isReady,
    hasPendingTerrainWork,
    refreshBakedTerrain,
    reloadHydrology: rebuildHydrologyMeshes,
    reloadCity,
    getShaderValidationVariants,
    completeBootstrap
  };
}
