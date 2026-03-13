import { createEnvironment } from './environment.js';
import { createTerrainSystem } from './terrain.js';
import { createRunwaySystem } from './runway.js';
import { createTowerSystem } from './tower.js';
import { createApron } from './apron.js';
import { createHangarSystem } from './hangar.js';
import { createRadarSystem } from './radar.js';
import { createCloudSystem } from './clouds.js';
import { createParticleSystem } from './particles.js';
import { createAircraftSystem } from './aircraft.js';
import { createTokenSystem } from './tokens.js';

import { createWorldLodManager } from './WorldLodManager.js';
import { createRuntimeLodSettings, normalizeLodSettings } from './LodSystem.js';
import { summarizeShaderValidationReport, warmupShaderPrograms } from './ShaderWarmup.js';
import {
  createShaderVariantRegistry,
  listShaderVariants,
  registerShaderVariants
} from './ShaderVariantRegistry.js';

export function createWorldObjects({ scene, renderer, Noise, PHYSICS, AIRCRAFT, WEATHER, lodSettings }) {
  lodSettings = lodSettings || createRuntimeLodSettings();
  normalizeLodSettings(lodSettings);
  const lodManager = createWorldLodManager({ lodSettings });

  const environment = createEnvironment({ scene, renderer, WEATHER });
  const terrain = createTerrainSystem({ scene, renderer, Noise, PHYSICS, lodSettings });
  const runway = createRunwaySystem({ scene, renderer, getTerrainHeight: terrain.getTerrainHeight, lodSettings });
  const tower = createTowerSystem({ scene, getTerrainHeight: terrain.getTerrainHeight, lodSettings });
  const apron = createApron({ scene, renderer, getTerrainHeight: terrain.getTerrainHeight, lodSettings });
  const hangar = createHangarSystem({ scene, getTerrainHeight: terrain.getTerrainHeight, lodSettings });
  const radar = createRadarSystem({ scene, getTerrainHeight: terrain.getTerrainHeight, lodSettings });
  const cloudSystem = createCloudSystem({ scene });
  const particles = createParticleSystem({ scene });
  const aircraft = createAircraftSystem({ scene, renderer });
  const tokenSystem = createTokenSystem({
    scene,
    getTerrainHeight: terrain.getTerrainHeight,
    spawnParticle: particles.spawnParticle,
    lodSettings
  });
  const shaderVariantRegistry = createShaderVariantRegistry();
  registerShaderVariants(shaderVariantRegistry, [
    terrain.getShaderValidationVariants?.(),
    runway.getShaderValidationVariants?.(),
    cloudSystem.getShaderValidationVariants?.()
  ]);
  const shaderVariants = listShaderVariants(shaderVariantRegistry);
  const shaderVariantManifest = shaderVariants.map((variant) => ({
    id: variant.id,
    system: variant.metadata?.system || 'unknown',
    metadata: variant.metadata || null
  }));
  let warmupPromise = null;
  let shaderValidationReport = null;

  function createShaderValidationSnapshot(overrides = {}) {
    const snapshot = {
      compiled: false,
      skipped: false,
      mode: typeof renderer?.compileAsync === 'function' ? 'compileAsync' : 'compile',
      variantCount: shaderVariantManifest.length,
      objectCount: 0,
      durationMs: 0,
      variants: shaderVariantManifest.map((variant) => ({
        id: variant.id,
        system: variant.system,
        objectCount: 0,
        materials: [],
        metadata: variant.metadata
      })),
      ...overrides
    };
    snapshot.summary = summarizeShaderValidationReport(snapshot);
    return snapshot;
  }

  function validateShaders(camera, { force = false } = {}) {
    if (warmupPromise && !force) return warmupPromise;
    warmupPromise = warmupShaderPrograms({
      renderer,
      camera,
      registry: shaderVariantRegistry
    }).then((report) => {
      shaderValidationReport = report;
      return report;
    }).catch((error) => {
      console.warn('[world] Shader warmup failed:', error);
      shaderValidationReport = createShaderValidationSnapshot({
        error: String(error?.message || error)
      });
      return shaderValidationReport;
    });
    return warmupPromise;
  }

  function warmupShaders(camera) {
    return validateShaders(camera);
  }

  function getShaderValidationReport() {
    return shaderValidationReport || createShaderValidationSnapshot({});
  }

  function getShaderValidationSummary() {
    return shaderValidationReport?.summary || createShaderValidationSnapshot({}).summary;
  }

  function getShaderValidationVariants() {
    return shaderVariantManifest.map((variant) => ({ ...variant }));
  }

  // Register objects for centralized LOD management
  lodManager.register(runway);
  lodManager.register(tower);
  lodManager.register(apron);
  lodManager.register(hangar);
  lodManager.register(radar);
  lodManager.register(tokenSystem);

  return {
    lodSettings,
    ...environment,
    ...terrain,
    ...runway,
    ...tower,
    ...apron,
    ...hangar,
    ...cloudSystem,
    ...particles,
    ...aircraft,
    ...tokenSystem,
    validateShaders,
    getShaderValidationReport,
    getShaderValidationSummary,
    getShaderValidationVariants,
    warmupShaders,
    updateWorldObjects: (time) => {
      radar.update(time);
    },
    invalidateWorldLod: lodManager.invalidate,
    updateWorldLOD: lodManager.updateWorldLOD
  };
}
