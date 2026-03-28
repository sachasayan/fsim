// @ts-check

import { createEnvironment } from './environment.js';
import { createTerrainSystem } from './terrain.js';
import { createAirportSystem } from './airports.js';
import { createCloudSystem } from './clouds.js';
import { createParticleSystem } from './particles.js';
import { createAircraftSystem } from './aircraft.js';
import { createTokenSystem } from './tokens.js';
import { createAuthoredObjectSystem } from './authoredObjects.js';

import { createWorldLodManager } from './WorldLodManager.js';
import { createRuntimeLodSettings, normalizeLodSettings } from './LodSystem.js';
import { summarizeShaderValidationReport, warmupShaderPrograms } from './ShaderWarmup.js';
import {
  createShaderVariantRegistry,
  listShaderVariants,
  registerShaderVariants
} from './ShaderVariantRegistry.js';

/**
 * @typedef WorldObjectsArgs
 * @property {import('three').Scene} scene
 * @property {import('three').WebGLRenderer} renderer
 * @property {unknown} Noise
 * @property {unknown} PHYSICS
 * @property {unknown} AIRCRAFT
 * @property {unknown} WEATHER
 * @property {ReturnType<typeof createRuntimeLodSettings> | null | undefined} [lodSettings]
 */

/**
 * @typedef AircraftSystemArgs
 * @property {import('three').Scene} scene
 * @property {import('three').WebGLRenderer} [renderer]
 */

/** @typedef {Awaited<ReturnType<typeof warmupShaderPrograms>>} ShaderValidationSnapshot */

/**
 * @param {WorldObjectsArgs} args
 */
export function createWorldObjects({ scene, renderer, Noise, PHYSICS, AIRCRAFT, WEATHER, lodSettings }) {
  lodSettings = lodSettings || createRuntimeLodSettings();
  normalizeLodSettings(lodSettings);
  const lodManager = createWorldLodManager({ lodSettings });

  const environment = createEnvironment({
    scene,
    renderer,
    WEATHER,
    shadowsEnabled: renderer?.shadowMap?.enabled !== false
  });
  const terrain = createTerrainSystem({ scene, renderer, Noise, PHYSICS, lodSettings });
  const airportSystem = createAirportSystem({ scene, renderer, getTerrainHeight: terrain.getTerrainHeight, lodSettings });
  const cloudSystem = createCloudSystem({ scene });
  const particles = createParticleSystem({ scene });
  const aircraft = createAircraftSystem(/** @type {AircraftSystemArgs} */ ({ scene, renderer }));
  const tokenSystem = createTokenSystem({
    scene,
    getTerrainHeight: terrain.getTerrainHeight,
    spawnParticle: particles.spawnParticle,
    lodSettings
  });
  const authoredObjects = createAuthoredObjectSystem({
    scene,
    getTerrainHeight: terrain.getTerrainHeight
  });
  const shaderVariantRegistry = createShaderVariantRegistry();
  registerShaderVariants(shaderVariantRegistry, [
    terrain.getShaderValidationVariants?.(),
    airportSystem.getShaderValidationVariants?.(),
    cloudSystem.getShaderValidationVariants?.()
  ]);
  const shaderVariants = listShaderVariants(shaderVariantRegistry);
  const shaderVariantManifest = shaderVariants.map((variant) => {
    const variantMetadata = /** @type {{ system?: string } | null | undefined } */ (variant.metadata);
    return {
      id: variant.id,
      system: variantMetadata?.system || 'unknown',
      metadata: variant.metadata || null
    };
  });
  /** @type {Promise<ShaderValidationSnapshot> | null} */
  let warmupPromise = null;
  /** @type {ShaderValidationSnapshot | null} */
  let shaderValidationReport = null;

  /**
   * @param {Record<string, unknown>} [overrides]
   * @returns {ShaderValidationSnapshot}
   */
  function createShaderValidationSnapshot(overrides = {}) {
    /** @type {Omit<ShaderValidationSnapshot, 'summary'>} */
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
    return {
      ...snapshot,
      summary: summarizeShaderValidationReport(snapshot)
    };
  }

  /**
   * @param {import('three').Camera} camera
   * @param {{ force?: boolean, onProgress?: ((progress: unknown) => void) | null }} [options]
   */
  function validateShaders(camera, { force = false, onProgress = null } = {}) {
    if (warmupPromise && !force) return warmupPromise;
    warmupPromise = warmupShaderPrograms({
      renderer,
      camera,
      registry: shaderVariantRegistry,
      onProgress
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

  /**
   * @param {import('three').Camera} camera
   * @param {{ force?: boolean, onProgress?: ((progress: unknown) => void) | null }} [options]
   */
  function warmupShaders(camera, options = {}) {
    return validateShaders(camera, options);
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
  lodManager.register(airportSystem);
  lodManager.register(tokenSystem);

  function refreshTerrainAlignment() {
    airportSystem.refreshTerrainAlignment?.();
    tokenSystem.refreshTerrainAlignment?.();
    authoredObjects.refreshTerrainAlignment?.();
  }

  return {
    lodSettings,
    ...environment,
    ...terrain,
    ...airportSystem,
    ...cloudSystem,
    ...particles,
    ...aircraft,
    ...tokenSystem,
    ...authoredObjects,
    terrainDebugSettings: terrain.terrainDebugSettings,
    applyTerrainDebugSettings: terrain.applyTerrainDebugSettings,
    validateShaders,
    getShaderValidationReport,
    getShaderValidationSummary,
    getShaderValidationVariants,
    warmupShaders,
    updateWorldObjects: (time) => {
      airportSystem.update(time);
    },
    getTerrainSelectionDiagnostics: terrain.getTerrainSelectionDiagnostics,
    hasPendingTerrainWork: terrain.hasPendingTerrainWork,
    refreshTerrainAlignment,
    invalidateWorldLod: lodManager.invalidate,
    updateWorldLOD: lodManager.updateWorldLOD
  };
}
